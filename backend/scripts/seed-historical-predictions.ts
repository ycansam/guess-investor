/**
 * Seed Historical Predictions
 * 
 * Genera predicciones históricas simuladas con datos verificados
 * para proporcionar un baseline de entrenamiento al sistema ML.
 * 
 * Uso: npx ts-node scripts/seed-historical-predictions.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Símbolos populares para generar datos
const SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple Inc', type: 'stock', currency: 'USD', avgVolatility: 25 },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock', currency: 'USD', avgVolatility: 22 },
  { symbol: 'GOOGL', name: 'Alphabet', type: 'stock', currency: 'USD', avgVolatility: 28 },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock', currency: 'USD', avgVolatility: 45 },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock', currency: 'USD', avgVolatility: 55 },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock', currency: 'USD', avgVolatility: 30 },
  { symbol: 'META', name: 'Meta Platforms', type: 'stock', currency: 'USD', avgVolatility: 35 },
  { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', currency: 'USD', avgVolatility: 65 },
  { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto', currency: 'USD', avgVolatility: 70 },
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'etf', currency: 'USD', avgVolatility: 15 },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', type: 'etf', currency: 'USD', avgVolatility: 20 },
  { symbol: 'GLD', name: 'Gold ETF', type: 'commodity', currency: 'USD', avgVolatility: 12 },
];

// Timeframes para generar
const TIMEFRAMES = [
  { name: 'intraday', days: 1 },
  { name: 'swing', days: 5 },
  { name: 'long', days: 14 },
];

// Factor scores simulados (realistas)
function generateFactorScores(direction: 'up' | 'down' | 'neutral', accuracy: number) {
  const bias = direction === 'up' ? 1 : direction === 'down' ? -1 : 0;
  const noise = (1 - accuracy / 100) * 40; // Más ruido si menos accuracy
  
  return {
    trend: Math.min(100, Math.max(-100, bias * 30 + (Math.random() - 0.5) * noise)),
    technical: Math.min(100, Math.max(-100, bias * 25 + (Math.random() - 0.5) * noise)),
    sentiment: Math.min(100, Math.max(-100, bias * 20 + (Math.random() - 0.5) * noise)),
    news: Math.min(100, Math.max(-100, bias * 15 + (Math.random() - 0.5) * noise)),
    macro: Math.min(100, Math.max(-100, bias * 10 + (Math.random() - 0.5) * noise)),
    forex: Math.min(100, Math.max(-100, (Math.random() - 0.5) * 30)),
    institutional: Math.min(100, Math.max(-100, bias * 12 + (Math.random() - 0.5) * noise)),
    financials: Math.min(100, Math.max(-100, bias * 18 + (Math.random() - 0.5) * noise)),
  };
}

// Genera datos de factor breakdown
function generateFactorBreakdown(
  assetType: string,
  factorScores: Record<string, number>,
  accuracyScore: number
) {
  const assetGroup = 
    assetType === 'crypto' ? 'crypto_major' :
    assetType === 'etf' ? 'etf_index' :
    assetType === 'commodity' ? 'commodity' : 'large_cap_stock';
  
  return {
    assetGroup,
    assetGroupDescription: `Tipo: ${assetType}`,
    relevantFactors: Object.keys(factorScores),
    availableFactors: Object.entries(factorScores).map(([name, score]) => ({
      name,
      score,
      hasData: true,
    })),
    weightsUsed: {
      trend: 0.14,
      technical: 0.20,
      sentiment: 0.12,
      news: 0.20,
      macro: 0.10,
      forex: 0.06,
      institutional: 0.10,
      financials: 0.08,
    },
    usingLearnedWeights: false,
    confidenceExplanation: `Seed data - accuracy ${accuracyScore}`,
    signalSummary: accuracyScore > 70 ? 'coherent_bullish' : accuracyScore > 50 ? 'mixed' : 'neutral',
  };
}

// Calcula quality basado en accuracy score
function getQuality(accuracyScore: number, directionCorrect: boolean): string {
  if (!directionCorrect) return 'failed';
  if (accuracyScore >= 75) return 'excellent';
  if (accuracyScore >= 50) return 'good';
  if (accuracyScore >= 25) return 'poor';
  return 'failed';
}

// Genera una predicción histórica verificada
async function generatePrediction(
  asset: typeof SYMBOLS[0],
  timeframe: typeof TIMEFRAMES[0],
  daysAgo: number
) {
  // Fechas
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - daysAgo);
  
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + timeframe.days);
  
  const verifiedAt = new Date(expiresAt);
  verifiedAt.setHours(verifiedAt.getHours() + 1);
  
  // Precio base simulado (realista por tipo)
  const basePrice = 
    asset.type === 'crypto' ? (asset.symbol.includes('BTC') ? 45000 : 2500) :
    asset.type === 'etf' ? (asset.symbol === 'SPY' ? 500 : 400) :
    asset.type === 'commodity' ? 180 :
    150 + Math.random() * 200;
  
  // Simular resultado (con distribución realista de aciertos)
  // 55-65% de acierto en dirección es realista para ML trading
  const isDirectionCorrect = Math.random() < 0.58;
  
  // Dirección predicha
  const directions: Array<'up' | 'down' | 'neutral'> = ['up', 'down', 'neutral'];
  const predictedDirection = directions[Math.floor(Math.random() * 2)]; // up o down mayormente
  
  // Cambio predicho basado en volatilidad
  const volatilityFactor = asset.avgVolatility / 100;
  const predictedChange = (Math.random() * 3 + 0.5) * volatilityFactor * (predictedDirection === 'up' ? 1 : -1);
  
  // Cambio real
  let actualChange: number;
  if (isDirectionCorrect) {
    // Dirección correcta pero con variación
    const accuracy = 50 + Math.random() * 50; // 50-100% de accuracy
    actualChange = predictedChange * (accuracy / 100) * (0.8 + Math.random() * 0.4);
  } else {
    // Dirección incorrecta
    actualChange = -predictedChange * (0.3 + Math.random() * 0.7);
  }
  
  // Calcular accuracy score
  let accuracyScore: number;
  if (isDirectionCorrect) {
    const predictedMag = Math.abs(predictedChange);
    const actualMag = Math.abs(actualChange);
    const magError = Math.abs(actualMag - predictedMag) / Math.max(predictedMag, 1);
    const magAccuracy = Math.max(0, 1 - magError);
    accuracyScore = Math.round(50 + magAccuracy * 50);
  } else {
    accuracyScore = Math.round(Math.max(0, 30 - Math.abs(actualChange) * 5));
  }
  
  // Precios
  const currentPrice = basePrice * (1 + (Math.random() - 0.5) * 0.1);
  const actualPrice = currentPrice * (1 + actualChange / 100);
  const targetPrice = currentPrice * (1 + predictedChange / 100);
  const predictedPriceMin = targetPrice * 0.97;
  const predictedPriceMax = targetPrice * 1.03;
  
  // Confianza (correlacionada con accuracy para datos realistas)
  const baseConfidence = 50 + Math.random() * 30;
  const confidence = Math.min(90, baseConfidence + (accuracyScore - 60) * 0.3);
  
  // Dirección real
  const actualDirection: 'up' | 'down' | 'neutral' = 
    actualChange > 0.5 ? 'up' : actualChange < -0.5 ? 'down' : 'neutral';
  
  // Factor scores
  const factorScores = generateFactorScores(predictedDirection, accuracyScore);
  
  // Factor breakdown
  const factorBreakdown = generateFactorBreakdown(asset.type, factorScores, accuracyScore);
  
  // Dentro del rango?
  const withinRange = actualPrice >= predictedPriceMin && actualPrice <= predictedPriceMax;
  
  // Quality
  const quality = getQuality(accuracyScore, isDirectionCorrect);
  
  // Crear predicción
  return prisma.prediction.create({
    data: {
      symbol: asset.symbol,
      asset: asset.name,
      assetType: asset.type,
      timeframe: timeframe.name,
      timeframeDays: timeframe.days,
      predictionType: 'close',
      
      direction: predictedDirection,
      predictedChange,
      confidence,
      currentPrice,
      targetPrice,
      predictedPriceMin,
      predictedPriceMax,
      currency: asset.currency,
      
      createdAt,
      expiresAt,
      
      // Verificación
      verified: true,
      verifiedAt,
      actualPrice,
      actualChange,
      actualDirection,
      directionCorrect: isDirectionCorrect,
      withinRange,
      priceError: Math.abs(actualChange - predictedChange),
      changeAccuracy: isDirectionCorrect ? Math.min(100, (1 - Math.abs(actualChange - predictedChange) / 10) * 100) : 0,
      accuracyScore,
      quality,
      
      // Volatilidad
      volatility: asset.avgVolatility,
      volatilityCategory: asset.avgVolatility > 40 ? 'high' : asset.avgVolatility > 20 ? 'medium' : 'low',
      
      // Factor data
      factorBreakdown: JSON.stringify(factorBreakdown),
      factorWeights: JSON.stringify(factorBreakdown.weightsUsed),
      reasoning: `Seed prediction for ML training - ${asset.name} ${timeframe.name}`,
      
      // Training flag
      usedForTraining: false,
    },
  });
}

async function main() {
  console.log('\n🌱 SEED DE PREDICCIONES HISTÓRICAS');
  console.log('=' .repeat(50));
  
  // Limpiar predicciones existentes (opcional, comentar si no quieres)
  const existingCount = await prisma.prediction.count();
  if (existingCount > 0) {
    console.log(`\n⚠️  Hay ${existingCount} predicciones existentes.`);
    console.log('   Añadiendo nuevas predicciones sin eliminar las existentes...\n');
  }
  
  let created = 0;
  let errors = 0;
  
  // Generar predicciones para cada combinación
  for (const asset of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      // Generar 5-8 predicciones por combinación (spread en últimos 30-60 días)
      const predictionsCount = 5 + Math.floor(Math.random() * 4);
      
      for (let i = 0; i < predictionsCount; i++) {
        const daysAgo = 7 + Math.floor(Math.random() * 53); // 7-60 días atrás
        
        try {
          await generatePrediction(asset, timeframe, daysAgo);
          created++;
          process.stdout.write('.');
        } catch (error) {
          errors++;
          console.error(`\n❌ Error creating prediction for ${asset.symbol}:`, error);
        }
      }
    }
  }
  
  console.log('\n');
  console.log('=' .repeat(50));
  console.log(`✅ Creadas: ${created} predicciones`);
  if (errors > 0) {
    console.log(`❌ Errores: ${errors}`);
  }
  
  // Mostrar estadísticas finales
  const stats = await prisma.prediction.groupBy({
    by: ['quality'],
    where: { verified: true },
    _count: true,
  });
  
  console.log('\n📊 DISTRIBUCIÓN DE CALIDAD:');
  stats.forEach(s => {
    console.log(`   ${s.quality}: ${s._count}`);
  });
  
  const directionStats = await prisma.prediction.aggregate({
    where: { verified: true },
    _avg: { accuracyScore: true },
    _count: { directionCorrect: true },
  });
  
  const correctCount = await prisma.prediction.count({
    where: { verified: true, directionCorrect: true },
  });
  const totalVerified = await prisma.prediction.count({
    where: { verified: true },
  });
  
  console.log('\n📈 MÉTRICAS:');
  console.log(`   Dirección correcta: ${((correctCount / totalVerified) * 100).toFixed(1)}%`);
  console.log(`   Accuracy score promedio: ${directionStats._avg.accuracyScore?.toFixed(1) || 0}`);
  console.log(`   Total verificadas: ${totalVerified}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
