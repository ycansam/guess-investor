/**
 * Script para recalcular los accuracy scores de predicciones verificadas
 * que tienen inconsistencia entre predictedChange y direction.
 * 
 * Problema: Predicciones con cambio significativo (ej: +4%) pero direction='neutral'
 * causaban scores incorrectos porque la verificación comparaba direcciones.
 * 
 * Este script:
 * 1. Encuentra predicciones con esta inconsistencia
 * 2. Corrige la dirección basándose en predictedChange
 * 3. Recalcula el accuracyScore correctamente
 */

import { prisma } from '../src/config/database.js';

// Umbral para considerar el movimiento como direccional vs neutral (en %)
const DIRECTION_THRESHOLD_PCT = 0.5;

// Bonus por alcanzar objetivo durante el período (multiplicador de score)
const TARGET_REACHED_BONUS = 1.10;

interface PredictionToFix {
  id: string;
  symbol: string;
  direction: string;
  predictedChange: number | null;
  actualChange: number | null;
  accuracyScore: number | null;
  targetReached: boolean | null;
}

function recalculateAccuracyScore(
  predictedDirection: 'up' | 'down' | 'neutral',
  predictedChange: number,
  actualChange: number,
  targetReached: boolean
): { accuracyScore: number; directionCorrect: boolean; quality: string } {
  // Calcular dirección real
  const actualDirection: 'up' | 'down' | 'neutral' =
    actualChange > DIRECTION_THRESHOLD_PCT ? 'up' :
    actualChange < -DIRECTION_THRESHOLD_PCT ? 'down' : 'neutral';

  // Verificar dirección correcta
  let directionCorrect = false;
  if (predictedDirection === 'up') {
    directionCorrect = actualChange >= 0;
  } else if (predictedDirection === 'down') {
    directionCorrect = actualChange <= 0;
  } else {
    directionCorrect = actualDirection === 'neutral';
  }

  // Calcular accuracy score
  let accuracyScore = 0;
  if (directionCorrect) {
    const predictedMag = Math.abs(predictedChange);
    const actualMag = Math.abs(actualChange);

    if (predictedMag < 0.1 && actualMag < 0.5) {
      accuracyScore = 100;
    } else if (predictedMag > 0.1) {
      const magError = Math.abs(actualMag - predictedMag) / Math.max(predictedMag, 1);
      const magAccuracy = Math.max(0, 1 - magError);
      accuracyScore = 50 + (magAccuracy * 50);
    } else {
      accuracyScore = 60;
    }
  } else {
    const actualMag = Math.abs(actualChange);
    if (actualMag < 0.5) {
      accuracyScore = 40;
    } else if (actualMag < 1) {
      accuracyScore = 20;
    } else {
      accuracyScore = Math.max(0, 15 - actualMag);
    }
  }

  // Aplicar bonus si alcanzó el objetivo
  if (targetReached && directionCorrect) {
    accuracyScore = Math.min(100, accuracyScore * TARGET_REACHED_BONUS);
  }

  accuracyScore = Math.round(Math.max(0, Math.min(100, accuracyScore)));

  // Determinar calidad
  let quality: string;
  if (!directionCorrect) {
    quality = 'failed';
  } else if (accuracyScore >= 75) {
    quality = 'excellent';
  } else if (accuracyScore >= 50) {
    quality = 'good';
  } else if (accuracyScore >= 25) {
    quality = 'poor';
  } else {
    quality = 'very_poor';
  }

  return { accuracyScore, directionCorrect, quality };
}

function getCorrectDirection(predictedChange: number): 'up' | 'down' | 'neutral' {
  // Umbral más bajo: 0.5% es suficiente para considerar direccional
  // Solo es "neutral" si el cambio predicho está muy cerca de 0
  const DIRECTION_THRESHOLD = 0.5;
  if (predictedChange > DIRECTION_THRESHOLD) return 'up';
  if (predictedChange < -DIRECTION_THRESHOLD) return 'down';
  // Incluso cambios pequeños tienen dirección si no son ~0
  if (predictedChange > 0.1) return 'up';
  if (predictedChange < -0.1) return 'down';
  return 'neutral';
}

async function main() {
  console.log('🔍 Buscando predicciones con inconsistencia direction/predictedChange...\n');

  // Buscar predicciones verificadas donde:
  // - direction = 'neutral' pero predictedChange > 1% (debería ser up)
  // - direction = 'neutral' pero predictedChange < -1% (debería ser down)
  const predictions = await prisma.prediction.findMany({
    where: {
      verified: true,
      actualChange: { not: null },
    },
    select: {
      id: true,
      symbol: true,
      direction: true,
      predictedChange: true,
      actualChange: true,
      accuracyScore: true,
      targetReached: true,
      directionCorrect: true,
      quality: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total predicciones verificadas: ${predictions.length}\n`);

  let fixed = 0;
  let alreadyCorrect = 0;
  const fixes: Array<{
    symbol: string;
    oldDirection: string;
    newDirection: string;
    predictedChange: number;
    actualChange: number;
    oldScore: number;
    newScore: number;
    oldQuality: string;
    newQuality: string;
  }> = [];

  for (const pred of predictions) {
    const predictedChange = pred.predictedChange ?? 0;
    const actualChange = pred.actualChange ?? 0;
    const correctDirection = getCorrectDirection(predictedChange);

    // Verificar si hay inconsistencia
    const hasInconsistency = pred.direction !== correctDirection && Math.abs(predictedChange) > 0.1;

    if (hasInconsistency) {
      // Recalcular con la dirección correcta
      const { accuracyScore, directionCorrect, quality } = recalculateAccuracyScore(
        correctDirection,
        predictedChange,
        actualChange,
        pred.targetReached ?? false
      );

      // Solo actualizar si el score cambia significativamente
      const oldScore = pred.accuracyScore ?? 0;
      if (Math.abs(accuracyScore - oldScore) > 5 || pred.direction !== correctDirection) {
        fixes.push({
          symbol: pred.symbol,
          oldDirection: pred.direction,
          newDirection: correctDirection,
          predictedChange,
          actualChange,
          oldScore,
          newScore: accuracyScore,
          oldQuality: pred.quality ?? 'unknown',
          newQuality: quality,
        });

        // Actualizar en la base de datos
        await prisma.prediction.update({
          where: { id: pred.id },
          data: {
            direction: correctDirection,
            directionCorrect,
            accuracyScore,
            quality,
          },
        });

        fixed++;
      }
    } else {
      // Verificar si el score actual está mal calculado incluso con la dirección correcta
      const { accuracyScore, directionCorrect, quality } = recalculateAccuracyScore(
        pred.direction as 'up' | 'down' | 'neutral',
        predictedChange,
        actualChange,
        pred.targetReached ?? false
      );

      const oldScore = pred.accuracyScore ?? 0;
      if (Math.abs(accuracyScore - oldScore) > 5 || pred.directionCorrect !== directionCorrect) {
        fixes.push({
          symbol: pred.symbol,
          oldDirection: pred.direction,
          newDirection: pred.direction,
          predictedChange,
          actualChange,
          oldScore,
          newScore: accuracyScore,
          oldQuality: pred.quality ?? 'unknown',
          newQuality: quality,
        });

        await prisma.prediction.update({
          where: { id: pred.id },
          data: {
            directionCorrect,
            accuracyScore,
            quality,
          },
        });

        fixed++;
      } else {
        alreadyCorrect++;
      }
    }
  }

  console.log('\n📊 Resumen de correcciones:\n');
  console.log(`✅ Predicciones correctas: ${alreadyCorrect}`);
  console.log(`🔧 Predicciones corregidas: ${fixed}`);

  if (fixes.length > 0) {
    console.log('\n📝 Detalle de correcciones:\n');
    console.log('Symbol\t\tOldDir\tNewDir\tPredicted\tActual\tOldScore\tNewScore\tQuality');
    console.log('-'.repeat(100));
    
    for (const fix of fixes.slice(0, 50)) { // Mostrar solo las primeras 50
      console.log(
        `${fix.symbol.padEnd(10)}\t${fix.oldDirection}\t${fix.newDirection}\t` +
        `${fix.predictedChange.toFixed(2)}%\t\t${fix.actualChange.toFixed(2)}%\t` +
        `${fix.oldScore}\t\t${fix.newScore}\t\t${fix.oldQuality} → ${fix.newQuality}`
      );
    }

    if (fixes.length > 50) {
      console.log(`\n... y ${fixes.length - 50} más`);
    }
  }

  // Mostrar estadísticas actualizadas
  const stats = await prisma.prediction.groupBy({
    by: ['quality'],
    where: { verified: true },
    _count: true,
  });

  console.log('\n📈 Distribución de calidad después de correcciones:\n');
  for (const stat of stats) {
    const emoji = stat.quality === 'excellent' ? '🎯' :
                  stat.quality === 'good' ? '👍' :
                  stat.quality === 'poor' ? '⚠️' : '❌';
    console.log(`${emoji} ${stat.quality}: ${stat._count}`);
  }

  await prisma.$disconnect();
  console.log('\n✅ Proceso completado');
}

main().catch(console.error);
