/**
 * VIX Service
 * Obtiene el índice VIX (Volatility Index) - "índice del miedo"
 * Valores altos = miedo/incertidumbre, valores bajos = complacencia
 */

import { logger } from '../../middleware/logger.js';

export interface VIXData {
  value: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  sentimentScore: number; // -100 a +100
  interpretation: string;
  timestamp: Date;
}

// Niveles históricos del VIX
const VIX_LEVELS = {
  EXTREME_FEAR: 30,
  FEAR: 20,
  NEUTRAL_HIGH: 15,
  NEUTRAL_LOW: 12,
  COMPLACENCY: 12,
  EXTREME_COMPLACENCY: 10,
};

// Cache
let cachedVix: VIXData | null = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

export const vixService = {
  /**
   * Obtiene el valor actual del VIX
   */
  async getCurrentVIX(): Promise<VIXData | null> {
    // Check cache
    if (cachedVix && Date.now() - cacheTime < CACHE_TTL) {
      return cachedVix;
    }

    try {
      logger.info('[VIX] Fetching VIX index...');
      
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        logger.warn(`[VIX] HTTP error: ${response.status}`);
        return cachedVix;
      }
      
      const data: any = await response.json();
      const result = data.chart?.result?.[0];
      
      if (!result) {
        logger.warn('[VIX] No data in response');
        return cachedVix;
      }

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];
      const closes = quote?.close?.filter((c: any) => c !== null) || [];
      
      const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
      const previousClose = meta.chartPreviousClose || meta.previousClose || closes[closes.length - 2] || currentPrice;
      const change = currentPrice - previousClose;
      const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

      const { sentiment, sentimentScore, interpretation } = this.interpretVIX(currentPrice, change);

      logger.info(`[VIX] Value: ${currentPrice.toFixed(2)} (${sentiment})`);

      const vixData: VIXData = {
        value: currentPrice,
        change,
        changePercent,
        high: meta.regularMarketDayHigh || currentPrice,
        low: meta.regularMarketDayLow || currentPrice,
        open: meta.regularMarketOpen || previousClose,
        previousClose,
        sentiment,
        sentimentScore,
        interpretation,
        timestamp: new Date(meta.regularMarketTime * 1000),
      };

      cachedVix = vixData;
      cacheTime = Date.now();

      return vixData;
    } catch (error) {
      logger.error('[VIX] Error fetching VIX:', error);
      return cachedVix;
    }
  },

  /**
   * Interpreta el valor del VIX
   */
  interpretVIX(vixValue: number, change: number): {
    sentiment: VIXData['sentiment'];
    sentimentScore: number;
    interpretation: string;
  } {
    let sentiment: VIXData['sentiment'];
    let sentimentScore: number;
    let interpretation: string;

    // VIX invertido vs mercado:
    // VIX alto = mercado miedoso = score negativo
    // VIX bajo = mercado complaciente = score positivo

    if (vixValue >= VIX_LEVELS.EXTREME_FEAR) {
      sentiment = 'extreme_fear';
      sentimentScore = -60 - Math.min(40, (vixValue - 30) * 2);
      interpretation = `VIX en ${vixValue.toFixed(1)} indica PÁNICO. Históricamente, niveles extremos suelen preceder rebotes.`;
    } else if (vixValue >= VIX_LEVELS.FEAR) {
      sentiment = 'fear';
      sentimentScore = -20 - ((vixValue - 20) / 10) * 40;
      interpretation = `VIX elevado en ${vixValue.toFixed(1)}. El mercado muestra nerviosismo.`;
    } else if (vixValue >= VIX_LEVELS.NEUTRAL_LOW) {
      sentiment = 'neutral';
      const midpoint = (VIX_LEVELS.FEAR + VIX_LEVELS.NEUTRAL_LOW) / 2;
      sentimentScore = ((midpoint - vixValue) / (midpoint - VIX_LEVELS.NEUTRAL_LOW)) * 20;
      interpretation = `VIX en ${vixValue.toFixed(1)} dentro del rango normal.`;
    } else if (vixValue >= VIX_LEVELS.EXTREME_COMPLACENCY) {
      sentiment = 'complacency';
      sentimentScore = 20 + ((12 - vixValue) / 2) * 40;
      interpretation = `VIX bajo en ${vixValue.toFixed(1)}. Mercado confiado. ⚠️ La complacencia extrema a veces precede correcciones.`;
    } else {
      sentiment = 'extreme_complacency';
      sentimentScore = 60 + Math.min(40, (10 - vixValue) * 20);
      interpretation = `⚠️ VIX extremadamente bajo (${vixValue.toFixed(1)}). Complacencia extrema, niveles insostenibles.`;
    }

    // Ajustar por cambio diario
    if (Math.abs(change) > 2) {
      const changeAdjustment = change > 0 ? -10 : 10;
      sentimentScore += changeAdjustment;
    }

    sentimentScore = Math.max(-100, Math.min(100, sentimentScore));

    return { sentiment, sentimentScore, interpretation };
  },

  /**
   * Formatea para análisis
   */
  formatForAnalysis(data: VIXData): string {
    const sentimentLabels: Record<string, string> = {
      extreme_fear: 'Miedo Extremo',
      fear: 'Miedo',
      neutral: 'Neutral',
      complacency: 'Complacencia',
      extreme_complacency: 'Complacencia Extrema',
    };

    const changeStr = data.change >= 0 ? `+${data.changePercent.toFixed(1)}%` : `${data.changePercent.toFixed(1)}%`;

    return `VIX: ${data.value.toFixed(2)} (${changeStr}) | ` +
           `Sentimiento: ${sentimentLabels[data.sentiment]} | ` +
           `Score: ${data.sentimentScore > 0 ? '+' : ''}${data.sentimentScore}`;
  },

  /**
   * Calcula impacto en predicción
   * El VIX es contrarian: alto VIX puede indicar oportunidad de compra
   */
  calculatePredictionImpact(data: VIXData): number {
    // Score positivo (complacencia) = señal bajista contrarian
    // Score negativo (miedo) = señal alcista contrarian
    return Math.round(data.sentimentScore * -0.02); // Max ±2%, invertido
  },

  /**
   * Obtiene nivel de volatilidad para ajustar predicciones
   */
  getVolatilityLevel(data: VIXData): 'low' | 'medium' | 'high' | 'extreme' {
    if (data.value >= 30) return 'extreme';
    if (data.value >= 20) return 'high';
    if (data.value >= 15) return 'medium';
    return 'low';
  },
};
