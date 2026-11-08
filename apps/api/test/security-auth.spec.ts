import { NestFactory } from '@nestjs/core';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { AUTH_CONFIG } from '../src/modules/auth/auth.constants';
import { KycVerificationService } from '../src/modules/kyc/kyc-verification.service';
import { ConsentService } from '../src/modules/kyc/consent.service';
import { OrderService } from '../src/modules/order/order.service';
import { QuoteService } from '../src/modules/quote/quote.service';
import { StaffRole, Segment, OrderStatus } from '@udyamone/shared-types';

interface HttpResponse {
  status: number;
  data: any;
}

function makeRequest(
  port: number,
  path: string,
  method = 'GET',
  body: any = null,
  customHeaders: Record<string, string> = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
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

async function runSecurityTestSuite() {
  console.log('================================================================');
  console.log('       UDYAMONE SECURITY GATE: AUTHENTICATION & ACCESS CONTROL  ');
  console.log('================================================================');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');

  const server = await app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 4466;
  console.log(`[SECURITY TEST HARNESS] Listening on port ${port}`);

  const prisma = app.get(PrismaService);
  const authService = app.get(AuthService);
  const kycService = app.get(KycVerificationService);
  const consentService = app.get(ConsentService);
  const orderService = app.get(OrderService);
  const quoteService = app.get(QuoteService);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  try {
    // ----------------------------------------------------------------
    // SUITE 1: Staff Authentication, Passwords & JWT Issuance
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 1] Staff Authentication, Bcrypt Hashes & JWT Issuance ---');

    await authService.seedDemoStaffAccounts();

    // Verify bcrypt hashes in DB
    const complianceUser = await prisma.staffUser.findUnique({
      where: { email: 'compliance@accel.telecom' }
    });
    assert(complianceUser !== null, 'Compliance officer account seeded in DB');
    assert(complianceUser!.passwordHash.startsWith('$2'), 'Compliance officer password is stored as bcrypt hash');
    assert(!complianceUser!.passwordHash.includes('Accel@2026'), 'Plaintext password is completely absent from database');

    const adminUser = await prisma.staffUser.findUnique({
      where: { email: 'admin@accel.telecom' }
    });
    assert(adminUser !== null, 'Admin account seeded in DB');
    assert(adminUser!.passwordHash.startsWith('$2'), 'Admin password is stored as bcrypt hash');

    const opsUser = await prisma.staffUser.findUnique({
      where: { email: 'ops@accel.telecom' }
    });
    assert(opsUser !== null, 'Operations account seeded in DB');

    const techUser = await prisma.staffUser.findUnique({
      where: { email: 'tech@accel.telecom' }
    });
    assert(techUser !== null, 'Technician account seeded in DB');

    // Login with invalid password
    const badLogin = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'compliance@accel.telecom',
      password: 'WrongPassword123!'
    });
    assert(badLogin.status === 401, 'Invalid password rejected with 401 Unauthorized');

    // Login with non-existent user
    const noUserLogin = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'nonexistent@accel.telecom',
      password: 'SomePassword'
    });
    assert(noUserLogin.status === 401, 'Non-existent user rejected with 401 Unauthorized');

    // Successful logins for each role
    const complianceLogin = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'compliance@accel.telecom',
      password: 'Accel@2026!Compliance'
    });
    if (complianceLogin.status !== 200) {
      console.log('DEBUG complianceLogin failure:', complianceLogin);
    }
    assert(complianceLogin.status === 200, 'Compliance officer login succeeded (200 OK)');
    assert(!!complianceLogin.data.accessToken, 'Issued JWT accessToken');
    assert(complianceLogin.data.user.role === StaffRole.COMPLIANCE_OFFICER, 'Returned role is COMPLIANCE_OFFICER');

    const complianceToken = complianceLogin.data.accessToken;

    const adminLogin = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'admin@accel.telecom',
      password: 'Accel@2026!Admin'
    });
    assert(adminLogin.status === 200, 'Admin login succeeded (200 OK)');
    const adminToken = adminLogin.data.accessToken;

    const opsLogin = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'ops@accel.telecom',
      password: 'Accel@2026!Operations'
    });
    assert(opsLogin.status === 200, 'Operations login succeeded (200 OK)');
    const opsToken = opsLogin.data.accessToken;

    const techLogin = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'tech@accel.telecom',
      password: 'Accel@2026!Technician'
    });
    assert(techLogin.status === 200, 'Technician login succeeded (200 OK)');
    const techToken = techLogin.data.accessToken;

    // Verify /api/auth/staff/me with valid token
    const meRes = await makeRequest(port, '/api/auth/staff/me', 'GET', null, {
      Authorization: `Bearer ${complianceToken}`
    });
    assert(meRes.status === 200, 'GET /api/auth/staff/me succeeded with valid JWT');
    assert(meRes.data.user.role === StaffRole.COMPLIANCE_OFFICER, 'Decoded user profile has COMPLIANCE_OFFICER role');
    assert(meRes.data.user.iss === AUTH_CONFIG.JWT_ISSUER, 'Decoded JWT has verified issuer');
    assert(meRes.data.user.aud === AUTH_CONFIG.JWT_AUDIENCE, 'Decoded JWT has verified audience');

    // ----------------------------------------------------------------
    // SUITE 2: Rejection of Forgeries, Expired Tokens & Tampering
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 2] Rejection of Forged Headers, Expired Tokens & Tampered JWTs ---');

    // 1. Unauthenticated request
    const unauthMe = await makeRequest(port, '/api/auth/staff/me', 'GET');
    assert(unauthMe.status === 401, 'Unauthenticated request rejected with 401 Unauthorized');

    // 2. Request with forged x-staff-role header (without Bearer token)
    const forgedHeaderMe = await makeRequest(port, '/api/auth/staff/me', 'GET', null, {
      'x-staff-role': 'ADMIN',
      'x-staff-user-id': 'SPOOFED_ADMIN_ID'
    });
    assert(forgedHeaderMe.status === 401, 'Forged x-staff-role header rejected with 401 Unauthorized');

    // 3. Request with malformed Authorization header
    const malformedAuth = await makeRequest(port, '/api/auth/staff/me', 'GET', null, {
      Authorization: 'Basic dXNlcjpwYXNz'
    });
    assert(malformedAuth.status === 401, 'Malformed Basic auth rejected with 401 Unauthorized');

    // 4. Request with tampered secret / invalid signature
    const forgedToken = jwt.sign(
      { sub: 'hacker', role: 'ADMIN', iss: AUTH_CONFIG.JWT_ISSUER, aud: AUTH_CONFIG.JWT_AUDIENCE },
      'wrong_signing_secret_hacked_key'
    );
    const tamperedRes = await makeRequest(port, '/api/auth/staff/me', 'GET', null, {
      Authorization: `Bearer ${forgedToken}`
    });
    assert(tamperedRes.status === 401, 'Tampered JWT signature strictly rejected with 401 Unauthorized');

    // 5. Request with expired token
    const expiredToken = jwt.sign(
      { sub: 'old_user', role: 'ADMIN', iss: AUTH_CONFIG.JWT_ISSUER, aud: AUTH_CONFIG.JWT_AUDIENCE },
      AUTH_CONFIG.JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const expiredRes = await makeRequest(port, '/api/auth/staff/me', 'GET', null, {
      Authorization: `Bearer ${expiredToken}`
    });
    assert(expiredRes.status === 401, 'Expired JWT strictly rejected with 401 Unauthorized');

    // 6. Request with invalid audience
    const badAudToken = jwt.sign(
      { sub: 'user', role: 'ADMIN', iss: AUTH_CONFIG.JWT_ISSUER, aud: 'wrong_audience' },
      AUTH_CONFIG.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const badAudRes = await makeRequest(port, '/api/auth/staff/me', 'GET', null, {
      Authorization: `Bearer ${badAudToken}`
    });
    assert(badAudRes.status === 401, 'Invalid audience JWT rejected with 401 Unauthorized');

    // ----------------------------------------------------------------
    // SUITE 3: Role-Based Authorization on Staff-Only Endpoints
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 3] Role-Based Authorization on Staff Endpoints ---');

    // Setup a flagged verification for testing manual override
    const testBiz = await prisma.business.upsert({
      where: { id: 'BIZ-SEC-TEST-01' },
      update: {},
      create: {
        id: 'BIZ-SEC-TEST-01',
        legalName: 'Security Test Enterprise',
        tradeName: 'SecTest Enterprise',
        constitution: 'Proprietorship',
        segment: Segment.PROFESSIONAL_OFFICE,
        city: 'Nagpur',
        cityTier: 2,
        state: 'Maharashtra',
        hasGstin: true,
        gstin: '27XUIXG0767D1ZP'
      }
    });

    await consentService.recordConsent({
      businessId: testBiz.id,
      purposeText: 'Security test consent'
    });

    const k03Result = await kycService.processApplicantSpecimen(testBiz.id, 'K03');
    const verificationId = k03Result.verificationId;

    // Test 3.1: KYC manual override with forged header (no token) -> 401
    const unauthOverride = await makeRequest(port, '/api/kyc/override', 'POST', {
      verificationId,
      reasonCode: 'OPTICAL_AMBIGUITY_CONFIRMED',
      reasonText: 'Unauthorized override attempt'
    }, {
      'x-staff-role': 'ADMIN',
      'x-staff-user-id': 'FORGED_ADMIN'
    });
    assert(unauthOverride.status === 401, 'KYC override with forged header without JWT rejected with 401 Unauthorized');

    // Test 3.2: KYC manual override with OPERATIONS token (unauthorized role) -> 403
    const opsOverride = await makeRequest(port, '/api/kyc/override', 'POST', {
      verificationId,
      reasonCode: 'OPTICAL_AMBIGUITY_CONFIRMED',
      reasonText: 'Ops attempting compliance override'
    }, {
      Authorization: `Bearer ${opsToken}`
    });
    assert(opsOverride.status === 403, 'KYC override with OPERATIONS role rejected with 403 Forbidden');

    // Test 3.3: KYC manual override with TECHNICIAN token -> 403
    const techOverride = await makeRequest(port, '/api/kyc/override', 'POST', {
      verificationId,
      reasonCode: 'OPTICAL_AMBIGUITY_CONFIRMED',
      reasonText: 'Tech attempting compliance override'
    }, {
      Authorization: `Bearer ${techToken}`
    });
    assert(techOverride.status === 403, 'KYC override with TECHNICIAN role rejected with 403 Forbidden');

    // Test 3.4: KYC manual override with COMPLIANCE_OFFICER token -> 200 OK
    const complianceOverride = await makeRequest(port, '/api/kyc/override', 'POST', {
      verificationId,
      reasonCode: 'OPTICAL_AMBIGUITY_CONFIRMED',
      reasonText: 'Proprietor physically verified original registration certificate.'
    }, {
      Authorization: `Bearer ${complianceToken}`
    });
    assert(complianceOverride.status === 200, 'KYC override with COMPLIANCE_OFFICER token succeeded (200 OK)');
    assert(complianceOverride.data.status === 'OVERRIDDEN_VERIFIED', 'Status transitioned to OVERRIDDEN_VERIFIED');

    // Verify actor in KycAuditLog
    const auditRecord = await prisma.kycAuditLog.findFirst({
      where: { kycVerificationId: verificationId },
      orderBy: { createdAt: 'desc' }
    });
    assert(auditRecord !== null, 'KycAuditLog record created');
    assert(auditRecord!.authorizerRole === 'COMPLIANCE_OFFICER', 'Audit log records verified COMPLIANCE_OFFICER role');
    assert(auditRecord!.authorizerUserId === complianceUser!.id, 'Audit log records authenticated staff user ID from JWT');

    // Test 3.5: Purge customer data endpoint security
    const unauthPurge = await makeRequest(port, `/api/kyc/data/${testBiz.id}`, 'DELETE');
    assert(unauthPurge.status === 401, 'Unauthenticated data purge rejected with 401 Unauthorized');

    const opsPurge = await makeRequest(port, `/api/kyc/data/${testBiz.id}`, 'DELETE', null, {
      Authorization: `Bearer ${opsToken}`
    });
    assert(opsPurge.status === 403, 'Data purge by OPERATIONS role rejected with 403 Forbidden');

    // ----------------------------------------------------------------
    // SUITE 4: Order Security, Internal Details & Transition Control
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 4] Order Security, Customer PII Protection & Transition Guards ---');

    // Create an order for testing
    const quote = await quoteService.calculateQuote({
      businessId: testBiz.id,
      items: [{ productId: 'P01', quantity: 1 }],
      save: true
    });
    const quoteRecord = await prisma.quote.findUnique({ where: { quoteNumber: quote.quoteNumber } });

    const checkoutRes = await orderService.checkout({
      businessId: testBiz.id,
      quoteId: quoteRecord!.id,
      contactName: 'Ramesh Patel',
      contactPhone: '+91 9822012345',
      installationAddress: 'Plot 42, MIDC Hingna Industrial Area',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440028'
    });
    const orderNumber = checkoutRes.orderNumber;
    assert(!!orderNumber, 'Order placed successfully for security tests');

    // Test 4.1: Internal order details with customer PII without authentication -> 401
    const unauthOrder = await makeRequest(port, `/api/orders/${orderNumber}`, 'GET');
    assert(unauthOrder.status === 401, 'Internal order details with customer PII strictly rejects unauthenticated access (401)');

    // Test 4.2: Internal order details with forged x-staff-role header (no JWT) -> 401
    const forgedOrder = await makeRequest(port, `/api/orders/${orderNumber}`, 'GET', null, {
      'x-staff-role': 'ADMIN'
    });
    assert(forgedOrder.status === 401, 'Internal order details strictly rejects forged x-staff-role header (401)');

    // Test 4.3: Internal order details with authenticated staff JWT -> 200 OK
    const authedOrder = await makeRequest(port, `/api/orders/${orderNumber}`, 'GET', null, {
      Authorization: `Bearer ${opsToken}`
    });
    assert(authedOrder.status === 200, 'Authenticated staff can access internal order details (200 OK)');
    assert(authedOrder.data.contactName === 'Ramesh Patel', 'Internal order contains contactName');
    assert(authedOrder.data.contactPhone === '+91 9822012345', 'Internal order contains unmasked phone for operations');

    // Test 4.4: Order transition without authentication -> 401
    const unauthTransition = await makeRequest(port, `/api/orders/${orderNumber}/transition`, 'POST', {
      toStatus: OrderStatus.KYC_VALIDATED
    });
    assert(unauthTransition.status === 401, 'Unauthenticated order transition rejected with 401 Unauthorized');

    // Test 4.5: Order transition with COMPLIANCE_OFFICER token (only OPS/ADMIN/TECH allowed) -> 403
    const complianceTransition = await makeRequest(port, `/api/orders/${orderNumber}/transition`, 'POST', {
      toStatus: OrderStatus.KYC_VALIDATED
    }, {
      Authorization: `Bearer ${complianceToken}`
    });
    assert(complianceTransition.status === 403, 'Order transition with COMPLIANCE_OFFICER role rejected with 403 Forbidden');

    // Test 4.6: Order transition with OPERATIONS token -> 200 OK
    const opsTransition = await makeRequest(port, `/api/orders/${orderNumber}/transition`, 'POST', {
      toStatus: OrderStatus.KYC_VALIDATED,
      reason: 'KYC verified and cleared by Operations'
    }, {
      Authorization: `Bearer ${opsToken}`
    });
    assert(opsTransition.status === 200, 'Order transition with OPERATIONS token succeeded (200 OK)');
    assert(opsTransition.data.status === OrderStatus.KYC_VALIDATED, 'Order status transitioned to KYC_VALIDATED');

    // Verify actor in OrderEvent
    const orderEvent = await prisma.orderEvent.findFirst({
      where: { orderId: authedOrder.data.id, toStatus: OrderStatus.KYC_VALIDATED },
      orderBy: { createdAt: 'desc' }
    });
    assert(orderEvent !== null, 'OrderEvent created in database');
    const meta = orderEvent!.metadata as any;
    assert(meta.actorRole === 'OPERATIONS', 'OrderEvent metadata records verified actorRole OPERATIONS');
    assert(meta.actorUserId === opsUser!.id, 'OrderEvent metadata records authenticated staff userId from JWT');

    // ----------------------------------------------------------------
    // SUITE 5: Transaction Consistency & TOCTOU Prevention
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 5] Checkout Transaction Consistency & Race-Condition Prevention ---');

    // Setup another business for transaction test
    const txBiz = await prisma.business.upsert({
      where: { id: 'BIZ-SEC-TX-TEST' },
      update: {},
      create: {
        id: 'BIZ-SEC-TX-TEST',
        legalName: 'Transaction Test Corp',
        tradeName: 'TxTest Corp',
        constitution: 'Proprietorship',
        segment: Segment.PROFESSIONAL_OFFICE,
        city: 'Visakhapatnam',
        cityTier: 2,
        state: 'Andhra Pradesh',
        hasGstin: true,
        gstin: '37LDYXK0296F1ZB'
      }
    });

    await consentService.recordConsent({
      businessId: txBiz.id,
      purposeText: 'Transaction test consent'
    });

    await kycService.processApplicantSpecimen(txBiz.id, 'K09'); // Status: VERIFIED

    const txQuote = await quoteService.calculateQuote({
      businessId: txBiz.id,
      items: [{ productId: 'P01', quantity: 1 }],
      save: true
    });
    const txQuoteRecord = await prisma.quote.findUnique({ where: { quoteNumber: txQuote.quoteNumber } });

    // Revoke consent right before checkout
    await consentService.revokeConsent(txBiz.id);

    // Attempt checkout: transaction revalidation must catch revoked consent inside transaction boundary
    let txConsentBlocked = false;
    try {
      await orderService.checkout({
        businessId: txBiz.id,
        quoteId: txQuoteRecord!.id,
        contactName: 'Anita Kulkarni',
        contactPhone: '+91 9876543210',
        installationAddress: 'Shop 217, Dwaraka Nagar',
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        pincode: '530016'
      });
    } catch (err: any) {
      if (err.status === 403 && err.message.includes('DPDP consent')) {
        txConsentBlocked = true;
      }
    }
    assert(txConsentBlocked, 'Revoked consent inside transaction boundary strictly blocks checkout (403)');

    // ----------------------------------------------------------------
    // SUITE 6: Public Tracker Zero PII & Uniform Responses
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 6] Public Tracker Zero-PII Leakage & Uniform Responses ---');

    // Public tracker with raw token
    const publicTrackerRes = await makeRequest(port, `/api/tracking/${checkoutRes.trackingToken}`, 'GET');
    assert(publicTrackerRes.status === 200, 'Public tracking returns 200 OK');
    assert(publicTrackerRes.data.maskedCustomer.contactName === 'R***** P****', 'Customer name is masked in public response');
    assert(publicTrackerRes.data.maskedCustomer.contactPhone === '+91 ********45', 'Phone number is masked in public response');
    assert(publicTrackerRes.data.orderId === undefined, 'orderId is completely stripped from public response');
    assert(publicTrackerRes.data.trackingTokenHash === undefined, 'trackingTokenHash is completely stripped from public response');

    // Invalid token returns uniform 404
    const invalidTrack1 = await makeRequest(port, '/api/tracking/TRK-2026-INVALID-TOKEN-12345', 'GET');
    assert(invalidTrack1.status === 404, 'Non-existent token returns uniform 404 Not Found');
    assert(invalidTrack1.data.message === 'Order not found or tracking token expired.', 'Uniform 404 message prevents oracle enumeration');

  } finally {
    await app.close();
  }

  console.log('\n================================================================');
  console.log('                 SECURITY TEST EXECUTION SUMMARY                ');
  console.log('================================================================');
  console.log(`Total Assertions: ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL SECURITY, AUTHENTICATION & ACCESS CONTROL TESTS PASSED!');
  } else {
    process.exit(1);
  }
}

runSecurityTestSuite().catch((e) => {
  console.error('Security test failed with error:', e);
  process.exit(1);
});
