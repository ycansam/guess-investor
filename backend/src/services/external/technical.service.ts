/**
 * Technical Indicators Service
 * Calcula indicadores técnicos: SMA, EMA, RSI, MACD, Bollinger Bands
 */

import { logger } from '../../middleware/logger.js';
import { yahooService } from './yahoo.service.js';

export interface TechnicalAnalysis {
  currentPrice: number;
  
  // Medias móviles
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  
  // Señales de cruce
  goldenCross: boolean;
  deathCross: boolean;
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
  
  // Bollinger Bands
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: 'above' | 'below' | 'inside';
  bollingerWidth: number | null;
  
  // Volumen
  avgVolume20: number | null;
  currentVolume: number | null;
  volumeRatio: number | null;
  volumeSignal: 'high' | 'low' | 'normal';
  
  // Score técnico combinado (-100 a +100)
  technicalScore: number;
  signals: TechnicalSignal[];
  trend: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  summary: string;
  hasData: boolean;
}

export interface TechnicalSignal {
  indicator: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  description: string;
  weight: number;
}

// Cache en memoria
const cache = new Map<string, { data: TechnicalAnalysis; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getCached(key: string): TechnicalAnalysis | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

export const technicalService = {
  async analyze(symbol: string): Promise<TechnicalAnalysis> {
    const cacheKey = `technical:${symbol}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      logger.info(`[Technical] Analyzing ${symbol}`);
      
      // Obtener datos históricos de 1 año
      const history = await yahooService.getHistory(symbol, '1y', '1d');
      
      if (!history || history.length < 20) {
        return this.createEmptyAnalysis();
      }

      const closes = history.map(h => h.close).filter(c => c !== null) as number[];
      const volumes = history.map(h => h.volume).filter(v => v !== null) as number[];
      
      const analysis = this.calculateAllIndicators(closes, volumes);
      
      cache.set(cacheKey, { data: analysis, expiresAt: Date.now() + CACHE_TTL });
      
      return analysis;
    } catch (error) {
      logger.error(`[Technical] Error analyzing ${symbol}:`, error);
      return this.createEmptyAnalysis();
    }
  },

  calculateAllIndicators(closes: number[], volumes: number[]): TechnicalAnalysis {
    const currentPrice = closes[closes.length - 1];
    const currentVolume = volumes[volumes.length - 1] || 0;

    // Calcular indicadores
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = this.calculateSMA(closes, 50);
    const sma200 = this.calculateSMA(closes, 200);
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const rsi14 = this.calculateRSI(closes, 14);
    const macdResult = this.calculateMACD(closes);
    const bollinger = this.calculateBollingerBands(closes, 20, 2);
    const avgVolume20 = this.calculateSMA(volumes, 20);
    const volumeRatio = avgVolume20 ? currentVolume / avgVolume20 : null;

    // Detectar cruces
    const goldenCross = sma50 !== null && sma200 !== null && this.detectGoldenCross(closes, 50, 200);
    const deathCross = sma50 !== null && sma200 !== null && this.detectDeathCross(closes, 50, 200);
    
    // Posiciones
    const priceAboveSMA200 = sma200 !== null && currentPrice > sma200;
    const priceAboveSMA50 = sma50 !== null && currentPrice > sma50;
    const priceAboveSMA20 = sma20 !== null && currentPrice > sma20;

    // RSI signal
    let rsiSignal: 'oversold' | 'overbought' | 'neutral' = 'neutral';
    if (rsi14 !== null) {
      if (rsi14 < 30) rsiSignal = 'oversold';
      else if (rsi14 > 70) rsiSignal = 'overbought';
    }

    // MACD trend
    let macdTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (macdResult.histogram !== null) {
      if (macdResult.histogram > 0) macdTrend = 'bullish';
      else if (macdResult.histogram < 0) macdTrend = 'bearish';
    }

    // Bollinger position
    let bollingerPosition: 'above' | 'below' | 'inside' = 'inside';
    if (bollinger.upper !== null && bollinger.lower !== null) {
      if (currentPrice > bollinger.upper) bollingerPosition = 'above';
      else if (currentPrice < bollinger.lower) bollingerPosition = 'below';
    }

    // Volume signal
    let volumeSignal: 'high' | 'low' | 'normal' = 'normal';
    if (volumeRatio !== null) {
      if (volumeRatio > 1.5) volumeSignal = 'high';
      else if (volumeRatio < 0.5) volumeSignal = 'low';
    }

    // Calcular señales y score
    const signals = this.generateSignals({
      currentPrice, sma20, sma50, sma200, rsi14, rsiSignal,
      macdTrend, goldenCross, deathCross, bollingerPosition, volumeSignal
    });
    
    const technicalScore = this.calculateScore(signals);
    const trend = this.determineTrend(technicalScore);
    const summary = this.generateSummary(trend, signals);

    return {
      currentPrice,
      sma20, sma50, sma200,
      ema12, ema26,
      goldenCross, deathCross,
      priceAboveSMA200, priceAboveSMA50, priceAboveSMA20,
      rsi14, rsiSignal,
      macd: macdResult.macd,
      macdSignal: macdResult.signal,
      macdHistogram: macdResult.histogram,
      macdTrend,
      bollingerUpper: bollinger.upper,
      bollingerMiddle: bollinger.middle,
      bollingerLower: bollinger.lower,
      bollingerPosition,
      bollingerWidth: bollinger.width,
      avgVolume20,
      currentVolume,
      volumeRatio,
      volumeSignal,
      technicalScore,
      signals,
      trend,
      summary,
      hasData: true,
    };
  },

  calculateSMA(data: number[], period: number): number | null {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  },

  calculateEMA(data: number[], period: number): number | null {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  },

  calculateRSI(closes: number[], period: number): number | null {
    if (closes.length < period + 1) return null;
    
    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    
    const recentChanges = changes.slice(-period);
    let gains = 0, losses = 0;
    
    for (const change of recentChanges) {
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  },

  calculateMACD(closes: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    
    if (ema12 === null || ema26 === null) {
      return { macd: null, signal: null, histogram: null };
    }
    
    const macd = ema12 - ema26;
    
    // Calcular EMA de 9 períodos del MACD (señal)
    const macdHistory: number[] = [];
    for (let i = 26; i < closes.length; i++) {
      const e12 = this.calculateEMAAt(closes, 12, i);
      const e26 = this.calculateEMAAt(closes, 26, i);
      if (e12 !== null && e26 !== null) {
        macdHistory.push(e12 - e26);
      }
    }
    
    const signal = macdHistory.length >= 9 ? this.calculateEMA(macdHistory, 9) : null;
    const histogram = signal !== null ? macd - signal : null;
    
    return { macd, signal, histogram };
  },

  calculateEMAAt(data: number[], period: number, endIndex: number): number | null {
    if (endIndex < period) return null;
    const slice = data.slice(0, endIndex + 1);
    return this.calculateEMA(slice, period);
  },

  calculateBollingerBands(closes: number[], period: number, stdDev: number): {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    width: number | null;
  } {
    const middle = this.calculateSMA(closes, period);
    if (middle === null) return { upper: null, middle: null, lower: null, width: null };
    
    const slice = closes.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    const upper = middle + std * stdDev;
    const lower = middle - std * stdDev;
    const width = (upper - lower) / middle * 100;
    
    return { upper, middle, lower, width };
  },

  detectGoldenCross(closes: number[], shortPeriod: number, longPeriod: number): boolean {
    if (closes.length < longPeriod + 2) return false;
    
    const currentShort = this.calculateSMA(closes, shortPeriod);
    const currentLong = this.calculateSMA(closes, longPeriod);
    const prevShort = this.calculateSMA(closes.slice(0, -1), shortPeriod);
    const prevLong = this.calculateSMA(closes.slice(0, -1), longPeriod);
    
    if (!currentShort || !currentLong || !prevShort || !prevLong) return false;
    
    return prevShort <= prevLong && currentShort > currentLong;
  },

  detectDeathCross(closes: number[], shortPeriod: number, longPeriod: number): boolean {
    if (closes.length < longPeriod + 2) return false;
    
    const currentShort = this.calculateSMA(closes, shortPeriod);
    const currentLong = this.calculateSMA(closes, longPeriod);
    const prevShort = this.calculateSMA(closes.slice(0, -1), shortPeriod);
    const prevLong = this.calculateSMA(closes.slice(0, -1), longPeriod);
    
    if (!currentShort || !currentLong || !prevShort || !prevLong) return false;
    
    return prevShort >= prevLong && currentShort < currentLong;
  },

  generateSignals(data: any): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];

    // RSI
    if (data.rsiSignal === 'oversold') {
      signals.push({ indicator: 'RSI', signal: 'bullish', description: 'RSI en sobreventa (<30)', weight: 15 });
    } else if (data.rsiSignal === 'overbought') {
      signals.push({ indicator: 'RSI', signal: 'bearish', description: 'RSI en sobrecompra (>70)', weight: 15 });
    }

    // MACD
    if (data.macdTrend === 'bullish') {
      signals.push({ indicator: 'MACD', signal: 'bullish', description: 'MACD positivo', weight: 20 });
    } else if (data.macdTrend === 'bearish') {
      signals.push({ indicator: 'MACD', signal: 'bearish', description: 'MACD negativo', weight: 20 });
    }

    // Golden/Death Cross
    if (data.goldenCross) {
      signals.push({ indicator: 'SMA', signal: 'bullish', description: 'Golden Cross (SMA50 > SMA200)', weight: 25 });
    }
    if (data.deathCross) {
      signals.push({ indicator: 'SMA', signal: 'bearish', description: 'Death Cross (SMA50 < SMA200)', weight: 25 });
    }

    // Bollinger
    if (data.bollingerPosition === 'below') {
      signals.push({ indicator: 'Bollinger', signal: 'bullish', description: 'Precio bajo banda inferior', weight: 10 });
    } else if (data.bollingerPosition === 'above') {
      signals.push({ indicator: 'Bollinger', signal: 'bearish', description: 'Precio sobre banda superior', weight: 10 });
    }

    // Volume
    if (data.volumeSignal === 'high') {
      signals.push({ indicator: 'Volume', signal: 'neutral', description: 'Volumen alto (confirma movimiento)', weight: 5 });
    }

    // SMA Position
    if (data.sma200 !== null && data.currentPrice > data.sma200) {
      signals.push({ indicator: 'SMA200', signal: 'bullish', description: 'Precio por encima de SMA200', weight: 15 });
    } else if (data.sma200 !== null) {
      signals.push({ indicator: 'SMA200', signal: 'bearish', description: 'Precio por debajo de SMA200', weight: 15 });
    }

    return signals;
  },

  calculateScore(signals: TechnicalSignal[]): number {
    let score = 0;
    for (const signal of signals) {
      if (signal.signal === 'bullish') score += signal.weight;
      else if (signal.signal === 'bearish') score -= signal.weight;
    }
    return Math.max(-100, Math.min(100, score));
  },

  determineTrend(score: number): 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish' {
    if (score >= 50) return 'strong_bullish';
    if (score >= 20) return 'bullish';
    if (score <= -50) return 'strong_bearish';
    if (score <= -20) return 'bearish';
    return 'neutral';
  },

  generateSummary(trend: string, signals: TechnicalSignal[]): string {
    const bullish = signals.filter(s => s.signal === 'bullish').length;
    const bearish = signals.filter(s => s.signal === 'bearish').length;
    
    const trendText = {
      'strong_bullish': 'Tendencia fuertemente alcista',
      'bullish': 'Tendencia alcista',
      'neutral': 'Tendencia neutral',
      'bearish': 'Tendencia bajista',
      'strong_bearish': 'Tendencia fuertemente bajista',
    }[trend] || 'Tendencia indefinida';
    
    return `${trendText}. ${bullish} señales alcistas, ${bearish} bajistas.`;
  },

  createEmptyAnalysis(): TechnicalAnalysis {
    return {
      currentPrice: 0,
      sma20: null, sma50: null, sma200: null,
      ema12: null, ema26: null,
      goldenCross: false, deathCross: false,
      priceAboveSMA200: false, priceAboveSMA50: false, priceAboveSMA20: false,
      rsi14: null, rsiSignal: 'neutral',
      macd: null, macdSignal: null, macdHistogram: null, macdTrend: 'neutral',
      bollingerUpper: null, bollingerMiddle: null, bollingerLower: null,
      bollingerPosition: 'inside', bollingerWidth: null,
      avgVolume20: null, currentVolume: null, volumeRatio: null, volumeSignal: 'normal',
      technicalScore: 0,
      signals: [],
      trend: 'neutral',
      summary: 'Sin datos suficientes para análisis técnico',
      hasData: false,
    };
  },
};
