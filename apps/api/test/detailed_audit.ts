import * as fs from 'fs';
import * as path from 'path';

const csvPath = path.resolve(__dirname, '../../../smb_leads.csv');
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
const headers = lines[0].split(',');

interface Row {
  [key: string]: string;
}

const rows: Row[] = [];
for (let i = 1; i < lines.length; i++) {
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

console.log('Total rows:', rows.length);

// 1. Funnel Verification
const total = rows.length;
const contacted = rows.filter(r => r.contacted_date && r.contacted_date.length > 0).length;
const needsAssessed = rows.filter(r => r.needs_assessed_date && r.needs_assessed_date.length > 0).length;
const quoteAccepted = rows.filter(r => r.quote_accepted_date && r.quote_accepted_date.length > 0).length;
const kycComplete = rows.filter(r => r.kyc_complete_date && r.kyc_complete_date.length > 0).length;
const activated = rows.filter(r => r.activated_date && r.activated_date.length > 0).length;

console.log('--- EXACT FUNNEL METRICS (Based on Date Milestones) ---');
console.log(`Total Leads:    ${total}`);
console.log(`Contacted:      ${contacted} (${((contacted / total) * 100).toFixed(2)}% of total, ${(contacted/total*100).toFixed(0)}% retention)`);
console.log(`Needs Assessed: ${needsAssessed} (${((needsAssessed / total) * 100).toFixed(2)}% of total, ${((needsAssessed/contacted)*100).toFixed(1)}% of previous)`);
console.log(`Quote Accepted: ${quoteAccepted} (${((quoteAccepted / total) * 100).toFixed(2)}% of total, ${((quoteAccepted/needsAssessed)*100).toFixed(1)}% of previous)`);
console.log(`KYC Complete:   ${kycComplete} (${((kycComplete / total) * 100).toFixed(2)}% of total, ${((kycComplete/quoteAccepted)*100).toFixed(1)}% of previous)`);
console.log(`Activated:      ${activated} (${((activated / total) * 100).toFixed(2)}% of total, ${((activated/kycComplete)*100).toFixed(1)}% of previous)`);

// 2. Stage Reached column breakdown
const stageCounts: Record<string, number> = {};
for (const r of rows) {
  stageCounts[r.stage_reached] = (stageCounts[r.stage_reached] || 0) + 1;
}
console.log('\n--- stage_reached Column Distribution ---');
console.table(stageCounts);

// 3. Drop Reason Breakdown
const dropReasons: Record<string, number> = {};
let totalDropped = 0;
for (const r of rows) {
  if (r.outcome === 'Dropped') {
    totalDropped++;
    const reason = r.drop_reason || 'Unknown';
    dropReasons[reason] = (dropReasons[reason] || 0) + 1;
  }
}

console.log(`\n--- Drop Reasons Breakdown (Total Dropped: ${totalDropped}) ---`);
const dropReasonTable = Object.entries(dropReasons)
  .map(([reason, count]) => ({
    reason,
    count,
    percentageOfDrops: Number(((count / totalDropped) * 100).toFixed(2)),
    percentageOfTotal: Number(((count / total) * 100).toFixed(2))
  }))
  .sort((a, b) => b.count - a.count);

console.table(dropReasonTable);

// 4. Drop Reason by stage_reached
const dropByStage: Record<string, Record<string, number>> = {};
for (const r of rows) {
  if (r.outcome === 'Dropped') {
    if (!dropByStage[r.stage_reached]) dropByStage[r.stage_reached] = {};
    dropByStage[r.stage_reached][r.drop_reason] = (dropByStage[r.stage_reached][r.drop_reason] || 0) + 1;
  }
}
console.log('\n--- Drop Reasons Grouped by stage_reached ---');
for (const [st, map] of Object.entries(dropByStage)) {
  console.log(`\nStage: [${st}] (Total: ${Object.values(map).reduce((a, b) => a + b, 0)})`);
  console.table(map);
}
