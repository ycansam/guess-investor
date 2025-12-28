/**
 * Fear & Greed Index Service
 * Obtiene el índice Fear & Greed para criptomonedas
 * API gratuita de alternative.me
 */

import { logger } from '../../middleware/logger.js';

export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: Date;
  nextUpdate: Date;
}

export interface FearGreedHistory {
  current: FearGreedData;
  yesterday: FearGreedData | null;
  lastWeek: FearGreedData | null;
  lastMonth: FearGreedData | null;
  score: number; // -100 a +100
  hasData: boolean;
}

const FEAR_GREED_API = 'https://api.alternative.me/fng/';

// Cache
let cached: FearGreedHistory | null = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

export const fearGreedService = {
  /**
   * Obtiene el índice actual de Fear & Greed
   */
  async getIndex(): Promise<FearGreedHistory | null> {
    // Check cache
    if (cached && Date.now() - cacheTime < CACHE_TTL) {
      return cached;
    }

    try {
      logger.info('[FearGreed] Fetching Fear & Greed index...');

      const response = await fetch(`${FEAR_GREED_API}?limit=31`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: any = await response.json();

      if (!data.data || data.data.length === 0) {
        return cached;
      }

      const entries = data.data;
      
      const current = this.parseEntry(entries[0]);
      const yesterday = entries.length > 1 ? this.parseEntry(entries[1]) : null;
      const lastWeek = entries.length > 7 ? this.parseEntry(entries[7]) : null;
      const lastMonth = entries.length > 30 ? this.parseEntry(entries[30]) : null;

      // Calcular score (-100 a +100)
      // 0 = extreme fear = -100
      // 50 = neutral = 0
      // 100 = extreme greed = +100
      const score = (current.value - 50) * 2;

      const result: FearGreedHistory = {
        current,
        yesterday,
        lastWeek,
        lastMonth,
        score,
        hasData: true,
      };

      cached = result;
      cacheTime = Date.now();

      logger.info(`[FearGreed] Value: ${current.value} (${current.classification})`);

      return result;
    } catch (error) {
      logger.error('[FearGreed] Error:', error);
      return cached;
    }
  },

  /**
   * Parsea una entrada del API
   */
  parseEntry(entry: any): FearGreedData {
    return {
      value: parseInt(entry.value),
      classification: this.translateClassification(entry.value_classification),
      timestamp: new Date(parseInt(entry.timestamp) * 1000),
      nextUpdate: new Date((parseInt(entry.timestamp) + 86400) * 1000),
    };
  },

  /**
   * Traduce clasificación
   */
  translateClassification(classification: string): string {
    const translations: Record<string, string> = {
      'Extreme Fear': 'Miedo Extremo',
      'Fear': 'Miedo',
      'Neutral': 'Neutral',
      'Greed': 'Codicia',
      'Extreme Greed': 'Codicia Extrema',
    };
    return translations[classification] || classification;
  },

  /**
   * Obtiene emoji según valor
   */
  getEmoji(value: number): string {
    if (value <= 20) return '😱';
    if (value <= 40) return '😰';
    if (value <= 60) return '😐';
    if (value <= 80) return '😊';
    return '🤑';
  },

  /**
   * Formatea para análisis
   */
  formatForAnalysis(data: FearGreedHistory): string {
    const { current, yesterday, lastWeek } = data;
    
    const parts: string[] = [];
    parts.push(`Fear & Greed: ${current.value}/100 (${current.classification}) ${this.getEmoji(current.value)}`);
    
    if (yesterday) {
      const change = current.value - yesterday.value;
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      parts.push(`Ayer: ${yesterday.value} (${arrow}${Math.abs(change)})`);
    }
    
    if (lastWeek) {
      const change = current.value - lastWeek.value;
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      parts.push(`1 semana: ${lastWeek.value} (${arrow}${Math.abs(change)})`);
    }

    parts.push(`Score: ${data.score > 0 ? '+' : ''}${data.score}`);

    return parts.join(' | ');
  },

  /**
   * Calcula impacto en predicción (para cripto)
   * El Fear & Greed es contrarian
   */
  calculatePredictionImpact(data: FearGreedHistory): number {
    if (!data.hasData) return 0;
    
    // Fear extremo = oportunidad de compra (positivo)
    // Greed extremo = señal de venta (negativo)
    // Usamos señal contrarian
    return Math.round(data.score * -0.03); // Max ±3%, invertido
  },

  /**
   * Obtiene clasificación de sentimiento
   */
  getSentimentLevel(value: number): 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed' {
    if (value <= 20) return 'extreme_fear';
    if (value <= 40) return 'fear';
    if (value <= 60) return 'neutral';
    if (value <= 80) return 'greed';
    return 'extreme_greed';
  },

  /**
   * Determina si el mercado está en extremo
   */
  isExtreme(value: number): { isExtreme: boolean; direction: 'fear' | 'greed' | null } {
    if (value <= 20) return { isExtreme: true, direction: 'fear' };
    if (value >= 80) return { isExtreme: true, direction: 'greed' };
    return { isExtreme: false, direction: null };
  },
};
