/**
 * Technical Indicators Service - MEJORADO
 * Calcula indicadores técnicos: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic
 * Incluye detección de soportes/resistencias y divergencias
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
  rsiDivergence: 'bullish' | 'bearish' | 'none';
  
  // MACD
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdTrend: 'bullish' | 'bearish' | 'neutral';
  macdCrossover: 'bullish_cross' | 'bearish_cross' | 'none';
  
  // Bollinger Bands
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: 'above' | 'below' | 'inside';
  bollingerWidth: number | null;
  bollingerSqueeze: boolean;
  
  // Stochastic
  stochasticK: number | null;
  stochasticD: number | null;
  stochasticSignal: 'oversold' | 'overbought' | 'neutral';
  
  // ATR - Average True Range
  atr14: number | null;
  atrPercent: number | null;
  volatilityLevel: 'high' | 'medium' | 'low';
  
  // Soporte/Resistencia
  nearestSupport: number | null;
  nearestResistance: number | null;
  distanceToSupport: number | null;
  distanceToResistance: number | null;
  
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
  dataQuality: 'high' | 'medium' | 'low';
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
      
      const history = await yahooService.getHistory(symbol, '1y', '1d');
      
      if (!history || history.length < 20) {
        return this.createEmptyAnalysis();
      }

      const closes = history.map(h => h.close).filter(c => c !== null) as number[];
      const highs = history.map(h => h.high).filter(h => h !== null) as number[];
      const lows = history.map(h => h.low).filter(l => l !== null) as number[];
      const volumes = history.map(h => h.volume).filter(v => v !== null) as number[];
      
      const analysis = this.calculateAllIndicators(closes, highs, lows, volumes);
      
      cache.set(cacheKey, { data: analysis, expiresAt: Date.now() + CACHE_TTL });
      
      return analysis;
    } catch (error) {
      logger.error(`[Technical] Error analyzing ${symbol}:`, error);
      return this.createEmptyAnalysis();
    }
  },

  calculateAllIndicators(closes: number[], highs: number[], lows: number[], volumes: number[]): TechnicalAnalysis {
    const currentPrice = closes[closes.length - 1];
    const currentVolume = volumes[volumes.length - 1] || 0;

    // Calcular indicadores básicos
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

    // Nuevos indicadores
    const stochastic = this.calculateStochastic(closes, highs, lows, 14, 3);
    const atr14 = this.calculateATR(closes, highs, lows, 14);
    const atrPercent = atr14 && currentPrice > 0 ? (atr14 / currentPrice) * 100 : null;
    const supportResistance = this.calculateSupportResistance(closes, highs, lows);
    
    // Detectar cruces
    const goldenCross = sma50 !== null && sma200 !== null && this.detectGoldenCross(closes, 50, 200);
    const deathCross = sma50 !== null && sma200 !== null && this.detectDeathCross(closes, 50, 200);
    const macdCrossover = this.detectMACDCrossover(closes);
    const rsiDivergence = this.detectRSIDivergence(closes, 14);
    const bollingerSqueeze = bollinger.width !== null && bollinger.width < 10;
    
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

    // Stochastic signal
    let stochasticSignal: 'oversold' | 'overbought' | 'neutral' = 'neutral';
    if (stochastic.k !== null) {
      if (stochastic.k < 20) stochasticSignal = 'oversold';
      else if (stochastic.k > 80) stochasticSignal = 'overbought';
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

    // Volatility level
    let volatilityLevel: 'high' | 'medium' | 'low' = 'medium';
    if (atrPercent !== null) {
      if (atrPercent > 4) volatilityLevel = 'high';
      else if (atrPercent < 1.5) volatilityLevel = 'low';
    }

    // Distancia a soporte/resistencia
    const distanceToSupport = supportResistance.support && currentPrice > 0
      ? ((currentPrice - supportResistance.support) / currentPrice) * 100
      : null;
    const distanceToResistance = supportResistance.resistance && currentPrice > 0
      ? ((supportResistance.resistance - currentPrice) / currentPrice) * 100
      : null;

    // Calcular señales y score
    const signals = this.generateSignals({
      currentPrice, sma20, sma50, sma200, rsi14, rsiSignal, rsiDivergence,
      macdTrend, macdCrossover, goldenCross, deathCross, 
      bollingerPosition, bollingerSqueeze, volumeSignal,
      stochasticSignal, distanceToSupport, distanceToResistance, volatilityLevel
    });
    
    const technicalScore = this.calculateScore(signals);
    const trend = this.determineTrend(technicalScore);
    const summary = this.generateSummary(trend, signals, volatilityLevel, rsi14, stochastic.k);

    const dataQuality: 'high' | 'medium' | 'low' = 
      closes.length >= 200 ? 'high' :
      closes.length >= 50 ? 'medium' : 'low';

    return {
      currentPrice,
      sma20, sma50, sma200,
      ema12, ema26,
      goldenCross, deathCross,
      priceAboveSMA200, priceAboveSMA50, priceAboveSMA20,
      rsi14, rsiSignal, rsiDivergence,
      macd: macdResult.macd,
      macdSignal: macdResult.signal,
      macdHistogram: macdResult.histogram,
      macdTrend, macdCrossover,
      bollingerUpper: bollinger.upper,
      bollingerMiddle: bollinger.middle,
      bollingerLower: bollinger.lower,
      bollingerPosition,
      bollingerWidth: bollinger.width,
      bollingerSqueeze,
      stochasticK: stochastic.k,
      stochasticD: stochastic.d,
      stochasticSignal,
      atr14,
      atrPercent,
      volatilityLevel,
      nearestSupport: supportResistance.support,
      nearestResistance: supportResistance.resistance,
      distanceToSupport,
      distanceToResistance,
      avgVolume20,
      currentVolume,
      volumeRatio,
      volumeSignal,
      technicalScore,
      signals,
      trend,
      summary,
      hasData: true,
      dataQuality,
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

  calculateStochastic(closes: number[], highs: number[], lows: number[], period: number, smoothK: number): { k: number | null; d: number | null } {
    if (closes.length < period || highs.length < period || lows.length < period) {
      return { k: null, d: null };
    }

    const kValues: number[] = [];
    for (let i = period - 1; i < closes.length; i++) {
      const highSlice = highs.slice(i - period + 1, i + 1);
      const lowSlice = lows.slice(i - period + 1, i + 1);
      const highest = Math.max(...highSlice);
      const lowest = Math.min(...lowSlice);
      
      if (highest === lowest) {
        kValues.push(50);
      } else {
        const k = ((closes[i] - lowest) / (highest - lowest)) * 100;
        kValues.push(k);
      }
    }

    if (kValues.length < smoothK) {
      return { k: kValues[kValues.length - 1] || null, d: null };
    }

    const smoothedK = this.calculateSMA(kValues, smoothK);
    const d = kValues.length >= smoothK * 2 
      ? this.calculateSMA(kValues.slice(-smoothK * 2), smoothK)
      : smoothedK;

    return { k: smoothedK, d };
  },

  calculateATR(closes: number[], highs: number[], lows: number[], period: number): number | null {
    if (closes.length < period + 1) return null;

    const trueRanges: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    return this.calculateEMA(trueRanges, period);
  },

  calculateSupportResistance(closes: number[], highs: number[], lows: number[]): { support: number | null; resistance: number | null } {
    if (closes.length < 20) return { support: null, resistance: null };

    const currentPrice = closes[closes.length - 1];
    const recentLows = lows.slice(-60).sort((a, b) => a - b);
    const recentHighs = highs.slice(-60).sort((a, b) => b - a);

    let support: number | null = null;
    for (const low of recentLows) {
      if (low < currentPrice * 0.98) {
        support = low;
        break;
      }
    }

    let resistance: number | null = null;
    for (const high of recentHighs) {
      if (high > currentPrice * 1.02) {
        resistance = high;
        break;
      }
    }

    return { support, resistance };
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

  detectMACDCrossover(closes: number[]): 'bullish_cross' | 'bearish_cross' | 'none' {
    if (closes.length < 30) return 'none';

    const current = this.calculateMACD(closes);
    const previous = this.calculateMACD(closes.slice(0, -1));

    if (!current.macd || !current.signal || !previous.macd || !previous.signal) {
      return 'none';
    }

    if (previous.macd <= previous.signal && current.macd > current.signal) {
      return 'bullish_cross';
    }
    if (previous.macd >= previous.signal && current.macd < current.signal) {
      return 'bearish_cross';
    }

    return 'none';
  },

  detectRSIDivergence(closes: number[], period: number): 'bullish' | 'bearish' | 'none' {
    if (closes.length < period + 20) return 'none';

    const recentCloses = closes.slice(-10);
    const previousCloses = closes.slice(-20, -10);
    
    const recentRSI = this.calculateRSI(closes, period);
    const previousRSI = this.calculateRSI(closes.slice(0, -10), period);

    if (recentRSI === null || previousRSI === null) return 'none';

    const recentLow = Math.min(...recentCloses);
    const previousLow = Math.min(...previousCloses);
    const recentHigh = Math.max(...recentCloses);
    const previousHigh = Math.max(...previousCloses);

    if (recentLow < previousLow && recentRSI > previousRSI) {
      return 'bullish';
    }

    if (recentHigh > previousHigh && recentRSI < previousRSI) {
      return 'bearish';
    }

    return 'none';
  },

  generateSignals(data: any): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];

    // RSI
    if (data.rsiSignal === 'oversold') {
      signals.push({ indicator: 'RSI', signal: 'bullish', description: 'RSI en sobreventa (<30)', weight: 15 });
    } else if (data.rsiSignal === 'overbought') {
      signals.push({ indicator: 'RSI', signal: 'bearish', description: 'RSI en sobrecompra (>70)', weight: 15 });
    }

    // RSI Divergence
    if (data.rsiDivergence === 'bullish') {
      signals.push({ indicator: 'RSI', signal: 'bullish', description: 'Divergencia alcista RSI', weight: 12 });
    } else if (data.rsiDivergence === 'bearish') {
      signals.push({ indicator: 'RSI', signal: 'bearish', description: 'Divergencia bajista RSI', weight: 12 });
    }

    // Stochastic
    if (data.stochasticSignal === 'oversold') {
      signals.push({ indicator: 'Stochastic', signal: 'bullish', description: 'Stochastic en sobreventa (<20)', weight: 10 });
    } else if (data.stochasticSignal === 'overbought') {
      signals.push({ indicator: 'Stochastic', signal: 'bearish', description: 'Stochastic en sobrecompra (>80)', weight: 10 });
    }

    // MACD
    if (data.macdTrend === 'bullish') {
      signals.push({ indicator: 'MACD', signal: 'bullish', description: 'MACD positivo', weight: 15 });
    } else if (data.macdTrend === 'bearish') {
      signals.push({ indicator: 'MACD', signal: 'bearish', description: 'MACD negativo', weight: 15 });
    }

    // MACD Crossover
    if (data.macdCrossover === 'bullish_cross') {
      signals.push({ indicator: 'MACD', signal: 'bullish', description: 'Cruce alcista MACD', weight: 18 });
    } else if (data.macdCrossover === 'bearish_cross') {
      signals.push({ indicator: 'MACD', signal: 'bearish', description: 'Cruce bajista MACD', weight: 18 });
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

    // Bollinger Squeeze
    if (data.bollingerSqueeze) {
      signals.push({ indicator: 'Bollinger', signal: 'neutral', description: 'Squeeze: volatilidad baja', weight: 5 });
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

    // Soporte/Resistencia
    if (data.distanceToSupport !== null && data.distanceToSupport < 3) {
      signals.push({ indicator: 'Support', signal: 'bullish', description: `Cerca de soporte (${data.distanceToSupport.toFixed(1)}%)`, weight: 8 });
    }
    if (data.distanceToResistance !== null && data.distanceToResistance < 3) {
      signals.push({ indicator: 'Resistance', signal: 'bearish', description: `Cerca de resistencia (${data.distanceToResistance.toFixed(1)}%)`, weight: 8 });
    }

    // Volatilidad
    if (data.volatilityLevel === 'high') {
      signals.push({ indicator: 'ATR', signal: 'neutral', description: 'Alta volatilidad - mayor riesgo', weight: 3 });
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

  generateSummary(trend: string, signals: TechnicalSignal[], volatility: string, rsi: number | null, stochK: number | null): string {
    const bullish = signals.filter(s => s.signal === 'bullish').length;
    const bearish = signals.filter(s => s.signal === 'bearish').length;
    
    const trendEmoji: Record<string, string> = {
      'strong_bullish': '🚀',
      'bullish': '📈',
      'neutral': '➡️',
      'bearish': '📉',
      'strong_bearish': '🔻',
    };
    
    const trendText: Record<string, string> = {
      'strong_bullish': 'Fuertemente alcista',
      'bullish': 'Alcista',
      'neutral': 'Neutral',
      'bearish': 'Bajista',
      'strong_bearish': 'Fuertemente bajista',
    };
    
    let summary = `${trendEmoji[trend] || ''} ${trendText[trend] || 'Indefinido'}. `;
    summary += `${bullish} señales alcistas, ${bearish} bajistas.`;
    
    if (rsi !== null && (rsi < 30 || rsi > 70)) {
      summary += ` RSI: ${rsi.toFixed(0)}${rsi < 30 ? ' (sobreventa)' : ' (sobrecompra)'}.`;
    }
    
    if (stochK !== null && (stochK < 20 || stochK > 80)) {
      summary += ` Stoch: ${stochK.toFixed(0)}${stochK < 20 ? ' (sobreventa)' : ' (sobrecompra)'}.`;
    }
    
    if (volatility === 'high') {
      summary += ' ⚠️ Alta volatilidad.';
    }
    
    return summary;
  },

  createEmptyAnalysis(): TechnicalAnalysis {
    return {
      currentPrice: 0,
      sma20: null, sma50: null, sma200: null,
      ema12: null, ema26: null,
      goldenCross: false, deathCross: false,
      priceAboveSMA200: false, priceAboveSMA50: false, priceAboveSMA20: false,
      rsi14: null, rsiSignal: 'neutral', rsiDivergence: 'none',
      macd: null, macdSignal: null, macdHistogram: null, macdTrend: 'neutral', macdCrossover: 'none',
      bollingerUpper: null, bollingerMiddle: null, bollingerLower: null,
      bollingerPosition: 'inside', bollingerWidth: null, bollingerSqueeze: false,
      stochasticK: null, stochasticD: null, stochasticSignal: 'neutral',
      atr14: null, atrPercent: null, volatilityLevel: 'medium',
      nearestSupport: null, nearestResistance: null,
      distanceToSupport: null, distanceToResistance: null,
      avgVolume20: null, currentVolume: null, volumeRatio: null, volumeSignal: 'normal',
      technicalScore: 0,
      signals: [],
      trend: 'neutral',
      summary: '❓ Sin datos suficientes para análisis técnico',
      hasData: false,
      dataQuality: 'low',
    };
  },
};
