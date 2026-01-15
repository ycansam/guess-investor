/**
 * Test del flujo real de predicción
 * Ejecutar: npx ts-node test-real-prediction.ts
 */
import { predictionCalculatorService } from './src/services/prediction/calculator.service';

async function testRealPrediction() {
  console.log('\n' + '='.repeat(70));
  console.log('  TEST DE PREDICCIÓN REAL');
  console.log('='.repeat(70) + '\n');

  const testAssets = [
    { symbol: 'META', type: 'stock' as const },
    { symbol: 'BTC-USD', type: 'crypto' as const },
    { symbol: 'GC=F', type: 'stock' as const },
  ];

  for (const asset of testAssets) {
    console.log(`\n🔮 Calculando predicción para ${asset.symbol}...`);
    try {
      const prediction = await predictionCalculatorService.calculatePrediction(
        asset.symbol,
        asset.type,
        1 // 1 día
      );

      if (prediction) {
        console.log(`   ✅ Predicción calculada:`);
        console.log(`      Asset Group: ${prediction.factorBreakdown.assetGroup}`);
        console.log(`      Dirección: ${prediction.direction}`);
        console.log(`      Cambio esperado: ${prediction.predictedChange.toFixed(2)}%`);
        console.log(`      Confianza: ${prediction.confidence}%`);
        console.log(`      Usando pesos aprendidos: ${prediction.factorBreakdown.usingLearnedWeights}`);
        
        // Mostrar top 3 factores por peso
        const weightsSorted = Object.entries(prediction.factorBreakdown.weightsUsed)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        console.log(`      Top 3 pesos: ${weightsSorted.map(([f, w]) => `${f}(${(w*100).toFixed(1)}%)`).join(', ')}`);
      } else {
        console.log(`   ❌ No se pudo calcular predicción`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n✅ Test completado!\n');
  process.exit(0);
}

testRealPrediction();
