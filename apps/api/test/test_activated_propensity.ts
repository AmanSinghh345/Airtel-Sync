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

// Evaluate with stage.includes('activated') included as 40 points:
function evalWithActivated(l: LeadRow) {
  let score = 0;
  const stage = (l.stage_reached || '').toLowerCase().trim();
  if (stage.includes('activated') || stage.includes('kyc complete')) {
    score += 40;
  } else if (stage.includes('quote accepted')) {
    score += 30;
  } else if (stage.includes('needs assessed')) {
    score += 20;
  } else if (stage.includes('contacted')) {
    score += 10;
  } else {
    score += 5;
  }

  if (l.has_gstin === 'Y') score += 15;
  if (l.has_udyam === 'Y') score += 10;

  const emp = parseInt(l.employee_count, 10) || 1;
  const sites = parseInt(l.num_sites, 10) || 1;
  if (sites >= 3 || emp >= 10) score += 10;

  const spend = parseFloat(l.monthly_telecom_spend_inr) || 0;
  if (spend >= 2000) score += 10;

  const reason = (l.drop_reason || '').toLowerCase();
  if (
    reason.includes('installation delay') ||
    reason.includes('delayed') ||
    reason.includes('document collection') ||
    reason.includes('wait') ||
    reason.includes('timing') ||
    reason.includes('follow up')
  ) {
    score += 15;
  } else if (
    reason.includes('price') ||
    reason.includes('competitor') ||
    reason.includes('budget') ||
    reason.includes('discount')
  ) {
    score += 10;
  } else if (reason.includes('not interested') || reason.includes('closed') || reason.includes('unreachable')) {
    score += 0;
  } else {
    score += 5;
  }

  score = Math.min(100, Math.max(0, score));
  let rank: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (score >= 70) rank = 'HIGH';
  else if (score >= 45) rank = 'MEDIUM';

  return { score, rank };
}

const withActResults = leads.map(l => ({
  outcome: l.outcome,
  ...evalWithActivated(l)
}));

const pBands = {
  HIGH: { range: '70-100', total: 0, activated: 0, dropped: 0, convPct: 0 },
  MEDIUM: { range: '45-69', total: 0, activated: 0, dropped: 0, convPct: 0 },
  LOW: { range: '0-44', total: 0, activated: 0, dropped: 0, convPct: 0 }
};

const dBands: Record<string, { total: number; activated: number; dropped: number; convPct: number }> = {
  '90-100': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '80-89': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '70-79': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '60-69': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '50-59': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '40-49': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '30-39': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '20-29': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '10-19': { total: 0, activated: 0, dropped: 0, convPct: 0 },
  '0-9': { total: 0, activated: 0, dropped: 0, convPct: 0 }
};

for (const r of withActResults) {
  const isAct = r.outcome === 'Activated';
  pBands[r.rank].total++;
  if (isAct) pBands[r.rank].activated++;
  else pBands[r.rank].dropped++;

  let dKey = '0-9';
  if (r.score >= 90) dKey = '90-100';
  else if (r.score >= 80) dKey = '80-89';
  else if (r.score >= 70) dKey = '70-79';
  else if (r.score >= 60) dKey = '60-69';
  else if (r.score >= 50) dKey = '50-59';
  else if (r.score >= 40) dKey = '40-49';
  else if (r.score >= 30) dKey = '30-39';
  else if (r.score >= 20) dKey = '20-29';
  else if (r.score >= 10) dKey = '10-19';

  dBands[dKey].total++;
  if (isAct) dBands[dKey].activated++;
  else dBands[dKey].dropped++;
}

for (const k of ['HIGH', 'MEDIUM', 'LOW'] as const) {
  pBands[k].convPct = Number(((pBands[k].activated / pBands[k].total) * 100).toFixed(2));
}

for (const k of Object.keys(dBands)) {
  if (dBands[k].total > 0) {
    dBands[k].convPct = Number(((dBands[k].activated / dBands[k].total) * 100).toFixed(2));
  }
}

console.log('--- IF ACTIVATED GETS 40 POINTS ---');
console.table(pBands);
console.log('Total Leads:', Object.values(pBands).reduce((a, b) => a + b.total, 0));
console.log('Total Activated:', Object.values(pBands).reduce((a, b) => a + b.activated, 0));

console.log('\n--- DECILES IF ACTIVATED GETS 40 POINTS ---');
console.table(dBands);
console.log('Total Leads:', Object.values(dBands).reduce((a, b) => a + b.total, 0));
console.log('Total Activated:', Object.values(dBands).reduce((a, b) => a + b.activated, 0));
