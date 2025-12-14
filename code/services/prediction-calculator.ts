/**
 * Servicio para calcular predicciones de forma DETERMINÍSTICA
 * basándose en datos reales de mercado y sentimiento.
 * 
 * NO usa IA para los números, solo datos matemáticos reales.
 */

import { companyFinancialsService, FinancialSummary } from './company-financials-service';
import { currencyService } from './currency-service';
import { macroEconomicService, MacroIndicators } from './macro-economic-service';
import { newsService, NewsSummary } from './news-service';
import { sentimentService } from './sentiment-service';
import { HistoricalData, yahooFinanceService } from './yahoo-finance-service';

export interface CalculatedPrediction {
  asset: string;
  assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'other';
  currentPrice: number;
  currency: string;
  
  // Predicción calculada
  predictedPriceMin: number;
  predictedPriceMax: number;
  predictedChange: number;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  
  // Datos base usados para el cálculo
  sentiment: {
    score: number; // 0-100, donde 50 es neutral
    source: string;
  };
  historical: {
    change30d: number;
    change90d: number;
    volatility: number;
  };
  
  // Datos financieros (solo para acciones)
  financials?: FinancialSummary;
  
  // Noticias recientes
  news?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    count: number;
    summary: string;
  };
  
  // Indicadores macroeconómicos
  macro?: {
    region: string;
    outlook: 'favorable' | 'neutral' | 'unfavorable';
    score: number;
    summary: string;
  };
  
  timeframe: string;
  calculatedAt: Date;
}

interface SentimentData {
  bullishPercent: number;
  source: string;
  hasData: boolean; // NUEVO: indica si hay datos reales de sentimiento
}

class PredictionCalculatorService {
  /**
   * Calcula una predicción basada 100% en datos reales
   */
  async calculatePrediction(
    symbol: string,
    type: 'stock' | 'crypto',
    timeframeDays: number = 1
  ): Promise<CalculatedPrediction | null> {
    try {
      console.log(`[PredictionCalc] Calculando predicción para ${symbol} (${type})`);

      // 1. Obtener datos de mercado reales
      const [quote, historical] = await Promise.all([
        yahooFinanceService.getQuote(symbol, type),
        yahooFinanceService.getHistoricalData(symbol, type).catch(() => null),
      ]);

      if (!quote || !quote.price) {
        console.log(`[PredictionCalc] No se pudo obtener precio para ${symbol}`);
        return null;
      }

      // 2. Obtener sentimiento real
      const sentimentData = await this.getSentimentScore(symbol, type);

      // 3. Obtener noticias recientes
      const newsData = await newsService.getNews(symbol, type);
      if (newsData.hasNews) {
        console.log(`[PredictionCalc] Noticias obtenidas: ${newsData.newsCount} (sentimiento: ${newsData.sentimentScore})`);
      }

      // 4. Obtener indicadores macroeconómicos
      const macroData = await macroEconomicService.getIndicators(symbol, type);
      if (macroData.hasData) {
        console.log(`[PredictionCalc] Datos macro obtenidos: ${macroData.macroOutlook} (score: ${macroData.macroScore})`);
      }

      // 5. Obtener datos financieros (solo para acciones)
      let financials: FinancialSummary | null = null;
      if (type === 'stock') {
        financials = await companyFinancialsService.getFinancialSummary(symbol, quote.price);
        if (financials) {
          console.log(`[PredictionCalc] Datos financieros obtenidos: score=${financials.overallScore}`);
        }
      }

      // 6. Calcular predicción de forma determinística
      const prediction = this.calculateFromData(
        symbol,
        type,
        quote.price,
        quote.currency || 'EUR',
        historical,
        sentimentData,
        financials,
        newsData,
        macroData,
        timeframeDays
      );

      // 7. Convertir precios a EUR si es necesario
      const currency = quote.currency || 'USD';
      if (currency !== 'EUR') {
        console.log(`[PredictionCalc] Convirtiendo de ${currency} a EUR`);
        const rate = await currencyService.getExchangeRateToEUR(currency);
        
        prediction.currentPrice = Math.round(prediction.currentPrice * rate * 100) / 100;
        prediction.predictedPriceMin = Math.round(prediction.predictedPriceMin * rate * 100) / 100;
        prediction.predictedPriceMax = Math.round(prediction.predictedPriceMax * rate * 100) / 100;
        prediction.currency = 'EUR';
        
        // También convertir el precio objetivo de analistas si existe
        if (prediction.financials?.targetPrice) {
          prediction.financials.targetPrice = Math.round(prediction.financials.targetPrice * rate * 100) / 100;
        }
        
        console.log(`[PredictionCalc] Precio convertido: ${prediction.currentPrice} EUR`);
      }

      console.log(`[PredictionCalc] Predicción calculada:`, {
        direction: prediction.direction,
        confidence: prediction.confidence,
        change: prediction.predictedChange.toFixed(2) + '%',
      });

      return prediction;
    } catch (error: any) {
      console.error(`[PredictionCalc] Error:`, error.message);
      return null;
    }
  }

  /**
   * Obtiene un score de sentimiento normalizado (0-100)
   */
  private async getSentimentScore(
    symbol: string,
    type: 'stock' | 'crypto'
  ): Promise<SentimentData> {
    try {
      const sentiment = await sentimentService.getSentimentForAsset(symbol, type);
      
      // Extraer % bullish de StockTwits si existe
      if (sentiment.stocktwits) {
        const match = sentiment.stocktwits.match(/Bullish:\s*(\d+)/);
        if (match) {
          return {
            bullishPercent: parseInt(match[1]),
            source: 'StockTwits',
            hasData: true,
          };
        }
      }

      // Si hay Fear & Greed (crypto), usarlo
      if (sentiment.fearGreed) {
        const match = sentiment.fearGreed.match(/Valor:\s*(\d+)/);
        if (match) {
          return {
            bullishPercent: parseInt(match[1]),
            source: 'Fear & Greed Index',
            hasData: true,
          };
        }
      }

      // Sin datos de sentimiento - NO inventar
      return {
        bullishPercent: 50, // Neutral por defecto
        source: 'Sin datos',
        hasData: false, // Indica que no hay datos reales
      };
    } catch {
      return {
        bullishPercent: 50,
        source: 'Sin datos',
        hasData: false,
      };
    }
  }

  /**
   * Cálculo determinístico de la predicción
   * 
   * Fórmula:
   * - Dirección: basada en tendencia histórica + sentimiento + fundamentales + noticias + expectativas + macro
   * - Confianza: basada en coherencia de señales + cantidad de datos
   * - Precio objetivo: basado en volatilidad histórica real + precio objetivo analistas
   */
  private calculateFromData(
    symbol: string,
    type: 'stock' | 'crypto',
    currentPrice: number,
    currency: string,
    historical: HistoricalData | null,
    sentiment: SentimentData,
    financials: FinancialSummary | null,
    news: NewsSummary,
    macro: MacroIndicators,
    timeframeDays: number
  ): CalculatedPrediction {
    // --- FLAGS DE DATOS DISPONIBLES ---
    const hasHistoricalData = historical !== null && (historical.change30d !== 0 || historical.change90d !== 0);
    const hasSentimentData = sentiment.hasData;
    const hasVolatilityData = historical !== null && historical.volatility > 0;
    const hasNewsData = news.hasNews;
    const hasMacroData = macro.hasData;
    
    // Valores - usar 0 (neutral) si no hay datos reales
    const change30d = hasHistoricalData ? historical.change30d : 0;
    const change90d = hasHistoricalData ? historical.change90d : 0;
    const volatility = hasVolatilityData ? historical.volatility : 20; // Solo volatilidad usamos default

    console.log(`[PredictionCalc] Datos disponibles: historical=${hasHistoricalData}, sentiment=${hasSentimentData}, news=${hasNewsData}, macro=${hasMacroData}, volatility=${hasVolatilityData}`);

    // --- CÁLCULO DE DIRECCIÓN ---
    // Score de tendencia histórica (-100 a +100) - SOLO si hay datos
    const trendScore = hasHistoricalData ? this.calculateTrendScore(change30d, change90d) : 0;
    
    // Score de sentimiento (-100 a +100) - SOLO si hay datos
    const sentimentScore = hasSentimentData ? (sentiment.bullishPercent - 50) * 2 : 0;
    
    // Score de noticias (-100 a +100) - SOLO si hay noticias
    // Las noticias tienen impacto directo y rápido en el precio
    let newsScore = 0;
    if (hasNewsData) {
      newsScore = news.sentimentScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] News score: ${newsScore} (${news.positiveCount}+ / ${news.negativeCount}-)`);
    }
    
    // Score macroeconómico (-100 a +100) - SOLO si hay datos
    let macroScore = 0;
    if (hasMacroData) {
      macroScore = macro.macroScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] Macro score: ${macroScore} (${macro.macroOutlook})`);
    }
    
    // Score de fundamentales (-100 a +100), solo para acciones
    let financialsScore = 0;
    if (financials) {
      // Convertir score 0-100 a -100/+100
      financialsScore = (financials.overallScore - 50) * 2;
      console.log(`[PredictionCalc] Financials score: ${financialsScore} (overall: ${financials.overallScore})`);
    }
    
    // Score de expectativas (-100 a +100)
    // Las expectativas son MUY importantes para movimientos a corto plazo
    // SOLO aplicar si hay datos reales (no inventar)
    let expectationsScore = 0;
    const hasExpectationsData = financials?.hasExpectationsData === true;
    if (hasExpectationsData && financials.expectationsScore !== undefined) {
      expectationsScore = (financials.expectationsScore - 50) * 2;
      console.log(`[PredictionCalc] Expectations score: ${expectationsScore} (raw: ${financials.expectationsScore})`);
    } else {
      console.log(`[PredictionCalc] Sin datos de expectations, no se aplica este factor`);
    }
    
    // Score combinado: distribuir pesos SOLO entre factores con datos reales
    let combinedScore: number;
    
    // Contar cuántos factores tienen datos
    // Los pesos reflejan la importancia de cada factor para predicciones a corto plazo
    const factors: { name: string; score: number; hasData: boolean; baseWeight: number }[] = [
      { name: 'trend', score: trendScore, hasData: hasHistoricalData, baseWeight: 0.20 },
      { name: 'sentiment', score: sentimentScore, hasData: hasSentimentData, baseWeight: 0.10 },
      { name: 'news', score: newsScore, hasData: hasNewsData, baseWeight: 0.20 }, // Noticias: impacto directo
      { name: 'macro', score: macroScore, hasData: hasMacroData, baseWeight: 0.15 }, // Macro: contexto general
      { name: 'financials', score: financialsScore, hasData: financials !== null, baseWeight: 0.20 },
      { name: 'expectations', score: expectationsScore, hasData: hasExpectationsData, baseWeight: 0.15 },
    ];
    
    const availableFactors = factors.filter(f => f.hasData);
    
    if (availableFactors.length === 0) {
      // Sin datos de ningún factor - no podemos predecir
      console.log(`[PredictionCalc] ⚠️ Sin datos de ningún factor, predicción neutral`);
      combinedScore = 0;
    } else {
      // Redistribuir pesos entre factores disponibles
      const totalWeight = availableFactors.reduce((sum, f) => sum + f.baseWeight, 0);
      combinedScore = availableFactors.reduce((sum, f) => {
        const normalizedWeight = f.baseWeight / totalWeight; // Normalizar a suma = 1
        return sum + (f.score * normalizedWeight);
      }, 0);
      
      const factorDetails = availableFactors.map(f => `${f.name}=${f.score.toFixed(0)}`).join(', ');
      console.log(`[PredictionCalc] Combined score: ${combinedScore.toFixed(1)} (factores: ${factorDetails})`);
    }
    
    // Determinar dirección
    let direction: 'up' | 'down' | 'neutral';
    if (combinedScore > 15) {
      direction = 'up';
    } else if (combinedScore < -15) {
      direction = 'down';
    } else {
      direction = 'neutral';
    }

    // --- CÁLCULO DE CONFIANZA ---
    // Base: según cantidad de factores disponibles
    const dataAvailabilityScore = (availableFactors.length / factors.length) * 100;
    
    // Coherencia entre señales disponibles (solo si hay al menos 2)
    let signalCoherence = 50; // Base neutral
    if (availableFactors.length >= 2) {
      const positiveSignals = availableFactors.filter(f => f.score > 10).length;
      const negativeSignals = availableFactors.filter(f => f.score < -10).length;
      const neutralSignals = availableFactors.length - positiveSignals - negativeSignals;
      
      // Alta coherencia si todas las señales van en la misma dirección
      if (positiveSignals === availableFactors.length || negativeSignals === availableFactors.length) {
        signalCoherence = 80;
      } else if ((positiveSignals > 0 && negativeSignals > 0)) {
        signalCoherence = 40; // Señales contradictorias
      } else {
        signalCoherence = 60; // Algunas señales, algunas neutrales
      }
    }
    
    // Confianza final: promedio entre disponibilidad y coherencia
    let confidence = (dataAvailabilityScore * 0.4) + (signalCoherence * 0.6);
    
    // Bonus/penalizaciones específicas
    if (!hasHistoricalData) confidence -= 10;
    if (!hasSentimentData) confidence -= 5;
    if (financials) confidence += 5;
    if (hasExpectationsData) confidence += 5;
    
    // Limitar entre 20 y 85 (nunca 100% seguro, más bajo si faltan datos)
    confidence = Math.max(20, Math.min(85, confidence));
    
    console.log(`[PredictionCalc] Confianza: ${confidence.toFixed(0)}% (datos: ${availableFactors.length}/${factors.length} factores)`);
    

    // --- CÁLCULO DE PRECIO OBJETIVO ---
    // Usar volatilidad real para calcular rango
    const dailyVolatility = volatility / Math.sqrt(252); // Volatilidad diaria
    const periodVolatility = dailyVolatility * Math.sqrt(timeframeDays);
    
    // El cambio esperado se basa en la dirección y la volatilidad
    let expectedChange: number;
    if (direction === 'up') {
      expectedChange = Math.min(periodVolatility * 0.5, 5); // Máximo 5% en 1 día
    } else if (direction === 'down') {
      expectedChange = -Math.min(periodVolatility * 0.5, 5);
    } else {
      expectedChange = 0;
    }
    
    // --- AJUSTES DE PRECIO CON REDISTRIBUCIÓN DE PESOS ---
    // Cada ajuste tiene un peso base. Si no hay datos, los otros se redistribuyen.
    
    // Definir ajustes posibles con sus pesos base
    interface PriceAdjustment {
      name: string;
      hasData: boolean;
      baseWeight: number; // Peso base para redistribución
      adjustment: number; // Ajuste calculado
    }
    
    const priceAdjustments: PriceAdjustment[] = [];
    
    // 1. Precio objetivo de analistas (peso base: 0.25)
    let targetAdjustment = 0;
    const hasTargetData = financials !== null && financials.targetPrice > 0 && financials.currentVsTarget !== 0;
    if (hasTargetData && financials) {
      const targetInfluence = Math.min(Math.abs(financials.currentVsTarget) / 100, 0.5);
      const targetDirection = financials.currentVsTarget > 0 ? 1 : -1;
      targetAdjustment = targetInfluence * (periodVolatility * 0.3) * targetDirection;
    }
    priceAdjustments.push({ name: 'target', hasData: hasTargetData, baseWeight: 0.25, adjustment: targetAdjustment });
    
    // 2. Expectativas del mercado (peso base: 0.25)
    let expectationsAdjustment = 0;
    if (hasExpectationsData && financials && financials.expectationsScore !== undefined && financials.expectationsScore !== 50) {
      const expectationsInfluence = (financials.expectationsScore - 50) / 100;
      expectationsAdjustment = expectationsInfluence * periodVolatility * 0.4;
      
      // Bonus por sorpresa reciente fuerte
      if (financials.lastEarningsSurprise && Math.abs(financials.lastEarningsSurprise) > 5) {
        const surpriseBonus = Math.sign(financials.lastEarningsSurprise) * 
                             Math.min(Math.abs(financials.lastEarningsSurprise) / 20, 0.5) * 
                             periodVolatility * 0.2;
        expectationsAdjustment += surpriseBonus;
      }
    }
    priceAdjustments.push({ name: 'expectations', hasData: hasExpectationsData, baseWeight: 0.25, adjustment: expectationsAdjustment });
    
    // 3. Noticias recientes (peso base: 0.30)
    let newsAdjustment = 0;
    if (hasNewsData && news.sentimentScore !== 0) {
      const newsInfluence = news.sentimentScore / 100;
      newsAdjustment = newsInfluence * periodVolatility * 0.5;
    }
    priceAdjustments.push({ name: 'news', hasData: hasNewsData, baseWeight: 0.30, adjustment: newsAdjustment });
    
    // 4. Contexto macroeconómico (peso base: 0.20)
    let macroAdjustment = 0;
    if (hasMacroData && macro.macroScore !== 0) {
      const macroInfluence = macro.macroScore / 100;
      macroAdjustment = macroInfluence * periodVolatility * 0.3;
    }
    priceAdjustments.push({ name: 'macro', hasData: hasMacroData, baseWeight: 0.20, adjustment: macroAdjustment });
    
    // Calcular ajuste total con redistribución de pesos
    const availablePriceAdjustments = priceAdjustments.filter(a => a.hasData);
    
    if (availablePriceAdjustments.length > 0) {
      const totalAdjustmentWeight = availablePriceAdjustments.reduce((sum, a) => sum + a.baseWeight, 0);
      
      // Aplicar cada ajuste con su peso normalizado
      for (const adj of availablePriceAdjustments) {
        const normalizedWeight = adj.baseWeight / totalAdjustmentWeight; // Normalizar a suma = 1
        const weightedAdjustment = adj.adjustment * normalizedWeight;
        expectedChange += weightedAdjustment;
        
        console.log(`[PredictionCalc] Ajuste ${adj.name}: ${weightedAdjustment.toFixed(2)}% (peso: ${(normalizedWeight * 100).toFixed(0)}%)`);
      }
      
      console.log(`[PredictionCalc] Ajustes disponibles: ${availablePriceAdjustments.length}/${priceAdjustments.length}`);
    } else {
      console.log(`[PredictionCalc] Sin ajustes adicionales - solo tendencia histórica`);
    }
    
    // Limitar el cambio máximo razonable para el timeframe
    const maxChange = Math.min(periodVolatility * 1.5, timeframeDays === 1 ? 8 : 15);
    expectedChange = Math.max(-maxChange, Math.min(maxChange, expectedChange));

    // --- CÁLCULO DE PRECIO OBJETIVO ---
    // Rango basado SOLO en volatilidad real (sin ampliar por confianza)
    // La confianza es solo informativa, no afecta el rango
    
    // Rango pequeño y coherente: ±20% de la volatilidad del período
    const priceRange = currentPrice * (periodVolatility / 100) * 0.2;
    const basePrice = currentPrice * (1 + expectedChange / 100);
    
    let predictedPriceMin: number;
    let predictedPriceMax: number;
    
    // El rango debe ser COHERENTE con la dirección:
    // - SUBIDA: todo el rango por encima del precio actual
    // - BAJADA: todo el rango por debajo del precio actual
    // - NEUTRAL: rango pequeño simétrico
    if (direction === 'up') {
      // Subida: desde precio actual hacia el objetivo
      predictedPriceMin = Math.round(currentPrice * 100) / 100;
      predictedPriceMax = Math.round((basePrice + priceRange) * 100) / 100;
    } else if (direction === 'down') {
      // Bajada: desde objetivo hacia el precio actual
      predictedPriceMin = Math.round((basePrice - priceRange) * 100) / 100;
      predictedPriceMax = Math.round(currentPrice * 100) / 100;
    } else {
      // Neutral: rango pequeño simétrico
      predictedPriceMin = Math.round((currentPrice - priceRange) * 100) / 100;
      predictedPriceMax = Math.round((currentPrice + priceRange) * 100) / 100;
    }
    
    console.log(`[PredictionCalc] Precio objetivo: ${predictedPriceMin} - ${predictedPriceMax}`);
    console.log(`[PredictionCalc] Dirección: ${direction.toUpperCase()}, Confianza: ${confidence.toFixed(0)}%`);

    return {
      asset: this.getAssetName(symbol),
      assetType: type,
      currentPrice: Math.round(currentPrice * 100) / 100,
      currency,
      predictedPriceMin,
      predictedPriceMax,
      predictedChange: Math.round(expectedChange * 100) / 100,
      direction,
      confidence: Math.round(confidence),
      sentiment: {
        score: sentiment.bullishPercent,
        source: sentiment.source,
      },
      historical: {
        change30d: Math.round(change30d * 100) / 100,
        change90d: Math.round(change90d * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
      },
      financials: financials || undefined,
      news: hasNewsData ? {
        sentiment: news.overallSentiment,
        score: news.sentimentScore,
        count: news.newsCount,
        summary: news.summary,
      } : undefined,
      macro: hasMacroData ? {
        region: macro.region,
        outlook: macro.macroOutlook,
        score: macro.macroScore,
        summary: macro.summary,
      } : undefined,
      timeframe: timeframeDays === 1 ? '1 día' : `${timeframeDays} días`,
      calculatedAt: new Date(),
    };
  }

  /**
   * Calcula score de tendencia (-100 a +100)
   */
  private calculateTrendScore(change30d: number, change90d: number): number {
    // Peso: 70% cambio 30d, 30% cambio 90d
    const weightedChange = (change30d * 0.7) + (change90d * 0.3);
    
    // Normalizar a -100 a +100 (asumiendo ±20% como extremos)
    return Math.max(-100, Math.min(100, weightedChange * 5));
  }

  /**
   * Calcula coherencia entre señales (0-100)
   */
  private calculateCoherence(trendScore: number, sentimentScore: number): number {
    // Si ambos tienen el mismo signo, alta coherencia
    const sameDirection = (trendScore >= 0) === (sentimentScore >= 0);
    
    if (sameDirection) {
      // Alta coherencia: base 60 + bonus por fuerza de señales
      const strength = (Math.abs(trendScore) + Math.abs(sentimentScore)) / 2;
      return 60 + (strength * 0.25);
    } else {
      // Baja coherencia: señales contradictorias
      const conflict = Math.abs(trendScore - sentimentScore) / 2;
      return Math.max(30, 55 - conflict * 0.25);
    }
  }

  /**
   * Obtiene nombre legible del activo
   */
  private getAssetName(symbol: string): string {
    const names: Record<string, string> = {
      'ITX.MC': 'Inditex',
      'AMZN': 'Amazon',
      'AAPL': 'Apple',
      'GOOGL': 'Google',
      'MSFT': 'Microsoft',
      'TSLA': 'Tesla',
      'BTC-EUR': 'Bitcoin',
      'ETH-EUR': 'Ethereum',
      'SAN.MC': 'Banco Santander',
      'BBVA.MC': 'BBVA',
      'TEF.MC': 'Telefónica',
      'IBE.MC': 'Iberdrola',
      'REP.MC': 'Repsol',
    };
    return names[symbol] || symbol;
  }
}

export const predictionCalculatorService = new PredictionCalculatorService();
