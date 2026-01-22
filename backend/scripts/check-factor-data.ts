import { prisma } from '../src/config/database.js';

async function main() {
  // Check newest unverified prediction
  const newest = await prisma.prediction.findFirst({
    where: { verified: false },
    orderBy: { createdAt: 'desc' },
    select: { symbol: true, factorBreakdown: true, createdAt: true },
  });
  
  console.log('=== NEWEST UNVERIFIED PREDICTION ===');
  if (newest) {
    console.log('Symbol:', newest.symbol);
    console.log('Created:', newest.createdAt);
    const fb = newest.factorBreakdown ? JSON.parse(newest.factorBreakdown) : null;
    console.log('Has factorBreakdown:', !!fb);
    console.log('Has availableFactors:', fb?.availableFactors?.length > 0 ? `YES (${fb.availableFactors.length})` : 'NO');
    if (fb?.availableFactors?.length > 0) {
      console.log('Sample factors:');
      for (const f of fb.availableFactors.slice(0, 3)) {
        console.log(`  ${f.name}: ${f.score}`);
      }
    }
  } else {
    console.log('No unverified predictions found');
  }

  console.log('\n=== VERIFIED PREDICTIONS ANALYSIS ===');
  
  const preds = await prisma.prediction.findMany({
    where: { verified: true },
    orderBy: { verifiedAt: 'desc' },
    take: 10,
    select: {
      symbol: true,
      factorBreakdown: true,
      factorWeights: true,
      verifiedAt: true,
    },
  });

  console.log('=== LAST 10 VERIFIED PREDICTIONS ===\n');
  
  for (const p of preds) {
    console.log('---');
    console.log('Symbol:', p.symbol, '| Verified:', p.verifiedAt);
    
    const fb = p.factorBreakdown ? JSON.parse(p.factorBreakdown) : null;
    const hasFactors = fb?.availableFactors?.length > 0;
    console.log('  assetGroup:', fb?.assetGroup || 'MISSING');
    console.log('  availableFactors:', hasFactors ? `${fb.availableFactors.length} factors` : 'EMPTY/MISSING');
    
    const fw = p.factorWeights;
    if (fw && fw !== 'null') {
      const parsed = JSON.parse(fw);
      const keys = Object.keys(parsed);
      console.log('  factorWeights:', keys.length > 0 ? `${keys.length} weights` : 'EMPTY');
    } else {
      console.log('  factorWeights: NULL');
    }
  }
  
  // Count totals
  const total = await prisma.prediction.count({ where: { verified: true } });
  const withFactors = await prisma.prediction.count({
    where: {
      verified: true,
      factorBreakdown: { contains: '"availableFactors":[{' },
    },
  });
  
  console.log('\n=== TOTALS ===');
  console.log('Total verified:', total);
  console.log('With complete availableFactors:', withFactors);
  console.log('Missing availableFactors:', total - withFactors);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
