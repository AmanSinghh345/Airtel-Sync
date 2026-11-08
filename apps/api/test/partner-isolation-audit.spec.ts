import { NestFactory } from '@nestjs/core';
import * as http from 'http';
import { AppModule } from '../src/app.module';

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

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('  UDYAMONE SECURITY AUDIT: PARTNER ISOLATION & ATTACK DEFENSE   ');
  console.log('================================================================');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  const port = 8246;
  await app.listen(port);
  console.log(`[AUDIT SERVER] Listening on port ${port}\n`);

  try {
    // 1. Authenticate Partner 1 (Vizag)
    const p1Res = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'partner.vizag@accel.telecom',
      password: 'Accel@2026!PartnerVizag'
    });
    assert(p1Res.status === 200, 'Partner 1 (Vizag) authenticated successfully');
    const partner1Token = p1Res.data.accessToken;
    const partner1AgencyId = p1Res.data.user.partnerId;

    // 2. Authenticate Partner 2 (Nagpur)
    const p2Res = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'partner.nagpur@accel.telecom',
      password: 'Accel@2026!PartnerNagpur'
    });
    assert(p2Res.status === 200, 'Partner 2 (Nagpur) authenticated successfully');
    const partner2Token = p2Res.data.accessToken;
    const partner2AgencyId = p2Res.data.user.partnerId;

    // Fetch lead IDs
    const p1LeadsRes = await makeRequest(port, '/api/partner/leads', 'GET', null, {
      Authorization: `Bearer ${partner1Token}`
    });
    const p1LeadId = p1LeadsRes.data.leads[0].id;

    const p2LeadsRes = await makeRequest(port, '/api/partner/leads', 'GET', null, {
      Authorization: `Bearer ${partner2Token}`
    });
    const p2LeadId = p2LeadsRes.data.leads[0].id;

    console.log(`  Target Leads: P1 Vizag (${p1LeadId}) | P2 Nagpur (${p2LeadId})\n`);

    // TEST 1: Query Parameter Tampering
    console.log('--- [ATTACK TEST 1] Query Parameter Tampering ---');
    const p1TamperQuery = await makeRequest(
      port,
      `/api/partner/leads?partnerId=${partner2AgencyId}`,
      'GET',
      null,
      { Authorization: `Bearer ${partner1Token}` }
    );
    assert(p1TamperQuery.status === 200, 'Request returns 200 OK');
    const allBelongToP1 = p1TamperQuery.data.leads.every((l: any) => l.assignedPartnerId === partner1AgencyId);
    assert(allBelongToP1, 'All leads strictly belong to Partner 1; injected partnerId query parameter was ignored');
    const noneBelongToP2 = p1TamperQuery.data.leads.every((l: any) => l.assignedPartnerId !== partner2AgencyId);
    assert(noneBelongToP2, 'Zero leads belonging to Partner 2 were leaked in the response');

    // TEST 2: Insecure Direct Object Reference (IDOR) Read
    console.log('\n--- [ATTACK TEST 2] Insecure Direct Object Reference (IDOR) Read ---');
    const idorRead = await makeRequest(
      port,
      `/api/partner/leads/${p2LeadId}`,
      'GET',
      null,
      { Authorization: `Bearer ${partner1Token}` }
    );
    assert(idorRead.status === 403, 'Partner 1 reading Partner 2 lead is blocked with 403 Forbidden');
    assert(idorRead.data.message.includes('Access Denied'), 'Error message confirms tenant boundary protection');

    // TEST 3: Cross-Tenant Write Attempt (Activity Injection)
    console.log('\n--- [ATTACK TEST 3] Cross-Tenant Activity Write Injection ---');
    const crossWrite = await makeRequest(
      port,
      `/api/partner/leads/${p2LeadId}/activity`,
      'POST',
      {
        activityType: 'PHONE_CALL',
        outcome: 'CONNECTED_INTERESTED',
        notes: 'Malicious cross-tenant activity payload'
      },
      { Authorization: `Bearer ${partner1Token}` }
    );
    assert(crossWrite.status === 403, 'Partner 1 logging activity on Partner 2 lead is blocked with 403 Forbidden');

    // TEST 4: Cross-Tenant Status Mutation
    console.log('\n--- [ATTACK TEST 4] Cross-Tenant Status Mutation ---');
    const crossStatus = await makeRequest(
      port,
      `/api/partner/leads/${p2LeadId}/status`,
      'POST',
      { status: 'RECOVERED' },
      { Authorization: `Bearer ${partner1Token}` }
    );
    assert(crossStatus.status === 403, 'Partner 1 mutating status on Partner 2 lead is blocked with 403 Forbidden');

    // TEST 5: Privilege Escalation (Partner attempting Admin Reassignment)
    console.log('\n--- [ATTACK TEST 5] Privilege Escalation (Partner Reassignment) ---');
    const privEsc = await makeRequest(
      port,
      '/api/partner/leads/assign',
      'POST',
      { leadId: p1LeadId, partnerId: partner1AgencyId },
      { Authorization: `Bearer ${partner1Token}` }
    );
    assert(privEsc.status === 403, 'Partner attempting lead reassignment is blocked with 403 Forbidden (RBAC)');

    // TEST 6: Parameter Injection & Path Traversal
    console.log('\n--- [ATTACK TEST 6] Parameter Injection & Path Traversal ---');
    const sqlInject = await makeRequest(
      port,
      `/api/partner/leads/${encodeURIComponent("SMB-0001' OR '1'='1")}`,
      'GET',
      null,
      { Authorization: `Bearer ${partner1Token}` }
    );
    assert([400, 404].includes(sqlInject.status), 'SQL injection probe safely returns 404/400 (Not Found / Bad Request)');

    // TEST 7: Tampered JWT Signature
    console.log('\n--- [ATTACK TEST 7] Tampered JWT Signature & Payload Forgery ---');
    const parts = partner1Token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    payload.partnerId = partner2AgencyId; // Attempt payload modification
    const forgedPayload = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=/g, '');
    const forgedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

    const forgedReq = await makeRequest(
      port,
      '/api/partner/leads',
      'GET',
      null,
      { Authorization: `Bearer ${forgedToken}` }
    );
    assert(forgedReq.status === 401, 'Tampered JWT signature strictly rejected with 401 Unauthorized');

    // TEST 8: Analytics Access Control (Public vs Authenticated)
    console.log('\n--- [ATTACK TEST 8] Analytics Access Control & Public Telemetry ---');
    // Unauthenticated public analytics
    const pubFunnel = await makeRequest(port, '/api/analytics/funnel');
    assert(pubFunnel.status === 200, 'Unauthenticated access to /api/analytics/funnel succeeds (Public Aggregation)');

    const pubDropReasons = await makeRequest(port, '/api/analytics/drop-reasons');
    assert(pubDropReasons.status === 200, 'Unauthenticated access to /api/analytics/drop-reasons succeeds (Public Aggregation)');

    const pubSegments = await makeRequest(port, '/api/analytics/segments');
    assert(pubSegments.status === 200, 'Unauthenticated access to /api/analytics/segments succeeds (Public Aggregation)');

    const pubImpact = await makeRequest(port, '/api/analytics/recovery-impact');
    assert(pubImpact.status === 200, 'Unauthenticated access to /api/analytics/recovery-impact succeeds (Public Aggregation)');

    // Unauthenticated access to sensitive partner leaderboard & commission MUST be blocked
    const unauthPartners = await makeRequest(port, '/api/analytics/partners');
    assert(unauthPartners.status === 401, 'Unauthenticated access to /api/analytics/partners is blocked with 401 Unauthorized');

    // Authenticated partner access to /api/analytics/partners
    const partnerAuthRes = await makeRequest(port, '/api/analytics/partners', 'GET', null, {
      Authorization: `Bearer ${partner1Token}`
    });
    assert(partnerAuthRes.status === 200, 'Authenticated partner access to /api/analytics/partners succeeds (200 OK)');
    assert(partnerAuthRes.data.partners.length > 0, 'Returns partner leaderboard to authenticated partner');

    // Authenticated admin access to /api/analytics/partners
    const adminLoginRes = await makeRequest(port, '/api/auth/staff/login', 'POST', {
      email: 'admin@accel.telecom',
      password: 'Accel@2026!Admin'
    });
    const adminToken = adminLoginRes.data.accessToken;

    const adminAuthRes = await makeRequest(port, '/api/analytics/partners', 'GET', null, {
      Authorization: `Bearer ${adminToken}`
    });
    assert(adminAuthRes.status === 200, 'Authenticated admin access to /api/analytics/partners succeeds (200 OK)');

  } finally {
    await app.close();
  }

  console.log('\n================================================================');
  console.log(`Audited Assertions: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
