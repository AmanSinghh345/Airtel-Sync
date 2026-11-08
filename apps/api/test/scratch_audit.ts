import * as fs from 'fs';
import * as path from 'path';

const csvPath = path.resolve(__dirname, '../../../smb_leads.csv');
console.log('Reading:', csvPath);

const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
const headers = lines[0].split(',');

console.log('Total data lines:', lines.length - 1);

interface Row {
  lead_id: string;
  stage_reached: string;
  outcome: string;
  drop_reason: string;
  contacted_date: string;
  needs_assessed_date: string;
  quote_accepted_date: string;
  kyc_complete_date: string;
  activated_date: string;
  [key: string]: string;
}

const rows: Row[] = [];

for (let i = 1; i < lines.length; i++) {
  // Simple CSV parse accounting for quotes if needed
  const line = lines[i];
  const parts: string[] = [];
  let inQuotes = false;
  let current = '';
  for (let c = 0; c < line.length; c++) {
    const char = line[c];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);

  const rowObj: any = {};
  for (let h = 0; h < headers.length; h++) {
    rowObj[headers[h]] = parts[h] ? parts[h].trim() : '';
  }
  rows.push(rowObj);
}

console.log('Parsed rows:', rows.length);

// 1. Check stage_reached value distribution
const stageCounts: Record<string, number> = {};
const outcomeCounts: Record<string, number> = {};
const dropReasonCounts: Record<string, number> = {};

// Date field counts
let countHasContactedDate = 0;
let countHasNeedsAssessedDate = 0;
let countHasQuoteAcceptedDate = 0;
let countHasKycCompleteDate = 0;
let countHasActivatedDate = 0;

for (const r of rows) {
  stageCounts[r.stage_reached] = (stageCounts[r.stage_reached] || 0) + 1;
  outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] || 0) + 1;
  if (r.drop_reason) {
    dropReasonCounts[r.drop_reason] = (dropReasonCounts[r.drop_reason] || 0) + 1;
  }

  if (r.contacted_date) countHasContactedDate++;
  if (r.needs_assessed_date) countHasNeedsAssessedDate++;
  if (r.quote_accepted_date) countHasQuoteAcceptedDate++;
  if (r.kyc_complete_date) countHasKycCompleteDate++;
  if (r.activated_date) countHasActivatedDate++;
}

console.log('\n--- stage_reached counts ---');
console.log(stageCounts);

console.log('\n--- outcome counts ---');
console.log(outcomeCounts);

console.log('\n--- Date presence counts ---');
console.log({
  countHasContactedDate,
  countHasNeedsAssessedDate,
  countHasQuoteAcceptedDate,
  countHasKycCompleteDate,
  countHasActivatedDate,
});

console.log('\n--- drop_reason counts ---');
console.log(dropReasonCounts);

// Cross-tabulate stage_reached vs outcome
const stageByOutcome: Record<string, Record<string, number>> = {};
for (const r of rows) {
  if (!stageByOutcome[r.stage_reached]) stageByOutcome[r.stage_reached] = {};
  stageByOutcome[r.stage_reached][r.outcome] = (stageByOutcome[r.stage_reached][r.outcome] || 0) + 1;
}
console.log('\n--- stage_reached by outcome ---');
console.log(stageByOutcome);
