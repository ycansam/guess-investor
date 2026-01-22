import { prisma } from '../src/config/database.js';

async function main() {
  // First check factorScores in a verified prediction
  const pred = await prisma.prediction.findFirst({
    where: { verified: true, factorBreakdown: { not: null } },
    orderBy: { verifiedAt: 'desc' },
  });

  if (pred && pred.factorBreakdown) {
    const fb = JSON.parse(pred.factorBreakdown);
    console.log('=== SAMPLE VERIFIED PREDICTION ===');
    console.log('Symbol:', pred.symbol);
    console.log('AssetGroup:', fb.assetGroup);
    console.log('Direction Correct:', pred.directionCorrect);
    console.log('\nFull factorBreakdown:', JSON.stringify(fb, null, 2));
    console.log('\nAvailable Factors:');
    if (fb.availableFactors) {
      for (const f of fb.availableFactors) {
        console.log(`  ${f.name}: ${f.score}`);
      }
    } else {
      console.log('  NO availableFactors in factorBreakdown!');
    }
    console.log('\nWeights Used:', fb.weightsUsed ? 'YES' : 'NO');
  }

  const state = await prisma.mLModelState.findFirst({
    where: { modelType: 'classifier_learning' },
    orderBy: { createdAt: 'desc' },
  });

  if (!state) {
    console.log('No classifier_learning state found');
    return;
  }

  const parsed = JSON.parse(state.stateJson);
  
  console.log('\n=== CLASSIFIER LEARNING STATE ===');
  console.log('Version:', parsed.version);
  console.log('Updated:', parsed.updatedAt);
  
  console.log('\n=== COMMODITY ===');
  console.log('Stats:', JSON.stringify(parsed.stats?.commodity, null, 2));
  console.log('Multipliers:', JSON.stringify(parsed.multipliers?.commodity, null, 2));
  
  // Compara con los estáticos iniciales
  const STATIC_COMMODITY = {
    macro: 1.5,
    forex: 2.0,
    seasonality: 1.5,
    sentiment: 0.7,
    financials: 0.1,
    competitors: 0.2,
    expectations: 0.3,
    trend: 1.0,
    technical: 1.0,
    news: 1.0,
    institutional: 1.0,
  };
  
  console.log('\n=== COMPARISON (Learned vs Static) ===');
  const learned = parsed.multipliers?.commodity || {};
  for (const [key, staticVal] of Object.entries(STATIC_COMMODITY)) {
    const learnedVal = learned[key] || 1.0;
    const diff = learnedVal - (staticVal as number);
    if (Math.abs(diff) > 0.001) {
      console.log(`${key}: ${(staticVal as number).toFixed(2)} → ${learnedVal.toFixed(2)} (Δ${diff > 0 ? '+' : ''}${diff.toFixed(2)})`);
    } else {
      console.log(`${key}: ${(staticVal as number).toFixed(2)} (no change)`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
