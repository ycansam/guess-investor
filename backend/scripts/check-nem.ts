import { prisma } from '../src/config/database.js';

async function main() {
  const p = await prisma.prediction.findFirst({
    where: { symbol: 'GOOG' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, factorBreakdown: true, createdAt: true },
  });
  
  console.log('GOOG Prediction:');
  if (p?.factorBreakdown) {
    const fb = JSON.parse(p.factorBreakdown);
    console.log(`  ID: ${p.id}`);
    console.log(`  Created: ${p.createdAt}`);
    console.log(`  assetGroup: ${fb.assetGroup}`);
    console.log(`  availableFactors: ${fb.availableFactors?.length || 0}`);
  } else {
    console.log(`  ID: ${p?.id}`);
    console.log(`  factorBreakdown: NULL`);
  }
}

main().finally(() => prisma.$disconnect());
