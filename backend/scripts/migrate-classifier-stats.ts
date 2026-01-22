/**
 * Script para migrar los stats de classifier_multipliers a classifier_learning
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Migrando datos de classifier_multipliers a classifier_learning...\n');

  // Obtener el estado de classifier_multipliers (tiene los datos correctos)
  const sourceState = await prisma.mLModelState.findFirst({
    where: { modelType: 'classifier_multipliers' },
    orderBy: { createdAt: 'desc' },
  });

  if (!sourceState) {
    console.log('❌ No se encontró classifier_multipliers');
    return;
  }

  const sourceData = JSON.parse(sourceState.stateJson || '{}');
  console.log('📊 Datos en classifier_multipliers:');
  for (const [group, stats] of Object.entries(sourceData.stats || {})) {
    const s = stats as any;
    if (s.sampleCount > 0) {
      console.log(`  ${group}: ${s.sampleCount} muestras`);
    }
  }

  // Obtener el estado de classifier_learning
  const targetState = await prisma.mLModelState.findFirst({
    where: { modelType: 'classifier_learning' },
    orderBy: { createdAt: 'desc' },
  });

  if (!targetState) {
    console.log('❌ No se encontró classifier_learning');
    return;
  }

  const targetData = JSON.parse(targetState.stateJson || '{}');
  
  // Copiar stats de source a target
  for (const [group, stats] of Object.entries(sourceData.stats || {})) {
    if (targetData.stats[group]) {
      targetData.stats[group] = stats;
    }
  }

  // Actualizar version
  targetData.version = 2;
  targetData.updatedAt = new Date().toISOString();

  // Guardar
  await prisma.mLModelState.update({
    where: { id: targetState.id },
    data: {
      stateJson: JSON.stringify(targetData),
      version: 2,
      updatedAt: new Date(),
    },
  });

  console.log('\n✅ Migración completada');
  
  // Verificar
  const updated = await prisma.mLModelState.findFirst({
    where: { modelType: 'classifier_learning' },
  });
  const updatedData = JSON.parse(updated?.stateJson || '{}');
  console.log('\n📊 Datos actualizados en classifier_learning:');
  for (const [group, stats] of Object.entries(updatedData.stats || {})) {
    const s = stats as any;
    if (s.sampleCount > 0) {
      console.log(`  ${group}: ${s.sampleCount} muestras, ${(s.successRate * 100).toFixed(1)}% éxito`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
