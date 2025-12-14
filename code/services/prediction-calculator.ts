/**
 * Servicio para calcular predicciones de forma DETERMINÍSTICA
 * basándose en datos reales de mercado y sentimiento.
 * 
 * NO usa IA para los números, solo datos matemáticos reales.
 */

import { companyFinancialsService, FinancialSummary } from './company-financials-service';
import { currencyService } from './currency-service';
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
  
  timeframe: string;
  calculatedAt: Date;
}

interface SentimentData {
  bullishPercent: number;
  source: string;
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

      // 3. Obtener datos financieros (solo para acciones)
      let financials: FinancialSummary | null = null;
      if (type === 'stock') {
        financials = await companyFinancialsService.getFinancialSummary(symbol, quote.price);
        if (financials) {
          console.log(`[PredictionCalc] Datos financieros obtenidos: score=${financials.overallScore}`);
        }
      }

      // 4. Calcular predicción de forma determinística
      const prediction = this.calculateFromData(
        symbol,
        type,
        quote.price,
        quote.currency || 'EUR',
        historical,
        sentimentData,
        financials,
        timeframeDays
      );

      // 5. Convertir precios a EUR si es necesario
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
          };
        }
      }

      // Sin datos de sentimiento
      return {
        bullishPercent: 50, // Neutral
        source: 'Sin datos',
      };
    } catch {
      return {
        bullishPercent: 50,
        source: 'Sin datos',
      };
    }
  }

  /**
   * Cálculo determinístico de la predicción
   * 
   * Fórmula:
   * - Dirección: basada en tendencia histórica (40%) + sentimiento (30%) + fundamentales (30%)
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
    timeframeDays: number
  ): CalculatedPrediction {
    // Valores por defecto si no hay histórico
    const change30d = historical?.change30d ?? 0;
    const change90d = historical?.change90d ?? 0;
    const volatility = historical?.volatility ?? 20; // 20% volatilidad por defecto

    // --- CÁLCULO DE DIRECCIÓN ---
    // Score de tendencia histórica (-100 a +100)
    const trendScore = this.calculateTrendScore(change30d, change90d);
    
    // Score de sentimiento (-100 a +100)
    const sentimentScore = (sentiment.bullishPercent - 50) * 2;
    
    // Score de fundamentales (-100 a +100), solo para acciones
    let financialsScore = 0;
    if (financials) {
      // Convertir score 0-100 a -100/+100
      financialsScore = (financials.overallScore - 50) * 2;
      console.log(`[PredictionCalc] Financials score: ${financialsScore} (overall: ${financials.overallScore})`);
    }
    
    // NUEVO: Score de expectativas (-100 a +100)
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
    
    // Score combinado: si hay financieros, incluirlos en el cálculo
    let combinedScore: number;
    if (financials) {
      if (hasExpectationsData) {
        // Acciones con expectativas reales: 
        // 25% tendencia, 20% sentimiento, 25% fundamentales, 30% expectativas
        combinedScore = (trendScore * 0.25) + (sentimentScore * 0.20) + 
                       (financialsScore * 0.25) + (expectationsScore * 0.30);
        console.log(`[PredictionCalc] Combined score (con expectations): ${combinedScore.toFixed(1)} (trend=${trendScore}, sent=${sentimentScore}, fin=${financialsScore}, exp=${expectationsScore})`);
      } else {
        // Acciones SIN datos de expectations: redistribuir pesos
        // 35% tendencia, 25% sentimiento, 40% fundamentales
        combinedScore = (trendScore * 0.35) + (sentimentScore * 0.25) + (financialsScore * 0.40);
        console.log(`[PredictionCalc] Combined score (sin expectations): ${combinedScore.toFixed(1)} (trend=${trendScore}, sent=${sentimentScore}, fin=${financialsScore})`);
      }
    } else {
      // Crypto u otros: 60% tendencia, 40% sentimiento
      combinedScore = (trendScore * 0.6) + (sentimentScore * 0.4);
      console.log(`[PredictionCalc] Combined score (crypto/sin financials): ${combinedScore.toFixed(1)}`);
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
    // Base: coherencia entre tendencia y sentimiento
    let signalCoherence = this.calculateCoherence(trendScore, sentimentScore);
    
    // Si tenemos fundamentales, bonus por coherencia con ellos
    if (financials) {
      const financialsAgree = (financialsScore >= 0) === (combinedScore >= 0);
      if (financialsAgree) signalCoherence += 10;
      else signalCoherence -= 5;
    }
    
    // Penalizar si no hay datos
    let confidence = signalCoherence;
    if (!historical) confidence -= 20;
    if (sentiment.source === 'Sin datos') confidence -= 15;
    // Bonus si tenemos fundamentales
    if (financials) confidence += 5;
    
    // Limitar entre 25 y 85 (nunca 100% seguro, nunca menos de 25%)
    confidence = Math.max(25, Math.min(85, confidence));

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
    
    // Si tenemos precio objetivo de analistas, ajustar el cambio esperado
    if (financials && financials.targetPrice > 0 && financials.currentVsTarget !== 0) {
      // Ponderar el cambio esperado con la diferencia vs precio objetivo
      // Limitar la influencia del target al timeframe
      const targetInfluence = Math.min(Math.abs(financials.currentVsTarget) / 100, 0.5);
      const targetDirection = financials.currentVsTarget > 0 ? 1 : -1;
      
      // Ajustar el cambio esperado considerando el precio objetivo
      const targetAdjustment = targetInfluence * (periodVolatility * 0.3) * targetDirection;
      expectedChange = expectedChange + targetAdjustment;
      
      console.log(`[PredictionCalc] Ajuste por target analistas: ${targetAdjustment.toFixed(2)}%`);
    }
    
    // NUEVO: Ajustar por expectativas del mercado (earnings surprise)
    // SOLO si hay datos REALES - no inventar para cryptos u otros activos sin earnings
    if (hasExpectationsData && financials && financials.expectationsScore !== undefined && financials.expectationsScore !== 50) {
      // Las sorpresas de earnings tienen efecto directo en el precio
      // Empresas que superan expectativas tienden a subir más
      const expectationsInfluence = (financials.expectationsScore - 50) / 100; // -0.5 a +0.5
      
      // El ajuste es proporcional a la volatilidad y la magnitud de las sorpresas
      const expectationsAdjustment = expectationsInfluence * periodVolatility * 0.4;
      expectedChange = expectedChange + expectationsAdjustment;
      
      console.log(`[PredictionCalc] Ajuste por expectativas: ${expectationsAdjustment.toFixed(2)}% (score: ${financials.expectationsScore})`);
      
      // Si hay sorpresa reciente fuerte, dar más peso
      if (financials.lastEarningsSurprise && Math.abs(financials.lastEarningsSurprise) > 5) {
        const surpriseBonus = Math.sign(financials.lastEarningsSurprise) * 
                             Math.min(Math.abs(financials.lastEarningsSurprise) / 20, 0.5) * 
                             periodVolatility * 0.2;
        expectedChange = expectedChange + surpriseBonus;
        console.log(`[PredictionCalc] Bonus por sorpresa reciente (${financials.lastEarningsSurprise.toFixed(1)}%): ${surpriseBonus.toFixed(2)}%`);
      }
    }
    
    // Limitar el cambio máximo razonable para el timeframe
    const maxChange = Math.min(periodVolatility * 1.5, timeframeDays === 1 ? 8 : 15);
    expectedChange = Math.max(-maxChange, Math.min(maxChange, expectedChange));

    // Rango de precio basado en volatilidad real
    const priceRange = currentPrice * (periodVolatility / 100);
    const basePrice = currentPrice * (1 + expectedChange / 100);
    
    const predictedPriceMin = Math.round((basePrice - priceRange * 0.3) * 100) / 100;
    const predictedPriceMax = Math.round((basePrice + priceRange * 0.3) * 100) / 100;

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
