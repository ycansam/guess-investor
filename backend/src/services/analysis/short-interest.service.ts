/**
 * Short Interest Service
 * Obtiene el % de acciones en corto (short interest)
 * 
 * Short Interest alto = Muchos apostando a la baja
 * - Si sube el precio → Short Squeeze potencial
 * - Si baja → Los cortos tenían razón
 * 
 * Niveles:
 * - <5% = Normal
 * - 5-10% = Elevado
 * - 10-20% = Alto (precaución)
 * - >20% = Muy alto (short squeeze potential)
 * 
 * Usado por: Steve Cohen
 */

import { logger } from '../../middleware/logger.js';

export interface ShortInterestData {
  // Datos principales
  shortPercent: number;           // % del float en cortos
  shortShares: number;            // Número de acciones en corto
  floatShares: number;            // Float total
  
  // Ratio days to cover
  daysToCover: number;            // Días para cubrir (short shares / avg volume)
  avgVolume: number;              // Volumen promedio diario
  
  // Interpretación
  level: 'low' | 'normal' | 'elevated' | 'high' | 'extreme';
  squeezeRisk: 'none' | 'low' | 'medium' | 'high';
  
  // Señales
  signal: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  tradingImplication: string;
  
  // Meta
  hasData: boolean;
  lastUpdate: string | null;
}

// Cache
const cache = new Map<string, { data: ShortInterestData; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora (short interest no cambia tanto)

export const shortInterestService = {
  /**
   * Obtiene datos de short interest para un símbolo
   */
  async getShortInterest(symbol: string): Promise<ShortInterestData> {
    // Check cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // Obtener datos de Yahoo Finance
      const data = await this.fetchFromYahoo(symbol);
      
      if (data) {
        cache.set(symbol, { data, timestamp: Date.now() });
        logger.info(`[ShortInterest] ${symbol}: ${data.shortPercent.toFixed(1)}% short, level: ${data.level}`);
        return data;
      }

      return this.getDefaultData();
    } catch (error) {
      logger.error(`[ShortInterest] Error fetching for ${symbol}:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Fetch short interest data from Yahoo Finance
   */
  async fetchFromYahoo(symbol: string): Promise<ShortInterestData | null> {
    try {
      // Intentar primero con v11 (más nuevo y más datos)
      const url = `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics`;
      
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        // Fallback a v10
        return this.fetchFromYahooV10(symbol);
      }

      const json = await response.json() as any;
      const stats = json.quoteSummary?.result?.[0]?.defaultKeyStatistics;
      
      if (!stats) {
        return this.fetchFromYahooV10(symbol);
      }

      return this.parseYahooStats(stats, null);
    } catch (error) {
      logger.debug(`[ShortInterest] v11 failed, trying v10`);
      return this.fetchFromYahooV10(symbol);
    }
  },

  /**
   * Fallback a v10
   */
  async fetchFromYahooV10(symbol: string): Promise<ShortInterestData | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,price`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return null;
      }

      const json = await response.json() as any;
      const stats = json.quoteSummary?.result?.[0]?.defaultKeyStatistics;
      const priceData = json.quoteSummary?.result?.[0]?.price;
      
      if (!stats) {
        return null;
      }

      return this.parseYahooStats(stats, priceData);
    } catch {
      return null;
    }
  },

  /**
   * Parsea los stats de Yahoo
   */
  parseYahooStats(stats: any, priceData: any): ShortInterestData | null {
    try {
      // Extraer datos
      const shortShares = stats.sharesShort?.raw || 0;
      const floatShares = stats.floatShares?.raw || 0;
      const shortPercent = stats.shortPercentOfFloat?.raw 
        ? stats.shortPercentOfFloat.raw * 100 
        : (floatShares > 0 ? (shortShares / floatShares) * 100 : 0);
      
      const avgVolume = priceData?.averageDailyVolume10Day?.raw || stats.averageVolume?.raw || 1;
      const daysToCover = avgVolume > 0 ? shortShares / avgVolume : 0;

      // Si no hay datos de short, retornar null
      if (shortShares === 0 && floatShares === 0) {
        return null;
      }

      // Determinar nivel
      const level = this.determineLevel(shortPercent);
      const squeezeRisk = this.determineSqueezeRisk(shortPercent, daysToCover);
      const { signal, summary, tradingImplication } = this.analyze(shortPercent, daysToCover, level, squeezeRisk);

      return {
        shortPercent,
        shortShares,
        floatShares,
        daysToCover,
        avgVolume,
        level,
        squeezeRisk,
        signal,
        summary,
        tradingImplication,
        hasData: true,
        lastUpdate: stats.dateShortInterest?.fmt || null,
      };
    } catch (error) {
      logger.debug(`[ShortInterest] Failed to parse stats`);
      return null;
    }
  },

  /**
   * Determina el nivel de short interest
   */
  determineLevel(shortPercent: number): ShortInterestData['level'] {
    if (shortPercent < 3) return 'low';
    if (shortPercent < 5) return 'normal';
    if (shortPercent < 10) return 'elevated';
    if (shortPercent < 20) return 'high';
    return 'extreme';
  },

  /**
   * Determina el riesgo de short squeeze
   */
  determineSqueezeRisk(shortPercent: number, daysToCover: number): ShortInterestData['squeezeRisk'] {
    // Short squeeze más probable con:
    // - Alto % en cortos
    // - Muchos días para cubrir (baja liquidez)
    
    const score = (shortPercent / 10) + (daysToCover / 2);
    
    if (score < 1) return 'none';
    if (score < 2) return 'low';
    if (score < 4) return 'medium';
    return 'high';
  },

  /**
   * Analiza y genera interpretación
   */
  analyze(
    shortPercent: number,
    daysToCover: number,
    level: ShortInterestData['level'],
    squeezeRisk: ShortInterestData['squeezeRisk']
  ): { signal: 'bullish' | 'bearish' | 'neutral'; summary: string; tradingImplication: string } {
    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let summary = '';
    let tradingImplication = '';

    if (level === 'extreme') {
      signal = 'bullish'; // Contrarian: mucho short = potencial squeeze
      summary = `🔥 Short Interest EXTREMO (${shortPercent.toFixed(1)}%). ${daysToCover.toFixed(1)} días para cubrir.`;
      tradingImplication = 'Alto riesgo de SHORT SQUEEZE. Los cortos podrían verse forzados a cubrir, impulsando el precio. Pero también indica que muchos creen que va a bajar.';
    } else if (level === 'high') {
      signal = 'bullish';
      summary = `⚠️ Short Interest ALTO (${shortPercent.toFixed(1)}%). Muchos apuestan a la baja.`;
      tradingImplication = 'Potencial de squeeze si hay catalizador positivo. Cualquier buena noticia puede disparar el precio.';
    } else if (level === 'elevated') {
      signal = 'neutral';
      summary = `📊 Short Interest elevado (${shortPercent.toFixed(1)}%). Por encima de lo normal.`;
      tradingImplication = 'Hay escepticismo sobre esta acción. Vigilar catalizadores.';
    } else if (level === 'normal') {
      signal = 'neutral';
      summary = `✓ Short Interest normal (${shortPercent.toFixed(1)}%).`;
      tradingImplication = 'Nivel típico de mercado. No es factor determinante.';
    } else {
      signal = 'neutral';
      summary = `✓ Short Interest bajo (${shortPercent.toFixed(1)}%). Pocos apuestan a la baja.`;
      tradingImplication = 'La mayoría es alcista o neutral. Sin presión de cortos.';
    }

    // Añadir info de days to cover si es relevante
    if (daysToCover > 5) {
      summary += ` Alto days-to-cover (${daysToCover.toFixed(1)} días).`;
    }

    return { signal, summary, tradingImplication };
  },

  /**
   * Datos por defecto cuando no hay información
   */
  getDefaultData(): ShortInterestData {
    return {
      shortPercent: 0,
      shortShares: 0,
      floatShares: 0,
      daysToCover: 0,
      avgVolume: 0,
      level: 'normal',
      squeezeRisk: 'none',
      signal: 'neutral',
      summary: 'ℹ️ Short Interest no disponible en tiempo real. Fuente de datos limitada.',
      tradingImplication: 'Busca short interest en finviz.com o shortinterest.com para datos actualizados. Los reportes se publican quincenalmente.',
      hasData: false,
      lastUpdate: null,
    };
  },
};
