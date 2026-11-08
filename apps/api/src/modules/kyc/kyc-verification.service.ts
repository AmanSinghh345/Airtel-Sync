import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OcrService } from './ocr.service';
import { ConsentService } from './consent.service';
import {
  KycDecisionStatus,
  DocumentType,
  KycVerificationResultDto,
  KycDocumentItemDto,
  KycOverrideRequestDto,
  CheckoutEligibilityDto
} from '@udyamone/shared-types';
import * as crypto from 'crypto';

export const REFERENCE_DATE = new Date('2026-07-15T00:00:00.000Z');

@Injectable()
export class KycVerificationService {
  private readonly logger = new Logger(KycVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly consentService: ConsentService
  ) {}

  /**
   * Processes KYC documents for a business under strict DPDP consent.
   * Performs image quality assessment, OCR, registry lookups, defect detection, and scoring.
   */
  async processKycDocuments(
    businessId: string,
    documentUploads: Array<{ documentType: DocumentType; filePath: string; originalFilename?: string }>
  ): Promise<KycVerificationResultDto> {
    // 1. Mandatory DPDP Consent Assertion
    await this.consentService.assertValidConsent(businessId);

    const business = await this.prisma.business.findUnique({
      where: { id: businessId }
    });
    if (!business) {
      throw new NotFoundException(`Business '${businessId}' was not found.`);
    }

    // 2. Initialize or fetch KycVerification record
    let verification = await this.prisma.kycVerification.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' }
    });

    if (!verification) {
      verification = await this.prisma.kycVerification.create({
        data: {
          businessId,
          status: 'PROCESSING'
        }
      });
    } else {
      await this.prisma.kycDocument.deleteMany({
        where: { kycVerificationId: verification.id }
      });
      verification = await this.prisma.kycVerification.update({
        where: { id: verification.id },
        data: { status: 'PROCESSING' }
      });
    }

    const detectedDefects: string[] = [];
    const documentResults: KycDocumentItemDto[] = [];

    // 3. Document Completeness Check
    const uploadedTypes = new Set(documentUploads.map((d) => d.documentType));
    if (!uploadedTypes.has(DocumentType.GST_CERTIFICATE)) {
      detectedDefects.push('MISSING_GST_DOCUMENT: Mandatory GST registration certificate was not uploaded.');
    }
    if (!uploadedTypes.has(DocumentType.UDYAM_CERTIFICATE)) {
      detectedDefects.push('MISSING_UDYAM_DOCUMENT: Mandatory Udyam MSME registration certificate was not uploaded.');
    }
    if (!uploadedTypes.has(DocumentType.SIGNATORY_ID)) {
      detectedDefects.push('MISSING_SIGNATORY_DOCUMENT: Authorised signatory ID proof was not uploaded.');
    }
    if (!uploadedTypes.has(DocumentType.ADDRESS_PROOF)) {
      detectedDefects.push('MISSING_ADDRESS_PROOF: Electricity / Utility bill address proof was not uploaded.');
    }

    let gstData: Record<string, any> = {};
    let udyamData: Record<string, any> = {};
    let signatoryData: Record<string, any> = {};
    let addressData: Record<string, any> = {};

    // 4. OCR Extraction & Quality Checks for Each Document
    for (const doc of documentUploads) {
      const ocrRes = await this.ocrService.analyzeDocument(doc.filePath, doc.documentType);

      if (ocrRes.defectCode) {
        if (ocrRes.defectCode === 'IMAGE_BLURRED') {
          detectedDefects.push(
            `FLAGGED_BLUR: ${doc.documentType} image is severely blurred (Laplacian variance: ${ocrRes.blurVariance} < 50.0).`
          );
        } else if (ocrRes.defectCode === 'MISSING_PRIMARY_PAGE') {
          detectedDefects.push(
            `MISSING_PRIMARY_PAGE: ${doc.documentType} contains only annexure/secondary schedule; primary page missing.`
          );
        } else if (ocrRes.defectCode === 'LOW_OCR_CONFIDENCE') {
          detectedDefects.push(
            `LOW_OCR_CONFIDENCE: ${doc.documentType} has low OCR confidence score (${ocrRes.ocrConfidence}%).`
          );
        }
      }

      // Persist KycDocument with raw OCR text preserved separately
      const savedDoc = await this.prisma.kycDocument.create({
        data: {
          kycVerificationId: verification.id,
          documentType: doc.documentType,
          storagePath: doc.filePath,
          originalFilename: doc.originalFilename || doc.filePath,
          mimeType: 'image/png',
          fileSizeBytes: 1024,
          isBlurred: ocrRes.isBlurred,
          blurVariance: ocrRes.blurVariance,
          qualityStatus: ocrRes.qualityStatus,
          ocrConfidence: ocrRes.ocrConfidence,
          rotationAngle: ocrRes.rotationAngle,
          rawOcrText: ocrRes.rawOcrText, // Unmodified raw OCR payload
          parsedData: ocrRes.parsedData, // Normalized structured attributes
          defectCode: ocrRes.defectCode || null
        }
      });

      documentResults.push({
        id: savedDoc.id,
        documentType: doc.documentType,
        originalFilename: savedDoc.originalFilename,
        qualityStatus: ocrRes.qualityStatus,
        isBlurred: ocrRes.isBlurred,
        blurVariance: ocrRes.blurVariance,
        rawOcrText: ocrRes.rawOcrText,
        parsedData: ocrRes.parsedData,
        defectCode: ocrRes.defectCode || null
      });

      if (doc.documentType === DocumentType.GST_CERTIFICATE) gstData = ocrRes.parsedData;
      if (doc.documentType === DocumentType.UDYAM_CERTIFICATE) udyamData = ocrRes.parsedData;
      if (doc.documentType === DocumentType.SIGNATORY_ID) signatoryData = ocrRes.parsedData;
      if (doc.documentType === DocumentType.ADDRESS_PROOF) addressData = ocrRes.parsedData;
    }

    // 5. GSTIN Government Registry Cross-Verification
    let gstinVerified = false;
    let gstinStatus = 'NOT_VERIFIED';

    if (gstData.gstin) {
      const gstinRecord = await this.prisma.gstinRegistry.findUnique({
        where: { gstin: gstData.gstin }
      });

      if (gstinRecord) {
        gstinStatus = gstinRecord.status;
        if (gstinRecord.status.toLowerCase() === 'active') {
          gstinVerified = true;
        } else {
          detectedDefects.push(
            `GSTIN_STATUS_${gstinRecord.status.toUpperCase()}: GSTIN '${gstData.gstin}' is currently ${gstinRecord.status} in the official registry.`
          );
        }
      } else {
        // Not found exact: Check for optical character confusion (O vs 0)
        const ambiguityMatch = await this.findOcrAmbiguityCandidate(gstData.gstin);

        if (ambiguityMatch) {
          detectedDefects.push(
            `OCR_AMBIGUITY_DETECTED: Character ambiguity (O vs 0) detected between document text and registry record. Manual review required. (Document: ${gstData.gstin}, Registry Candidate: ${ambiguityMatch.candidateGstin}).`
          );
        } else {
          detectedDefects.push(
            `GSTIN_NOT_IN_REGISTRY: GSTIN '${gstData.gstin}' does not exist in official government registry (Possible altered/forged document).`
          );
        }
      }
    } else if (gstData.rawGstin) {
      // Ambiguous GSTIN string extracted
      const ambiguityMatch = await this.findOcrAmbiguityCandidate(gstData.rawGstin);

      if (ambiguityMatch) {
        detectedDefects.push(
          `OCR_AMBIGUITY_DETECTED: Character ambiguity (O vs 0) detected between document text and registry record. Manual review required. (Document: ${gstData.rawGstin}, Registry Candidate: ${ambiguityMatch.candidateGstin}).`
        );
      } else {
        detectedDefects.push(
          `GSTIN_NOT_IN_REGISTRY: Extracted GSTIN '${gstData.rawGstin}' does not conform to statutory 15-character structure or does not exist in official government registry (Possible altered/forged document).`
        );
      }
    }

    // 6. Udyam Government Registry Cross-Verification
    let udyamVerified = false;
    if (udyamData.udyamNumber) {
      const udyamRecord = await this.prisma.udyamRegistry.findUnique({
        where: { udyamNumber: udyamData.udyamNumber }
      });

      if (udyamRecord) {
        udyamVerified = true;
      } else {
        detectedDefects.push(
          `UDYAM_NOT_IN_REGISTRY: Udyam registration number '${udyamData.udyamNumber}' does not exist in official MSME registry.`
        );
      }
    } else if (uploadedTypes.has(DocumentType.UDYAM_CERTIFICATE)) {
      detectedDefects.push(
        'MISSING_UDYAM_NUMBER: Udyam certificate was uploaded but registration number field was blank or unreadable.'
      );
    }

    // 7. Address Proof Validity (Utility Bill $\le 90$ Days from 2026-07-15)
    if (addressData.billDate) {
      const billDate = new Date(addressData.billDate);
      const diffMs = REFERENCE_DATE.getTime() - billDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const maxPolicyDays = Number(process.env.KYC_ADDRESS_PROOF_MAX_DAYS || 90);
      if (diffDays > maxPolicyDays) {
        detectedDefects.push(
          `ADDRESS_PROOF_EXPIRED: Electricity bill date (${addressData.billDate}) is ${diffDays} days old (exceeds configurable challenge policy window of ${maxPolicyDays} days as of reference date 2026-07-15).`
        );
      }
    }

    // 8. Cross-Entity Name & Signatory Fuzzy Matching
    const tradeName = gstData.tradeName || udyamData.enterpriseName || '';
    const legalName = gstData.legalName || '';
    const signatoryName = signatoryData.signatoryName || '';

    let nameMatchScore = 1.0;
    if (gstData.tradeName && udyamData.enterpriseName) {
      nameMatchScore = this.calculateStringSimilarity(gstData.tradeName, udyamData.enterpriseName);
      if (nameMatchScore < 0.7) {
        detectedDefects.push(
          `NAME_MISMATCH: Enterprise name mismatch between GST certificate ('${gstData.tradeName}') and Udyam certificate ('${udyamData.enterpriseName}').`
        );
      }
    }

    let signatoryMatchScore = 1.0;
    if (signatoryName && legalName) {
      signatoryMatchScore = this.calculateSignatorySimilarity(signatoryName, legalName);
      if (signatoryMatchScore < 0.7) {
        detectedDefects.push(
          `SIGNATORY_MISMATCH: Signatory name ('${signatoryName}') does not match legal proprietor/partner ('${legalName}').`
        );
      }
    }

    // 9. Deterministic Final KYC Status Assessment
    let finalStatus: KycDecisionStatus = KycDecisionStatus.VERIFIED;
    if (detectedDefects.length > 0) {
      // Rule: Uncertain or flagged KYC must NEVER be automatically approved!
      finalStatus = KycDecisionStatus.MANUAL_REVIEW;
    }

    const updatedVerification = await this.prisma.kycVerification.update({
      where: { id: verification.id },
      data: {
        status: finalStatus,
        gstinVerified,
        gstinStatus,
        udyamVerified,
        nameMatchScore: Number(nameMatchScore.toFixed(2)),
        addressMatchScore: 1.0,
        signatoryMatchScore: Number(signatoryMatchScore.toFixed(2)),
        detectedDefects: detectedDefects as any,
        verifiedAt: finalStatus === KycDecisionStatus.VERIFIED ? new Date() : null
      }
    });

    const canProceedToCheckout =
      (finalStatus as string) === (KycDecisionStatus.VERIFIED as string) ||
      (finalStatus as string) === (KycDecisionStatus.OVERRIDDEN_VERIFIED as string);

    return {
      verificationId: updatedVerification.id,
      businessId: updatedVerification.businessId,
      status: finalStatus,
      gstinVerified,
      gstinStatus,
      udyamVerified,
      nameMatchScore: Number(nameMatchScore.toFixed(2)),
      addressMatchScore: 1.0,
      signatoryMatchScore: Number(signatoryMatchScore.toFixed(2)),
      detectedDefects,
      canProceedToCheckout,
      documents: documentResults,
      verifiedAt: updatedVerification.verifiedAt ? updatedVerification.verifiedAt.toISOString() : null
    };
  }

  /**
   * Evaluates an official hackathon applicant specimen (K01..K12) directly from `kyc_documents/`.
   */
  async processApplicantSpecimen(businessId: string, applicantCode: string): Promise<KycVerificationResultDto> {
    const code = applicantCode.toUpperCase();
    const docTypes: Array<{ type: DocumentType; suffix: string }> = [
      { type: DocumentType.GST_CERTIFICATE, suffix: 'gst_certificate.png' },
      { type: DocumentType.UDYAM_CERTIFICATE, suffix: 'udyam_certificate.png' },
      { type: DocumentType.SIGNATORY_ID, suffix: 'signatory_id.png' },
      { type: DocumentType.ADDRESS_PROOF, suffix: 'address_proof.png' }
    ];

    const fs = require('fs');
    const path = require('path');
    const documentsToProcess: Array<{ documentType: DocumentType; filePath: string; originalFilename: string }> = [];

    for (const dt of docTypes) {
      const filename = `${code}_${dt.suffix}`;
      const candidatePaths = [
        path.resolve(process.cwd(), 'kyc_documents', filename),
        path.resolve(process.cwd(), '../../kyc_documents', filename),
        path.resolve(process.cwd(), '../kyc_documents', filename),
        path.resolve(__dirname, '../../../../../kyc_documents', filename)
      ];
      const resolvedPath = candidatePaths.find((p: string) => fs.existsSync(p));
      if (resolvedPath) {
        documentsToProcess.push({
          documentType: dt.type,
          filePath: resolvedPath,
          originalFilename: filename
        });
      }
    }

    return this.processKycDocuments(businessId, documentsToProcess);
  }

  /**
   * Audited manual override workflow restricted to COMPLIANCE_OFFICER or ADMIN roles.
   */
  async overrideVerification(dto: KycOverrideRequestDto): Promise<KycVerificationResultDto> {
    // Role Enforcement
    const allowedRoles = ['COMPLIANCE_OFFICER', 'ADMIN'];
    if (!allowedRoles.includes(dto.authorizerRole)) {
      throw new ForbiddenException(
        `Role '${dto.authorizerRole}' is not authorized to perform KYC manual overrides. Required: COMPLIANCE_OFFICER or ADMIN.`
      );
    }

    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: dto.verificationId },
      include: { documents: true }
    });

    if (!verification) {
      throw new NotFoundException(`KYC Verification '${dto.verificationId}' was not found.`);
    }

    // Tamper-evident cryptographic audit hash
    const payloadToHash = JSON.stringify({
      verificationId: dto.verificationId,
      authorizerUserId: dto.authorizerUserId,
      authorizerRole: dto.authorizerRole,
      reasonCode: dto.reasonCode,
      reasonText: dto.reasonText,
      timestamp: new Date().toISOString()
    });
    const overridePayloadHash = crypto.createHash('sha256').update(payloadToHash).digest('hex');

    // Create Audit Log
    await this.prisma.kycAuditLog.create({
      data: {
        kycVerificationId: verification.id,
        action: 'MANUAL_OVERRIDE',
        previousStatus: verification.status,
        newStatus: KycDecisionStatus.OVERRIDDEN_VERIFIED,
        authorizerUserId: dto.authorizerUserId,
        authorizerRole: dto.authorizerRole,
        reasonCode: dto.reasonCode,
        reasonText: dto.reasonText,
        overridePayloadHash
      }
    });

    // Update Verification Status
    const updated = await this.prisma.kycVerification.update({
      where: { id: verification.id },
      data: {
        status: KycDecisionStatus.OVERRIDDEN_VERIFIED,
        reviewerNotes: `Manual Override approved by ${dto.authorizerUserId} (${dto.authorizerRole}). Reason: [${dto.reasonCode}] ${dto.reasonText}. Hash: ${overridePayloadHash.substring(0, 12)}...`,
        verifiedAt: new Date()
      },
      include: { documents: true }
    });

    return {
      verificationId: updated.id,
      businessId: updated.businessId,
      status: updated.status as unknown as KycDecisionStatus,
      gstinVerified: updated.gstinVerified,
      gstinStatus: updated.gstinStatus || undefined,
      udyamVerified: updated.udyamVerified,
      nameMatchScore: Number(updated.nameMatchScore),
      addressMatchScore: Number(updated.addressMatchScore),
      signatoryMatchScore: Number(updated.signatoryMatchScore),
      detectedDefects: (updated.detectedDefects as any) || [],
      reviewerNotes: updated.reviewerNotes || undefined,
      canProceedToCheckout: true,
      documents: updated.documents.map((d) => ({
        id: d.id,
        documentType: d.documentType as unknown as DocumentType,
        originalFilename: d.originalFilename,
        qualityStatus: d.qualityStatus as string,
        isBlurred: d.isBlurred,
        blurVariance: Number(d.blurVariance),
        rawOcrText: d.rawOcrText,
        parsedData: d.parsedData as any,
        defectCode: d.defectCode
      })),
      verifiedAt: updated.verifiedAt ? updated.verifiedAt.toISOString() : null
    };
  }

  /**
   * Fetches KYC verification result by verification ID.
   */
  async getVerificationById(verificationId: string): Promise<KycVerificationResultDto> {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
      include: { documents: true }
    });

    if (!verification) {
      throw new NotFoundException(`KYC Verification '${verificationId}' was not found.`);
    }

    const canProceedToCheckout =
      (verification.status as string) === (KycDecisionStatus.VERIFIED as string) ||
      (verification.status as string) === (KycDecisionStatus.OVERRIDDEN_VERIFIED as string);

    return {
      verificationId: verification.id,
      businessId: verification.businessId,
      status: verification.status as unknown as KycDecisionStatus,
      gstinVerified: verification.gstinVerified,
      gstinStatus: verification.gstinStatus || undefined,
      udyamVerified: verification.udyamVerified,
      nameMatchScore: Number(verification.nameMatchScore),
      addressMatchScore: Number(verification.addressMatchScore),
      signatoryMatchScore: Number(verification.signatoryMatchScore),
      detectedDefects: (verification.detectedDefects as any) || [],
      reviewerNotes: verification.reviewerNotes || undefined,
      canProceedToCheckout,
      documents: verification.documents.map((d) => ({
        id: d.id,
        documentType: d.documentType as unknown as DocumentType,
        originalFilename: d.originalFilename,
        qualityStatus: d.qualityStatus as string,
        isBlurred: d.isBlurred,
        blurVariance: Number(d.blurVariance),
        rawOcrText: d.rawOcrText,
        parsedData: d.parsedData as any,
        defectCode: d.defectCode
      })),
      verifiedAt: verification.verifiedAt ? verification.verifiedAt.toISOString() : null
    };
  }

  /**
   * Fetches latest KYC verification result by business ID.
   */
  async getVerificationByBusinessId(businessId: string): Promise<KycVerificationResultDto | null> {
    const verification = await this.prisma.kycVerification.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: { documents: true }
    });

    if (!verification) {
      return null;
    }

    const canProceedToCheckout =
      (verification.status as string) === (KycDecisionStatus.VERIFIED as string) ||
      (verification.status as string) === (KycDecisionStatus.OVERRIDDEN_VERIFIED as string);

    return {
      verificationId: verification.id,
      businessId: verification.businessId,
      status: verification.status as unknown as KycDecisionStatus,
      gstinVerified: verification.gstinVerified,
      gstinStatus: verification.gstinStatus || undefined,
      udyamVerified: verification.udyamVerified,
      nameMatchScore: Number(verification.nameMatchScore),
      addressMatchScore: Number(verification.addressMatchScore),
      signatoryMatchScore: Number(verification.signatoryMatchScore),
      detectedDefects: (verification.detectedDefects as any) || [],
      reviewerNotes: verification.reviewerNotes || undefined,
      canProceedToCheckout,
      documents: verification.documents.map((d) => ({
        id: d.id,
        documentType: d.documentType as unknown as DocumentType,
        originalFilename: d.originalFilename,
        qualityStatus: d.qualityStatus as string,
        isBlurred: d.isBlurred,
        blurVariance: Number(d.blurVariance),
        rawOcrText: d.rawOcrText,
        parsedData: d.parsedData as any,
        defectCode: d.defectCode
      })),
      verifiedAt: verification.verifiedAt ? verification.verifiedAt.toISOString() : null
    };
  }

  /**
   * Asserts whether a customer's KYC status permits checkout.
   */
  async getCheckoutEligibility(businessId: string): Promise<CheckoutEligibilityDto> {
    const verification = await this.prisma.kycVerification.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' }
    });

    if (!verification) {
      return {
        businessId,
        eligible: false,
        kycStatus: KycDecisionStatus.PENDING,
        reason: 'No KYC verification has been initiated for this business.'
      };
    }

    const eligible =
      (verification.status as string) === (KycDecisionStatus.VERIFIED as string) ||
      (verification.status as string) === (KycDecisionStatus.OVERRIDDEN_VERIFIED as string);

    return {
      businessId,
      eligible,
      kycStatus: verification.status as unknown as KycDecisionStatus,
      reason: eligible
        ? 'KYC verified. Permitted to proceed to checkout.'
        : `KYC status '${verification.status}' does not permit checkout. Must be VERIFIED or OVERRIDDEN_VERIFIED.`
    };
  }

  /**
   * Helper: Generates potential optical character ambiguity swap candidates (O vs 0).
   */
  private getOcrAmbiguityCandidates(str: string): string[] {
    const candidates = new Set<string>();
    if (str.includes('O')) candidates.add(str.replace(/O/g, '0'));
    if (str.includes('0')) candidates.add(str.replace(/0/g, 'O'));

    // Position-aware GSTIN swap for 15-character statutory format
    if (str.length === 15) {
      const chars = str.split('');
      // State code (indices 0-1) must be digits
      if (chars[0] === 'O') chars[0] = '0';
      if (chars[1] === 'O') chars[1] = '0';
      // PAN letters (indices 2-6) must be letters
      for (let i = 2; i <= 6; i++) {
        if (chars[i] === '0') chars[i] = 'O';
      }
      // PAN digits (indices 7-10) must be digits
      for (let i = 7; i <= 10; i++) {
        if (chars[i] === 'O') chars[i] = '0';
      }
      // Index 11 is letter
      if (chars[11] === '0') chars[11] = 'O';
      candidates.add(chars.join(''));
    }

    return Array.from(candidates);
  }

  /**
   * Searches for a matching registry record among ambiguity candidates.
   */
  private async findOcrAmbiguityCandidate(
    rawGstin: string
  ): Promise<{ candidateGstin: string; record: any } | null> {
    const candidates = this.getOcrAmbiguityCandidates(rawGstin);
    for (const cand of candidates) {
      if (cand !== rawGstin) {
        const record = await this.prisma.gstinRegistry.findUnique({ where: { gstin: cand } });
        if (record) {
          return { candidateGstin: cand, record };
        }
      }
    }
    return null;
  }

  /**
   * Helper: Calculates Levenshtein string similarity score (0.0 to 1.0).
   */
  private calculateStringSimilarity(s1: string, s2: string): number {
    const a = s1.toLowerCase().trim();
    const b = s2.toLowerCase().trim();
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return 1.0 - distance / maxLen;
  }

  /**
   * Helper: Compares signatory name with legal proprietor name (e.g. "Pooja Shah" in "Pooja Shah (Prop. ...)").
   */
  private calculateSignatorySimilarity(signatory: string, legalName: string): number {
    const cleanSignatory = signatory.toLowerCase().trim();
    const cleanLegal = legalName.toLowerCase().trim();

    if (cleanLegal.includes(cleanSignatory)) return 1.0;
    return this.calculateStringSimilarity(cleanSignatory, cleanLegal);
  }
}
