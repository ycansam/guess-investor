/**
 * Options Service
 * Obtiene datos de opciones del mercado desde CBOE
 * Calcula Put/Call ratio como indicador de sentimiento
 * Ratio alto = bearish, ratio bajo = bullish
 */

import { logger } from '../../middleware/logger.js';
import { sentimentService } from './sentiment.service.js';

// Interfaces
export interface OptionsData {
  symbol: string;
  putCallRatio: number;
  totalPutVolume: number;
  totalCallVolume: number;
  totalPutOpenInterest: number;
  totalCallOpenInterest: number;
  sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
  sentimentScore: number; // -100 a +100
  timestamp: Date;
}

export interface SPXOptionsResponse {
  symbol: string;
  pcRatio: number;
  pcRatioVolume: number;
  sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
  sentimentScore: number;
  timestamp: Date;
  source: 'cboe' | 'vix_estimate';
}

interface PutCallCalculation {
  pcRatio: number;
  pcRatioVolume: number;
  totalPutVolume: number;
  totalCallVolume: number;
  totalPutOI: number;
  totalCallOI: number;
  sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
  sentimentScore: number;
}

// URLs de CBOE para datos de opciones
const CBOE_OPTIONS_URLS = {
  SPX: 'https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json',
  VIX: 'https://cdn.cboe.com/api/global/delayed_quotes/options/_VIX.json',
};

// Cache
const cache = new Map<string, { data: SPXOptionsResponse; expiresAt: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

function getCached(key: string): SPXOptionsResponse | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: SPXOptionsResponse): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL,
  });
}

export const optionsService = {
  /**
   * Obtiene el Put/Call ratio del S&P 500 desde CBOE
   */
  async getSPXPutCallRatio(): Promise<SPXOptionsResponse | null> {
    const cacheKey = 'spx_put_call';
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      logger.info('[Options] Fetching Put/Call ratio from CBOE...');
      
      const response = await fetch(CBOE_OPTIONS_URLS.SPX, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
      
      if (!response.ok) {
        logger.warn(`[Options] CBOE returned status ${response.status}`);
        return null;
      }
      
      const data: any = await response.json();
      
      if (!data.data?.options || !Array.isArray(data.data.options)) {
        logger.warn('[Options] CBOE response missing options data');
        return null;
      }

      // Calcular Put/Call ratio
      const calculation = this.calculatePutCallRatio(data.data.options);
      
      const result: SPXOptionsResponse = {
        symbol: 'SPX',
        pcRatio: calculation.pcRatio,
        pcRatioVolume: calculation.pcRatioVolume,
        sentiment: calculation.sentiment,
        sentimentScore: calculation.sentimentScore,
        timestamp: new Date(data.timestamp || Date.now()),
        source: 'cboe',
      };
      
      logger.info(`[Options] SPX Put/Call ratio: ${result.pcRatio.toFixed(2)} (${result.sentiment})`);
      
      setCache(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('[Options] Error fetching from CBOE:', error);
      return null;
    }
  },

  /**
   * Calcula el Put/Call ratio y Open Interest ratio
   */
  calculatePutCallRatio(options: any[]): PutCallCalculation {
    let totalPutVolume = 0;
    let totalCallVolume = 0;
    let totalPutOI = 0;
    let totalCallOI = 0;

    for (const option of options) {
      const optionSymbol = option.option || '';
      const volume = option.volume || 0;
      const openInterest = option.open_interest || 0;

      // Identificar si es Put (P) o Call (C) por el símbolo
      // Formato: SPX251219C06820000 (C = Call, P = Put)
      if (optionSymbol.includes('P')) {
        totalPutVolume += volume;
        totalPutOI += openInterest;
      } else if (optionSymbol.includes('C')) {
        totalCallVolume += volume;
        totalCallOI += openInterest;
      }
    }

    // Put/Call ratio basado en Open Interest (más estable)
    const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;
    
    // Put/Call ratio basado en Volume (más volátil, pero muestra actividad reciente)
    const pcRatioVolume = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1;

    // Interpretar el ratio:
    // < 0.7 = Extreme Greed (muchas más calls que puts - muy bullish)
    // 0.7 - 0.9 = Bullish
    // 0.9 - 1.1 = Neutral
    // 1.1 - 1.3 = Bearish
    // > 1.3 = Extreme Fear (muchas más puts que calls - muy bearish)
    const { sentiment, sentimentScore } = this.interpretRatio(pcRatio);

    return { 
      pcRatio, 
      pcRatioVolume, 
      totalPutVolume, 
      totalCallVolume, 
      totalPutOI, 
      totalCallOI,
      sentiment, 
      sentimentScore 
    };
  },

  /**
   * Interpreta el Put/Call ratio y devuelve sentimiento
   */
  interpretRatio(pcRatio: number): { 
    sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed'; 
    sentimentScore: number;
  } {
    let sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
    let sentimentScore: number;

    if (pcRatio < 0.7) {
      sentiment = 'extreme_greed';
      sentimentScore = 80 + Math.min(20, (0.7 - pcRatio) * 100);
    } else if (pcRatio < 0.9) {
      sentiment = 'bullish';
      sentimentScore = 20 + ((0.9 - pcRatio) / 0.2) * 60;
    } else if (pcRatio <= 1.1) {
      sentiment = 'neutral';
      sentimentScore = -20 + ((1.1 - pcRatio) / 0.2) * 40;
    } else if (pcRatio <= 1.3) {
      sentiment = 'bearish';
      sentimentScore = -20 - ((pcRatio - 1.1) / 0.2) * 60;
    } else {
      sentiment = 'extreme_fear';
      sentimentScore = -80 - Math.min(20, (pcRatio - 1.3) * 50);
    }

    // Limitar a rango -100 a +100
    sentimentScore = Math.max(-100, Math.min(100, sentimentScore));

    return { sentiment, sentimentScore };
  },

  /**
   * Obtiene datos de opciones para un símbolo específico
   * Para símbolos individuales, usamos SPX como indicador de mercado general
   */
  async getOptionsData(symbol: string): Promise<OptionsData | null> {
    if (symbol.toUpperCase() === 'SPX' || symbol.toUpperCase() === '^SPX') {
      const spxData = await this.getSPXPutCallRatio();
      if (spxData) {
        return {
          symbol: 'SPX',
          putCallRatio: spxData.pcRatio,
          totalPutVolume: 0,
          totalCallVolume: 0,
          totalPutOpenInterest: 0,
          totalCallOpenInterest: 0,
          sentiment: spxData.sentiment,
          sentimentScore: spxData.sentimentScore,
          timestamp: spxData.timestamp,
        };
      }
    }
    return null;
  },

  /**
   * Obtiene el Put/Call ratio general del mercado (SPX) con fallback a VIX
   */
  async getMarketPutCallRatio(): Promise<SPXOptionsResponse | null> {
    // Primero intentar obtener datos reales de CBOE
    const realData = await this.getSPXPutCallRatio();
    
    // Verificar si los datos son válidos (ratio de exactamente 1.00 indica fallo de parseo)
    if (realData && realData.pcRatio !== 1.00) {
      return realData;
    }
    
    // Fallback: estimar Put/Call ratio basándose en el VIX
    logger.info('[Options] CBOE unavailable, estimating Put/Call ratio from VIX...');
    
    try {
      const sentiment = await sentimentService.getSentiment('SPY', 'stock');
      
      if (sentiment.vix) {
        const vixValue = sentiment.vix.value;
        const estimated = this.estimateFromVIX(vixValue);
        
        logger.info(`[Options] Estimated Put/Call ratio from VIX (${vixValue.toFixed(1)}): ${estimated.pcRatio.toFixed(2)} (${estimated.sentiment})`);
        
        return {
          symbol: 'SPX',
          pcRatio: estimated.pcRatio,
          pcRatioVolume: estimated.pcRatio,
          sentiment: estimated.sentiment,
          sentimentScore: estimated.sentimentScore,
          timestamp: new Date(),
          source: 'vix_estimate',
        };
      }
    } catch (error) {
      logger.error('[Options] Error estimating from VIX:', error);
    }
    
    return null;
  },

  /**
   * Estima Put/Call ratio basándose en VIX
   */
  estimateFromVIX(vixValue: number): {
    pcRatio: number;
    sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
    sentimentScore: number;
  } {
    // Mapear VIX a Put/Call ratio estimado:
    // VIX 10-15: PC ratio ~0.75-0.85 (bullish)
    // VIX 15-20: PC ratio ~0.85-1.00 (neutral)
    // VIX 20-25: PC ratio ~1.00-1.15 (slightly bearish)
    // VIX 25-30: PC ratio ~1.15-1.30 (bearish)
    // VIX 30+: PC ratio ~1.30+ (extreme fear)
    
    let estimatedPCRatio: number;
    let sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
    let sentimentScore: number;
    
    if (vixValue < 12) {
      estimatedPCRatio = 0.65 + (vixValue - 10) * 0.05;
      sentiment = 'extreme_greed';
      sentimentScore = 80;
    } else if (vixValue < 16) {
      estimatedPCRatio = 0.75 + (vixValue - 12) * 0.025;
      sentiment = 'bullish';
      sentimentScore = 40;
    } else if (vixValue < 20) {
      estimatedPCRatio = 0.85 + (vixValue - 16) * 0.0375;
      sentiment = 'neutral';
      sentimentScore = 0;
    } else if (vixValue < 25) {
      estimatedPCRatio = 1.00 + (vixValue - 20) * 0.03;
      sentiment = 'bearish';
      sentimentScore = -40;
    } else if (vixValue < 30) {
      estimatedPCRatio = 1.15 + (vixValue - 25) * 0.03;
      sentiment = 'bearish';
      sentimentScore = -60;
    } else {
      estimatedPCRatio = 1.30 + (vixValue - 30) * 0.02;
      sentiment = 'extreme_fear';
      sentimentScore = -80;
    }
    
    // Limitar ratio a rango razonable
    estimatedPCRatio = Math.max(0.5, Math.min(2.0, estimatedPCRatio));
    
    return { pcRatio: estimatedPCRatio, sentiment, sentimentScore };
  },

  /**
   * Calcula el impacto del Put/Call ratio en una predicción
   * Retorna un ajuste de porcentaje (-5 a +5)
   */
  calculatePredictionImpact(data: SPXOptionsResponse): number {
    // El sentimiento de opciones es contrarian:
    // - Extreme fear (muchos puts) -> señal bullish contrarian
    // - Extreme greed (muchas calls) -> señal bearish contrarian
    
    // Pero también puede confirmar tendencias:
    // - En mercados alcistas, bullish sentiment lo confirma
    // - En mercados bajistas, bearish sentiment lo confirma
    
    // Usamos el sentimentScore directamente pero invertido para señal contrarian
    // y reducido para no dominar la predicción
    
    const baseImpact = data.sentimentScore * 0.03; // Max ±3%
    
    // Extreme values tienen más peso contrarian
    if (data.sentiment === 'extreme_fear') {
      return 3; // Bullish contrarian signal
    } else if (data.sentiment === 'extreme_greed') {
      return -3; // Bearish contrarian signal
    }
    
    return Math.max(-3, Math.min(3, baseImpact));
  },

  /**
   * Formatea los datos de opciones para incluir en análisis
   */
  formatForAnalysis(data: SPXOptionsResponse): string {
    const sentimentLabel: Record<string, string> = {
      extreme_fear: 'Miedo Extremo',
      bearish: 'Bajista',
      neutral: 'Neutral',
      bullish: 'Alcista',
      extreme_greed: 'Codicia Extrema',
    };

    return `Put/Call Ratio: ${data.pcRatio.toFixed(2)} | ` +
           `Volumen P/C: ${data.pcRatioVolume.toFixed(2)} | ` +
           `Sentimiento: ${sentimentLabel[data.sentiment]} | ` +
           `Score: ${data.sentimentScore > 0 ? '+' : ''}${data.sentimentScore.toFixed(0)}`;
  },

  /**
   * Genera interpretación detallada del ratio
   */
  getInterpretation(data: SPXOptionsResponse): string {
    const { pcRatio, sentiment } = data;
    
    if (sentiment === 'extreme_greed') {
      return `Put/Call ratio muy bajo (${pcRatio.toFixed(2)}). El mercado está muy optimista. ` +
             `Señal contraria: las correcciones suelen venir después de optimismo extremo.`;
    } else if (sentiment === 'bullish') {
      return `Put/Call ratio bajo (${pcRatio.toFixed(2)}). Más operadores comprando calls. ` +
             `Sentimiento alcista moderado.`;
    } else if (sentiment === 'neutral') {
      return `Put/Call ratio equilibrado (${pcRatio.toFixed(2)}). ` +
             `Equilibrio entre puts y calls. El mercado no muestra dirección clara.`;
    } else if (sentiment === 'bearish') {
      return `Put/Call ratio elevado (${pcRatio.toFixed(2)}). Más operadores comprando puts. ` +
             `Sentimiento bajista moderado.`;
    } else {
      return `Put/Call ratio muy alto (${pcRatio.toFixed(2)}). Miedo extremo en opciones. ` +
             `Históricamente, estos niveles suelen preceder rebotes (señal contrarian bullish).`;
    }
  },
};
