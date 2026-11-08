import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AdvisorService } from '../src/modules/advisor/advisor.service';
import { DeterministicExtractionService } from '../src/modules/advisor/deterministic-extraction.service';
import { GeminiExtractionService } from '../src/modules/advisor/gemini-extraction.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Segment, ProductCategory } from '@udyamone/shared-types';
import * as http from 'http';

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

async function runPhase3TestSuite() {
  console.log('================================================================');
  console.log('    UDYAMONE PHASE 3: CONVERSATIONAL AI ADVISOR & EXTRACTION    ');
  console.log('================================================================');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.init();

  const prisma = app.get(PrismaService);
  const advisorService = app.get(AdvisorService);
  const deterministicService = app.get(DeterministicExtractionService);
  const geminiService = app.get(GeminiExtractionService);

  try {
    // ================================================================
    // SUITE 1: DETERMINISTIC MULTILINGUAL EXTRACTION
    // ================================================================
    console.log('\n--- [SUITE 1] Deterministic Multilingual Intent Extraction ---');

    // 1.1 Hindi (Devanagari) Input
    const hindiText = 'मेरा नाम राजेश शर्मा है, मेरी पुणे में मैन्युफैक्चरिंग कंपनी Apex Tools है। हमारे पास 25 कर्मचारी हैं, 2 शाखाएं हैं और जीएसटी नंबर 27AABCA1234F1Z5 उपलब्ध है। हमें हाई-स्पीड इंटरनेट और बैकअप चाहिए।';
    const hindiLang = deterministicService.detectLanguage(hindiText);
    assert(hindiLang === 'Hindi', 'Correctly detected Hindi language from Devanagari text');

    const hindiExtracted = deterministicService.extract(hindiText);
    assert(hindiExtracted.city === 'Pune', `Extracted city is Pune (got ${hindiExtracted.city})`);
    assert(hindiExtracted.cityTier === 1, `Pune correctly classified as City Tier 1 (got ${hindiExtracted.cityTier})`);
    assert(hindiExtracted.segment === Segment.MANUFACTURING, `Segment correctly identified as MANUFACTURING (got ${hindiExtracted.segment})`);
    assert(hindiExtracted.employeeCount === 25, `Employee count is 25 (got ${hindiExtracted.employeeCount})`);
    assert(hindiExtracted.numSites === 2, `Number of sites is 2 (got ${hindiExtracted.numSites})`);
    assert(hindiExtracted.hasGstin === true, `hasGstin is true (got ${hindiExtracted.hasGstin})`);
    assert(hindiExtracted.gstin === '27AABCA1234F1Z5', `GSTIN correctly extracted: ${hindiExtracted.gstin}`);
    assert(hindiExtracted.intendedCategories?.includes(ProductCategory.CONNECTIVITY) === true, 'Intent includes CONNECTIVITY');

    // 1.2 English Input
    const englishText = 'We operate BlueCloud Technologies, an IT office in Bengaluru with 15 staff members and 1 location. We have GST registered. Need fast internet with static IP for our internal servers, budget is around 3000.';
    const engLang = deterministicService.detectLanguage(englishText);
    assert(engLang === 'English', 'Correctly detected English language');

    const engExtracted = deterministicService.extract(englishText);
    assert(engExtracted.city === 'Bengaluru', `Extracted city is Bengaluru (got ${engExtracted.city})`);
    assert(engExtracted.cityTier === 1, 'Bengaluru is City Tier 1');
    assert(engExtracted.segment === Segment.PROFESSIONAL_OFFICE, `Segment is PROFESSIONAL_OFFICE (got ${engExtracted.segment})`);
    assert(engExtracted.employeeCount === 15, `Employee count is 15 (got ${engExtracted.employeeCount})`);
    assert(engExtracted.numSites === 1, `Sites count is 1 (got ${engExtracted.numSites})`);
    assert(engExtracted.hasGstin === true, 'hasGstin is true');
    assert(engExtracted.monthlyBudgetInr === 3000, `Budget is 3000 (got ${engExtracted.monthlyBudgetInr})`);
    assert(engExtracted.specificProductInterests?.includes('P11') === true, 'P11 (Static IP) detected from requirement');

    // 1.3 Hinglish Input
    const hinglishText = 'Mera business name Sharma Kirana Store hai, Jaipur me shop hai. 4 staff log kaam karte hai, 1 dukaan hai, GST nahi hai. Fast wifi chahiye billing ke liye.';
    const hinglishLang = deterministicService.detectLanguage(hinglishText);
    assert(hinglishLang === 'Hinglish', 'Correctly detected Hinglish language');

    const hinglishExtracted = deterministicService.extract(hinglishText);
    assert(hinglishExtracted.city === 'Jaipur', `City is Jaipur (got ${hinglishExtracted.city})`);
    assert(hinglishExtracted.cityTier === 2, `Jaipur correctly classified as City Tier 2 (got ${hinglishExtracted.cityTier})`);
    assert(hinglishExtracted.segment === Segment.MICRO_RETAIL, `Segment is MICRO_RETAIL (got ${hinglishExtracted.segment})`);
    assert(hinglishExtracted.employeeCount === 4, `Staff count is 4 (got ${hinglishExtracted.employeeCount})`);
    assert(hinglishExtracted.hasGstin === false, 'hasGstin is false (GST nahi hai)');

    // ================================================================
    // SUITE 2: MISSING FIELDS & CONTEXTUAL FOLLOW-UPS
    // ================================================================
    console.log('\n--- [SUITE 2] Missing Fields Detection & Follow-up Generation ---');

    // Incomplete text: user gives only business type
    const incompleteText = 'Hello, I want internet for my new office.';
    const incompleteExtracted = deterministicService.extract(incompleteText);
    const missing = deterministicService.getMissingFields(incompleteExtracted);

    assert(missing.includes('city'), 'Detects missing city');
    assert(missing.includes('employeeCount'), 'Detects missing employeeCount');
    assert(missing.includes('numSites'), 'Detects missing numSites');
    assert(missing.includes('hasGstin'), 'Detects missing hasGstin');

    // Follow-up question generation in Hindi & English
    const followUpHindiCity = deterministicService.generateFollowUpQuestion('city', 'Hindi');
    assert(followUpHindiCity.includes('शहर'), 'Hindi follow-up question for city contains "शहर"');

    const followUpEngEmp = deterministicService.generateFollowUpQuestion('employeeCount', 'English');
    assert(followUpEngEmp.includes('employees'), 'English follow-up question contains "employees"');

    // 2.3 Unknown City Tier Handling (Never silently default!)
    const unknownCityText = 'We run a clinic located in Atlantis with 5 staff.';
    const unknownCityExtracted = deterministicService.extract(unknownCityText);
    assert(unknownCityExtracted.city === 'Atlantis', 'Extracted unknown city name');
    assert(unknownCityExtracted.cityTier === undefined, 'Unknown city has undefined cityTier (not silently defaulted)');
    const missingUnknownCity = deterministicService.getMissingFields(unknownCityExtracted);
    assert(missingUnknownCity.includes('cityTier'), 'cityTier flagged as missing field for unknown city');

    // ================================================================
    // SUITE 2.5: ACTUAL GSTIN REGISTRY VERIFICATION
    // ================================================================
    console.log('\n--- [SUITE 2.5] Actual GSTIN Registry Lookup Verification ---');

    // Cancelled GSTIN in registry: 37IHKXV5167L1ZS (Vindhya Tours)
    const cancelledTurn = await advisorService.handleTurn({
      message: 'My company in Visakhapatnam has 10 staff, 1 site, GST 37IHKXV5167L1ZS.'
    });
    assert(cancelledTurn.extractedEntities.hasGstin === false, 'Cancelled GSTIN in registry (37IHKXV5167L1ZS) sets hasGstin = false');

    // Fake / Unseeded GSTIN: 07AAAAA0000A1Z5
    const fakeGstinTurn = await advisorService.handleTurn({
      message: 'My company in Delhi has 10 staff, 1 site, GST 07AAAAA0000A1Z5.'
    });
    assert(fakeGstinTurn.extractedEntities.hasGstin === false, 'Unseeded/Fake GSTIN sets hasGstin = false');

    // Active GSTIN in registry: 07PUTXM1153M1Z9 (Metro Diagnostics)
    const activeGstinTurn = await advisorService.handleTurn({
      message: 'My company in Delhi has 10 staff, 1 site, GST 07PUTXM1153M1Z9.'
    });
    assert(activeGstinTurn.extractedEntities.hasGstin === true, 'Active GSTIN in registry (07PUTXM1153M1Z9) sets hasGstin = true');

    // ================================================================
    // SUITE 3: MULTI-TURN CONVERSATION & STATE PERSISTENCE
    // ================================================================
    console.log('\n--- [SUITE 3] Multi-turn Conversation & Session Persistence ---');

    // Turn 1: Incomplete start
    const turn1 = await advisorService.handleTurn({
      message: 'नमस्ते, मुझे अपनी कंपनी के लिए इंटरनेट कनेक्शन चाहिए।'
    });

    assert(!!turn1.sessionToken, `Session token created: ${turn1.sessionToken}`);
    assert(turn1.sessionToken.length >= 35, `Session token uses 128-bit cryptographic randomness (length ${turn1.sessionToken.length})`);
    assert(!turn1.isComplete, 'Turn 1 is incomplete (isComplete = false)');
    assert(turn1.missingFields.length > 0, `Turn 1 reports missing fields: ${turn1.missingFields.join(', ')}`);
    assert(turn1.preferredLanguage === 'Hindi', 'Turn 1 language detected as Hindi');

    // Turn 2: Provide city and employees
    const turn2 = await advisorService.handleTurn({
      sessionToken: turn1.sessionToken,
      message: 'हमारी कंपनी दिल्ली में स्थित है और हमारे पास 18 कर्मचारी हैं।'
    });

    assert(turn2.sessionToken === turn1.sessionToken, 'Session token maintained across turns');
    assert(turn2.extractedEntities.city === 'Delhi', `Turn 2 extracted city: ${turn2.extractedEntities.city}`);
    assert(turn2.extractedEntities.employeeCount === 18, `Turn 2 extracted employeeCount: ${turn2.extractedEntities.employeeCount}`);
    assert(!turn2.isComplete, 'Turn 2 still incomplete (waiting for sites, GSTIN)');

    // Turn 3: Provide sites, active GSTIN, and primary need to complete requirements
    const turn3 = await advisorService.handleTurn({
      sessionToken: turn1.sessionToken,
      message: 'हमारे पास 1 ही मुख्य ऑफिस है। हाँ, हमारे पास GST नंबर 07PUTXM1153M1Z9 है और हमें हाई-स्पीड फाइबर चाहिए।'
    });

    assert(turn3.isComplete, 'Turn 3 is complete (isComplete = true)');
    assert(turn3.missingFields.length === 0, 'No remaining missing fields in Turn 3');
    assert(turn3.extractedEntities.hasGstin === true, 'Active Delhi GSTIN successfully verified against database');
    assert(!!turn3.recommendation, 'Turn 3 returned recommendation');
    assert(turn3.recommendation?.items.length! >= 1, `Turn 3 recommended ${turn3.recommendation?.items.length} products`);
    assert(turn3.recommendation?.quote !== undefined, 'Turn 3 quote generated from QuoteModule');
    assert(turn3.recommendation?.quote?.totalMonthlyRecurringInr! > 0, 'Turn 3 quote has positive recurring total');
    assert(turn3.reply.includes('अनुमानित मासिक शुल्क'), 'Turn 3 reply formatted with Hindi commercial breakdown');

    // Turn 4: Retrieve session history from PostgreSQL
    const sessionRecord = await advisorService.getSession(turn1.sessionToken);
    assert(sessionRecord.sessionToken === turn1.sessionToken, 'Retrieved session token matches');
    assert(sessionRecord.messages.length === 6, `Retrieved session has 6 messages (3 user + 3 assistant; got ${sessionRecord.messages.length})`);
    assert(sessionRecord.isCompleted === true, 'Retrieved session is marked completed');

    // ================================================================
    // SUITE 4: GEMINI RESILIENCE & DETERMINISTIC FALLBACK
    // ================================================================
    console.log('\n--- [SUITE 4] AI Extraction Resilience & Fallback Tests ---');

    // 4.1 Malformed / Arbitrary AI output validation
    const malformedPayload = {
      businessName: '123 Fake Corp',
      segment: 'INVALID_SEGMENT_INVENTED_BY_AI',
      city: 'Delhi',
      cityTier: 99, // invalid tier
      employeeCount: -50, // invalid negative headcount
      numSites: 'three', // invalid string
      hasGstin: 'yes', // invalid non-boolean
      monthlyBudgetInr: 'lots of money'
    };

    const sanitized = (geminiService as any).validateAndSanitize(malformedPayload, {});
    assert(sanitized.segment === undefined, 'Rejected invalid segment from arbitrary model output');
    assert(sanitized.cityTier === undefined, 'Rejected invalid cityTier 99');
    assert(sanitized.employeeCount === undefined, 'Rejected negative employeeCount');
    assert(sanitized.numSites === undefined, 'Rejected non-numeric numSites');
    assert(sanitized.hasGstin === undefined, 'Rejected non-boolean hasGstin');
    assert(sanitized.city === 'Delhi', 'Preserved valid city Delhi');

    // 4.2 Simulated Gemini API failure / missing key
    const fallbackResult = await geminiService.extractIntent([
      { role: 'user', content: 'Our factory in Ahmedabad has 50 staff and GST.' }
    ]);
    assert(fallbackResult === null, 'extractIntent safely returns null when Gemini key is unset/invalid, enabling fallback');

    // ================================================================
    // SUITE 5: LIVE HTTP REST API VERIFICATION
    // ================================================================
    console.log('\n--- [SUITE 5] Live HTTP REST API Verification ---');
    const port = 4003;
    await app.listen(port);
    console.log(`  Live test HTTP server listening on port ${port}...`);

    // 5.1 POST /api/advisor/chat (Turn 1: English Flow)
    const chatHttpRes1 = await httpPost(`http://127.0.0.1:${port}/api/advisor/chat`, {
      message: 'Hi, we are Zenith Logistics in Mumbai with 12 employees and 1 office. We have GST.'
    });
    const chatData1 = JSON.parse(chatHttpRes1.body);
    assert(chatHttpRes1.statusCode === 200, `POST /api/advisor/chat returned 200 OK`);
    assert(chatData1.extractedEntities.city === 'Mumbai', `Live HTTP extracted city: ${chatData1.extractedEntities.city}`);
    assert(chatData1.extractedEntities.cityTier === 1, 'Mumbai classified as Tier 1');
    assert(chatData1.extractedEntities.employeeCount === 12, 'Headcount extracted as 12');
    assert(chatData1.isComplete === true, 'All core requirements met; isComplete: true');
    assert(chatData1.recommendation?.quote?.quoteNumber !== undefined, 'Generated quoteNumber via QuoteService');
    assert(chatData1.recommendation?.quote?.totalMonthlyRecurringInr === 1499, `Quote monthly is ₹1,499 (P02 Biz Fibre 300M; got ${chatData1.recommendation?.quote?.totalMonthlyRecurringInr})`);

    // 5.2 GET /api/advisor/session/:sessionToken
    const sessionHttpRes = await httpGet(`http://127.0.0.1:${port}/api/advisor/session/${chatData1.sessionToken}`);
    const sessionData = JSON.parse(sessionHttpRes.body);
    assert(sessionHttpRes.statusCode === 200, `GET /api/advisor/session/:sessionToken returned 200 OK`);
    assert(sessionData.sessionToken === chatData1.sessionToken, 'Live HTTP sessionToken matches');
    assert(sessionData.messages.length === 2, `Session has 2 messages (got ${sessionData.messages.length})`);

    await app.close();
    console.log('  Live test HTTP server closed cleanly.');

  } catch (err: any) {
    console.error('CRITICAL UNEXPECTED ERROR IN PHASE 3 TEST SUITE:', err);
    assert(false, 'Phase 3 Test Suite execution', err.message);
  } finally {
    await prisma.$disconnect();
  }

  // Summary Report
  console.log('\n================================================================');
  console.log('                  PHASE 3 TEST SUMMARY REPORT                   ');
  console.log('================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Assertions: ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    results.filter((r) => !r.passed).forEach((r) => console.error(`  - ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PHASE 3 TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

// Native HTTP helpers
function httpGet(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
    }).on('error', reject);
  });
}

function httpPost(url: string, payload: any): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

runPhase3TestSuite();
