/**
 * Script para verificar el estado de los classifier multipliers en la BD
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Primero ver todos los tipos de modelo
  const allStates = await prisma.mLModelState.findMany({
    select: { modelType: true, version: true, id: true },
  });
  
  console.log('\n📋 Todos los tipos de modelo en la BD:');
  for (const s of allStates) {
    console.log(`  - ${s.modelType} (v${s.version})`);
  }

  // Ahora buscar específicamente classifier_multipliers
  const states = await prisma.mLModelState.findMany({
    where: { modelType: 'classifier_multipliers' },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n📊 Estados con modelType='classifier_multipliers': ${states.length}`);

  // Y también buscar classifier_learning
  const statesLearning = await prisma.mLModelState.findMany({
    where: { modelType: 'classifier_learning' },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`📊 Estados con modelType='classifier_learning': ${statesLearning.length}`);

  // Mostrar detalles del estado de classifier_multipliers
  for (const state of states) {
    console.log(`\n=== classifier_multipliers ===`);
    console.log(`ID: ${state.id}`);
    console.log(`Version: ${state.version}`);
    
    const data = JSON.parse(state.stateJson || '{}');
    console.log(`Stats:`);
    for (const [group, stats] of Object.entries(data.stats || {})) {
      const s = stats as any;
      if (s.sampleCount > 0) {
        console.log(`  ${group}: ${s.sampleCount} muestras, ${(s.successRate * 100).toFixed(1)}% éxito`);
      }
    }
  }

  // Mostrar detalles del estado de classifier_learning
  for (const state of statesLearning) {
    console.log(`\n=== classifier_learning ===`);
    console.log(`ID: ${state.id}`);
    console.log(`Version: ${state.version}`);
    
    const data = JSON.parse(state.stateJson || '{}');
    console.log(`Stats:`);
    for (const [group, stats] of Object.entries(data.stats || {})) {
      const s = stats as any;
      console.log(`  ${group}: ${s.sampleCount} muestras, ${(s.successRate * 100).toFixed(1)}% éxito`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
