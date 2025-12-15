/**
 * Servicio de Indicadores Técnicos
 * 
 * Calcula indicadores técnicos a partir de datos históricos:
 * - SMA (Simple Moving Average): 20, 50, 200 días
 * - EMA (Exponential Moving Average): 12, 26 días
 * - RSI (Relative Strength Index): 14 días
 * - MACD (Moving Average Convergence Divergence): 12, 26, 9
 * - Bandas de Bollinger: 20, 2 desviaciones
 * - Análisis de volumen
 */

import apiConfig from '../data/api-config.json';

const config = apiConfig.yahoo;

export interface TechnicalAnalysis {
  // Datos básicos
  currentPrice: number;
  
  // Medias móviles simples
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  
  // Medias móviles exponenciales
  ema12: number | null;
  ema26: number | null;
  
  // Señales de cruce
  goldenCross: boolean; // SMA50 cruza por encima de SMA200
  deathCross: boolean;  // SMA50 cruza por debajo de SMA200
  priceAboveSMA200: boolean;
  priceAboveSMA50: boolean;
  priceAboveSMA20: boolean;
  
  // RSI
  rsi14: number | null;
  rsiSignal: 'oversold' | 'overbought' | 'neutral';
  
  // MACD
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdTrend: 'bullish' | 'bearish' | 'neutral';
  
  // Bandas de Bollinger
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: 'above' | 'below' | 'inside'; // Posición del precio
  bollingerWidth: number | null; // Ancho de las bandas (volatilidad)
  
  // Volumen
  avgVolume20: number | null;
  currentVolume: number | null;
  volumeRatio: number | null; // currentVolume / avgVolume20
  volumeSignal: 'high' | 'low' | 'normal';
  
  // Score técnico combinado (-100 a +100)
  technicalScore: number;
  
  // Señales resumidas
  signals: TechnicalSignal[];
  
  // Tendencia general
  trend: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  
  // Resumen para mostrar
  summary: string;
  
  hasData: boolean;
}

export interface TechnicalSignal {
  indicator: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  description: string;
  weight: number; // Importancia del indicador
}

interface OHLCVData {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  timestamps: number[];
}

class TechnicalIndicatorsService {
  private cache = new Map<string, { data: TechnicalAnalysis; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  /**
   * Obtiene análisis técnico completo para un símbolo
   */
  async analyzeTechnicals(symbol: string): Promise<TechnicalAnalysis> {
    const cacheKey = symbol.toUpperCase();
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`[TechnicalIndicators] Usando caché para ${symbol}`);
      return cached.data;
    }

    try {
      console.log(`[TechnicalIndicators] Analizando indicadores técnicos para ${symbol}`);
      
      // Obtener datos históricos de 1 año (necesitamos ~250 días para SMA200)
      const ohlcv = await this.fetchOHLCVData(symbol);
      
      if (!ohlcv || ohlcv.close.length < 20) {
        return this.createEmptyAnalysis();
      }

      const analysis = this.calculateAllIndicators(ohlcv);
      
      // Guardar en caché
      this.cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
      
      return analysis;
    } catch (error) {
      console.error(`[TechnicalIndicators] Error analizando ${symbol}:`, error);
      return this.createEmptyAnalysis();
    }
  }

  /**
   * Obtiene datos OHLCV de Yahoo Finance
   */
  private async fetchOHLCVData(symbol: string): Promise<OHLCVData | null> {
    try {
      const yahooUrl = `${config.baseUrl}/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
      const proxyUrl = `${config.corsProxy}${encodeURIComponent(yahooUrl)}`;
      
      const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) {
        return null;
      }

      const quote = result.indicators?.quote?.[0];
      const timestamps = result.timestamp || [];

      // Filtrar valores nulos manteniendo sincronización
      const validIndices: number[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (quote.close?.[i] != null && quote.open?.[i] != null) {
          validIndices.push(i);
        }
      }

      return {
        open: validIndices.map(i => quote.open[i]),
        high: validIndices.map(i => quote.high?.[i] || quote.close[i]),
        low: validIndices.map(i => quote.low?.[i] || quote.close[i]),
        close: validIndices.map(i => quote.close[i]),
        volume: validIndices.map(i => quote.volume?.[i] || 0),
        timestamps: validIndices.map(i => timestamps[i]),
      };
    } catch (error) {
      console.error(`[TechnicalIndicators] Error fetching OHLCV:`, error);
      return null;
    }
  }

  /**
   * Calcula todos los indicadores técnicos
   */
  private calculateAllIndicators(ohlcv: OHLCVData): TechnicalAnalysis {
    const { close, volume } = ohlcv;
    const currentPrice = close[close.length - 1];
    const currentVolume = volume[volume.length - 1];

    // Calcular SMAs
    const sma20 = this.calculateSMA(close, 20);
    const sma50 = this.calculateSMA(close, 50);
    const sma200 = this.calculateSMA(close, 200);

    // Calcular EMAs
    const ema12 = this.calculateEMA(close, 12);
    const ema26 = this.calculateEMA(close, 26);

    // Calcular RSI
    const rsi14 = this.calculateRSI(close, 14);

    // Calcular MACD
    const macdResult = this.calculateMACD(close);

    // Calcular Bandas de Bollinger
    const bollinger = this.calculateBollingerBands(close, 20, 2);

    // Calcular promedio de volumen
    const avgVolume20 = this.calculateSMA(volume, 20);
    const volumeRatio = avgVolume20 ? currentVolume / avgVolume20 : null;

    // Detectar cruces de medias
    const goldenCross = this.detectCross(close, 50, 200, 'golden');
    const deathCross = this.detectCross(close, 50, 200, 'death');

    // Generar señales
    const signals: TechnicalSignal[] = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;

    // Señal de precio vs SMAs
    if (sma200 !== null) {
      const priceAbove = currentPrice > sma200;
      signals.push({
        indicator: 'SMA200',
        signal: priceAbove ? 'bullish' : 'bearish',
        description: priceAbove 
          ? `Precio por encima de SMA200 (${sma200.toFixed(2)})` 
          : `Precio por debajo de SMA200 (${sma200.toFixed(2)})`,
        weight: 20,
      });
      totalWeightedScore += (priceAbove ? 100 : -100) * 20;
      totalWeight += 20;
    }

    if (sma50 !== null) {
      const priceAbove = currentPrice > sma50;
      signals.push({
        indicator: 'SMA50',
        signal: priceAbove ? 'bullish' : 'bearish',
        description: priceAbove 
          ? `Precio por encima de SMA50 (${sma50.toFixed(2)})` 
          : `Precio por debajo de SMA50 (${sma50.toFixed(2)})`,
        weight: 15,
      });
      totalWeightedScore += (priceAbove ? 100 : -100) * 15;
      totalWeight += 15;
    }

    // Señal de RSI
    if (rsi14 !== null) {
      let rsiSignalType: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let rsiScore = 0;
      
      if (rsi14 < 30) {
        rsiSignalType = 'bullish'; // Oversold = oportunidad de compra
        rsiScore = 50;
      } else if (rsi14 > 70) {
        rsiSignalType = 'bearish'; // Overbought = señal de venta
        rsiScore = -50;
      } else if (rsi14 < 45) {
        rsiScore = 25;
      } else if (rsi14 > 55) {
        rsiScore = -25;
      }
      
      signals.push({
        indicator: 'RSI14',
        signal: rsiSignalType,
        description: `RSI en ${rsi14.toFixed(1)} (${rsi14 < 30 ? 'sobreventa' : rsi14 > 70 ? 'sobrecompra' : 'neutral'})`,
        weight: 15,
      });
      totalWeightedScore += rsiScore * 15;
      totalWeight += 15;
    }

    // Señal de MACD
    if (macdResult.histogram !== null) {
      const macdBullish = macdResult.histogram > 0;
      signals.push({
        indicator: 'MACD',
        signal: macdBullish ? 'bullish' : 'bearish',
        description: macdBullish 
          ? `MACD positivo (${macdResult.histogram.toFixed(3)})` 
          : `MACD negativo (${macdResult.histogram.toFixed(3)})`,
        weight: 15,
      });
      totalWeightedScore += (macdBullish ? 100 : -100) * 15;
      totalWeight += 15;
    }

    // Señal de Bollinger
    if (bollinger.upper !== null && bollinger.lower !== null) {
      let bollingerSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let bollingerScore = 0;
      
      if (currentPrice <= bollinger.lower) {
        bollingerSignal = 'bullish'; // Cerca de banda inferior = posible rebote
        bollingerScore = 50;
      } else if (currentPrice >= bollinger.upper) {
        bollingerSignal = 'bearish'; // Cerca de banda superior = posible corrección
        bollingerScore = -50;
      }
      
      signals.push({
        indicator: 'Bollinger',
        signal: bollingerSignal,
        description: currentPrice <= bollinger.lower 
          ? 'Precio en banda inferior (posible rebote)'
          : currentPrice >= bollinger.upper 
            ? 'Precio en banda superior (posible corrección)'
            : 'Precio dentro de las bandas',
        weight: 10,
      });
      totalWeightedScore += bollingerScore * 10;
      totalWeight += 10;
    }

    // Señal de cruce dorado/mortal
    if (goldenCross) {
      signals.push({
        indicator: 'Golden Cross',
        signal: 'bullish',
        description: 'Cruce dorado detectado (SMA50 > SMA200)',
        weight: 20,
      });
      totalWeightedScore += 100 * 20;
      totalWeight += 20;
    }
    
    if (deathCross) {
      signals.push({
        indicator: 'Death Cross',
        signal: 'bearish',
        description: 'Cruce mortal detectado (SMA50 < SMA200)',
        weight: 20,
      });
      totalWeightedScore += -100 * 20;
      totalWeight += 20;
    }

    // Señal de volumen
    if (volumeRatio !== null) {
      let volumeSignalType: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (volumeRatio > 1.5) {
        // Alto volumen - refuerza la tendencia actual
        const priceTrend = close[close.length - 1] > close[close.length - 2];
        volumeSignalType = priceTrend ? 'bullish' : 'bearish';
        signals.push({
          indicator: 'Volumen',
          signal: volumeSignalType,
          description: `Volumen ${(volumeRatio * 100).toFixed(0)}% del promedio (alto)`,
          weight: 10,
        });
        totalWeightedScore += (priceTrend ? 50 : -50) * 10;
        totalWeight += 10;
      }
    }

    // Calcular score final
    const technicalScore = totalWeight > 0 
      ? Math.round(totalWeightedScore / totalWeight)
      : 0;

    // Determinar tendencia general
    let trend: TechnicalAnalysis['trend'] = 'neutral';
    if (technicalScore >= 50) trend = 'strong_bullish';
    else if (technicalScore >= 20) trend = 'bullish';
    else if (technicalScore <= -50) trend = 'strong_bearish';
    else if (technicalScore <= -20) trend = 'bearish';

    // Generar resumen
    const summary = this.generateSummary(signals, technicalScore, trend);

    return {
      currentPrice,
      sma20,
      sma50,
      sma200,
      ema12,
      ema26,
      goldenCross,
      deathCross,
      priceAboveSMA200: sma200 !== null ? currentPrice > sma200 : false,
      priceAboveSMA50: sma50 !== null ? currentPrice > sma50 : false,
      priceAboveSMA20: sma20 !== null ? currentPrice > sma20 : false,
      rsi14,
      rsiSignal: rsi14 === null ? 'neutral' : rsi14 < 30 ? 'oversold' : rsi14 > 70 ? 'overbought' : 'neutral',
      macd: macdResult.macd,
      macdSignal: macdResult.signal,
      macdHistogram: macdResult.histogram,
      macdTrend: macdResult.histogram === null ? 'neutral' : macdResult.histogram > 0 ? 'bullish' : 'bearish',
      bollingerUpper: bollinger.upper,
      bollingerMiddle: bollinger.middle,
      bollingerLower: bollinger.lower,
      bollingerPosition: bollinger.upper === null ? 'inside' 
        : currentPrice >= bollinger.upper ? 'above' 
        : currentPrice <= bollinger.lower ? 'below' 
        : 'inside',
      bollingerWidth: bollinger.width,
      avgVolume20,
      currentVolume,
      volumeRatio,
      volumeSignal: volumeRatio === null ? 'normal' : volumeRatio > 1.5 ? 'high' : volumeRatio < 0.5 ? 'low' : 'normal',
      technicalScore,
      signals,
      trend,
      summary,
      hasData: true,
    };
  }

  /**
   * Calcula SMA (Simple Moving Average)
   */
  private calculateSMA(data: number[], period: number): number | null {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  /**
   * Calcula EMA (Exponential Moving Average)
   */
  private calculateEMA(data: number[], period: number): number | null {
    if (data.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  /**
   * Calcula RSI (Relative Strength Index)
   */
  private calculateRSI(data: number[], period: number = 14): number | null {
    if (data.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    // Calcular ganancias y pérdidas iniciales
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calcula MACD (Moving Average Convergence Divergence)
   */
  private calculateMACD(data: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
    const ema12 = this.calculateEMA(data, 12);
    const ema26 = this.calculateEMA(data, 26);
    
    if (ema12 === null || ema26 === null) {
      return { macd: null, signal: null, histogram: null };
    }

    const macdLine = ema12 - ema26;
    
    // Para la línea de señal, necesitamos calcular EMA de los últimos valores MACD
    // Simplificamos usando una aproximación
    const macdValues: number[] = [];
    for (let i = 26; i < data.length; i++) {
      const e12 = this.calculateEMAAtIndex(data, 12, i);
      const e26 = this.calculateEMAAtIndex(data, 26, i);
      if (e12 !== null && e26 !== null) {
        macdValues.push(e12 - e26);
      }
    }
    
    const signal = macdValues.length >= 9 
      ? this.calculateEMA(macdValues, 9)
      : null;
    
    const histogram = signal !== null ? macdLine - signal : null;

    return { macd: macdLine, signal, histogram };
  }

  /**
   * Calcula EMA hasta un índice específico
   */
  private calculateEMAAtIndex(data: number[], period: number, endIndex: number): number | null {
    if (endIndex < period) return null;
    
    const slice = data.slice(0, endIndex + 1);
    return this.calculateEMA(slice, period);
  }

  /**
   * Calcula Bandas de Bollinger
   */
  private calculateBollingerBands(data: number[], period: number = 20, stdDev: number = 2): {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    width: number | null;
  } {
    const sma = this.calculateSMA(data, period);
    if (sma === null) {
      return { upper: null, middle: null, lower: null, width: null };
    }

    const slice = data.slice(-period);
    const squaredDiffs = slice.map(val => Math.pow(val - sma, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    const upper = sma + (standardDeviation * stdDev);
    const lower = sma - (standardDeviation * stdDev);
    const width = ((upper - lower) / sma) * 100; // Ancho como porcentaje

    return { upper, middle: sma, lower, width };
  }

  /**
   * Detecta cruces de medias móviles
   */
  private detectCross(data: number[], shortPeriod: number, longPeriod: number, type: 'golden' | 'death'): boolean {
    if (data.length < longPeriod + 5) return false;

    // Calcular SMAs actuales
    const shortSMA = this.calculateSMA(data, shortPeriod);
    const longSMA = this.calculateSMA(data, longPeriod);
    
    // Calcular SMAs de hace 5 días
    const dataMinusN = data.slice(0, -5);
    const shortSMAPrev = this.calculateSMA(dataMinusN, shortPeriod);
    const longSMAPrev = this.calculateSMA(dataMinusN, longPeriod);

    if (!shortSMA || !longSMA || !shortSMAPrev || !longSMAPrev) return false;

    if (type === 'golden') {
      // Golden Cross: SMA corta cruza por encima de SMA larga
      return shortSMAPrev <= longSMAPrev && shortSMA > longSMA;
    } else {
      // Death Cross: SMA corta cruza por debajo de SMA larga
      return shortSMAPrev >= longSMAPrev && shortSMA < longSMA;
    }
  }

  /**
   * Genera un resumen de los indicadores técnicos
   */
  private generateSummary(signals: TechnicalSignal[], score: number, trend: TechnicalAnalysis['trend']): string {
    const bullishSignals = signals.filter(s => s.signal === 'bullish').length;
    const bearishSignals = signals.filter(s => s.signal === 'bearish').length;

    const trendText = {
      'strong_bullish': 'Tendencia fuertemente alcista',
      'bullish': 'Tendencia alcista',
      'neutral': 'Tendencia neutral',
      'bearish': 'Tendencia bajista',
      'strong_bearish': 'Tendencia fuertemente bajista',
    }[trend];

    const signalSummary = signals
      .filter(s => s.signal !== 'neutral')
      .slice(0, 3)
      .map(s => s.description)
      .join('. ');

    return `${trendText}. ${bullishSignals} señales alcistas, ${bearishSignals} bajistas. ${signalSummary || 'Sin señales destacadas.'}`;
  }

  /**
   * Crea un análisis vacío cuando no hay datos
   */
  private createEmptyAnalysis(): TechnicalAnalysis {
    return {
      currentPrice: 0,
      sma20: null,
      sma50: null,
      sma200: null,
      ema12: null,
      ema26: null,
      goldenCross: false,
      deathCross: false,
      priceAboveSMA200: false,
      priceAboveSMA50: false,
      priceAboveSMA20: false,
      rsi14: null,
      rsiSignal: 'neutral',
      macd: null,
      macdSignal: null,
      macdHistogram: null,
      macdTrend: 'neutral',
      bollingerUpper: null,
      bollingerMiddle: null,
      bollingerLower: null,
      bollingerPosition: 'inside',
      bollingerWidth: null,
      avgVolume20: null,
      currentVolume: null,
      volumeRatio: null,
      volumeSignal: 'normal',
      technicalScore: 0,
      signals: [],
      trend: 'neutral',
      summary: 'No hay datos suficientes para análisis técnico',
      hasData: false,
    };
  }
}

export const technicalIndicatorsService = new TechnicalIndicatorsService();
