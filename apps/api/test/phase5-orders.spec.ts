import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderService } from '../src/modules/order/order.service';
import { KycVerificationService } from '../src/modules/kyc/kyc-verification.service';
import { QuoteService } from '../src/modules/quote/quote.service';
import { ConsentService } from '../src/modules/kyc/consent.service';
import { OrderStatus, Segment, KycDecisionStatus, DocumentType } from '@udyamone/shared-types';
import { AUTH_CONFIG } from '../src/modules/auth/auth.constants';
import * as http from 'http';
import * as crypto from 'crypto';
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

async function runPhase5TestSuite() {
  console.log('================================================================');
  console.log('    UDYAMONE PHASE 5: CHECKOUT, STATE MACHINE & TRACKING        ');
  console.log('================================================================');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');

  const server = await app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 4455;
  console.log(`[TEST HARNESS] Phase 5 test server running on port ${port}`);

  const prisma = app.get(PrismaService);
  const orderService = app.get(OrderService);
  const kycService = app.get(KycVerificationService);
  const quoteService = app.get(QuoteService);
  const consentService = app.get(ConsentService);

  try {
    // ================================================================
    // FIXTURE SETUP
    // ================================================================
    console.log('\n--- Setting Up Phase 5 Fixtures & Applicants ---');

    // Business A: Clean / Verified applicant (K09)
    const bizVerified = await prisma.business.upsert({
      where: { id: 'BIZ-PHASE5-VERIFIED' },
      update: {},
      create: {
        id: 'BIZ-PHASE5-VERIFIED',
        legalName: 'Anita Kulkarni (Prop. Kaveri Insurance Advisors)',
        tradeName: 'Kaveri Insurance Advisors',
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
      businessId: bizVerified.id,
      purposeText: 'DPDP consent for Phase 5 verification'
    });
    // Process K09 specimen -> Status VERIFIED
    await kycService.processApplicantSpecimen(bizVerified.id, 'K09');

    // Business B: Overridden applicant (K03)
    const bizOverridden = await prisma.business.upsert({
      where: { id: 'BIZ-PHASE5-OVERRIDDEN' },
      update: {},
      create: {
        id: 'BIZ-PHASE5-OVERRIDDEN',
        legalName: 'Ramesh Patel (Prop. Ganesh Woodcraft)',
        tradeName: 'Ganesh Woodcraft',
        constitution: 'Proprietorship',
        segment: Segment.MANUFACTURING,
        city: 'Nagpur',
        cityTier: 2,
        state: 'Maharashtra',
        hasGstin: true,
        gstin: '27XUIXG0767D1ZP'
      }
    });

    await consentService.recordConsent({
      businessId: bizOverridden.id,
      purposeText: 'DPDP consent for Phase 5 overridden verification'
    });
    const k03Result = await kycService.processApplicantSpecimen(bizOverridden.id, 'K03');
    // Perform authorized override
    await kycService.overrideVerification({
      verificationId: k03Result.verificationId,
      authorizerUserId: 'CHIEF-COMPLIANCE-01',
      authorizerRole: 'COMPLIANCE_OFFICER',
      reasonCode: 'OPTICAL_AMBIGUITY_CONFIRMED',
      reasonText: 'Proprietor physically verified original registration certificate.'
    });

    // Business C: Flagged / MANUAL_REVIEW applicant (K01)
    const bizManual = await prisma.business.upsert({
      where: { id: 'BIZ-PHASE5-MANUAL' },
      update: {},
      create: {
        id: 'BIZ-PHASE5-MANUAL',
        legalName: 'Apex Auto Electricals',
        tradeName: 'Apex Auto Electricals',
        constitution: 'Proprietorship',
        segment: Segment.MICRO_RETAIL,
        city: 'Visakhapatnam',
        cityTier: 2,
        state: 'Andhra Pradesh'
      }
    });
    await consentService.recordConsent({
      businessId: bizManual.id,
      purposeText: 'DPDP consent for Phase 5 manual review applicant'
    });
    await kycService.processApplicantSpecimen(bizManual.id, 'K01');

    // Business D: Revoked Consent Business
    const bizRevoked = await prisma.business.upsert({
      where: { id: 'BIZ-PHASE5-REVOKED' },
      update: {},
      create: {
        id: 'BIZ-PHASE5-REVOKED',
        legalName: 'Revoked Security Systems',
        tradeName: 'Revoked Systems',
        constitution: 'Proprietorship',
        segment: Segment.MICRO_RETAIL,
        city: 'Delhi',
        cityTier: 1,
        state: 'Delhi'
      }
    });
    await consentService.recordConsent({ businessId: bizRevoked.id });
    await consentService.revokeConsent(bizRevoked.id);

    // Create valid quotes for testing
    // Quote 1: For BIZ-PHASE5-VERIFIED (P01: Biz Fibre 100M - SLA 5 days + P09: Voice Line - SLA 3 days)
    const quoteVerified = await quoteService.calculateQuote({
      businessId: bizVerified.id,
      items: [
        { productId: 'P01', quantity: 1 },
        { productId: 'P09', quantity: 1 }
      ],
      save: true
    });

    // Quote 2: For BIZ-PHASE5-OVERRIDDEN (P01: Biz Fibre 100M)
    const quoteOverridden = await quoteService.calculateQuote({
      businessId: bizOverridden.id,
      items: [{ productId: 'P01', quantity: 1 }],
      save: true
    });

    // Quote 3: For BIZ-PHASE5-MANUAL (P01)
    const quoteManual = await quoteService.calculateQuote({
      businessId: bizManual.id,
      items: [{ productId: 'P01', quantity: 1 }],
      save: true
    });

    // Quote 4: Expired Quote for BIZ-PHASE5-VERIFIED
    const quoteExpired = await quoteService.calculateQuote({
      businessId: bizVerified.id,
      items: [{ productId: 'P01', quantity: 1 }],
      save: true
    });
    // Set validUntil in the past
    await prisma.quote.update({
      where: { id: quoteExpired.quoteNumber ? (await prisma.quote.findUnique({ where: { quoteNumber: quoteExpired.quoteNumber } }))!.id : '' },
      data: { validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    const expiredRecord = await prisma.quote.findUnique({ where: { quoteNumber: quoteExpired.quoteNumber } });

    const quoteVerifiedRecord = await prisma.quote.findUnique({ where: { quoteNumber: quoteVerified.quoteNumber } });
    const quoteOverriddenRecord = await prisma.quote.findUnique({ where: { quoteNumber: quoteOverridden.quoteNumber } });
    const quoteManualRecord = await prisma.quote.findUnique({ where: { quoteNumber: quoteManual.quoteNumber } });

    // ================================================================
    // SUITE 1: CHECKOUT & ORDER CREATION UNDER STRICT KYC GATE
    // ================================================================
    console.log('\n--- [SUITE 1] Checkout & Order Creation Under KYC Gate ---');

    // 1.1 Checkout blocked for MANUAL_REVIEW applicant (K01)
    let manualCheckoutBlocked = false;
    try {
      await orderService.checkout({
        quoteId: quoteManualRecord!.id,
        businessId: bizManual.id,
        contactName: 'Suresh Kumar',
        contactPhone: '+91 9876543210',
        installationAddress: 'Shop 12, Main Bazaar, Visakhapatnam',
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        pincode: '530001'
      });
    } catch (err: any) {
      if (err.status === 403 && err.message.includes('MANUAL_REVIEW')) {
        manualCheckoutBlocked = true;
      }
    }
    assert(manualCheckoutBlocked, 'Checkout strictly blocked for MANUAL_REVIEW applicant (403 Forbidden)');

    // 1.2 Checkout blocked when DPDP consent is revoked
    let revokedCheckoutBlocked = false;
    try {
      await orderService.checkout({
        quoteId: quoteVerifiedRecord!.id,
        businessId: bizRevoked.id,
        contactName: 'Amit Verma',
        contactPhone: '+91 9876543211',
        installationAddress: 'Sector 5, Delhi',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001'
      });
    } catch (err: any) {
      if (err.status === 403 || err.message.includes('belongs to business') || err.message.includes('consent')) {
        revokedCheckoutBlocked = true;
      }
    }
    assert(revokedCheckoutBlocked, 'Checkout blocked when quote belongs to another business or consent is revoked');

    // 1.3 Checkout blocked for expired quote
    let expiredQuoteBlocked = false;
    try {
      await orderService.checkout({
        quoteId: expiredRecord!.id,
        businessId: bizVerified.id,
        contactName: 'Anita Kulkarni',
        contactPhone: '+91 9876543212',
        installationAddress: 'Shop 217, Civil Lines, Visakhapatnam',
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        pincode: '530002'
      });
    } catch (err: any) {
      if (err.status === 400 && err.message.includes('expired')) {
        expiredQuoteBlocked = true;
      }
    }
    assert(expiredQuoteBlocked, 'Checkout strictly blocked for expired quote (400 Bad Request)');

    // 1.4 Successful checkout for VERIFIED applicant (K09)
    const checkoutVerified = await orderService.checkout({
      quoteId: quoteVerifiedRecord!.id,
      businessId: bizVerified.id,
      contactName: 'Anita Kulkarni',
      contactPhone: '+91 9876543210',
      installationAddress: 'Shop/Unit 217, Civil Lines, Visakhapatnam',
      city: 'Visakhapatnam',
      state: 'Andhra Pradesh',
      pincode: '530002'
    });

    assert(checkoutVerified.orderNumber.startsWith('ORD-2026-'), `Order number generated: ${checkoutVerified.orderNumber}`);
    assert(checkoutVerified.status === OrderStatus.ORDER_RECEIVED, 'Initial order status is ORDER_RECEIVED');
    assert(checkoutVerified.trackingToken.startsWith('TRK-2026-'), 'High-entropy secret tracking token returned');
    assert(checkoutVerified.calculatedSlaDays === 5, `Installation SLA is 5 days (max of P01: 5, P09: 3; got ${checkoutVerified.calculatedSlaDays})`);
    assert(checkoutVerified.isGuaranteedSla === false, 'Installation SLA is explicitly distinguished as not guaranteed');
    assert(checkoutVerified.totalMonthlyRecurringInr === 1498, `Exact Decimal monthly recurring price: ₹1,498 (got ${checkoutVerified.totalMonthlyRecurringInr})`);
    assert(checkoutVerified.totalOneTimeSetupInr === 1500, `Exact Decimal one-time setup fee: ₹1,500 (got ${checkoutVerified.totalOneTimeSetupInr})`);

    // 1.5 Successful checkout for OVERRIDDEN_VERIFIED applicant (K03)
    const checkoutOverridden = await orderService.checkout({
      quoteId: quoteOverriddenRecord!.id,
      businessId: bizOverridden.id,
      contactName: 'Ramesh Patel',
      contactPhone: '+91 9876543213',
      installationAddress: 'Plot 45, MIDC Hingna, Nagpur',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440016'
    });
    assert(
      checkoutOverridden.status === OrderStatus.ORDER_RECEIVED,
      'Overridden verified applicant successfully created order'
    );
    assert(
      checkoutOverridden.orderNumber.startsWith('ORD-2026-'),
      `Overridden applicant order number: ${checkoutOverridden.orderNumber}`
    );

    // ================================================================
    // SUITE 2: SECURITY OF TRACKING TOKEN & STORAGE
    // ================================================================
    console.log('\n--- [SUITE 2] Tracking Token Cryptographic Security ---');

    // 2.1 Verify raw tracking token is NEVER stored in database
    const dbOrder = await prisma.order.findUnique({
      where: { orderNumber: checkoutVerified.orderNumber }
    });
    assert(dbOrder !== null, 'Order found in PostgreSQL');

    // Expected hash of the raw token
    const expectedHash = crypto.createHash('sha256').update(checkoutVerified.trackingToken).digest('hex');
    assert(dbOrder!.trackingTokenHash === expectedHash, 'Database stores exactly the SHA-256 hash of the tracking secret');
    assert(
      !(dbOrder as any).trackingToken && !JSON.stringify(dbOrder).includes(checkoutVerified.trackingToken),
      'Plaintext tracking secret is completely absent from database record'
    );

    // 2.2 Idempotent duplicate checkout returns existing order safely
    const duplicateCheckout = await orderService.checkout({
      quoteId: quoteVerifiedRecord!.id,
      businessId: bizVerified.id,
      contactName: 'Anita Kulkarni',
      contactPhone: '+91 9876543210',
      installationAddress: 'Shop/Unit 217, Civil Lines, Visakhapatnam',
      city: 'Visakhapatnam',
      state: 'Andhra Pradesh',
      pincode: '530002'
    });
    assert(duplicateCheckout.orderNumber === checkoutVerified.orderNumber, 'Idempotent duplicate checkout returned existing orderNumber');
    assert(
      duplicateCheckout.trackingToken === '[ALREADY_ISSUED_ON_INITIAL_CHECKOUT]',
      'Raw tracking secret is not re-exposed on idempotent duplicate checkout'
    );

    // 2.3 Verify OrderItems Decimal values in DB
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: dbOrder!.id }
    });
    assert(orderItems.length === 2, `Order has exactly 2 order items (got ${orderItems.length})`);
    assert(Number(orderItems[0].unitPriceInr) > 0, 'OrderItem unitPriceInr is positive Decimal');
    assert(Number(orderItems[0].unitSetupInr) >= 0, 'OrderItem unitSetupInr is Decimal');

    // 2.4 Verify initial OrderEvent created transactionally
    const initialEvents = await prisma.orderEvent.findMany({
      where: { orderId: dbOrder!.id }
    });
    assert(initialEvents.length === 1, 'Initial OrderEvent created during checkout transaction');
    assert(initialEvents[0].toStatus === OrderStatus.ORDER_RECEIVED, 'Initial event toStatus is ORDER_RECEIVED');
    assert(initialEvents[0].triggeredBy === 'CUSTOMER', 'Initial event triggeredBy is CUSTOMER');

    // ================================================================
    // SUITE 3: ORDER STATE MACHINE VALIDATION & CONCURRENCY
    // ================================================================
    console.log('\n--- [SUITE 3] Order State Machine & Permitted Transitions ---');

    // 3.1 Unauthorized role cannot transition order
    let unauthorizedTransitionBlocked = false;
    try {
      await orderService.transitionOrder(
        checkoutVerified.orderNumber,
        { toStatus: OrderStatus.KYC_VALIDATED },
        'CUSTOMER',
        'CUST-001'
      );
    } catch (err: any) {
      if (err.status === 403) unauthorizedTransitionBlocked = true;
    }
    assert(unauthorizedTransitionBlocked, 'Customer or unauthorized role cannot transition order (403 Forbidden)');

    // 3.2 Invalid transition: Skipping states (ORDER_RECEIVED -> TECHNICIAN_DISPATCHED) rejected
    let skipStateBlocked = false;
    try {
      await orderService.transitionOrder(
        checkoutVerified.orderNumber,
        { toStatus: OrderStatus.TECHNICIAN_DISPATCHED },
        'OPERATIONS',
        'OPS-01'
      );
    } catch (err: any) {
      if (err.status === 400 && err.message.includes('Invalid state transition')) {
        skipStateBlocked = true;
      }
    }
    assert(skipStateBlocked, 'Skipping state machine stages is strictly rejected (400 Bad Request)');

    // 3.3 Valid Transition 1: ORDER_RECEIVED -> KYC_VALIDATED
    const t1 = await orderService.transitionOrder(
      checkoutVerified.orderNumber,
      { toStatus: OrderStatus.KYC_VALIDATED, reason: 'Identity and GSTIN registry verified.' },
      'OPERATIONS',
      'OPS-01'
    );
    assert(t1.status === OrderStatus.KYC_VALIDATED, 'Transition 1 succeeded: status is KYC_VALIDATED');

    // 3.4 Backward transition rejected: KYC_VALIDATED -> ORDER_RECEIVED
    let backwardTransitionBlocked = false;
    try {
      await orderService.transitionOrder(
        checkoutVerified.orderNumber,
        { toStatus: OrderStatus.ORDER_RECEIVED },
        'OPERATIONS',
        'OPS-01'
      );
    } catch (err: any) {
      if (err.status === 400) backwardTransitionBlocked = true;
    }
    assert(backwardTransitionBlocked, 'Backward transition (KYC_VALIDATED -> ORDER_RECEIVED) strictly rejected');

    // 3.5 Valid Transition 2: KYC_VALIDATED -> FEASIBILITY_CLEARED
    const t2 = await orderService.transitionOrder(
      checkoutVerified.orderNumber,
      { toStatus: OrderStatus.FEASIBILITY_CLEARED, reason: 'Fiber port capacity confirmed at exchange.' },
      'OPERATIONS',
      'OPS-01'
    );
    assert(t2.status === OrderStatus.FEASIBILITY_CLEARED, 'Transition 2 succeeded: status is FEASIBILITY_CLEARED');

    // 3.6 Valid Transition 3: FEASIBILITY_CLEARED -> TECHNICIAN_DISPATCHED
    const t3 = await orderService.transitionOrder(
      checkoutVerified.orderNumber,
      {
        toStatus: OrderStatus.TECHNICIAN_DISPATCHED,
        assignedTechnician: 'Vikram Singh (ID: TECH-991)',
        technicianPhone: '+91 9988776655',
        reason: 'Technician scheduled for on-site CPE setup.'
      },
      'OPERATIONS',
      'OPS-01'
    );
    assert(t3.status === OrderStatus.TECHNICIAN_DISPATCHED, 'Transition 3 succeeded: status is TECHNICIAN_DISPATCHED');
    assert(t3.assignedTechnician === 'Vikram Singh (ID: TECH-991)', 'Technician assigned successfully');

    // 3.7 Valid Transition 4: TECHNICIAN_DISPATCHED -> INSTALLED_AND_ACTIVE
    const t4 = await orderService.transitionOrder(
      checkoutVerified.orderNumber,
      { toStatus: OrderStatus.INSTALLED_AND_ACTIVE, reason: 'Fiber link spliced, tested, throughput verified 100Mbps.' },
      'TECHNICIAN',
      'TECH-991'
    );
    assert(t4.status === OrderStatus.INSTALLED_AND_ACTIVE, 'Transition 4 succeeded: status is INSTALLED_AND_ACTIVE');
    assert(t4.actualActivatedDate !== null, 'actualActivatedDate recorded upon activation');

    // 3.8 Terminal state check: Transition from INSTALLED_AND_ACTIVE rejected
    let terminalTransitionBlocked = false;
    try {
      await orderService.transitionOrder(
        checkoutVerified.orderNumber,
        { toStatus: OrderStatus.CANCELLED },
        'ADMIN',
        'ADMIN-01'
      );
    } catch (err: any) {
      if (err.status === 400 && err.message.includes('Terminal State')) {
        terminalTransitionBlocked = true;
      }
    }
    assert(terminalTransitionBlocked, 'Cannot cancel or transition an already active order (Terminal State)');

    // 3.9 Event audit trail consistency
    const eventsAfterCompletion = await prisma.orderEvent.findMany({
      where: { orderId: dbOrder!.id },
      orderBy: { createdAt: 'asc' }
    });
    assert(eventsAfterCompletion.length === 5, `Order has exactly 5 lifecycle events (got ${eventsAfterCompletion.length})`);
    assert(eventsAfterCompletion[4].toStatus === OrderStatus.INSTALLED_AND_ACTIVE, 'Final event is INSTALLED_AND_ACTIVE');

    // 3.10 Cancellation flow test on a separate order
    const cancelQuote = await quoteService.calculateQuote({
      businessId: bizOverridden.id,
      items: [{ productId: 'P01', quantity: 1 }],
      save: true
    });
    const cancelQuoteRecord = await prisma.quote.findUnique({ where: { quoteNumber: cancelQuote.quoteNumber } });
    const orderToCancel = await orderService.checkout({
      quoteId: cancelQuoteRecord!.id,
      businessId: bizOverridden.id,
      contactName: 'Ramesh Patel',
      contactPhone: '+91 9876543213',
      installationAddress: 'Plot 45, MIDC Hingna, Nagpur',
      city: 'Nagpur',
      state: 'Maharashtra',
      pincode: '440016'
    });
    const cancelledOrder = await orderService.transitionOrder(
      orderToCancel.orderNumber,
      { toStatus: OrderStatus.CANCELLED, reason: 'Customer requested cancellation.' },
      'OPERATIONS',
      'OPS-01'
    );
    assert(cancelledOrder.status === OrderStatus.CANCELLED, 'Order successfully transitioned to CANCELLED');

    // ================================================================
    // SUITE 4: SECURE PUBLIC TRACKER & ZERO PII EXPOSURE
    // ================================================================
    console.log('\n--- [SUITE 4] Secure Public Tracker & Zero PII Leakage ---');

    // 4.1 Query tracker with valid raw tracking secret
    const trackingRes = await orderService.trackByToken(checkoutVerified.trackingToken, '127.0.0.1');

    assert(trackingRes.orderNumber === checkoutVerified.orderNumber, 'Public tracker returned correct order number');
    assert(trackingRes.currentStatus === OrderStatus.INSTALLED_AND_ACTIVE, 'Public tracker reflects current status');
    assert(trackingRes.progressPercentage === 100, 'Progress percentage is 100% for active order');
    assert(trackingRes.steps.length === 5, 'Timeline contains all 5 milestones');
    assert(trackingRes.steps[4].state === 'CURRENT' || trackingRes.steps[4].state === 'COMPLETED', 'Milestone states properly updated');

    // 4.2 Zero PII Exposure Checks
    assert(
      !(trackingRes as any).id && !(trackingRes as any).businessId && !(trackingRes as any).quoteId,
      'Internal UUIDs (orderId, businessId, quoteId) stripped from public response'
    );
    assert(
      !(trackingRes as any).trackingTokenHash,
      'Internal token hash is never returned in public response'
    );
    assert(
      trackingRes.maskedCustomer.contactName === 'A**** K*******',
      `Customer contact name is properly masked: got '${trackingRes.maskedCustomer.contactName}'`
    );
    assert(
      trackingRes.maskedCustomer.contactPhone === '+91 ********10',
      `Customer phone number is properly masked: got '${trackingRes.maskedCustomer.contactPhone}'`
    );
    assert(
      trackingRes.maskedCustomer.installationAddress === '***, Civil Lines, Visakhapatnam',
      `Street address is masked with city retained: got '${trackingRes.maskedCustomer.installationAddress}'`
    );
    assert(
      trackingRes.installationSla.isGuaranteed === false,
      'SLA is clearly marked as an estimate and not guaranteed'
    );
    assert(
      trackingRes.installationSla.disclaimer.includes('estimate'),
      'SLA contains explicit customer-facing estimate disclaimer'
    );

    // 4.3 Invalid tracking token returns generic safe 404
    let invalidToken404 = false;
    try {
      await orderService.trackByToken('TRK-INVALID-TOKEN-999', '127.0.0.1');
    } catch (err: any) {
      if (err.status === 404 && err.message.includes('not found')) {
        invalidToken404 = true;
      }
    }
    assert(invalidToken404, 'Invalid tracking token returns uniform safe 404 NotFoundException');

    // 4.4 Rate limiting on public tracker
    let rateLimitExceeded = false;
    try {
      // Send 35 rapid requests from unique test IP
      for (let i = 0; i < 35; i++) {
        await orderService.trackByToken(checkoutVerified.trackingToken, '192.168.1.100');
      }
    } catch (err: any) {
      if (err.status === 429) rateLimitExceeded = true;
    }
    assert(rateLimitExceeded, 'Rate limiter triggers 429 Too Many Requests when queries exceed threshold');

    // ================================================================
    // SUITE 5: LIVE HTTP REST API ENDPOINTS
    // ================================================================
    console.log('\n--- [SUITE 5] Live HTTP REST API Integration ---');

    // 5.1 Public Tracker via HTTP GET /api/tracking/:token
    const httpTrack = await httpRequest(port, `/api/tracking/${checkoutVerified.trackingToken}`);
    assert(httpTrack.status === 200, `GET /api/tracking/:token returned 200 OK (got ${httpTrack.status})`);
    assert(httpTrack.data.orderNumber === checkoutVerified.orderNumber, 'HTTP tracker returned matching orderNumber');
    assert(httpTrack.data.maskedCustomer.contactPhone.includes('********'), 'HTTP tracker returned masked phone');

    // 5.2 Invalid token via HTTP returns 404
    const httpTrackFail = await httpRequest(port, '/api/tracking/TRK-FAKE-TOKEN');
    assert(httpTrackFail.status === 404, `GET /api/tracking/invalid returned 404 Not Found (got ${httpTrackFail.status})`);

    // Generate signed test JWTs
    const opsToken = jwt.sign(
      { sub: 'OPS-01', role: 'OPERATIONS', iss: AUTH_CONFIG.JWT_ISSUER, aud: AUTH_CONFIG.JWT_AUDIENCE },
      AUTH_CONFIG.JWT_SECRET
    );
    const unauthorizedToken = jwt.sign(
      { sub: 'COMPLIANCE-01', role: 'COMPLIANCE_OFFICER', iss: AUTH_CONFIG.JWT_ISSUER, aud: AUTH_CONFIG.JWT_AUDIENCE },
      AUTH_CONFIG.JWT_SECRET
    );

    // 5.3 Authenticated Order Lookup via HTTP GET /api/orders/:orderNumber with OPERATIONS JWT
    const httpOrder = await httpRequest(
      port,
      `/api/orders/${checkoutVerified.orderNumber}`,
      'GET',
      undefined,
      { Authorization: `Bearer ${opsToken}` }
    );
    assert(httpOrder.status === 200, `GET /api/orders/:orderNumber returned 200 OK (got ${httpOrder.status})`);
    assert(httpOrder.data.items.length === 2, 'HTTP order contains 2 items');

    // 5.4 Order Transition via HTTP POST /api/orders/:orderNumber/transition with unauthorized role returns 403
    const httpTransFail = await httpRequest(
      port,
      `/api/orders/${orderToCancel.orderNumber}/transition`,
      'POST',
      { toStatus: OrderStatus.FEASIBILITY_CLEARED },
      { Authorization: `Bearer ${unauthorizedToken}` }
    );
    assert(httpTransFail.status === 403, `Transition with unauthorized role returned 403 Forbidden (got ${httpTransFail.status})`);

    // 5.5 Order Transition with unauthenticated request (no JWT) returns 401
    const httpUnauthTrans = await httpRequest(
      port,
      `/api/orders/${orderToCancel.orderNumber}/transition`,
      'POST',
      { toStatus: OrderStatus.FEASIBILITY_CLEARED }
    );
    assert(httpUnauthTrans.status === 401, `Transition without JWT returned 401 Unauthorized (got ${httpUnauthTrans.status})`);

    // ================================================================
    // SUMMARY REPORT
    // ================================================================
    console.log('\n================================================================');
    console.log('                 PHASE 5 TEST EXECUTION SUMMARY                 ');
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
      console.log('\n🎉 ALL PHASE 5 CHECKOUT, STATE MACHINE & TRACKING TESTS PASSED!');
      process.exit(0);
    }
  } catch (error) {
    console.error('Test Suite encountered fatal error:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPhase5TestSuite();
