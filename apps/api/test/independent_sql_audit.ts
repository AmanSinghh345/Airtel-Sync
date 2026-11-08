import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runSqlAudit() {
  console.log('--- INDEPENDENT SQL AGGREGATIONS VS ANALYTICS ENDPOINTS ---\n');

  // 1. Total leads in PostgreSQL
  const [totalResult]: any = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "DroppedLead"`;
  console.log(`Total DroppedLead rows: ${totalResult.count}`);

  // 2. Exact stage counts in PostgreSQL
  const stageBreakdown: any = await prisma.$queryRaw`
    SELECT "stageReached", COUNT(*)::int as count 
    FROM "DroppedLead" 
    GROUP BY "stageReached" 
    ORDER BY count DESC
  `;
  console.log('\nDirect SQL stageReached breakdown:');
  console.table(stageBreakdown);

  // 3. Exact dropReason counts in PostgreSQL
  const dropReasonBreakdown: any = await prisma.$queryRaw`
    SELECT "dropReason", COUNT(*)::int as count,
           ROUND((COUNT(*)::numeric / 4632 * 100), 2) as pct_of_drops
    FROM "DroppedLead"
    WHERE "stageReached" != 'Activated'
    GROUP BY "dropReason"
    ORDER BY count DESC
  `;
  console.log(`\nDirect SQL dropReason breakdown (Total non-activated: 4,632):`);
  console.table(dropReasonBreakdown);

  // 4. Exact segment counts in PostgreSQL
  const segmentBreakdown: any = await prisma.$queryRaw`
    SELECT 
      segment, 
      COUNT(*)::int as total,
      SUM(CASE WHEN "stageReached" = 'Activated' THEN 1 ELSE 0 END)::int as activated,
      SUM(CASE WHEN "stageReached" != 'Activated' THEN 1 ELSE 0 END)::int as dropped,
      ROUND((SUM(CASE WHEN "stageReached" = 'Activated' THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100), 2) as conv_pct
    FROM "DroppedLead"
    GROUP BY segment
    ORDER BY total DESC
  `;
  console.log('\nDirect SQL Segment Breakdown:');
  console.table(segmentBreakdown);

  // 5. Partner assignment and recovery counts
  const partnerBreakdown: any = await prisma.$queryRaw`
    SELECT 
      p."partnerCode",
      p."agencyName",
      p."territoryCity",
      COUNT(d.id)::int as assigned,
      SUM(CASE WHEN d.status = 'RECOVERED' THEN 1 ELSE 0 END)::int as recovered
    FROM "Partner" p
    LEFT JOIN "DroppedLead" d ON d."assignedPartnerId" = p.id
    GROUP BY p.id, p."partnerCode", p."agencyName", p."territoryCity"
    ORDER BY p."partnerCode"
  `;
  console.log('\nDirect SQL Partner Breakdown:');
  console.table(partnerBreakdown);

  await prisma.$disconnect();
}

runSqlAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
