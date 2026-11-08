import { PrismaClient, ProductCategory, Segment } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

// Paths to read-only original datasets
const ROOT_DIR = path.resolve(__dirname, '../../..');
const PRODUCTS_CSV = path.join(ROOT_DIR, 'product_catalogue.csv');
const GSTIN_CSV = path.join(ROOT_DIR, 'mock_gstin_registry.csv');
const UDYAM_CSV = path.join(ROOT_DIR, 'mock_udyam_registry.csv');
const LEADS_CSV = path.join(ROOT_DIR, 'smb_leads.csv');

function parseDateOrNull(val: string | undefined): Date | null {
  if (!val || !val.trim()) return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d;
}

function parseSegment(str: string): Segment {
  const s = str.trim().toLowerCase();
  if (s.includes('micro')) return Segment.MICRO_RETAIL;
  if (s.includes('prof') || s.includes('office')) return Segment.PROFESSIONAL_OFFICE;
  if (s.includes('multi')) return Segment.MULTI_SITE;
  if (s.includes('mfg') || s.includes('manufactur')) return Segment.MANUFACTURING;
  return Segment.MICRO_RETAIL;
}

function parseCategory(str: string): ProductCategory {
  const c = str.trim();
  if (c === 'Connectivity') return ProductCategory.CONNECTIVITY;
  if (c === 'Communication') return ProductCategory.COMMUNICATION;
  if (c === 'Cloud & Productivity') return ProductCategory.CLOUD_PRODUCTIVITY;
  if (c === 'Security') return ProductCategory.SECURITY;
  if (c === 'IoT & Physical') return ProductCategory.IOT_PHYSICAL;
  throw new Error(`Unknown category: ${c}`);
}

async function main() {
  console.log('--- UDYAMONE DATABASE SEEDING STARTED ---');
  console.log(`Checking original files in: ${ROOT_DIR}`);

  if (!fs.existsSync(PRODUCTS_CSV)) throw new Error(`Missing ${PRODUCTS_CSV}`);
  if (!fs.existsSync(GSTIN_CSV)) throw new Error(`Missing ${GSTIN_CSV}`);
  if (!fs.existsSync(UDYAM_CSV)) throw new Error(`Missing ${UDYAM_CSV}`);
  if (!fs.existsSync(LEADS_CSV)) throw new Error(`Missing ${LEADS_CSV}`);

  // 1. Read & Validate Products CSV
  const productsRaw = parse(fs.readFileSync(PRODUCTS_CSV, 'utf-8'), { columns: true, skip_empty_lines: true });
  if (productsRaw.length !== 25) {
    throw new Error(`Expected exactly 25 products in catalogue, found ${productsRaw.length}`);
  }

  // Validate duplicate IDs
  const productIds = new Set<string>();
  for (const p of productsRaw) {
    if (productIds.has(p.product_id)) {
      throw new Error(`Duplicate product ID detected: ${p.product_id}`);
    }
    productIds.add(p.product_id);
  }

  // 2. Read & Validate GSTIN Registry
  const gstinRaw = parse(fs.readFileSync(GSTIN_CSV, 'utf-8'), { columns: true, skip_empty_lines: true });
  if (gstinRaw.length !== 3534) {
    throw new Error(`Expected exactly 3534 GSTIN records, found ${gstinRaw.length}`);
  }

  // 3. Read & Validate Udyam Registry
  const udyamRaw = parse(fs.readFileSync(UDYAM_CSV, 'utf-8'), { columns: true, skip_empty_lines: true });
  if (udyamRaw.length !== 2723) {
    throw new Error(`Expected exactly 2723 Udyam records, found ${udyamRaw.length}`);
  }

  // 4. Read & Validate Leads CSV
  const leadsRaw = parse(fs.readFileSync(LEADS_CSV, 'utf-8'), { columns: true, skip_empty_lines: true });
  if (leadsRaw.length !== 5000) {
    throw new Error(`Expected exactly 5000 SMB leads, found ${leadsRaw.length}`);
  }

  console.log('All CSV files verified for row counts and structure. Beginning transactional database load...');

  // Use interactive transaction for atomic seeding
  await prisma.$transaction(async (tx) => {
    // Clean existing catalog and registry tables
    await tx.productPrerequisite.deleteMany({});
    await tx.productCityTier.deleteMany({});
    await tx.productTargetSegment.deleteMany({});
    await tx.product.deleteMany({});
    await tx.gstinRegistry.deleteMany({});
    await tx.udyamRegistry.deleteMany({});
    await tx.droppedLead.deleteMany({});

    console.log('1. Seeding 25 Products...');
    for (const p of productsRaw) {
      await tx.product.create({
        data: {
          id: p.product_id,
          category: parseCategory(p.category),
          productName: p.product_name,
          description: p.description,
          unit: p.unit,
          priceMinInr: p.price_min_inr_per_month,
          priceMaxInr: p.price_max_inr_per_month,
          oneTimeSetupInr: p.one_time_setup_inr,
          minContractMonths: parseInt(p.min_contract_months, 10),
          minEmployees: parseInt(p.min_employees, 10) || 1,
          minSites: parseInt(p.min_sites, 10) || 1,
          requiresGstin: p.requires_gstin.trim().toUpperCase() === 'Y',
          typicalInstallDays: parseInt(p.typical_install_days, 10) || 5,
          isActive: true
        }
      });

      // City tiers
      const tiers = p.available_city_tiers.split(';').map((t: string) => parseInt(t.trim(), 10)).filter((t: number) => !isNaN(t));
      for (const tier of tiers) {
        await tx.productCityTier.create({
          data: { productId: p.product_id, cityTier: tier }
        });
      }

      // Target segments
      const segs = p.target_segments.split(';').map((s: string) => s.trim().toLowerCase());
      for (const seg of segs) {
        await tx.productTargetSegment.create({
          data: { productId: p.product_id, segment: parseSegment(seg) }
        });
      }
    }

    // Prerequisites (calculated programmatically: 34 pairs)
    console.log('2. Seeding Product Prerequisites...');
    let prereqCount = 0;
    for (const p of productsRaw) {
      const req = p.requires_one_of ? p.requires_one_of.trim() : '';
      if (req) {
        const prereqList = req.split('|').map((x: string) => x.trim()).filter((x: string) => x);
        for (const prereqId of prereqList) {
          if (!productIds.has(prereqId)) {
            throw new Error(`Broken dependency! ${p.product_id} requires non-existent product ${prereqId}`);
          }
          await tx.productPrerequisite.create({
            data: {
              productId: p.product_id,
              prerequisiteProductId: prereqId
            }
          });
          prereqCount++;
        }
      }
    }
    console.log(`   Seeded ${prereqCount} prerequisite links (verified).`);

    // Seed GSTIN Registry in batches
    console.log('3. Seeding GSTIN Registry (3,534 records)...');
    const BATCH_SIZE = 500;
    for (let i = 0; i < gstinRaw.length; i += BATCH_SIZE) {
      const slice = gstinRaw.slice(i, i + BATCH_SIZE);
      await tx.gstinRegistry.createMany({
        data: slice.map((r: any) => ({
          gstin: r.gstin.trim(),
          legalName: r.legal_name.trim(),
          tradeName: r.trade_name.trim(),
          constitution: r.constitution.trim(),
          principalPlaceOfBusiness: r.principal_place_of_business.trim(),
          state: r.state.trim(),
          registrationDate: new Date(r.registration_date.trim()),
          status: r.status.trim()
        }))
      });
    }

    // Seed Udyam Registry in batches
    console.log('4. Seeding Udyam Registry (2,723 records)...');
    for (let i = 0; i < udyamRaw.length; i += BATCH_SIZE) {
      const slice = udyamRaw.slice(i, i + BATCH_SIZE);
      await tx.udyamRegistry.createMany({
        data: slice.map((r: any) => ({
          udyamNumber: r.udyam_number.trim(),
          enterpriseName: r.enterprise_name.trim(),
          enterpriseType: r.enterprise_type.trim(),
          majorActivity: r.major_activity.trim(),
          nicDescription: r.nic_description.trim(),
          state: r.state.trim(),
          city: r.city.trim(),
          dateOfRegistration: new Date(r.date_of_registration.trim())
        }))
      });
    }

    // Seed Dropped Leads in batches
    console.log('5. Seeding Dropped Leads (5,000 records)...');
    for (let i = 0; i < leadsRaw.length; i += BATCH_SIZE) {
      const slice = leadsRaw.slice(i, i + BATCH_SIZE);
      await tx.droppedLead.createMany({
        data: slice.map((r: any) => {
          // Calculate deterministic baseline propensity score (0 to 100)
          let score = 20.0;
          if (r.has_gstin === 'Y') score += 30.0;
          if (r.has_udyam === 'Y') score += 15.0;
          if (r.stage_reached === 'KYC complete') score += 25.0;
          else if (r.stage_reached === 'Quote accepted') score += 20.0;
          else if (r.stage_reached === 'Needs assessed') score += 10.0;
          
          let rank = 'LOW';
          if (score >= 70) rank = 'HIGH';
          else if (score >= 45) rank = 'MEDIUM';

          return {
            id: r.lead_id.trim(),
            originalCreatedDate: parseDateOrNull(r.created_date),
            leadSource: r.lead_source?.trim() || null,
            businessName: r.business_name.trim(),
            businessType: r.business_type?.trim() || null,
            segment: parseSegment(r.segment),
            city: r.city.trim(),
            cityTier: parseInt(r.city_tier, 10) || 2,
            state: r.state.trim(),
            preferredLanguage: r.preferred_language?.trim() || 'Hindi',
            employeeCount: parseInt(r.employee_count, 10) || 1,
            numSites: parseInt(r.num_sites, 10) || 1,
            annualTurnoverBand: r.annual_turnover_band?.trim() || null,
            hasGstin: r.has_gstin === 'Y',
            gstin: r.gstin?.trim() || null,
            hasUdyam: r.has_udyam === 'Y',
            udyamNumber: r.udyam_number?.trim() || null,
            currentInternet: r.current_internet?.trim() || null,
            currentProvider: r.current_provider?.trim() || null,
            monthlyTelecomSpendInr: r.monthly_telecom_spend_inr ? r.monthly_telecom_spend_inr : null,
            productsOfInterest: r.products_of_interest?.trim() || null,
            contactName: r.contact_name?.trim() || 'Business Owner',
            contactRole: r.contact_role?.trim() || null,
            stageReached: r.stage_reached.trim(),
            dropReason: r.drop_reason?.trim() || 'Unspecified',
            propensityScore: score,
            propensityRank: rank,
            recoveryPitch: `Lead reached stage ${r.stage_reached}. Priority callback for ${r.business_name}.`
          };
        })
      });
    }
  }, { timeout: 60000 });

  console.log('--- DATABASE SEEDING COMPLETED SUCCESSFULLY ---');
}

main()
  .catch((e) => {
    console.error('SEEDING FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
