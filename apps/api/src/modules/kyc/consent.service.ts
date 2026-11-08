import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RecordConsentRequestDto,
  RecordConsentResponseDto
} from '@udyamone/shared-types';

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records affirmative DPDP consent before any KYC document processing or registry lookups.
   */
  async recordConsent(dto: RecordConsentRequestDto): Promise<RecordConsentResponseDto> {
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId }
    });

    if (!business) {
      throw new NotFoundException(`Business with ID '${dto.businessId}' was not found.`);
    }

    const retentionDays = dto.retentionDays || 30;
    const purposeText =
      dto.purposeText ||
      'Customer consent obtained for enterprise telecom onboarding, identity verification via GSTIN and Udyam government registries, and credit assessment under the Digital Personal Data Protection Act, 2023.';
    const dataFieldsCovered =
      dto.dataFieldsCovered || 'GSTIN, Udyam Registration, Signatory ID Proof, Electricity Bill (Address Proof)';

    const record = await this.prisma.consentRecord.create({
      data: {
        businessId: dto.businessId,
        consentType: 'DPDP_KYC_VERIFICATION',
        consentGiven: true,
        purposeText,
        dataFieldsCovered,
        retentionDays
      }
    });

    return {
      consentId: record.id,
      businessId: record.businessId,
      consentGiven: record.consentGiven,
      consentTimestamp: record.consentTimestamp.toISOString(),
      retentionDays: record.retentionDays,
      revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null
    };
  }

  /**
   * Asserts that active, unrevoked DPDP consent exists before allowing KYC processing or registry queries.
   */
  async assertValidConsent(businessId: string): Promise<boolean> {
    const consent = await this.prisma.consentRecord.findFirst({
      where: {
        businessId,
        consentGiven: true,
        revokedAt: null
      },
      orderBy: { consentTimestamp: 'desc' }
    });

    if (!consent) {
      throw new ForbiddenException(
        `DPDP Act 2023 Violation: Affirmative consent must be recorded for business '${businessId}' before processing KYC documents or querying registries.`
      );
    }

    return true;
  }

  /**
   * Revokes customer DPDP consent.
   */
  async revokeConsent(businessId: string): Promise<{ success: boolean; revokedAt: string }> {
    const now = new Date();
    await this.prisma.consentRecord.updateMany({
      where: { businessId, revokedAt: null },
      data: { revokedAt: now }
    });

    return {
      success: true,
      revokedAt: now.toISOString()
    };
  }

  /**
   * Purges / scrubs customer KYC document payloads and PII following retention expiration
   * or a right-to-be-forgotten request under DPDP Act, 2023.
   *
   * Configurable Regulatory Retention Policy:
   * 1. Customer PII & Document Payloads (Images, OCR transcripts): Erased upon customer
   *    right-to-be-forgotten request or customer DPDP retention expiry (default 30-90 days,
   *    configured per customer consent record).
   * 2. Compliance Audit Logs (Non-PII): Preserved separately under configurable enterprise policy
   *    (KYC_AUDIT_RETENTION_DAYS, default 2555 days / 7 years aligned with DoT Unified License
   *    Condition 39.20 subscriber verification audit guidelines and PMLA audit requirements).
   *    Audit logs retain only non-PII operational evidence: verificationId, authorizer staff ID,
   *    timestamp, reason code, and a tamper-evident SHA-256 integrity hash.
   */
  async deleteCustomerKycData(
    businessId: string
  ): Promise<{ success: boolean; purgedRecords: number; auditLogsPreserved: number }> {
    // 1. Revoke affirmative DPDP consent
    await this.revokeConsent(businessId);

    // 2. Fetch KYC verifications for the customer
    const verifications = await this.prisma.kycVerification.findMany({
      where: { businessId },
      include: { auditLogs: true }
    });

    let purgedDocs = 0;
    let auditLogsPreserved = 0;

    for (const v of verifications) {
      // 3. Scrub and delete raw OCR documents and image storage references
      const deleteResult = await this.prisma.kycDocument.deleteMany({
        where: { kycVerificationId: v.id }
      });
      purgedDocs += deleteResult.count;
      auditLogsPreserved += v.auditLogs.length;

      // 4. Scrub customer PII fields from the verification record while keeping audit linkage
      await this.prisma.kycVerification.update({
        where: { id: v.id },
        data: {
          reviewerNotes: '[PURGED_UNDER_DPDP_RIGHT_TO_BE_FORGOTTEN]',
          detectedDefects: [],
          status: 'REJECTED'
        }
      });
    }

    return {
      success: true,
      purgedRecords: purgedDocs,
      auditLogsPreserved
    };
  }
}
