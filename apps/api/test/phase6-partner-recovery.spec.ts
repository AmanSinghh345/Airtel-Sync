import { NestFactory } from '@nestjs/core';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { AUTH_CONFIG } from '../src/modules/auth/auth.constants';
import { PartnerService } from '../src/modules/partner/partner.service';
import { PropensityService } from '../src/modules/partner/propensity.service';
import { AnalyticsService } from '../src/modules/partner/analytics.service';
import {
  StaffRole,
  LeadStatus,
  ActivityType,
  Segment
} from '@udyamone/shared-types';

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

async function runPhase6TestSuite() {
  console.log('================================================================');
  console.log('  UDYAMONE PHASE 6: PARTNER PORTAL, LEAD RECOVERY & ANALYTICS  ');
  console.log('================================================================');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');

  const server = await app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 4477;
  console.log(`[TEST HARNESS] Phase 6 test server running on port ${port}`);

  const prisma = app.get(PrismaService);
  const authService = app.get(AuthService);
  const partnerService = app.get(PartnerService);
  const propensityService = app.get(PropensityService);
  const analyticsService = app.get(AnalyticsService);

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
    // Ensure partners and staff are seeded
    await partnerService.seedDemoPartnersAndStaff();

    // ----------------------------------------------------------------
    // SUITE 1: Partner Authentication & JWT Issuance
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 1] Partner Authentication & Role Verification ---');

    const partner1Login = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'partner.vizag@accel.telecom',
      password: 'Accel@2026!PartnerVizag'
    });
    assert(partner1Login.status === 200, 'Partner 1 (Vizag) login succeeded (200 OK)');
    assert(partner1Login.data.user.role === StaffRole.PARTNER, 'User role is PARTNER');
    assert(!!partner1Login.data.user.partnerId, 'User has associated partnerId');
    const p1Token = partner1Login.data.accessToken;
    const p1PartnerId = partner1Login.data.user.partnerId;

    const partner2Login = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'partner.nagpur@accel.telecom',
      password: 'Accel@2026!PartnerNagpur'
    });
    assert(partner2Login.status === 200, 'Partner 2 (Nagpur) login succeeded (200 OK)');
    const p2Token = partner2Login.data.accessToken;
    const p2PartnerId = partner2Login.data.user.partnerId;

    const adminLogin = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'admin@accel.telecom',
      password: 'Accel@2026!Admin'
    });
    const adminToken = adminLogin.data.accessToken;

    // ----------------------------------------------------------------
    // SUITE 2: Partner Lead Isolation & Multi-Tenancy Protection
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 2] Partner Isolation & Multi-Tenancy Protection ---');

    // Partner 1 gets their leads
    const p1LeadsRes = await makeRequest(port, '/api/partner/leads', 'GET', null, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(p1LeadsRes.status === 200, 'Partner 1 fetched assigned leads (200 OK)');
    assert(p1LeadsRes.data.leads.length > 0, `Partner 1 has assigned leads (got ${p1LeadsRes.data.leads.length})`);
    
    // Check that ALL leads returned to Partner 1 belong to Partner 1
    const p1AllMatch = p1LeadsRes.data.leads.every((l: any) => l.assignedPartnerId === p1PartnerId);
    assert(p1AllMatch, 'All leads returned to Partner 1 strictly belong to Partner 1 agency');

    // Partner 2 gets their leads
    const p2LeadsRes = await makeRequest(port, '/api/partner/leads', 'GET', null, {
      Authorization: `Bearer ${p2Token}`
    });
    assert(p2LeadsRes.status === 200, 'Partner 2 fetched assigned leads (200 OK)');
    const p2AllMatch = p2LeadsRes.data.leads.every((l: any) => l.assignedPartnerId === p2PartnerId);
    assert(p2AllMatch, 'All leads returned to Partner 2 strictly belong to Partner 2 agency');

    const p1Lead = p1LeadsRes.data.leads.find((l: any) => l.status === LeadStatus.ASSIGNED) || p1LeadsRes.data.leads[0];
    const p1LeadId = p1Lead.id;
    // Reset to ASSIGNED to guarantee test idempotency across repeated runs
    await prisma.droppedLead.update({
      where: { id: p1LeadId },
      data: { status: 'ASSIGNED' }
    });

    const p2LeadId = p2LeadsRes.data.leads[0].id;
    assert(p1LeadId !== p2LeadId, 'Partner 1 and Partner 2 have separate distinct leads');

    // Partner 1 attempts to access Partner 2's lead -> 403 Forbidden
    const crossAccess = await makeRequest(port, `/api/partner/leads/${p2LeadId}`, 'GET', null, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(crossAccess.status === 403, 'Partner 1 accessing Partner 2 lead is blocked with 403 Forbidden');

    // Partner 1 attempts to record activity on Partner 2's lead -> 403 Forbidden
    const crossActivity = await makeRequest(port, `/api/partner/leads/${p2LeadId}/activity`, 'POST', {
      activityType: ActivityType.PHONE_CALL,
      notes: 'Unauthorized activity attempt'
    }, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(crossActivity.status === 403, 'Partner 1 recording activity on Partner 2 lead is blocked with 403 Forbidden');

    // Partner 1 attempts to change status on Partner 2's lead -> 403 Forbidden
    const crossStatus = await makeRequest(port, `/api/partner/leads/${p2LeadId}/status`, 'POST', {
      status: LeadStatus.RECOVERED
    }, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(crossStatus.status === 403, 'Partner 1 updating status on Partner 2 lead is blocked with 403 Forbidden');

    // ----------------------------------------------------------------
    // SUITE 3: Role-Based Access Control (RBAC)
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 3] Role-Based Access Control (RBAC) ---');

    // Partner attempts to assign a lead -> 403 Forbidden (Only ADMIN/OPS allowed)
    const partnerAssignAttempt = await makeRequest(port, '/api/partner/leads/assign', 'POST', {
      leadId: p1LeadId,
      partnerId: p2PartnerId
    }, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(partnerAssignAttempt.status === 403, 'Partner role assigning lead is blocked with 403 Forbidden');

    // Admin attempts to assign an unassigned lead -> 200 OK
    const unassignedLead = await prisma.droppedLead.findFirst({
      where: { assignedPartnerId: null, stageReached: { not: 'Activated' } }
    });
    assert(unassignedLead !== null, 'Found unassigned dropped lead in dataset for admin assignment test');

    const adminAssign = await makeRequest(port, '/api/partner/leads/assign', 'POST', {
      leadId: unassignedLead!.id,
      partnerId: p1PartnerId,
      notes: 'Assigned to Vizag partner for immediate outreach'
    }, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(adminAssign.status === 200, 'Admin successfully assigned lead to partner (200 OK)');
    assert(adminAssign.data.assignedPartnerId === p1PartnerId, 'Lead assignedPartnerId updated to Partner 1');
    assert(adminAssign.data.status === LeadStatus.ASSIGNED, 'Lead status transitioned to ASSIGNED');

    // Reject assigning activated lead to partner recovery
    const activatedLead = await prisma.droppedLead.findFirst({
      where: { stageReached: 'Activated' }
    });
    if (activatedLead) {
      const rejectActivated = await makeRequest(port, '/api/partner/leads/assign', 'POST', {
        leadId: activatedLead.id,
        partnerId: p1PartnerId,
        notes: 'Attempting to assign activated lead'
      }, {
        Authorization: `Bearer ${adminToken}`
      });
      assert(rejectActivated.status === 400, 'Attempting to assign an activated lead to partner is rejected with 400 Bad Request');
    }

    // Admin can query all leads across all partners
    const adminAllLeads = await makeRequest(port, '/api/partner/leads', 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(adminAllLeads.status === 200, 'Admin can view cross-agency leads (200 OK)');

    // ----------------------------------------------------------------
    // SUITE 4: Propensity Scoring Algorithm & Explainability
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 4] Propensity Scoring & Explainability Engine ---');

    // Test case 1: High-intent lead (KYC complete + GSTIN + Udyam + Delay drop reason)
    const highProfile = {
      stageReached: 'KYC complete',
      dropReason: 'Installation delayed beyond 21 days',
      hasGstin: true,
      hasUdyam: true,
      employeeCount: 20,
      numSites: 3,
      monthlyTelecomSpendInr: 3500,
      businessName: 'Balaji Dental Care'
    };
    const highEval = propensityService.evaluateRecoveryLead(highProfile);
    assert(highEval.score >= 80, `High intent lead scored >= 80 (got ${highEval.score})`);
    assert(highEval.priorityRank === 'HIGH', 'Classified as HIGH priority');
    assert(highEval.scoringFactors.length >= 4, 'Includes explainable scoring factor breakdown');
    assert(highEval.recoveryPitch.includes('Priority Win-Back Opportunity'), 'Generates tailored High Priority recovery pitch');
    const factorPointsSum = highEval.scoringFactors.reduce((acc, f) => acc + f.points, 0);
    assert(factorPointsSum === highEval.score, `Factor points sum (${factorPointsSum}) matches total score (${highEval.score})`);
    assert(highEval.priorityReason.length > 0, 'Exposes classification justification');
    assert(highEval.recommendedAction.length > 0, 'Exposes recommended operational action');

    // Test case 2: Commercial negotiation lead (Quote accepted + Price reason)
    const medProfile = {
      stageReached: 'Quote accepted',
      dropReason: 'Price too high',
      hasGstin: true,
      hasUdyam: false,
      employeeCount: 5,
      numSites: 1,
      monthlyTelecomSpendInr: 1500,
      businessName: 'Apex Tools'
    };
    const medEval = propensityService.evaluateRecoveryLead(medProfile);
    assert(medEval.score >= 45 && medEval.score < 70, `Commercial lead scored in medium range (got ${medEval.score})`);
    assert(medEval.priorityRank === 'MEDIUM', 'Classified as MEDIUM priority');
    assert(medEval.recoveryPitch.includes('Commercial Recovery Call'), 'Generates tailored Medium Priority recovery pitch');

    // Test case 3: Low-intent lead (Lead stage + Not interested)
    const lowProfile = {
      stageReached: 'Lead',
      dropReason: 'Not interested on first call',
      hasGstin: false,
      hasUdyam: false,
      employeeCount: 2,
      numSites: 1,
      monthlyTelecomSpendInr: 500,
      businessName: 'Corner Kiosk'
    };
    const lowEval = propensityService.evaluateRecoveryLead(lowProfile);
    assert(lowEval.score < 45, `Unqualified lead scored < 45 (got ${lowEval.score})`);
    assert(lowEval.priorityRank === 'LOW', 'Classified as LOW priority');

    // Test case 4: Model A Day-0 Firmographic Intake Evaluation (Zero Leakage)
    const intakeProfile = {
      businessName: 'Apex Logistics Hub',
      hasGstin: true,
      hasUdyam: true,
      employeeCount: 25,
      numSites: 4,
      monthlyTelecomSpendInr: 6500,
      cityTier: 1
    };
    const intakeEval = propensityService.evaluateIntakeLead(intakeProfile);
    assert(intakeEval.score >= 70, `Intake profile scored HIGH (got ${intakeEval.score})`);
    assert(intakeEval.priorityRank === 'HIGH', 'Classified as HIGH intake priority');
    const intakeFactorSum = intakeEval.scoringFactors.reduce((acc, f) => acc + f.points, 0);
    assert(intakeFactorSum === intakeEval.score, `Intake factors sum (${intakeFactorSum}) matches score (${intakeEval.score})`);
    assert(intakeEval.priorityReason.includes('Formalized'), 'Intake explains priority justification');
    assert(intakeEval.recommendedAction.includes('Enterprise'), 'Intake provides operational recommendation');

    // Test case 5: Model B strictly rejects 'Activated' status
    let rejectedActivated = false;
    try {
      propensityService.evaluateRecoveryLead({
        stageReached: 'Activated',
        dropReason: 'None'
      });
    } catch (e) {
      rejectedActivated = true;
    }
    assert(rejectedActivated, 'Model B strictly rejects terminal Activated outcome');

    // ----------------------------------------------------------------
    // SUITE 5: Lead Recovery Workflow & Activity Logging
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 5] Lead Recovery Workflow & Activity Logging ---');

    // Partner 1 records an in-person visit on their assigned lead
    const activityRes = await makeRequest(port, `/api/partner/leads/${p1LeadId}/activity`, 'POST', {
      activityType: ActivityType.IN_PERSON_VISIT,
      notes: 'Met business proprietor. Agreed on fast-track optical fiber installation.',
      outcome: 'Customer agreed to proceed with reactivation',
      followUpDate: '2026-07-20'
    }, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(activityRes.status === 201, 'Logged follow-up activity (201 Created)');
    assert(activityRes.data.activityType === ActivityType.IN_PERSON_VISIT, 'Activity recorded as IN_PERSON_VISIT');
    assert(activityRes.data.partnerId === p1PartnerId, 'Activity bound to authenticated partner ID');

    // Check that lead status advanced to CONTACTED
    const leadAfterActivity = await makeRequest(port, `/api/partner/leads/${p1LeadId}`, 'GET', null, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(leadAfterActivity.status === 200, 'Fetched lead details');
    assert(leadAfterActivity.data.status === LeadStatus.CONTACTED, 'Lead status advanced to CONTACTED');
    assert(leadAfterActivity.data.activities.length >= 1, 'Lead contains logged activity in timeline');

    // Partner 1 marks the lead as RECOVERED
    const recoverRes = await makeRequest(port, `/api/partner/leads/${p1LeadId}/status`, 'POST', {
      status: LeadStatus.RECOVERED,
      notes: 'Successfully recovered account. Quote accepted and sent for dispatch.',
      outcome: 'Account converted'
    }, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(recoverRes.status === 200, 'Updated lead status (200 OK)');
    assert(recoverRes.data.status === LeadStatus.RECOVERED, 'Lead status is now RECOVERED');

    // Verify Partner 1 Dashboard metrics reflect the recovery
    const metricsRes = await makeRequest(port, '/api/partner/dashboard/metrics', 'GET', null, {
      Authorization: `Bearer ${p1Token}`
    });
    assert(metricsRes.status === 200, 'Partner dashboard metrics returned 200 OK');
    assert(metricsRes.data.recoveredLeads >= 1, `Recovered leads count is >= 1 (got ${metricsRes.data.recoveredLeads})`);
    assert(metricsRes.data.recoveryRatePercent > 0, 'Recovery rate percentage is > 0%');
    assert(metricsRes.data.estimatedCommissionInr > 0, 'Estimated commission is calculated');

    // ----------------------------------------------------------------
    // SUITE 6: Live Analytics Aggregated from 5,000 SMB Leads
    // ----------------------------------------------------------------
    console.log('\n--- [SUITE 6] Live Database Analytics on 5,000 SMB Leads ---');

    // 6.1 Funnel analytics
    const funnelRes = await makeRequest(port, '/api/analytics/funnel', 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(funnelRes.status === 200, 'GET /api/analytics/funnel returned 200 OK');
    assert(funnelRes.data.totalLeads === 5000, `Total leads in funnel is exactly 5,000 (got ${funnelRes.data.totalLeads})`);
    assert(funnelRes.data.totalActivated === 368, `Total activated leads is exactly 368 (got ${funnelRes.data.totalActivated})`);
    assert(funnelRes.data.totalDropped === 4632, `Total dropped leads is exactly 4,632 (got ${funnelRes.data.totalDropped})`);
    assert(funnelRes.data.funnelStages.length === 6, 'Funnel contains all 6 stages');

    // 6.2 Drop reasons analytics
    const dropReasonsRes = await makeRequest(port, '/api/analytics/drop-reasons', 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(dropReasonsRes.status === 200, 'GET /api/analytics/drop-reasons returned 200 OK');
    assert(dropReasonsRes.data.dropReasons.length > 0, 'Returned drop reasons breakdown');
    assert(
      dropReasonsRes.data.dropReasons.some((r: any) => r.recoverableCategory === 'HIGH_RECOVERABILITY'),
      'Identified HIGH_RECOVERABILITY drop reasons'
    );

    // 6.3 Segment analytics
    const segmentsRes = await makeRequest(port, '/api/analytics/segments', 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(segmentsRes.status === 200, 'GET /api/analytics/segments returned 200 OK');
    assert(segmentsRes.data.segments.length === 4, 'Returned all 4 MSME segments');

    // 6.4 Partner performance leaderboard
    const partnersRes = await makeRequest(port, '/api/analytics/partners', 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(partnersRes.status === 200, 'GET /api/analytics/partners returned 200 OK');
    assert(partnersRes.data.partners.length >= 3, `Returned performance for all 3 demo partners (got ${partnersRes.data.partners.length})`);

    // 6.5 Recovery impact
    const impactRes = await makeRequest(port, '/api/analytics/recovery-impact', 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(impactRes.status === 200, 'GET /api/analytics/recovery-impact returned 200 OK');
    assert(impactRes.data.highPriorityLeadsCount > 0, 'Calculated active high-priority pipeline');
    assert(impactRes.data.recoveredCount >= 1, 'Reflects recovered leads volume');

  } finally {
    await app.close();
  }

  console.log('\n================================================================');
  console.log('                 PHASE 6 TEST EXECUTION SUMMARY                 ');
  console.log('================================================================');
  console.log(`Total Assertions: ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 6 PARTNER PORTAL, RECOVERY & ANALYTICS TESTS PASSED!');
  } else {
    process.exit(1);
  }
}

runPhase6TestSuite().catch((e) => {
  console.error('Phase 6 test failed with error:', e);
  process.exit(1);
});
