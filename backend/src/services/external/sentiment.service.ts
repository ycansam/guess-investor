/**
 * Sentiment Service
 * Combina múltiples fuentes de sentimiento: VIX, Fear & Greed, Reddit
 */

import { logger } from '../../middleware/logger.js';

export interface SentimentData {
  symbol?: string;
  type: 'stock' | 'crypto';
  
  // VIX (volatilidad)
  vix?: {
    value: number;
    sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
    score: number;
  };
  
  // Fear & Greed Index (crypto)
  fearGreed?: {
    value: number;
    classification: string;
    score: number;
  };
  
  // Score general
  overallScore: number; // -100 a +100
  bullishPercent: number; // 0-100
  hasData: boolean;
  summary: string;
}

// Cache
const cache = new Map<string, { data: SentimentData; expiresAt: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

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
      };

      // Obtener datos en paralelo
      const promises: Promise<void>[] = [];
      
      if (type === 'stock') {
        promises.push(this.getVIXData().then(vix => { if (vix) result.vix = vix; }));
      } else {
        promises.push(this.getFearGreedIndex().then(fg => { if (fg) result.fearGreed = fg; }));
      }
      
      await Promise.allSettled(promises);
      
      // Calcular score general
      const scores: number[] = [];
      
      if (result.vix) {
        scores.push(result.vix.score);
        result.hasData = true;
      }
      
      if (result.fearGreed) {
        scores.push(result.fearGreed.score);
        result.hasData = true;
      }
      
      if (scores.length > 0) {
        result.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        result.bullishPercent = Math.round((result.overallScore + 100) / 2);
      }
      
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
      const vixValue = closes.filter((c: any) => c !== null).pop();
      
      if (!vixValue) return null;
      
      // Interpretar VIX
      // <12: Extreme complacency (bearish signal)
      // 12-20: Normal/neutral
      // 20-30: Fear (starting to be contrarian bullish)
      // >30: Extreme fear (very bullish contrarian)
      
      type VixSentiment = 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
      let sentiment: VixSentiment;
      let score: number;
      
      if (vixValue < 12) {
        sentiment = 'extreme_complacency';
        score = -30; // Complacency es bearish
      } else if (vixValue < 18) {
        sentiment = 'complacency';
        score = -10;
      } else if (vixValue < 25) {
        sentiment = 'neutral';
        score = 0;
      } else if (vixValue < 35) {
        sentiment = 'fear';
        score = 20; // Fear es contrarian bullish
      } else {
        sentiment = 'extreme_fear';
        score = 40; // Extreme fear es muy bullish (contrarian)
      }
      
      logger.info(`[Sentiment] VIX: ${vixValue.toFixed(2)} (${sentiment}, score: ${score})`);
      
      return { value: vixValue, sentiment, score };
    } catch (error) {
      logger.error(`[Sentiment] Error getting VIX:`, error);
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
      // 0-24: Extreme Fear
      // 25-49: Fear
      // 50-74: Greed
      // 75-100: Extreme Greed
      
      // Convertir a score (-100 a +100)
      const score = (value - 50) * 2;
      
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
        'extreme_fear': `VIX muy alto (${data.vix.value.toFixed(1)}) - Mercado con miedo extremo`,
        'fear': `VIX elevado (${data.vix.value.toFixed(1)}) - Cautela en el mercado`,
        'neutral': `VIX normal (${data.vix.value.toFixed(1)}) - Volatilidad moderada`,
        'complacency': `VIX bajo (${data.vix.value.toFixed(1)}) - Complacencia`,
        'extreme_complacency': `VIX muy bajo (${data.vix.value.toFixed(1)}) - Complacencia extrema`,
      }[data.vix.sentiment];
      parts.push(vixText);
    }
    
    if (data.fearGreed) {
      parts.push(`Fear & Greed: ${data.fearGreed.value} (${data.fearGreed.classification})`);
    }
    
    if (parts.length === 0) {
      return 'Sin datos de sentimiento disponibles.';
    }
    
    const sentiment = data.overallScore > 20 ? 'alcista' :
                     data.overallScore < -20 ? 'bajista' : 'neutral';
    
    return `${parts.join('. ')}. Sentimiento general: ${sentiment}.`;
  },
};
