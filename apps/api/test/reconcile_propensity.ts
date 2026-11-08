import * as fs from 'fs';
import * as path from 'path';
import { PropensityService } from '../src/modules/partner/propensity.service';

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
  business_name: string;
  preferred_language: string;
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

const propensityService = new PropensityService();

console.log('Testing with current PropensityService directly imported:\n');

const currentResults = leads.map(l => {
  const res = propensityService.evaluateLead({
    stageReached: l.stage_reached,
    dropReason: l.drop_reason,
    hasGstin: l.has_gstin === 'Y',
    hasUdyam: l.has_udyam === 'Y',
    employeeCount: parseInt(l.employee_count, 10) || 1,
    numSites: parseInt(l.num_sites, 10) || 1,
    monthlyTelecomSpendInr: parseFloat(l.monthly_telecom_spend_inr) || 0,
    businessName: l.business_name,
    preferredLanguage: l.preferred_language
  });
  return {
    leadId: l.lead_id,
    outcome: l.outcome,
    score: res.score,
    priorityRank: res.priorityRank
  };
});

// Mutually exclusive priority bands:
// HIGH: 70 - 100
// MEDIUM: 45 - 69
// LOW: 0 - 44
const priorityBands = {
  HIGH: { range: '70-100', total: 0, activated: 0, dropped: 0, convPct: 0 },
  MEDIUM: { range: '45-69', total: 0, activated: 0, dropped: 0, convPct: 0 },
  LOW: { range: '0-44', total: 0, activated: 0, dropped: 0, convPct: 0 }
};

// Deciles:
// 90-100, 80-89, 70-79, 60-69, 50-59, 40-49, 30-39, 20-29, 10-19, 0-9
const decileBands: Record<string, { total: number; activated: number; dropped: number; convPct: number }> = {
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

for (const r of currentResults) {
  const isAct = r.outcome === 'Activated';
  
  // Priority
  priorityBands[r.priorityRank].total++;
  if (isAct) priorityBands[r.priorityRank].activated++;
  else priorityBands[r.priorityRank].dropped++;

  // Decile
  let decileKey = '0-9';
  if (r.score >= 90) decileKey = '90-100';
  else if (r.score >= 80) decileKey = '80-89';
  else if (r.score >= 70) decileKey = '70-79';
  else if (r.score >= 60) decileKey = '60-69';
  else if (r.score >= 50) decileKey = '50-59';
  else if (r.score >= 40) decileKey = '40-49';
  else if (r.score >= 30) decileKey = '30-39';
  else if (r.score >= 20) decileKey = '20-29';
  else if (r.score >= 10) decileKey = '10-19';

  decileBands[decileKey].total++;
  if (isAct) decileBands[decileKey].activated++;
  else decileBands[decileKey].dropped++;
}

for (const k of ['HIGH', 'MEDIUM', 'LOW'] as const) {
  priorityBands[k].convPct = Number(((priorityBands[k].activated / priorityBands[k].total) * 100).toFixed(2));
}

for (const k of Object.keys(decileBands)) {
  if (decileBands[k].total > 0) {
    decileBands[k].convPct = Number(((decileBands[k].activated / decileBands[k].total) * 100).toFixed(2));
  }
}

console.log('--- PRIORITY BANDS RECONCILIATION ---');
console.table(priorityBands);

const totalLeadsPriority = Object.values(priorityBands).reduce((a, b) => a + b.total, 0);
const totalActPriority = Object.values(priorityBands).reduce((a, b) => a + b.activated, 0);
console.log(`Total Leads across Priority Bands: ${totalLeadsPriority} (Target: 5,000)`);
console.log(`Total Activated across Priority Bands: ${totalActPriority} (Target: 368)`);

console.log('\n--- DECILE BANDS RECONCILIATION ---');
console.table(decileBands);

const totalLeadsDecile = Object.values(decileBands).reduce((a, b) => a + b.total, 0);
const totalActDecile = Object.values(decileBands).reduce((a, b) => a + b.activated, 0);
console.log(`Total Leads across Decile Bands: ${totalLeadsDecile} (Target: 5,000)`);
console.log(`Total Activated across Decile Bands: ${totalActDecile} (Target: 368)`);
