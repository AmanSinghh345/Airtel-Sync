import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ConsentService } from './consent.service';
import { KycVerificationService } from './kyc-verification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RecordConsentRequestDto,
  RecordConsentResponseDto,
  KycVerificationResultDto,
  KycOverrideRequestDto,
  CheckoutEligibilityDto,
  DocumentType,
  StaffRole,
  StaffJwtPayload
} from '@udyamone/shared-types';

@Controller('kyc')
export class KycController {
  constructor(
    private readonly consentService: ConsentService,
    private readonly kycVerificationService: KycVerificationService
  ) {}

  /**
   * POST /api/kyc/consent
   * Records explicit DPDP Act 2023 affirmative customer consent.
   */
  @Post('consent')
  @HttpCode(HttpStatus.CREATED)
  async recordConsent(@Body() dto: RecordConsentRequestDto): Promise<RecordConsentResponseDto> {
    if (!dto || !dto.businessId) {
      throw new BadRequestException('Field businessId is required to record DPDP consent.');
    }
    return this.consentService.recordConsent(dto);
  }

  /**
   * POST /api/kyc/consent/revoke
   * Revokes customer DPDP consent.
   */
  @Post('consent/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeConsent(@Body() body: { businessId: string }): Promise<{ success: boolean; revokedAt: string }> {
    if (!body || !body.businessId) {
      throw new BadRequestException('Field businessId is required to revoke consent.');
    }
    return this.consentService.revokeConsent(body.businessId);
  }

  /**
   * DELETE /api/kyc/data/:businessId
   * Right-to-be-forgotten customer data purging under DPDP Act 2023.
   * Document payloads are scrubbed, while compliance audit logs are retained under statutory rules.
   * Guarded by genuine server-side JWT authentication and role authorization (ADMIN or COMPLIANCE_OFFICER).
   */
  @Delete('data/:businessId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.ADMIN, StaffRole.COMPLIANCE_OFFICER)
  async purgeCustomerData(
    @Param('businessId') businessId: string,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<{ success: boolean; purgedRecords: number; auditLogsPreserved?: number }> {
    if (!businessId) {
      throw new BadRequestException('Param businessId is required.');
    }
    return this.consentService.deleteCustomerKycData(businessId);
  }

  /**
   * POST /api/kyc/process-applicant/:code
   * Processes an official test specimen (K01..K12) from kyc_documents/.
   */
  @Post('process-applicant/:code')
  @HttpCode(HttpStatus.OK)
  async processApplicant(
    @Param('code') code: string,
    @Body() body: { businessId: string }
  ): Promise<KycVerificationResultDto> {
    if (!code) {
      throw new BadRequestException('Applicant code (e.g. K01..K12) is required.');
    }
    if (!body || !body.businessId) {
      throw new BadRequestException('Field businessId is required.');
    }
    return this.kycVerificationService.processApplicantSpecimen(body.businessId, code);
  }

  /**
   * POST /api/kyc/process-documents
   * Securely validates and processes uploaded KYC documents.
   * Validates MIME type, extension, file size, generated filenames, and prevents path traversal.
   */
  @Post('process-documents')
  @HttpCode(HttpStatus.OK)
  async processDocuments(
    @Body()
    body: {
      businessId: string;
      documents: Array<{
        documentType: DocumentType;
        filePath: string;
        originalFilename?: string;
        mimeType?: string;
        fileSizeBytes?: number;
      }>;
    }
  ): Promise<KycVerificationResultDto> {
    if (!body || !body.businessId) {
      throw new BadRequestException('Field businessId is required.');
    }
    if (!body.documents || !Array.isArray(body.documents) || body.documents.length === 0) {
      throw new BadRequestException('Field documents array is required and must not be empty.');
    }

    const ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.pdf'];
    const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

    const validatedDocuments: Array<{ documentType: DocumentType; filePath: string; originalFilename?: string }> = [];

    for (const doc of body.documents) {
      if (!doc.filePath) {
        throw new BadRequestException('Document filePath is required.');
      }

      // 1. Path traversal prevention check
      const normalized = path.normalize(doc.filePath);
      if (normalized.includes('..') || /[\0<>:"|?*]/.test(doc.filePath)) {
        throw new BadRequestException(`Path traversal or invalid characters detected in '${doc.filePath}'.`);
      }

      // 2. Extension check
      const filename = doc.originalFilename || path.basename(doc.filePath);
      const ext = path.extname(filename).toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        throw new BadRequestException(`Disallowed file extension '${ext}'. Allowed: ${ALLOWED_EXTS.join(', ')}`);
      }

      // 3. MIME type check
      if (doc.mimeType && !ALLOWED_MIMES.includes(doc.mimeType.toLowerCase())) {
        throw new BadRequestException(`Disallowed MIME type '${doc.mimeType}'. Allowed: ${ALLOWED_MIMES.join(', ')}`);
      }

      // 4. File existence & size check
      const resolvedPath = path.resolve(doc.filePath);
      if (fs.existsSync(resolvedPath)) {
        const stats = fs.statSync(resolvedPath);
        if (stats.size > MAX_FILE_SIZE) {
          throw new BadRequestException(`File size ${stats.size} bytes exceeds maximum allowed 10MB.`);
        }
      }

      // 5. Generate secure, collision-resistant storage identifier
      const secureSafeName = `${doc.documentType}_${crypto.randomUUID()}${ext}`;

      validatedDocuments.push({
        documentType: doc.documentType,
        filePath: resolvedPath,
        originalFilename: doc.originalFilename || secureSafeName
      });
    }

    return this.kycVerificationService.processKycDocuments(body.businessId, validatedDocuments);
  }

  /**
   * GET /api/kyc/status/:verificationId
   * Retrieves KYC verification status by verification ID.
   */
  @Get('status/:verificationId')
  async getVerificationStatus(@Param('verificationId') verificationId: string): Promise<KycVerificationResultDto> {
    if (!verificationId) {
      throw new BadRequestException('verificationId is required.');
    }
    return this.kycVerificationService.getVerificationById(verificationId);
  }

  /**
   * GET /api/kyc/status/business/:businessId
   * Retrieves latest KYC verification status by business ID.
   */
  @Get('status/business/:businessId')
  async getBusinessKycStatus(@Param('businessId') businessId: string): Promise<KycVerificationResultDto> {
    if (!businessId) {
      throw new BadRequestException('businessId is required.');
    }
    const result = await this.kycVerificationService.getVerificationByBusinessId(businessId);
    if (!result) {
      throw new NotFoundException(`No KYC verification found for business '${businessId}'.`);
    }
    return result;
  }

  /**
   * POST /api/kyc/override
   * Authorized compliance officer or admin override for flagged KYC verifications.
   * SECURITY ENFORCEMENT: Server-side JWT authentication & role-based guard.
   * Derives staff identity and role from verified JWT context; never trusts request headers or body roles.
   */
  @Post('override')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.COMPLIANCE_OFFICER, StaffRole.ADMIN)
  async manualOverride(
    @Body() dto: KycOverrideRequestDto,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<KycVerificationResultDto> {
    if (!dto || !dto.verificationId) {
      throw new BadRequestException('verificationId is required.');
    }
    if (!dto.reasonCode || !dto.reasonText) {
      throw new BadRequestException('reasonCode and reasonText are required.');
    }

    return this.kycVerificationService.overrideVerification({
      verificationId: dto.verificationId,
      authorizerUserId: staff.sub,
      authorizerRole: staff.role as 'COMPLIANCE_OFFICER' | 'ADMIN',
      reasonCode: dto.reasonCode,
      reasonText: dto.reasonText
    });
  }

  /**
   * GET /api/kyc/checkout-eligibility/:businessId
   * Asserts whether the business has achieved VERIFIED or OVERRIDDEN_VERIFIED status.
   */
  @Get('checkout-eligibility/:businessId')
  async getCheckoutEligibility(@Param('businessId') businessId: string): Promise<CheckoutEligibilityDto> {
    if (!businessId) {
      throw new BadRequestException('businessId is required.');
    }
    return this.kycVerificationService.getCheckoutEligibility(businessId);
  }
}
