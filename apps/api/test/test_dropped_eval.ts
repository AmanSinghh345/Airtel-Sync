import * as fs from 'fs';
import * as path from 'path';
import { PropensityService } from '../src/modules/partner/propensity.service';

const csvPath = path.resolve(__dirname, '../../../smb_leads.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(l => l.trim().length > 0);
const headers = lines[0].split(',');
const service = new PropensityService();

let droppedCount = 0;
let activatedCount = 0;

const droppedBands = {
  HIGH: 0,
  MEDIUM: 0,
  LOW: 0
};

const droppedDeciles: Record<string, number> = {
  '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0,
  '45-49': 0, '40-44': 0, '30-39': 0, '20-29': 0, '10-19': 0, '0-9': 0
};

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
  for (let h = 0; h < headers.length; h++) obj[headers[h]] = parts[h] ? parts[h].trim() : '';

  if (obj.outcome === 'Activated') {
    activatedCount++;
  } else {
    droppedCount++;
    const res = service.evaluateLead({
      stageReached: obj.stage_reached,
      dropReason: obj.drop_reason,
      hasGstin: obj.has_gstin === 'Y',
      hasUdyam: obj.has_udyam === 'Y',
      employeeCount: parseInt(obj.employee_count, 10) || 1,
      numSites: parseInt(obj.num_sites, 10) || 1,
      monthlyTelecomSpendInr: parseFloat(obj.monthly_telecom_spend_inr) || 0,
      businessName: obj.business_name
    });
    droppedBands[res.priorityRank]++;

    let d = '0-9';
    if (res.score >= 90) d = '90-100';
    else if (res.score >= 80) d = '80-89';
    else if (res.score >= 70) d = '70-79';
    else if (res.score >= 60) d = '60-69';
    else if (res.score >= 50) d = '50-59';
    else if (res.score >= 45) d = '45-49';
    else if (res.score >= 40) d = '40-44';
    else if (res.score >= 30) d = '30-39';
    else if (res.score >= 20) d = '20-29';
    else if (res.score >= 10) d = '10-19';
    droppedDeciles[d]++;
  }
}

console.log('--- OPERATIONAL RECOVERY TRIAGE ON DROPPED LEADS ---');
console.log('Total Dropped Leads Evaluated:', droppedCount);
console.log('Total Activated (Excluded from Abandonment Pool):', activatedCount);
console.table(droppedBands);
console.log('Dropped Deciles:');
console.table(droppedDeciles);
