import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runSmokeTests() {
  console.log('====================================================');
  console.log('       UDYAMONE PHASE 1 SMOKE TEST SUITE            ');
  console.log('====================================================');

  try {
    // 1. Connection check
    console.log('\n[1/5] Testing PostgreSQL Connection...');
    const result = await prisma.$queryRaw`SELECT current_database(), current_user, version()`;
    console.log('  SUCCESS: Connected to PostgreSQL database.', result);

    // 2. Product Table Verification
    console.log('\n[2/5] Verifying Product Catalogue & Normalized Relations...');
    const productCount = await prisma.product.count();
    const cityTierCount = await prisma.productCityTier.count();
    const prereqCount = await prisma.productPrerequisite.count();
    const targetSegmentCount = await prisma.productTargetSegment.count();

    console.log(`  Products count: ${productCount} (Expected: 25)`);
    console.log(`  City Tiers count: ${cityTierCount} (Expected: 49)`);
    console.log(`  Prerequisites count: ${prereqCount} (Expected: 34)`);
    console.log(`  Target Segments count: ${targetSegmentCount} (Expected: >= 25)`);

    if (productCount !== 25) throw new Error(`Product count mismatch: got ${productCount}`);
    if (cityTierCount !== 49) throw new Error(`City tier count mismatch: got ${cityTierCount}`);
    if (prereqCount !== 34) throw new Error(`Prerequisites count mismatch: got ${prereqCount}`);

    // Verify P10 prerequisites
    const p10Prereqs = await prisma.productPrerequisite.findMany({
      where: { productId: 'P10' },
      select: { prerequisiteProductId: true },
    });
    console.log('  P10 (Managed SD-WAN) prerequisites in DB:', p10Prereqs.map(p => p.prerequisiteProductId));
    if (p10Prereqs.length !== 5) throw new Error(`Expected 5 prerequisites for P10, got ${p10Prereqs.length}`);

    // 3. GSTIN Registry Verification
    console.log('\n[3/5] Verifying GSTIN Registry...');
    const gstinCount = await prisma.gstinRegistry.count();
    console.log(`  GSTIN records: ${gstinCount} (Expected: 3534)`);
    if (gstinCount !== 3534) throw new Error(`GSTIN count mismatch: got ${gstinCount}`);

    const k01Gst = await prisma.gstinRegistry.findUnique({
      where: { gstin: '37IHKXV5167L1ZS' },
    });
    console.log('  Sample K01 GSTIN status in DB:', k01Gst?.tradeName, '| Status:', k01Gst?.status);
    if (!k01Gst || k01Gst.status !== 'Cancelled') {
      throw new Error(`K01 GSTIN status mismatch: expected Cancelled, got ${k01Gst?.status}`);
    }

    // 4. Udyam Registry Verification
    console.log('\n[4/5] Verifying Udyam Registry...');
    const udyamCount = await prisma.udyamRegistry.count();
    console.log(`  Udyam records: ${udyamCount} (Expected: 2723)`);
    if (udyamCount !== 2723) throw new Error(`Udyam count mismatch: got ${udyamCount}`);

    // 5. Dropped Leads Verification
    console.log('\n[5/5] Verifying Dropped Leads & Propensity Scoring...');
    const leadsCount = await prisma.droppedLead.count();
    console.log(`  Dropped leads records: ${leadsCount} (Expected: 5000)`);
    if (leadsCount !== 5000) throw new Error(`Leads count mismatch: got ${leadsCount}`);

    const sampleHighPropensity = await prisma.droppedLead.findFirst({
      where: { propensityRank: 'HIGH' },
    });
    console.log(`  Sample High Propensity Lead: ${sampleHighPropensity?.id} (${sampleHighPropensity?.businessName}) | Score: ${sampleHighPropensity?.propensityScore}`);

    console.log('\n====================================================');
    console.log('    ALL PHASE 1 SMOKE TESTS PASSED CLEANLY (100%)    ');
    console.log('====================================================');
  } catch (err: any) {
    console.error('\nSMOKE TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSmokeTests();
