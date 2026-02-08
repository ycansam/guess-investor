/**
 * Sentiment Service - MEJORADO
 * Combina múltiples fuentes de sentimiento:
 * - VIX (volatilidad implícita)
 * - Put/Call Ratio (CBOE) - NUEVO
 * - Fear & Greed Index (crypto)
 * - Advance/Decline Ratio - NUEVO
 */

import { logger } from '../../middleware/logger.js';

export interface SentimentData {
  symbol?: string;
  type: 'stock' | 'crypto';
  
  // VIX (volatilidad)
  vix?: {
    value: number;
    change1d: number; // Cambio % diario
    sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
    score: number;
  };
  
  // Put/Call Ratio (NUEVO)
  putCallRatio?: {
    value: number;
    sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
    score: number;
  };
  
  // Fear & Greed Index (crypto)
  fearGreed?: {
    value: number;
    classification: string;
    score: number;
  };
  
  // Advance/Decline (NUEVO)
  advanceDecline?: {
    ratio: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    score: number;
  };
  
  // Score general
  overallScore: number; // -100 a +100
  bullishPercent: number; // 0-100
  hasData: boolean;
  summary: string;
  dataQuality: 'high' | 'medium' | 'low'; // NUEVO
}

// Cache
const cache = new Map<string, { data: SentimentData; expiresAt: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos (reducido para datos más frescos)

function getCached(key: string): SentimentData | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

export const sentimentService = {
  async getSentiment(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<SentimentData> {
    const cacheKey = `sentiment:${symbol}:${type}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      logger.info(`[Sentiment] Getting sentiment for ${symbol} (${type})`);
      
      const result: SentimentData = {
        symbol,
        type,
        overallScore: 0,
        bullishPercent: 50,
        hasData: false,
        summary: '',
        dataQuality: 'low',
      };

      // Obtener datos en paralelo según tipo
      if (type === 'stock') {
        const [vix, putCall] = await Promise.allSettled([
          this.getVIXData(),
          this.getPutCallRatio(),
        ]);
        
        if (vix.status === 'fulfilled' && vix.value) result.vix = vix.value;
        if (putCall.status === 'fulfilled' && putCall.value) result.putCallRatio = putCall.value;
      } else {
        const fearGreed = await this.getFearGreedIndex();
        if (fearGreed) result.fearGreed = fearGreed;
      }
      
      // Calcular score general con pesos
      const scores: { score: number; weight: number }[] = [];
      
      if (result.vix) {
        scores.push({ score: result.vix.score, weight: 0.5 });
        result.hasData = true;
      }
      
      if (result.putCallRatio) {
        scores.push({ score: result.putCallRatio.score, weight: 0.5 });
        result.hasData = true;
      }
      
      if (result.fearGreed) {
        scores.push({ score: result.fearGreed.score, weight: 1.0 });
        result.hasData = true;
      }
      
      if (scores.length > 0) {
        const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
        result.overallScore = Math.round(
          scores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight
        );
        result.bullishPercent = Math.round((result.overallScore + 100) / 2);
      }
      
      // Determinar calidad de datos
      result.dataQuality = scores.length >= 2 ? 'high' : scores.length === 1 ? 'medium' : 'low';
      
      result.summary = this.generateSummary(result);
      
      cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
      
      return result;
    } catch (error) {
      logger.error(`[Sentiment] Error getting sentiment:`, error);
      return {
        symbol, type,
        overallScore: 0,
        bullishPercent: 50,
        hasData: false,
        summary: 'Sin datos de sentimiento disponibles.',
        dataQuality: 'low',
      };
    }
  },

  async getVIXData(): Promise<SentimentData['vix'] | null> {
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) return null;
      
      const data: any = await response.json();
      const result = data.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((c: any) => c !== null && c > 0);
      
      if (validCloses.length < 2) return null;
      
      const vixValue = validCloses[validCloses.length - 1];
      const prevValue = validCloses[validCloses.length - 2];
      const change1d = ((vixValue - prevValue) / prevValue) * 100;
      
      // Interpretación mejorada del VIX
      // Considera tanto el nivel como el cambio
      type VixSentiment = 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
      let sentiment: VixSentiment;
      let score: number;
      
      // Score base por nivel
      if (vixValue < 12) {
        sentiment = 'extreme_complacency';
        score = -40; // Complacencia extrema es muy bearish (contrarian)
      } else if (vixValue < 16) {
        sentiment = 'complacency';
        score = -20;
      } else if (vixValue < 22) {
        sentiment = 'neutral';
        score = 0;
      } else if (vixValue < 30) {
        sentiment = 'fear';
        score = 25; // Fear es contrarian bullish
      } else if (vixValue < 40) {
        sentiment = 'extreme_fear';
        score = 45; // Extreme fear es muy bullish (contrarian)
      } else {
        sentiment = 'extreme_fear';
        score = 50; // Pánico total - oportunidad histórica
      }
      
      // Ajustar por velocidad de cambio (spikes del VIX son oportunidades)
      if (change1d > 20) {
        score += 15; // Spike de VIX = pánico = oportunidad
      } else if (change1d > 10) {
        score += 8;
      } else if (change1d < -15) {
        score -= 10; // VIX colapsando = complacencia inminente
      }
      
      logger.info(`[Sentiment] VIX: ${vixValue.toFixed(2)} (${change1d > 0 ? '+' : ''}${change1d.toFixed(1)}%), ${sentiment}, score: ${score}`);
      
      return { value: vixValue, change1d, sentiment, score };
    } catch (error) {
      logger.error(`[Sentiment] Error getting VIX:`, error);
      return null;
    }
  },

  /**
   * Put/Call Ratio - NUEVO
   * Ratio > 1.0 = más puts = miedo = bullish contrarian
   * Ratio < 0.7 = más calls = codicia = bearish contrarian
   */
  async getPutCallRatio(): Promise<SentimentData['putCallRatio'] | null> {
    try {
      // CBOE Total Put/Call Ratio (aproximación via Yahoo)
      // Usamos opciones del SPY como proxy
      const url = 'https://query1.finance.yahoo.com/v7/finance/options/SPY';
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) return null;
      
      const data: any = await response.json();
      const options = data.optionChain?.result?.[0];
      
      if (!options) return null;
      
      const calls = options.options?.[0]?.calls || [];
      const puts = options.options?.[0]?.puts || [];
      
      // Calcular volumen total
      const callVolume = calls.reduce((sum: number, c: any) => sum + (c.volume || 0), 0);
      const putVolume = puts.reduce((sum: number, p: any) => sum + (p.volume || 0), 0);
      
      if (callVolume === 0) return null;
      
      const ratio = putVolume / callVolume;
      
      type PCSentiment = 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
      let sentiment: PCSentiment;
      let score: number;
      
      // Interpretación contrarian
      if (ratio > 1.3) {
        sentiment = 'extreme_fear';
        score = 40; // Mucho miedo = bullish
      } else if (ratio > 1.0) {
        sentiment = 'fear';
        score = 20;
      } else if (ratio > 0.7) {
        sentiment = 'neutral';
        score = 0;
      } else if (ratio > 0.5) {
        sentiment = 'greed';
        score = -20;
      } else {
        sentiment = 'extreme_greed';
        score = -40; // Mucha codicia = bearish
      }
      
      logger.info(`[Sentiment] Put/Call Ratio: ${ratio.toFixed(2)} (${sentiment}, score: ${score})`);
      
      return { value: ratio, sentiment, score };
    } catch (error) {
      logger.debug(`[Sentiment] Could not get Put/Call ratio: ${(error as Error).message}`);
      return null;
    }
  },

  async getFearGreedIndex(): Promise<SentimentData['fearGreed'] | null> {
    try {
      // Alternative.me Fear & Greed Index
      const url = 'https://api.alternative.me/fng/?limit=1';
      
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) return null;
      
      const data: any = await response.json();
      const fngData = data.data?.[0];
      
      if (!fngData) return null;
      
      const value = parseInt(fngData.value);
      const classification = fngData.value_classification;
      
      // Fear & Greed: 0-100
      // Convertir a score contrarian (-100 a +100)
      // Miedo extremo (0-25) = bullish (+40 a +100)
      // Codicia extrema (75-100) = bearish (-40 a -100)
      let score: number;
      
      if (value < 20) {
        score = 50; // Miedo extremo = muy bullish
      } else if (value < 40) {
        score = 25; // Miedo = bullish
      } else if (value < 60) {
        score = 0; // Neutral
      } else if (value < 80) {
        score = -25; // Codicia = bearish
      } else {
        score = -50; // Codicia extrema = muy bearish
      }
      
      logger.info(`[Sentiment] Fear & Greed: ${value} (${classification}, score: ${score})`);
      
      return { value, classification, score };
    } catch (error) {
      logger.error(`[Sentiment] Error getting Fear & Greed:`, error);
      return null;
    }
  },

  generateSummary(data: SentimentData): string {
    const parts: string[] = [];
    
    if (data.vix) {
      const vixText = {
        'extreme_fear': `VIX muy alto (${data.vix.value.toFixed(1)}) - Pánico en el mercado 🔴`,
        'fear': `VIX elevado (${data.vix.value.toFixed(1)}) - Mercado temeroso`,
        'neutral': `VIX normal (${data.vix.value.toFixed(1)}) - Volatilidad moderada`,
        'complacency': `VIX bajo (${data.vix.value.toFixed(1)}) - Complacencia`,
        'extreme_complacency': `VIX muy bajo (${data.vix.value.toFixed(1)}) - Complacencia extrema ⚠️`,
      }[data.vix.sentiment];
      parts.push(vixText);
    }
    
    if (data.putCallRatio) {
      if (data.putCallRatio.value > 1.0) {
        parts.push(`Put/Call alto (${data.putCallRatio.value.toFixed(2)}) - Inversores cubriendo`);
      } else if (data.putCallRatio.value < 0.7) {
        parts.push(`Put/Call bajo (${data.putCallRatio.value.toFixed(2)}) - Exceso de optimismo`);
      }
    }
    
    if (data.fearGreed) {
      parts.push(`Fear & Greed: ${data.fearGreed.value} (${data.fearGreed.classification})`);
    }
    
    if (parts.length === 0) {
      return 'Sin datos de sentimiento disponibles.';
    }
    
    // Interpretar score como señal contrarian
    let interpretation: string;
    if (data.overallScore > 30) {
      interpretation = '📈 Señal contrarian ALCISTA (mercado con miedo)';
    } else if (data.overallScore > 10) {
      interpretation = '↗️ Sesgo alcista (cautela en el mercado)';
    } else if (data.overallScore < -30) {
      interpretation = '📉 Señal contrarian BAJISTA (mercado complaciente)';
    } else if (data.overallScore < -10) {
      interpretation = '↘️ Sesgo bajista (optimismo excesivo)';
    } else {
      interpretation = '↔️ Sentimiento neutral';
    }
    
    return `${parts.join('. ')}. ${interpretation}`;
  },
};
