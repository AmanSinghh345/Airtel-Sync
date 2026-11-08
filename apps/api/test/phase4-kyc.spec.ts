import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConsentService } from '../src/modules/kyc/consent.service';
import { KycVerificationService } from '../src/modules/kyc/kyc-verification.service';
import { KycDecisionStatus, DocumentType, Segment } from '@udyamone/shared-types';
import { AUTH_CONFIG } from '../src/modules/auth/auth.constants';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';

interface TestSummary {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestSummary[] = [];

function assert(condition: boolean, testName: string, errorMsg?: string) {
  if (!condition) {
    results.push({ name: testName, passed: false, error: errorMsg || 'Assertion failed' });
    console.error(`  ❌ FAIL: ${testName} - ${errorMsg || 'Assertion failed'}`);
  } else {
    results.push({ name: testName, passed: true });
    console.log(`  ✅ PASS: ${testName}`);
  }
}

// HTTP request helper for testing live API endpoints
function httpRequest(
  port: number,
  path: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: any,
  customHeaders?: Record<string, string>
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
          ...(customHeaders || {})
        }
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const data = rawData ? JSON.parse(rawData) : null;
            resolve({ status: res.statusCode || 500, data });
          } catch {
            resolve({ status: res.statusCode || 500, data: rawData });
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runPhase4TestSuite() {
  console.log('================================================================');
  console.log('    UDYAMONE PHASE 4: DIGITAL KYC, OCR & REGISTRY VERIFICATION  ');
  console.log('================================================================');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');

  // Start HTTP server on dynamic port
  const server = await app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 3344;
  console.log(`[TEST HARNESS] Phase 4 test server running on port ${port}`);

  const prisma = app.get(PrismaService);
  const consentService = app.get(ConsentService);
  const kycService = app.get(KycVerificationService);

  try {
    // ================================================================
    // SUITE 1: DPDP ACT 2023 CONSENT MANAGEMENT
    // ================================================================
    console.log('\n--- [SUITE 1] DPDP Act 2023 Consent Recording & Enforcement ---');

    // Create a dedicated test business for consent tests
    const consentBiz = await prisma.business.upsert({
      where: { id: 'TEST-BIZ-CONSENT' },
      update: {},
      create: {
        id: 'TEST-BIZ-CONSENT',
        legalName: 'Apex Data Solutions LLP',
        tradeName: 'Apex Data Solutions',
        constitution: 'Limited Liability Partnership',
        segment: Segment.PROFESSIONAL_OFFICE,
        city: 'Pune',
        cityTier: 1,
        state: 'Maharashtra',
        hasGstin: true,
        gstin: '27AABCA1234F1Z5'
      }
    });

    // Clean any prior consent records for this test biz
    await prisma.consentRecord.deleteMany({ where: { businessId: consentBiz.id } });

    // 1.1 Process KYC without consent must throw ForbiddenException
    let consentViolationThrown = false;
    try {
      await kycService.processKycDocuments(consentBiz.id, []);
    } catch (err: any) {
      if (err.status === 403 || err.message.includes('DPDP')) {
        consentViolationThrown = true;
      }
    }
    assert(consentViolationThrown, 'KYC processing without affirmative DPDP consent throws 403 Forbidden');

    // 1.2 Record affirmative DPDP consent
    const consentRes = await consentService.recordConsent({
      businessId: consentBiz.id,
      retentionDays: 60,
      purposeText: 'Customer consent for telecom onboarding & identity verification.'
    });
    assert(consentRes.consentGiven === true, 'Consent successfully recorded with consentGiven: true');
    assert(consentRes.retentionDays === 60, 'Retention days set to 60');
    assert(consentRes.revokedAt === null, 'Revocation date is initially null');

    // 1.3 Assert consent is now active
    const isValidConsent = await consentService.assertValidConsent(consentBiz.id);
    assert(isValidConsent === true, 'assertValidConsent succeeds after affirmative recording');

    // 1.4 Revoke consent
    const revokeRes = await consentService.revokeConsent(consentBiz.id);
    assert(revokeRes.success === true, 'Consent revocation returned success: true');

    let revokedViolationThrown = false;
    try {
      await consentService.assertValidConsent(consentBiz.id);
    } catch (err: any) {
      if (err.status === 403) revokedViolationThrown = true;
    }
    assert(revokedViolationThrown, 'assertValidConsent throws 403 Forbidden after revocation');

    // ================================================================
    // SUITE 2: OFFICIAL SPECIMEN EVALUATION (K01 TO K12)
    // ================================================================
    console.log('\n--- [SUITE 2] K01–K12 Planted Defects & Government Registry Cross-Verification ---');

    // Seed test business records and record consent for each applicant
    const applicantCodes = ['K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'K07', 'K08', 'K09', 'K10', 'K11', 'K12'];
    const applicantResults: Record<string, any> = {};

    for (const code of applicantCodes) {
      const bizId = `TEST-BIZ-${code}`;
      await prisma.business.upsert({
        where: { id: bizId },
        update: {},
        create: {
          id: bizId,
          legalName: `Specimen Business ${code}`,
          tradeName: `Specimen ${code}`,
          constitution: 'Proprietorship',
          segment: Segment.MICRO_RETAIL,
          city: 'Visakhapatnam',
          cityTier: 2,
          state: 'Andhra Pradesh'
        }
      });

      // Grant affirmative DPDP consent for test specimen
      await consentService.recordConsent({
        businessId: bizId,
        purposeText: `Hackathon automated evaluation for specimen ${code}`
      });

      console.log(`  Processing specimen ${code}...`);
      const res = await kycService.processApplicantSpecimen(bizId, code);
      applicantResults[code] = res;
    }

    // ----------------------------------------------------------------
    // K01: Cancelled GSTIN in registry + Missing Udyam number on certificate
    // ----------------------------------------------------------------
    const k01 = applicantResults['K01'];
    assert(k01.status === KycDecisionStatus.MANUAL_REVIEW, 'K01 flagged for MANUAL_REVIEW');
    assert(k01.canProceedToCheckout === false, 'K01 cannot proceed to checkout');
    assert(
      k01.detectedDefects.some((d: string) => d.includes('GSTIN_STATUS_CANCELLED')),
      'K01 correctly detected GSTIN_STATUS_CANCELLED defect'
    );
    assert(
      k01.detectedDefects.some((d: string) => d.includes('MISSING_UDYAM_NUMBER')),
      'K01 correctly detected MISSING_UDYAM_NUMBER defect'
    );

    // ----------------------------------------------------------------
    // K02: Missing Primary Page (Only Annexure schedule uploaded)
    // ----------------------------------------------------------------
    const k02 = applicantResults['K02'];
    assert(k02.status === KycDecisionStatus.MANUAL_REVIEW, 'K02 flagged for MANUAL_REVIEW');
    assert(k02.canProceedToCheckout === false, 'K02 cannot proceed to checkout');
    assert(
      k02.detectedDefects.some((d: string) => d.includes('MISSING_PRIMARY_PAGE')),
      'K02 correctly detected MISSING_PRIMARY_PAGE defect'
    );

    // ----------------------------------------------------------------
    // K03: OCR Ambiguity (letter O vs digit 0)
    // ----------------------------------------------------------------
    const k03 = applicantResults['K03'];
    assert(k03.status === KycDecisionStatus.MANUAL_REVIEW, 'K03 flagged for MANUAL_REVIEW');
    assert(k03.canProceedToCheckout === false, 'K03 cannot proceed to checkout');
    assert(
      k03.detectedDefects.some((d: string) => d.includes('OCR_AMBIGUITY_DETECTED')),
      'K03 detected OCR_AMBIGUITY_DETECTED (27XUIXGO767D1ZP vs 27XUIXG0767D1ZP)'
    );

    // ----------------------------------------------------------------
    // K04: Extreme Blur (Laplacian variance ~ 1.03 < 50.0)
    // ----------------------------------------------------------------
    const k04 = applicantResults['K04'];
    assert(k04.status === KycDecisionStatus.MANUAL_REVIEW, 'K04 flagged for MANUAL_REVIEW');
    assert(k04.canProceedToCheckout === false, 'K04 cannot proceed to checkout');
    assert(
      k04.detectedDefects.some((d: string) => d.includes('FLAGGED_BLUR')),
      'K04 correctly detected FLAGGED_BLUR defect'
    );

    // ----------------------------------------------------------------
    // K05: Missing Udyam Document
    // ----------------------------------------------------------------
    const k05 = applicantResults['K05'];
    assert(k05.status === KycDecisionStatus.MANUAL_REVIEW, 'K05 flagged for MANUAL_REVIEW');
    assert(k05.canProceedToCheckout === false, 'K05 cannot proceed to checkout');
    assert(
      k05.detectedDefects.some((d: string) => d.includes('MISSING_UDYAM_DOCUMENT')),
      'K05 correctly detected MISSING_UDYAM_DOCUMENT defect'
    );

    // ----------------------------------------------------------------
    // K06: Altered GSTIN (8189 vs 5189)
    // ----------------------------------------------------------------
    const k06 = applicantResults['K06'];
    assert(k06.status === KycDecisionStatus.MANUAL_REVIEW, 'K06 flagged for MANUAL_REVIEW');
    assert(k06.canProceedToCheckout === false, 'K06 cannot proceed to checkout');
    assert(
      k06.detectedDefects.some(
        (d: string) =>
          d.includes('GSTIN_NOT_IN_REGISTRY') ||
          d.includes('GSTIN_FORMAT_INVALID') ||
          d.includes('OCR_AMBIGUITY')
      ),
      'K06 detected GSTIN defect (altered document)'
    );

    // ----------------------------------------------------------------
    // K07: OCR Ambiguity + Name Mismatch
    // ----------------------------------------------------------------
    const k07 = applicantResults['K07'];
    assert(k07.status === KycDecisionStatus.MANUAL_REVIEW, 'K07 flagged for MANUAL_REVIEW');
    assert(k07.canProceedToCheckout === false, 'K07 cannot proceed to checkout');
    assert(
      k07.detectedDefects.some((d: string) => d.includes('OCR_AMBIGUITY_DETECTED') || d.includes('NAME_MISMATCH')),
      'K07 detected OCR_AMBIGUITY_DETECTED or NAME_MISMATCH'
    );

    // ----------------------------------------------------------------
    // K08: OCR Ambiguity (24X0RXG9365M1Z3 vs 24XORXG9365M1Z3)
    // ----------------------------------------------------------------
    const k08 = applicantResults['K08'];
    assert(k08.status === KycDecisionStatus.MANUAL_REVIEW, 'K08 flagged for MANUAL_REVIEW');
    assert(k08.canProceedToCheckout === false, 'K08 cannot proceed to checkout');
    assert(
      k08.detectedDefects.some((d: string) => d.includes('OCR_AMBIGUITY_DETECTED')),
      'K08 detected OCR_AMBIGUITY_DETECTED (digit 0 vs letter O)'
    );

    // ----------------------------------------------------------------
    // K09: Clean & Fully Valid Specimen!
    // ----------------------------------------------------------------
    const k09 = applicantResults['K09'];
    assert(k09.status === KycDecisionStatus.VERIFIED, 'K09 successfully VERIFIED with 0 defects');
    assert(k09.canProceedToCheckout === true, 'K09 permitted to proceed to checkout');
    assert(k09.gstinVerified === true, 'K09 GSTIN active and verified in registry');
    assert(k09.udyamVerified === true, 'K09 Udyam active and verified in registry');
    assert(k09.detectedDefects.length === 0, `K09 has 0 defects (got: ${k09.detectedDefects.length})`);

    // ----------------------------------------------------------------
    // K10: Altered GSTIN (HIX vs HJX)
    // ----------------------------------------------------------------
    const k10 = applicantResults['K10'];
    assert(k10.status === KycDecisionStatus.MANUAL_REVIEW, 'K10 flagged for MANUAL_REVIEW');
    assert(k10.canProceedToCheckout === false, 'K10 cannot proceed to checkout');
    assert(
      k10.detectedDefects.some(
        (d: string) =>
          d.includes('GSTIN_NOT_IN_REGISTRY') ||
          d.includes('GSTIN_FORMAT_INVALID') ||
          d.includes('OCR_AMBIGUITY')
      ),
      'K10 detected GSTIN defect (altered document)'
    );

    // ----------------------------------------------------------------
    // K11: Address Proof Expired (> 90 days validity window)
    // ----------------------------------------------------------------
    const k11 = applicantResults['K11'];
    assert(k11.status === KycDecisionStatus.MANUAL_REVIEW, 'K11 flagged for MANUAL_REVIEW');
    assert(k11.canProceedToCheckout === false, 'K11 cannot proceed to checkout');
    assert(
      k11.detectedDefects.some((d: string) => d.includes('ADDRESS_PROOF_EXPIRED')),
      'K11 correctly detected ADDRESS_PROOF_EXPIRED defect (bill from Oct 2025 > 90 days)'
    );

    // ----------------------------------------------------------------
    // K12: Clean & Fully Valid Specimen!
    // ----------------------------------------------------------------
    const k12 = applicantResults['K12'];
    assert(k12.status === KycDecisionStatus.VERIFIED, 'K12 successfully VERIFIED with 0 defects');
    assert(k12.canProceedToCheckout === true, 'K12 permitted to proceed to checkout');
    assert(k12.gstinVerified === true, 'K12 GSTIN active and verified in registry');
    assert(k12.udyamVerified === true, 'K12 Udyam active and verified in registry');
    assert(k12.detectedDefects.length === 0, `K12 has 0 defects (got: ${k12.detectedDefects.length})`);

    // ================================================================
    // SUITE 3: AUDITED MANUAL OVERRIDE & CRYPTOGRAPHIC HASHING
    // ================================================================
    console.log('\n--- [SUITE 3] Audited Manual Override & Tamper-Evident SHA-256 Hash ---');

    // 3.1 Unauthorized role (e.g. SALES_AGENT) must be rejected
    let unauthorizedOverrideThrown = false;
    try {
      await kycService.overrideVerification({
        verificationId: k03.verificationId,
        authorizerUserId: 'SALES-AGENT-42',
        authorizerRole: 'SALES_AGENT' as any,
        reasonCode: 'EXCEPTION_APPROVED',
        reasonText: 'Approved on behalf of sales'
      });
    } catch (err: any) {
      if (err.status === 403) unauthorizedOverrideThrown = true;
    }
    assert(unauthorizedOverrideThrown, 'Manual override by unauthorized role throws 403 Forbidden');

    // 3.2 Authorized override by COMPLIANCE_OFFICER on K03 (optical ambiguity)
    const overrideRes = await kycService.overrideVerification({
      verificationId: k03.verificationId,
      authorizerUserId: 'COMPLIANCE-OFFICER-07',
      authorizerRole: 'COMPLIANCE_OFFICER',
      reasonCode: 'OPTICAL_AMBIGUITY_CONFIRMED',
      reasonText: 'Proprietor physically presented original certificate matching GSTIN 27XUIXG0767D1ZP.'
    });

    assert(
      overrideRes.status === KycDecisionStatus.OVERRIDDEN_VERIFIED,
      'Status transitioned to OVERRIDDEN_VERIFIED'
    );
    assert(overrideRes.canProceedToCheckout === true, 'Overridden applicant now permitted to proceed to checkout');

    // 3.3 Verify KycAuditLog in database
    const auditLogs = await prisma.kycAuditLog.findMany({
      where: { kycVerificationId: k03.verificationId }
    });
    assert(auditLogs.length > 0, 'KycAuditLog record created in database');
    const audit = auditLogs[0];
    assert(audit.authorizerRole === 'COMPLIANCE_OFFICER', 'Audit log records COMPLIANCE_OFFICER role');
    assert(audit.authorizerUserId === 'COMPLIANCE-OFFICER-07', 'Audit log records officer user ID');
    assert(
      audit.overridePayloadHash.length === 64,
      `Audit log has valid 64-char SHA-256 hash: ${audit.overridePayloadHash.substring(0, 16)}...`
    );

    // ================================================================
    // SUITE 4: CHECKOUT ELIGIBILITY GATE
    // ================================================================
    console.log('\n--- [SUITE 4] Checkout Eligibility Gate Verification ---');

    // 4.1 Unverified applicant K01 cannot checkout
    const eligK01 = await kycService.getCheckoutEligibility('TEST-BIZ-K01');
    assert(eligK01.eligible === false, 'K01 checkout eligibility is false');
    assert(eligK01.kycStatus === KycDecisionStatus.MANUAL_REVIEW, 'K01 status is MANUAL_REVIEW');

    // 4.2 Verified applicant K09 can checkout
    const eligK09 = await kycService.getCheckoutEligibility('TEST-BIZ-K09');
    assert(eligK09.eligible === true, 'K09 checkout eligibility is true');
    assert(eligK09.kycStatus === KycDecisionStatus.VERIFIED, 'K09 status is VERIFIED');

    // 4.3 Overridden applicant K03 can checkout
    const eligK03 = await kycService.getCheckoutEligibility('TEST-BIZ-K03');
    assert(eligK03.eligible === true, 'Overridden K03 checkout eligibility is true');
    assert(eligK03.kycStatus === KycDecisionStatus.OVERRIDDEN_VERIFIED, 'K03 status is OVERRIDDEN_VERIFIED');

    // ================================================================
    // SUITE 5: LIVE HTTP REST API INTEGRATION
    // ================================================================
    console.log('\n--- [SUITE 5] Live HTTP REST API Integration ---');

    // 5.1 POST /api/kyc/consent
    const httpConsent = await httpRequest(port, '/api/kyc/consent', 'POST', {
      businessId: 'TEST-BIZ-K09',
      retentionDays: 45
    });
    assert(httpConsent.status === 201, `POST /api/kyc/consent returned 201 Created (got ${httpConsent.status})`);
    assert(httpConsent.data.consentGiven === true, 'API returned consentGiven: true');

    // 5.2 GET /api/kyc/checkout-eligibility/:businessId
    const httpElig = await httpRequest(port, '/api/kyc/checkout-eligibility/TEST-BIZ-K09');
    assert(httpElig.status === 200, `GET /api/kyc/checkout-eligibility returned 200 OK (got ${httpElig.status})`);
    assert(httpElig.data.eligible === true, 'API returned eligible: true for K09');

    // 5.3 GET /api/kyc/status/:verificationId
    const httpStatus = await httpRequest(port, `/api/kyc/status/${k09.verificationId}`);
    assert(httpStatus.status === 200, `GET /api/kyc/status/:id returned 200 OK (got ${httpStatus.status})`);
    assert(httpStatus.data.status === 'VERIFIED', 'API returned status VERIFIED');
    assert(httpStatus.data.documents.length === 4, 'API returned all 4 evaluated documents');

    // Generate signed test JWTs
    const adminToken = jwt.sign(
      { sub: 'SYSADMIN-1', role: 'ADMIN', iss: AUTH_CONFIG.JWT_ISSUER, aud: AUTH_CONFIG.JWT_AUDIENCE },
      AUTH_CONFIG.JWT_SECRET
    );
    const unauthorizedToken = jwt.sign(
      { sub: 'OPERATOR-1', role: 'OPERATIONS', iss: AUTH_CONFIG.JWT_ISSUER, aud: AUTH_CONFIG.JWT_AUDIENCE },
      AUTH_CONFIG.JWT_SECRET
    );

    // 5.4 POST /api/kyc/override with unauthorized role returns 403 Forbidden
    const httpOverrideFail = await httpRequest(
      port,
      '/api/kyc/override',
      'POST',
      {
        verificationId: k01.verificationId,
        reasonCode: 'EXCEPTION',
        reasonText: 'Override attempt'
      },
      { Authorization: `Bearer ${unauthorizedToken}` }
    );
    assert(
      httpOverrideFail.status === 403,
      `POST /api/kyc/override with unauthorized role returned 403 Forbidden (got ${httpOverrideFail.status})`
    );

    // 5.5 POST /api/kyc/override with authenticated ADMIN role succeeds
    const httpOverrideOk = await httpRequest(
      port,
      '/api/kyc/override',
      'POST',
      {
        verificationId: k01.verificationId,
        reasonCode: 'OFFLINE_AFFIDAVIT_VERIFIED',
        reasonText: 'Customer provided renewed GST registration certificate offline.'
      },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(
      httpOverrideOk.status === 200,
      `POST /api/kyc/override with ADMIN role returned 200 OK (got ${httpOverrideOk.status})`
    );
    assert(
      httpOverrideOk.data.status === KycDecisionStatus.OVERRIDDEN_VERIFIED,
      'Status updated to OVERRIDDEN_VERIFIED via API'
    );

    // 5.6 DELETE /api/kyc/data/:businessId (Right to be Forgotten) guarded by ADMIN JWT
    const httpPurge = await httpRequest(
      port,
      '/api/kyc/data/TEST-BIZ-CONSENT',
      'DELETE',
      undefined,
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(httpPurge.status === 200, `DELETE /api/kyc/data returned 200 OK (got ${httpPurge.status})`);
    assert(httpPurge.data.success === true, 'Purge API returned success: true');

    // 5.7 Security Verification: Unauthenticated request or forged header without JWT is rejected with 401
    const httpBodySpoof = await httpRequest(
      port,
      '/api/kyc/override',
      'POST',
      {
        verificationId: k01.verificationId,
        reasonCode: 'SPOOF_ATTEMPT',
        reasonText: 'Attempting to supply forged header without JWT'
      },
      { 'x-staff-role': 'ADMIN', 'x-staff-user-id': 'FORGED_ADMIN' }
    );
    assert(
      httpBodySpoof.status === 401,
      'Client-supplied role in header without server-side authenticated JWT is strictly rejected with 401 Unauthorized'
    );

    // 5.8 Security Verification: Path traversal in document upload is rejected
    const httpPathTraversal = await httpRequest(port, '/api/kyc/process-documents', 'POST', {
      businessId: 'TEST-BIZ-K09',
      documents: [
        {
          documentType: DocumentType.GST_CERTIFICATE,
          filePath: '../../../../etc/shadow'
        }
      ]
    });
    assert(
      httpPathTraversal.status === 400,
      'Path traversal attempt in document upload is blocked with 400 Bad Request'
    );

    // 5.9 Security Verification: Disallowed file extension is rejected
    const httpBadExt = await httpRequest(port, '/api/kyc/process-documents', 'POST', {
      businessId: 'TEST-BIZ-K09',
      documents: [
        {
          documentType: DocumentType.GST_CERTIFICATE,
          filePath: 'payload.exe',
          originalFilename: 'malicious.exe'
        }
      ]
    });
    assert(
      httpBadExt.status === 400,
      'Disallowed file extension (.exe) is blocked with 400 Bad Request'
    );

    // ================================================================
    // SUMMARY REPORT
    // ================================================================
    console.log('\n================================================================');
    console.log('                 PHASE 4 TEST EXECUTION SUMMARY                 ');
    console.log('================================================================');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    console.log(`Total Assertions: ${results.length}`);
    console.log(`Passed:           ${passed}`);
    console.log(`Failed:           ${failed}`);

    if (failed > 0) {
      console.error('\nFailed tests:');
      results.filter((r) => !r.passed).forEach((r) => console.error(`  - ${r.name}: ${r.error}`));
      process.exit(1);
    } else {
      console.log('\n🎉 ALL PHASE 4 KYC & OCR TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    }
  } catch (error) {
    console.error('Test Suite encountered fatal error:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPhase4TestSuite();
