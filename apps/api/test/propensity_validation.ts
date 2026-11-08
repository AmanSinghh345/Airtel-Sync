import * as fs from 'fs';
import * as path from 'path';

const csvPath = path.resolve(__dirname, '../../../smb_leads.csv');
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
const headers = lines[0].split(',');

interface LeadRow {
  lead_id: string;
  stage_reached: string;
  outcome: string;
  drop_reason: string;
  employee_count: string;
  num_sites: string;
  monthly_telecom_spend_inr: string;
  has_gstin: string;
  gstin: string;
  has_udyam: string;
  udyam_number: string;
  [key: string]: string;
}

const leads: LeadRow[] = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const parts: string[] = [];
  let inQuotes = false;
  let current = '';
  for (let c = 0; c < line.length; c++) {
    const char = line[c];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  const obj: any = {};
  for (let h = 0; h < headers.length; h++) {
    obj[headers[h]] = parts[h] ? parts[h].trim() : '';
  }
  leads.push(obj);
}

// Replicate PropensityService logic
function calculateScore(lead: LeadRow) {
  let score = 0;

  // 1. Funnel stage
  const stage = lead.stage_reached;
  if (stage === 'KYC complete' || stage === 'Activated') score += 40;
  else if (stage === 'Quote accepted') score += 30;
  else if (stage === 'Needs assessed') score += 20;
  else if (stage === 'Contacted') score += 10;
  else score += 5; // Lead

  // 2. GSTIN
  const hasGstin = lead.has_gstin === 'Y';
  const gstinVerified = hasGstin && lead.gstin.length > 5;
  if (gstinVerified) score += 15;

  // 3. Udyam
  const hasUdyam = lead.has_udyam === 'Y';
  const udyamVerified = hasUdyam && lead.udyam_number.length > 5;
  if (udyamVerified) score += 10;

  // 4. Scale & Monthly spend
  const emp = parseInt(lead.employee_count, 10) || 0;
  const sites = parseInt(lead.num_sites, 10) || 0;
  const spend = parseFloat(lead.monthly_telecom_spend_inr) || 0;

  if (emp >= 20 || sites >= 2 || spend >= 5000) {
    score += 20;
  } else if (emp >= 5 || spend >= 2500) {
    score += 10;
  } else {
    score += 5;
  }

  // 5. Drop reason recoverability
  const reason = lead.drop_reason;
  const highRec = [
    'Installation delayed beyond 21 days',
    'Decided to wait',
    'Quote took too long to arrive',
    'Visit not scheduled by sales',
    'Quote too complex to understand'
  ];
  const medRec = [
    'Price too high',
    'Competitor offered cheaper plan',
    'Found paperwork too long',
    'Missing GST or Udyam document',
    'Authorised signatory not available',
    'Owner had no time for a visit',
    'Only wanted a mobile plan',
    'Locked in with current provider'
  ];

  if (highRec.some(r => reason.toLowerCase().includes(r.toLowerCase()))) {
    score += 15;
  } else if (medRec.some(r => reason.toLowerCase().includes(r.toLowerCase()))) {
    score += 8;
  } else {
    score += 2;
  }

  score = Math.min(100, Math.max(0, score));

  let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (score >= 70) priority = 'HIGH';
  else if (score >= 45) priority = 'MEDIUM';

  return { score, priority };
}

// Evaluate across all 5000 leads
interface BandStats {
  total: number;
  activated: number;
  dropped: number;
  conversionRate: number;
}

const bandStats: Record<'HIGH' | 'MEDIUM' | 'LOW', BandStats> = {
  HIGH: { total: 0, activated: 0, dropped: 0, conversionRate: 0 },
  MEDIUM: { total: 0, activated: 0, dropped: 0, conversionRate: 0 },
  LOW: { total: 0, activated: 0, dropped: 0, conversionRate: 0 },
};

// Also by 10-point deciles
const deciles: Record<string, { total: number; activated: number; conversionRate: number }> = {};
for (let d = 0; d <= 90; d += 10) {
  deciles[`${d}-${d+9}`] = { total: 0, activated: 0, conversionRate: 0 };
}
deciles['100'] = { total: 0, activated: 0, conversionRate: 0 };

for (const l of leads) {
  const { score, priority } = calculateScore(l);
  const isActivated = l.outcome === 'Activated';

  bandStats[priority].total++;
  if (isActivated) bandStats[priority].activated++;
  else bandStats[priority].dropped++;

  const decileKey = score === 100 ? '100' : `${Math.floor(score / 10) * 10}-${Math.floor(score / 10) * 10 + 9}`;
  if (deciles[decileKey]) {
    deciles[decileKey].total++;
    if (isActivated) deciles[decileKey].activated++;
  }
}

for (const p of ['HIGH', 'MEDIUM', 'LOW'] as const) {
  bandStats[p].conversionRate = Number(((bandStats[p].activated / bandStats[p].total) * 100).toFixed(2));
}

for (const k of Object.keys(deciles)) {
  if (deciles[k].total > 0) {
    deciles[k].conversionRate = Number(((deciles[k].activated / deciles[k].total) * 100).toFixed(2));
  }
}

console.log('--- PROPENSITY SCORE PRIORITY BANDS VS ACTUAL HISTORICAL CONVERSION ---');
console.table(bandStats);

console.log('\n--- CONVERSION RATE BY SCORE DECILE ---');
console.table(deciles);
