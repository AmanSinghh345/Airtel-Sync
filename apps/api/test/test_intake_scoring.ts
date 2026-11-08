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
  has_udyam: string;
  city_tier: string;
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

// Pure Day-0 Firmographic Intake Model (Zero Target Leakage)
// Uses ONLY attributes known at lead intake: GSTIN, Udyam, employees, sites, spend, city tier
function calculateIntakeFirmographicScore(l: LeadRow) {
  let score = 0;

  // 1. Regulatory Formalization (0 - 40 pts)
  // Challenge dataset ground truth: leads with GSTIN activate at 9.6% vs 2.0% without GSTIN
  if (l.has_gstin === 'Y') score += 25;
  if (l.has_udyam === 'Y') score += 15;

  // 2. Commercial Footprint & Scale (0 - 30 pts)
  const emp = parseInt(l.employee_count, 10) || 1;
  if (emp >= 20) score += 15;
  else if (emp >= 5) score += 10;
  else score += 5;

  const sites = parseInt(l.num_sites, 10) || 1;
  if (sites >= 3) score += 15;
  else if (sites >= 2) score += 10;
  else score += 5;

  // 3. Telecom Spend Budget (0 - 20 pts)
  const spend = parseFloat(l.monthly_telecom_spend_inr) || 0;
  if (spend >= 5000) score += 20;
  else if (spend >= 2500) score += 10;
  else score += 5;

  // 4. Infrastructure Readiness / City Tier (0 - 10 pts)
  const tier = parseInt(l.city_tier, 10) || 2;
  if (tier === 1) score += 10;
  else score += 5;

  score = Math.min(100, Math.max(0, score));

  let rank: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (score >= 70) rank = 'HIGH';
  else if (score >= 45) rank = 'MEDIUM';

  return { score, rank };
}

const evaluated = leads.map(l => ({
  id: l.lead_id,
  outcome: l.outcome,
  ...calculateIntakeFirmographicScore(l)
}));

// Priority Bands
const priorityBands = {
  HIGH: { range: '70-100', total: 0, activated: 0, dropped: 0, convPct: 0 },
  MEDIUM: { range: '45-69', total: 0, activated: 0, dropped: 0, convPct: 0 },
  LOW: { range: '0-44', total: 0, activated: 0, dropped: 0, convPct: 0 }
};

// Deciles
const decileBands: Record<string, { total: number; activated: number; dropped: number; convPct: number }> = {
  '90-100': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '80-89': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '70-79': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '60-69': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '50-59': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '45-49': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '40-44': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '30-39': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '20-29': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '10-19': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '0-9': { total: 0, activated: 0, dropped: 0, convPct: 0 }
};

for (const r of evaluated) {
  const isAct = r.outcome === 'Activated';
  priorityBands[r.rank].total++;
  if (isAct) priorityBands[r.rank].activated++;
  else priorityBands[r.rank].dropped++;

  let dKey = '0-9';
  if (r.score >= 90) dKey = '90-100';
  else if (r.score >= 80) dKey = '80-89';
  else if (r.score >= 70) dKey = '70-79';
  else if (r.score >= 60) dKey = '60-69';
  else if (r.score >= 50) dKey = '50-59';
  else if (r.score >= 45) dKey = '45-49';
  else if (r.score >= 40) dKey = '40-44';
  else if (r.score >= 30) dKey = '30-39';
  else if (r.score >= 20) dKey = '20-29';
  else if (r.score >= 10) dKey = '10-19';

  decileBands[dKey].total++;
  if (isAct) decileBands[dKey].activated++;
  else decileBands[dKey].dropped++;
}

for (const k of ['HIGH', 'MEDIUM', 'LOW'] as const) {
  priorityBands[k].convPct = Number(((priorityBands[k].activated / priorityBands[k].total) * 100).toFixed(2));
}

for (const k of Object.keys(decileBands)) {
  if (decileBands[k].total > 0) {
    decileBands[k].convPct = Number(((decileBands[k].activated / decileBands[k].total) * 100).toFixed(2));
  }
}

console.log('--- ZERO-LEAKAGE INTAKE FIRMOGRAPHIC MODEL ---');
console.table(priorityBands);
console.log('Total Leads:', Object.values(priorityBands).reduce((a, b) => a + b.total, 0));
console.log('Total Activated:', Object.values(priorityBands).reduce((a, b) => a + b.activated, 0));

console.log('\n--- ZERO-LEAKAGE SCORE INTERVALS ---');
console.table(decileBands);
console.log('Total Leads:', Object.values(decileBands).reduce((a, b) => a + b.total, 0));
console.log('Total Activated:', Object.values(decileBands).reduce((a, b) => a + b.activated, 0));
