import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { QuoteService } from '../src/modules/quote/quote.service';
import { PrismaService } from '../src/prisma/prisma.service';
import * as http from 'http';

interface TestSummary {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
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

async function runPhase2TestSuite() {
  console.log('================================================================');
  console.log('    UDYAMONE PHASE 2: CATALOG & DYNAMIC QUOTE ENGINE TESTS      ');
  console.log('================================================================');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.init();

  const prisma = app.get(PrismaService);
  const catalogService = app.get(CatalogService);
  const quoteService = app.get(QuoteService);

  try {
    // ================================================================
    // SUITE 1: CATALOGUE INTEGRITY & ALL 25 PRODUCTS
    // ================================================================
    console.log('\n--- [SUITE 1] Catalogue Verification & All 25 Products ---');
    const allProducts = await catalogService.getAllProducts();
    assert(allProducts.length === 25, 'Catalog contains exactly 25 products', `Expected 25, got ${allProducts.length}`);

    // Verify all 25 product IDs exist and have valid fields
    for (let i = 1; i <= 25; i++) {
      const pid = `P${i.toString().padStart(2, '0')}`;
      const prod = allProducts.find((p) => p.id === pid);
      assert(!!prod, `Product ${pid} exists in catalogue`, `Product ${pid} not found`);
      if (prod) {
        assert(prod.priceMinInr > 0, `Product ${pid} has positive priceMinInr (${prod.priceMinInr})`);
        assert(prod.priceMaxInr >= prod.priceMinInr, `Product ${pid} priceMaxInr >= priceMinInr`);
        assert(prod.availableCityTiers.length > 0, `Product ${pid} has available city tiers`);
        assert(prod.targetSegments.length > 0, `Product ${pid} has target segments`);
      }
    }

    // ================================================================
    // SUITE 2: ELIGIBILITY & CONSTRAINTS VALIDATION
    // ================================================================
    console.log('\n--- [SUITE 2] Eligibility & Constraint Validation ---');

    // 2.1 City Tier Constraint: P03 (Biz Fibre 1G) is Tier 1 only
    const p03Tier2Check = await catalogService.validateBundle(
      { cityTier: 2, hasGstin: true, employeeCount: 10, numSites: 1 },
      [{ productId: 'P03', quantity: 1 }]
    );
    assert(
      !p03Tier2Check.valid && p03Tier2Check.errors.some((e) => e.code === 'CITY_TIER_INCOMPATIBLE'),
      'P03 (Biz Fibre 1G) is rejected in City Tier 2',
      JSON.stringify(p03Tier2Check.errors)
    );

    const p03Tier1Check = await catalogService.validateBundle(
      { cityTier: 1, hasGstin: true, employeeCount: 10, numSites: 1 },
      [{ productId: 'P03', quantity: 1 }]
    );
    assert(p03Tier1Check.valid, 'P03 (Biz Fibre 1G) is accepted in City Tier 1');

    // 2.2 GSTIN Requirement: P10 requires GSTIN
    const p10NoGstinCheck = await catalogService.validateBundle(
      { cityTier: 1, hasGstin: false, employeeCount: 15, numSites: 3, existingProductIds: ['P01'] },
      [{ productId: 'P10', quantity: 1 }]
    );
    assert(
      !p10NoGstinCheck.valid && p10NoGstinCheck.errors.some((e) => e.code === 'GSTIN_REQUIRED'),
      'P10 (SD-WAN Basic) is rejected when customer has no GSTIN',
      JSON.stringify(p10NoGstinCheck.errors)
    );

    // 2.3 Headcount / Minimum Employees: P10 requires min 10 employees; P06 requires min 25 employees
    const p10LowEmployeesCheck = await catalogService.validateBundle(
      { cityTier: 1, hasGstin: true, employeeCount: 5, numSites: 3, existingProductIds: ['P01'] },
      [{ productId: 'P10', quantity: 1 }]
    );
    assert(
      !p10LowEmployeesCheck.valid && p10LowEmployeesCheck.errors.some((e) => e.code === 'INSUFFICIENT_EMPLOYEES'),
      'P10 (SD-WAN) is rejected when employee count is below minimum 10 (got 5)',
      JSON.stringify(p10LowEmployeesCheck.errors)
    );

    // 2.4 Minimum Sites: P10 requires at least 3 sites
    const p10SingleSiteCheck = await catalogService.validateBundle(
      { cityTier: 1, hasGstin: true, employeeCount: 15, numSites: 1, existingProductIds: ['P01'] },
      [{ productId: 'P10', quantity: 1 }]
    );
    assert(
      !p10SingleSiteCheck.valid && p10SingleSiteCheck.errors.some((e) => e.code === 'INSUFFICIENT_SITES'),
      'P10 (SD-WAN Basic) is rejected when numSites < 3 (got 1)',
      JSON.stringify(p10SingleSiteCheck.errors)
    );

    // ================================================================
    // SUITE 3: PREREQUISITE CHAINS & RECURSIVE VALIDATION
    // ================================================================
    console.log('\n--- [SUITE 3] Prerequisite Chains & Recursive Validation ---');

    // Test all 7 add-on products with prerequisites: P09, P10, P11, P12, P21, P22, P23
    const addonIds = ['P09', 'P10', 'P11', 'P12', 'P21', 'P22', 'P23'];
    for (const addonId of addonIds) {
      const standaloneCheck = await catalogService.validateBundle(
        { cityTier: 1, hasGstin: true, employeeCount: 50, numSites: 10 },
        [{ productId: addonId, quantity: 1 }]
      );
      assert(
        !standaloneCheck.valid && standaloneCheck.errors.some((e) => e.code === 'PREREQUISITE_MISSING'),
        `Add-on ${addonId} alone fails with PREREQUISITE_MISSING`,
        `Expected PREREQUISITE_MISSING, got: ${JSON.stringify(standaloneCheck.errors)}`
      );
    }

    // P11 (Static IP) + P01 (Biz Fibre 100M) bundle -> Should succeed!
    const p11WithP01Check = await catalogService.validateBundle(
      { cityTier: 1, hasGstin: true, employeeCount: 5, numSites: 1 },
      [
        { productId: 'P01', quantity: 1 },
        { productId: 'P11', quantity: 1 }
      ]
    );
    assert(p11WithP01Check.valid, 'P11 (Static IP) + P01 (Biz Fibre 100) bundle is valid');

    // P10 (SD-WAN) + P01 (Biz Fibre 100) with 3 sites, 15 employees, GSTIN -> Should succeed!
    const p10WithP01Check = await catalogService.validateBundle(
      { cityTier: 1, hasGstin: true, employeeCount: 15, numSites: 3 },
      [
        { productId: 'P01', quantity: 1 },
        { productId: 'P10', quantity: 1 }
      ]
    );
    assert(p10WithP01Check.valid, 'P10 (SD-WAN) + P01 (Biz Fibre 100) with 3 sites and 15 employees is valid');

    // P10 with P04 (Biz 5G AirFiber 100) -> Should fail because P04 is NOT in P10 prerequisites (P01|P02|P03|P05|P06)
    const p10WithP04Check = await catalogService.validateBundle(
      { cityTier: 1, hasGstin: true, employeeCount: 15, numSites: 3 },
      [
        { productId: 'P04', quantity: 1 },
        { productId: 'P10', quantity: 1 }
      ]
    );
    assert(
      !p10WithP04Check.valid && p10WithP04Check.errors.some((e) => e.code === 'PREREQUISITE_MISSING'),
      'P10 correctly rejects P04 as prerequisite (requires wireline fibre P01|P02|P03|P05|P06)'
    );

    // ================================================================
    // SUITE 4: DECIMAL PRICING & QUOTE ENGINE
    // ================================================================
    console.log('\n--- [SUITE 4] Decimal Pricing Engine & Breakdown ---');

    // 4.1 Indicative pricing calculation without tax/discount
    // P01: min 999, max 1199, setup 0, install 5 days
    // P09: min 499, max 699, setup 1500, install 3 days
    const baseQuote = await quoteService.calculateQuote({
      businessProfile: { cityTier: 1, hasGstin: true, employeeCount: 10, numSites: 1 },
      items: [
        { productId: 'P01', quantity: 1 },
        { productId: 'P09', quantity: 1 }
      ],
      contractMonths: 12,
      discountPercent: 0,
      taxPercent: 0
    });

    // P01: 999 * 1 = 999 monthly, 0 setup
    // P09: 499 * 1 = 499 monthly, 1500 setup
    // Subtotal monthly: 999 + 499 = 1498.00
    // Subtotal setup: 0 + 1500 = 1500.00
    // Total 1st year: (1498 * 12) + 1500 = 17976 + 1500 = 19476.00
    // Order SLA: max(P01: 5 days, P09: 3 days) = 5 days
    assert(baseQuote.subtotalMonthlyInr === 1498, `Base monthly subtotal is exactly 1498 (got ${baseQuote.subtotalMonthlyInr})`);
    assert(baseQuote.subtotalSetupInr === 1500, `Base setup subtotal is exactly 1500 (got ${baseQuote.subtotalSetupInr})`);
    assert(baseQuote.totalIndicativeFirstYearInr === 19476, `Total 1st year indicative value is 19476 (got ${baseQuote.totalIndicativeFirstYearInr})`);
    assert(baseQuote.installationSlaDays === 5, `Order SLA is 5 days (max of P01: 5 days, P09: 3 days; got ${baseQuote.installationSlaDays})`);

    // 4.2 Configurable pricing within catalogue bounds
    const customPriceQuote = await quoteService.calculateQuote({
      businessProfile: { cityTier: 1, hasGstin: true, employeeCount: 10, numSites: 1 },
      items: [
        { productId: 'P01', quantity: 1, configuredUnitPriceInr: 1050 } // Between 999 and 1199
      ]
    });
    assert(customPriceQuote.subtotalMonthlyInr === 1050, `Configured unit price ₹1050 accepted within range [999, 1199]`);

    // 4.3 Configured price out of catalogue range (below min) -> Must fail
    let belowMinFailed = false;
    try {
      await quoteService.calculateQuote({
        businessProfile: { cityTier: 1, hasGstin: true, employeeCount: 10, numSites: 1 },
        items: [{ productId: 'P01', quantity: 1, configuredUnitPriceInr: 500 }] // below 999
      });
    } catch (e: any) {
      belowMinFailed = true;
    }
    assert(belowMinFailed, 'Configured price below priceMinInr is rejected with BadRequestException');

    // 4.4 Configured price out of catalogue range (above max) -> Must fail
    let aboveMaxFailed = false;
    try {
      await quoteService.calculateQuote({
        businessProfile: { cityTier: 1, hasGstin: true, employeeCount: 10, numSites: 1 },
        items: [{ productId: 'P01', quantity: 1, configuredUnitPriceInr: 2500 }] // above 1199
      });
    } catch (e: any) {
      aboveMaxFailed = true;
    }
    assert(aboveMaxFailed, 'Configured price above priceMaxInr is rejected with BadRequestException');

    // 4.5 Configurable Contract Discount (10%) and Configurable GST (18%)
    // P01 configured at 1000 monthly (setup 0), P09 configured at 500 monthly (setup 1500)
    const taxAndDiscountQuote = await quoteService.calculateQuote({
      businessProfile: { cityTier: 1, hasGstin: true, employeeCount: 10, numSites: 1 },
      items: [
        { productId: 'P01', quantity: 1, configuredUnitPriceInr: 1000 },
        { productId: 'P09', quantity: 1, configuredUnitPriceInr: 500 }
      ],
      discountPercent: 10,
      taxPercent: 18,
      contractMonths: 12
    });
    // Subtotal monthly: 1500.00
    // Discount 10%: 150.00 -> Net monthly: 1350.00
    // Tax 18% on 1350: 243.00 -> Total monthly: 1593.00
    // Subtotal setup: 1500.00
    // Tax 18% on setup: 270.00 -> Total setup: 1770.00
    // Total 1st year: (1593 * 12) + 1770 = 19116 + 1770 = 20886.00
    assert(taxAndDiscountQuote.netMonthlyInr === 1350, `Net monthly after 10% discount is 1350 (got ${taxAndDiscountQuote.netMonthlyInr})`);
    assert(taxAndDiscountQuote.totalMonthlyRecurringInr === 1593, `Total monthly after 18% GST is 1593 (got ${taxAndDiscountQuote.totalMonthlyRecurringInr})`);
    assert(taxAndDiscountQuote.totalOneTimeSetupInr === 1770, `Total setup after 18% GST is 1770 (got ${taxAndDiscountQuote.totalOneTimeSetupInr})`);
    assert(taxAndDiscountQuote.totalIndicativeFirstYearInr === 20886, `Total 1st year value is exactly 20886 (got ${taxAndDiscountQuote.totalIndicativeFirstYearInr})`);

    // ================================================================
    // SUITE 5: QUOTE PERSISTENCE & RETRIEVAL
    // ================================================================
    console.log('\n--- [SUITE 5] Quote Persistence & Retrieval ---');

    // Create a temporary test business
    const testBusiness = await prisma.business.create({
      data: {
        legalName: 'Apex Precision Engineering Pvt Ltd',
        tradeName: 'Apex Tools',
        constitution: 'Private Limited Company',
        segment: 'MANUFACTURING',
        city: 'Pune',
        cityTier: 1,
        state: 'Maharashtra',
        hasGstin: true,
        gstin: '27AABCA1234F1Z5',
        hasUdyam: true,
        udyamNumber: 'UDYAM-MH-01-0012345',
        employeeCount: 45,
        numSites: 2
      }
    });

    // Save formal quote
    const savedQuote = await quoteService.calculateQuote({
      businessId: testBusiness.id,
      items: [
        { productId: 'P02', quantity: 1 }, // Biz Fibre 300
        { productId: 'P11', quantity: 1 }  // Static IP Bundle
      ],
      save: true
    });

    assert(!!savedQuote.quoteNumber, `Quote number generated: ${savedQuote.quoteNumber}`);
    assert(savedQuote.quoteNumber?.startsWith('QUO-2026-') === true, 'Quote number matches format QUO-2026-XXXXX');

    // Retrieve saved quote by quoteNumber
    const retrievedQuote = await quoteService.getQuoteByNumber(savedQuote.quoteNumber!);
    assert(retrievedQuote.quoteNumber === savedQuote.quoteNumber, 'Retrieved quoteNumber matches saved quote');
    assert(retrievedQuote.items.length === 2, `Retrieved quote has 2 items (got ${retrievedQuote.items.length})`);
    assert(retrievedQuote.totalMonthlyRecurringInr === savedQuote.totalMonthlyRecurringInr, 'Retrieved totalMonthly matches saved quote');

    // Clean up temporary test business
    await prisma.business.delete({ where: { id: testBusiness.id } });
    console.log('  Cleaned up temporary test business.');

    // ================================================================
    // SUITE 6: REAL HTTP SERVER VERIFICATION (Catalog & Quote APIs)
    // ================================================================
    console.log('\n--- [SUITE 6] Live HTTP REST API Verification ---');
    const port = 4002;
    await app.listen(port);
    console.log(`  Live test HTTP server listening on port ${port}...`);

    // 6.1 GET /api/catalog/products
    const catHttpRes = await httpGet(`http://127.0.0.1:${port}/api/catalog/products`);
    const catData = JSON.parse(catHttpRes.body);
    assert(catHttpRes.statusCode === 200, `GET /api/catalog/products returned 200 OK`);
    assert(catData.length === 25, `GET /api/catalog/products returned 25 products`);

    // 6.2 POST /api/catalog/validate-bundle
    const validateHttpRes = await httpPost(`http://127.0.0.1:${port}/api/catalog/validate-bundle`, {
      profile: { cityTier: 1, hasGstin: true, employeeCount: 15, numSites: 3 },
      items: [
        { productId: 'P01', quantity: 1 },
        { productId: 'P10', quantity: 1 }
      ]
    });
    const validateData = JSON.parse(validateHttpRes.body);
    assert(validateHttpRes.statusCode === 201 || validateHttpRes.statusCode === 200, `POST /api/catalog/validate-bundle HTTP status ${validateHttpRes.statusCode}`);
    assert(validateData.valid === true, 'POST /api/catalog/validate-bundle returned valid: true');

    // 6.3 POST /api/quote/calculate
    const quoteHttpRes = await httpPost(`http://127.0.0.1:${port}/api/quote/calculate`, {
      businessProfile: { cityTier: 1, hasGstin: true, employeeCount: 10, numSites: 1 },
      items: [{ productId: 'P01', quantity: 1 }],
      contractMonths: 12
    });
    const quoteData = JSON.parse(quoteHttpRes.body);
    assert(quoteHttpRes.statusCode === 200, `POST /api/quote/calculate returned 200 OK`);
    assert(quoteData.subtotalMonthlyInr === 999, `POST /api/quote/calculate returned subtotal 999`);

    await app.close();
    console.log('  Live test HTTP server closed cleanly.');

  } catch (err: any) {
    console.error('CRITICAL UNEXPECTED ERROR IN TEST SUITE:', err);
    assert(false, 'Phase 2 Test Suite execution', err.message);
  } finally {
    await prisma.$disconnect();
  }

  // Summary Report
  console.log('\n================================================================');
  console.log('                  PHASE 2 TEST SUMMARY REPORT                   ');
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
    console.log('\n🎉 ALL PHASE 2 TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  }
}

// Helpers for native HTTP requests
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

runPhase2TestSuite();
