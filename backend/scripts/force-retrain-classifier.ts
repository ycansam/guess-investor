/**
 * Script para forzar el reentrenamiento del clasificador
 * usando predicciones verificadas existentes.
 * 
 * Dado que las predicciones históricas no tienen availableFactors completos,
 * este script usa valores por defecto basados en directionCorrect/accuracyScore.
 */

import { prisma } from '../src/config/database.js';
import { classifierLearningService } from '../src/services/ml/classifier-learning.service.js';

// Mapeo de assetGroup a factores importantes (para simular aprendizaje)
const GROUP_DEFAULT_FACTORS: Record<string, string[]> = {
  commodity: ['macro', 'forex', 'seasonality', 'sentiment'],
  crypto_major: ['sentiment', 'news', 'macro'],
  crypto_alt: ['sentiment', 'technical', 'news'],
  etf_index: ['macro', 'trend', 'forex'],
  large_cap_stock: ['financials', 'institutional', 'expectations'],
  small_cap_stock: ['technical', 'sentiment', 'news'],
  default: ['trend', 'technical', 'sentiment', 'news'],
};

async function main() {
  // Inicializar servicio
  await classifierLearningService.initialize();
  
  // Obtener predicciones verificadas con factorBreakdown
  const predictions = await prisma.prediction.findMany({
    where: {
      verified: true,
      factorBreakdown: { not: null },
    },
    select: {
      id: true,
      symbol: true,
      factorBreakdown: true,
      directionCorrect: true,
      accuracyScore: true,
      predictedChange: true,
      actualChange: true,
    },
  });

  console.log(`Found ${predictions.length} verified predictions with factorBreakdown`);
  
  let trained = 0;
  const byGroup: Record<string, { total: number; correct: number }> = {};
  
  for (const pred of predictions) {
    const fb = JSON.parse(pred.factorBreakdown!);
    const assetGroup = fb.assetGroup || 'default';
    
    if (!byGroup[assetGroup]) {
      byGroup[assetGroup] = { total: 0, correct: 0 };
    }
    byGroup[assetGroup].total++;
    if (pred.directionCorrect) {
      byGroup[assetGroup].correct++;
    }
    
    // Generar factorScores simulados basados en el resultado
    // Si acertó, los factores relevantes tuvieron scores en la dirección correcta
    // Si falló, los factores dieron señales incorrectas
    const defaultFactors = GROUP_DEFAULT_FACTORS[assetGroup] || GROUP_DEFAULT_FACTORS.default;
    const factorScores: Record<string, number> = {};
    const factorWeights: Record<string, number> = {};
    
    const actualDirection = (pred.actualChange || 0) > 0 ? 1 : -1;
    const predictionDirection = (pred.predictedChange || 0) > 0 ? 1 : -1;
    
    // Si hay availableFactors reales, usarlos
    if (fb.availableFactors && fb.availableFactors.length > 0) {
      for (const f of fb.availableFactors) {
        if (f.hasData) {
          factorScores[f.name] = f.score;
        }
      }
    } else {
      // Generar scores simulados
      for (const factor of defaultFactors) {
        // El score simulado depende de si la predicción fue correcta
        if (pred.directionCorrect) {
          // Si acertamos, los factores dieron señales en la dirección correcta
          factorScores[factor] = actualDirection * (20 + Math.random() * 30);
        } else {
          // Si fallamos, los factores dieron señales opuestas
          factorScores[factor] = -actualDirection * (20 + Math.random() * 30);
        }
      }
    }
    
    // Generar weights por defecto
    if (fb.weightsUsed && Object.keys(fb.weightsUsed).length > 0) {
      Object.assign(factorWeights, fb.weightsUsed);
    } else {
      const numFactors = Object.keys(factorScores).length;
      for (const factor of Object.keys(factorScores)) {
        factorWeights[factor] = 1 / numFactors;
      }
    }
    
    // Solo llamar learnFromVerifiedPrediction si tenemos al menos algunos factorScores
    if (Object.keys(factorScores).length > 0) {
      await classifierLearningService.learnFromVerifiedPrediction({
        assetGroup,
        directionCorrect: pred.directionCorrect ?? false,
        accuracyScore: pred.accuracyScore ?? 0,
        factorScores,
        factorWeights,
        predictedChange: pred.predictedChange,
        actualChange: pred.actualChange ?? 0,
      });
      trained++;
    }
  }
  
  console.log(`\n=== TRAINING COMPLETE ===`);
  console.log(`Trained on ${trained} predictions`);
  console.log(`\nBy group:`);
  for (const [group, stats] of Object.entries(byGroup)) {
    const rate = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : '0';
    console.log(`  ${group}: ${stats.total} samples, ${rate}% success`);
  }
  
  // Mostrar multiplicadores resultantes
  console.log(`\n=== RESULTING MULTIPLIERS ===`);
  const allMultipliers = classifierLearningService.getAllMultipliers();
  for (const [group, mults] of Object.entries(allMultipliers)) {
    console.log(`\n${group}:`);
    const sorted = Object.entries(mults)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);
    for (const [factor, mult] of sorted) {
      console.log(`  ${factor}: ${((mult as number) * 100).toFixed(0)}%`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
