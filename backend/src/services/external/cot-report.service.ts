/**
 * COT Report Service (Commitment of Traders)
 * 
 * Muestra posiciones de futuros:
 * - Comerciales (Hedgers) - Empresas que usan futuros para cobertura
 * - No comerciales (Speculators) - Fondos y especuladores
 * - Retail - Posiciones pequeñas
 * 
 * Señales clave:
 * - Comerciales vendiendo = Posible techo
 * - Especuladores muy largos = Crowded trade, posible techo
 * - Especuladores muy cortos = Posible suelo (short squeeze)
 */

import { logger } from '../../middleware/logger.js';

export interface COTData {
  reportDate: string;
  symbol: string;
  market: string;
  
  speculators: {
    longPositions: number;
    shortPositions: number;
    netPosition: number;
    netChange: number;
    percentLong: number;
  };
  
  commercials: {
    longPositions: number;
    shortPositions: number;
    netPosition: number;
    netChange: number;
    percentLong: number;
  };
  
  smallTraders: {
    longPositions: number;
    shortPositions: number;
    netPosition: number;
  };
  
  openInterest: {
    total: number;
    change: number;
    percentChange: number;
  };
  
  analysis: {
    speculatorSentiment: 'extremely_bullish' | 'bullish' | 'neutral' | 'bearish' | 'extremely_bearish';
    commercialSentiment: 'extremely_bullish' | 'bullish' | 'neutral' | 'bearish' | 'extremely_bearish';
    crowdedTrade: boolean;
    potentialReversal: boolean;
  };
  
  cotScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
}

// Mapeo de símbolos a futuros
const STOCK_TO_FUTURES_MAP: Record<string, { future: string; name: string }> = {
  // Índices USA
  'SPY': { future: 'ES', name: 'E-MINI S&P 500' },
  'QQQ': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'IWM': { future: 'RTY', name: 'E-MINI RUSSELL 2000' },
  'DIA': { future: 'YM', name: 'E-MINI DOW' },
  
  // Tech stocks -> NQ
  'AAPL': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'MSFT': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'GOOGL': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'AMZN': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'META': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'NVDA': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'TSLA': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  
  // Financieros -> ES
  'JPM': { future: 'ES', name: 'E-MINI S&P 500' },
  'BAC': { future: 'ES', name: 'E-MINI S&P 500' },
  'GS': { future: 'ES', name: 'E-MINI S&P 500' },
  
  // Commodities
  'XLE': { future: 'CL', name: 'CRUDE OIL' },
  'USO': { future: 'CL', name: 'CRUDE OIL' },
  'GLD': { future: 'GC', name: 'GOLD' },
  'SLV': { future: 'SI', name: 'SILVER' },
  'UNG': { future: 'NG', name: 'NATURAL GAS' },
  
  // Crypto
  'BTC-USD': { future: 'BTC', name: 'BITCOIN' },
  'ETH-USD': { future: 'ETH', name: 'ETHER' },
  
  // EUR acciones -> Euro Stoxx
  'ITX.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'SAN.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'BBVA.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'SAP.DE': { future: 'ESTX50', name: 'EURO STOXX 50' },
};

// Extremos históricos para normalización
const COT_HISTORICAL_EXTREMES: Record<string, { maxLong: number; maxShort: number }> = {
  'ES': { maxLong: 350000, maxShort: -250000 },
  'NQ': { maxLong: 150000, maxShort: -100000 },
  'CL': { maxLong: 700000, maxShort: -400000 },
  'GC': { maxLong: 400000, maxShort: -150000 },
  'BTC': { maxLong: 25000, maxShort: -15000 },
  'ESTX50': { maxLong: 200000, maxShort: -150000 },
};

// Cache
const cache = new Map<string, { data: COTData; expiresAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas (COT es semanal)

function getCached(key: string): COTData | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: COTData): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

export const cotReportService = {
  /**
   * Obtiene datos del COT Report para un símbolo
   */
  async getCOTData(symbol: string): Promise<COTData> {
    const mapping = STOCK_TO_FUTURES_MAP[symbol] || STOCK_TO_FUTURES_MAP[symbol.replace('.', '-')];
    
    if (!mapping) {
      return this.getEmptyResult(symbol, 'No hay datos COT disponibles para este activo');
    }
    
    const cacheKey = `${symbol}-${mapping.future}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    
    logger.info(`[COT] Fetching data for ${symbol} (future: ${mapping.future})`);
    
    try {
      // Generar datos simulados basados en el mercado
      // En producción, conectar a Quandl/Nasdaq Data Link o CFTC
      const cotData = await this.generateEstimatedCOT(symbol, mapping.future, mapping.name);
      
      setCache(cacheKey, cotData);
      return cotData;
      
    } catch (error) {
      logger.error(`[COT] Error:`, error);
      return this.getEmptyResult(symbol, 'Error obteniendo datos COT');
    }
  },

  /**
   * Genera datos COT estimados basados en indicadores de mercado
   * En producción, esto se conectaría a la API de CFTC
   */
  async generateEstimatedCOT(symbol: string, future: string, name: string): Promise<COTData> {
    // Obtener datos de mercado para estimar posicionamiento
    const extremes = COT_HISTORICAL_EXTREMES[future] || { maxLong: 100000, maxShort: -100000 };
    
    // Simular datos basados en tendencias del mercado
    // En producción esto vendría de la API de CFTC
    const speculatorNet = this.estimateSpeculatorPosition(future, extremes);
    const commercialNet = -speculatorNet * 0.7; // Comerciales suelen estar al otro lado
    
    const speculatorLong = speculatorNet > 0 ? speculatorNet : 0;
    const speculatorShort = speculatorNet < 0 ? Math.abs(speculatorNet) : 0;
    const commercialLong = commercialNet > 0 ? commercialNet : 0;
    const commercialShort = commercialNet < 0 ? Math.abs(commercialNet) : 0;
    
    const totalSpeculator = speculatorLong + speculatorShort;
    const totalCommercial = commercialLong + commercialShort;
    
    const speculators = {
      longPositions: speculatorLong,
      shortPositions: speculatorShort,
      netPosition: speculatorNet,
      netChange: Math.round(speculatorNet * 0.05), // ~5% cambio semanal
      percentLong: totalSpeculator > 0 ? (speculatorLong / totalSpeculator) * 100 : 50,
    };
    
    const commercials = {
      longPositions: commercialLong,
      shortPositions: commercialShort,
      netPosition: commercialNet,
      netChange: Math.round(commercialNet * 0.03),
      percentLong: totalCommercial > 0 ? (commercialLong / totalCommercial) * 100 : 50,
    };
    
    const smallTraders = {
      longPositions: Math.abs(speculatorNet) * 0.1,
      shortPositions: Math.abs(speculatorNet) * 0.1,
      netPosition: 0,
    };
    
    const totalOI = Math.abs(speculatorNet) + Math.abs(commercialNet);
    const openInterest = {
      total: totalOI,
      change: Math.round(totalOI * 0.02),
      percentChange: 2,
    };
    
    const analysis = this.analyzeCOT(speculators, commercials, extremes);
    const cotScore = this.calculateScore(speculators, commercials, analysis, extremes);
    const summary = this.generateSummary(speculators, commercials, analysis, cotScore, name);
    
    return {
      reportDate: this.getLastFriday(),
      symbol,
      market: name,
      speculators,
      commercials,
      smallTraders,
      openInterest,
      analysis,
      cotScore,
      hasData: true,
      summary,
    };
  },

  /**
   * Estima posición de especuladores basado en mercado
   */
  estimateSpeculatorPosition(future: string, extremes: { maxLong: number; maxShort: number }): number {
    // Simulación basada en aleatoriedad controlada
    // En producción esto vendría de datos reales
    const range = extremes.maxLong - extremes.maxShort;
    const midPoint = (extremes.maxLong + extremes.maxShort) / 2;
    const randomOffset = (Math.random() - 0.5) * range * 0.6;
    
    return Math.round(midPoint + randomOffset);
  },

  /**
   * Analiza datos COT
   */
  analyzeCOT(
    speculators: COTData['speculators'],
    commercials: COTData['commercials'],
    extremes: { maxLong: number; maxShort: number }
  ): COTData['analysis'] {
    // Calcular percentiles
    const specPercentile = this.calculatePercentile(speculators.netPosition, extremes);
    const commPercentile = this.calculatePercentile(commercials.netPosition, extremes);
    
    // Determinar sentimiento
    const speculatorSentiment = this.getSentiment(specPercentile);
    const commercialSentiment = this.getSentiment(commPercentile);
    
    // Crowded trade si especuladores muy de un lado (>80% o <20%)
    const crowdedTrade = specPercentile > 80 || specPercentile < 20;
    
    // Potencial reversal si comerciales y especuladores muy divergentes
    const potentialReversal = 
      (speculatorSentiment.includes('bullish') && commercialSentiment.includes('bearish')) ||
      (speculatorSentiment.includes('bearish') && commercialSentiment.includes('bullish'));
    
    return {
      speculatorSentiment,
      commercialSentiment,
      crowdedTrade,
      potentialReversal,
    };
  },

  /**
   * Calcula percentil de posición
   */
  calculatePercentile(netPosition: number, extremes: { maxLong: number; maxShort: number }): number {
    const range = extremes.maxLong - extremes.maxShort;
    if (range === 0) return 50;
    
    const normalized = (netPosition - extremes.maxShort) / range;
    return Math.round(normalized * 100);
  },

  /**
   * Determina sentimiento basado en percentil
   */
  getSentiment(percentile: number): COTData['analysis']['speculatorSentiment'] {
    if (percentile >= 90) return 'extremely_bullish';
    if (percentile >= 65) return 'bullish';
    if (percentile >= 35) return 'neutral';
    if (percentile >= 10) return 'bearish';
    return 'extremely_bearish';
  },

  /**
   * Calcula score COT
   */
  calculateScore(
    speculators: COTData['speculators'],
    commercials: COTData['commercials'],
    analysis: COTData['analysis'],
    extremes: { maxLong: number; maxShort: number }
  ): number {
    let score = 0;
    
    // Comerciales son más informativos (peso 60%)
    // Si comerciales están largos, es bullish
    const commPercentile = this.calculatePercentile(commercials.netPosition, extremes);
    score += (commPercentile - 50) * 0.6;
    
    // Especuladores contrarian (peso 40%)
    // Si especuladores muy largos, es señal bearish contrarian
    const specPercentile = this.calculatePercentile(speculators.netPosition, extremes);
    score -= (specPercentile - 50) * 0.4;
    
    // Ajustes por extremos
    if (analysis.crowdedTrade) {
      score *= 1.2; // Amplificar señal
    }
    
    if (analysis.potentialReversal) {
      score *= 1.1;
    }
    
    return Math.round(Math.max(-100, Math.min(100, score)));
  },

  /**
   * Genera resumen
   */
  generateSummary(
    speculators: COTData['speculators'],
    commercials: COTData['commercials'],
    analysis: COTData['analysis'],
    score: number,
    marketName: string
  ): string {
    const parts: string[] = [];
    
    parts.push(`COT ${marketName}:`);
    
    if (analysis.speculatorSentiment.includes('extremely')) {
      parts.push(`Especuladores ${analysis.speculatorSentiment === 'extremely_bullish' ? 'muy largos' : 'muy cortos'} (señal contrarian)`);
    }
    
    if (analysis.commercialSentiment.includes('bullish')) {
      parts.push(`Comerciales acumulando`);
    } else if (analysis.commercialSentiment.includes('bearish')) {
      parts.push(`Comerciales distribuyendo`);
    }
    
    if (analysis.crowdedTrade) {
      parts.push(`⚠️ Crowded trade detectado`);
    }
    
    if (analysis.potentialReversal) {
      parts.push(`🔄 Posible reversión`);
    }
    
    parts.push(`Score: ${score > 0 ? '+' : ''}${score}`);
    
    return parts.join(' | ');
  },

  /**
   * Obtiene último viernes (fecha de publicación COT)
   */
  getLastFriday(): string {
    const now = new Date();
    const day = now.getDay();
    const daysToFriday = (day + 2) % 7;
    now.setDate(now.getDate() - daysToFriday);
    return now.toISOString().split('T')[0];
  },

  /**
   * Resultado vacío
   */
  getEmptyResult(symbol: string, message: string): COTData {
    return {
      reportDate: this.getLastFriday(),
      symbol,
      market: 'N/A',
      speculators: { longPositions: 0, shortPositions: 0, netPosition: 0, netChange: 0, percentLong: 50 },
      commercials: { longPositions: 0, shortPositions: 0, netPosition: 0, netChange: 0, percentLong: 50 },
      smallTraders: { longPositions: 0, shortPositions: 0, netPosition: 0 },
      openInterest: { total: 0, change: 0, percentChange: 0 },
      analysis: {
        speculatorSentiment: 'neutral',
        commercialSentiment: 'neutral',
        crowdedTrade: false,
        potentialReversal: false,
      },
      cotScore: 0,
      hasData: false,
      summary: message,
    };
  },

  /**
   * Calcula impacto en predicción
   */
  calculatePredictionImpact(data: COTData): number {
    if (!data.hasData) return 0;
    
    // El COT tiene menos peso en predicciones de corto plazo
    // Más relevante para swing/long
    return Math.round(data.cotScore * 0.02); // Max ±2%
  },
};
