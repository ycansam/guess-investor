/**
 * Script para re-entrenar clasificadores con todas las predicciones verificadas
 * Ejecutar con: npx tsx scripts/force-relearn-classifiers.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Multiplicadores base (14 factores)
const BASE_MULTIPLIERS = {
  trend: 1.0,
  technical: 1.0,
  sentiment: 1.0,
  news: 1.0,
  macro: 1.0,
  forex: 1.0,
  institutional: 1.0,
  financials: 1.0,
  intradayTrend: 1.0,
  optionsFlow: 1.0,
  volumeProfile: 1.0,
  divergences: 1.0,
  volatilityIV: 1.0,
  marketBreadth: 1.0,
};

const MIN_SAMPLES = 5;
const LEARNING_RATE = 0.02;
const MAX_MULTIPLIER = 2.0;
const MIN_MULTIPLIER = 0.3;

interface Stats {
  sampleCount: number;
  successRate: number;
  avgAccuracy: number;
  lastUpdated: string;
}

interface State {
  multipliers: Record<string, Record<string, number>>;
  stats: Record<string, Stats>;
  version: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function main() {
  console.log('🔄 Iniciando re-entrenamiento de clasificadores...\n');

  // Obtener todas las predicciones verificadas con factorBreakdown
  const predictions = await prisma.prediction.findMany({
    where: {
      verified: true,
      factorBreakdown: { not: null },
      directionCorrect: { not: null },
    },
    select: {
      id: true,
      symbol: true,
      directionCorrect: true,
      accuracyScore: true,
      predictedChange: true,
      actualChange: true,
      factorBreakdown: true,
    },
  });

  console.log(`📊 Encontradas ${predictions.length} predicciones verificadas con factorBreakdown\n`);

  if (predictions.length === 0) {
    console.log('❌ No hay predicciones para procesar');
    return;
  }

  // Inicializar estado
  const state: State = {
    multipliers: {},
    stats: {},
    version: 2,
  };

  // Procesar cada predicción
  for (const pred of predictions) {
    try {
      const factorBreakdown = JSON.parse(pred.factorBreakdown || '{}');
      const assetGroup = factorBreakdown.assetGroup;

      if (!assetGroup) continue;

      // Inicializar grupo si no existe
      if (!state.multipliers[assetGroup]) {
        state.multipliers[assetGroup] = { ...BASE_MULTIPLIERS };
        state.stats[assetGroup] = {
          sampleCount: 0,
          successRate: 0,
          avgAccuracy: 0,
          lastUpdated: new Date().toISOString(),
        };
      }

      const stats = state.stats[assetGroup];

      // Actualizar estadísticas
      stats.sampleCount += 1;
      stats.successRate = ((stats.successRate * (stats.sampleCount - 1)) + (pred.directionCorrect ? 1 : 0)) / stats.sampleCount;
      stats.avgAccuracy = ((stats.avgAccuracy * (stats.sampleCount - 1)) + (pred.accuracyScore || 0)) / stats.sampleCount;
      stats.lastUpdated = new Date().toISOString();

      // Solo ajustar si tenemos suficientes muestras
      if (stats.sampleCount >= MIN_SAMPLES) {
        const predictionCorrect = pred.directionCorrect && (pred.accuracyScore || 0) > 50;

        // Ajustar multiplicadores basándose en si la predicción fue correcta
        for (const factor of Object.keys(BASE_MULTIPLIERS)) {
          const currentMult = state.multipliers[assetGroup][factor];

          if (predictionCorrect) {
            // Predicción correcta: aumentar ligeramente
            state.multipliers[assetGroup][factor] = clamp(
              currentMult * (1 + LEARNING_RATE),
              MIN_MULTIPLIER,
              MAX_MULTIPLIER
            );
          } else {
            // Predicción incorrecta: disminuir ligeramente
            state.multipliers[assetGroup][factor] = clamp(
              currentMult * (1 - LEARNING_RATE * 0.5),
              MIN_MULTIPLIER,
              MAX_MULTIPLIER
            );
          }
        }
      }
    } catch (err) {
      console.error(`  Error procesando ${pred.symbol}: ${err}`);
    }
  }

  // Mostrar resultados
  console.log('\n📈 Resultados por grupo de activo:\n');
  console.log('=' .repeat(60));

  for (const [group, stats] of Object.entries(state.stats)) {
    console.log(`\n🏷️  ${group}`);
    console.log(`   Muestras: ${stats.sampleCount}`);
    console.log(`   Tasa de éxito: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`   Precisión promedio: ${stats.avgAccuracy.toFixed(1)}%`);
  }

  // Guardar el estado en la base de datos
  console.log('\n💾 Guardando estado...');

  const existingState = await prisma.mLModelState.findFirst({
    where: { modelType: 'classifier_learning' },
    orderBy: { createdAt: 'desc' },
  });

  if (existingState) {
    await prisma.mLModelState.update({
      where: { id: existingState.id },
      data: {
        stateJson: JSON.stringify(state),
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.mLModelState.create({
      data: {
        modelType: 'classifier_learning',
        version: state.version,
        stateJson: JSON.stringify(state),
      },
    });
  }

  console.log('\n✅ Re-entrenamiento completado');
  console.log(`   Total grupos: ${Object.keys(state.stats).length}`);
  console.log(`   Total muestras: ${predictions.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
