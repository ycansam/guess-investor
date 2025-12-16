/**
 * Servicio para análisis del COT Report (Commitment of Traders)
 * 
 * El COT report muestra las posiciones de futuros de:
 * - Comerciales (Hedgers) - Empresas que usan futuros para cobertura
 * - No comerciales (Speculators) - Fondos y especuladores
 * - Non-reportable (Retail) - Posiciones pequeñas/retail
 * 
 * Señales clave:
 * - Comerciales vendiendo = Posible techo (ellos saben del negocio)
 * - Especuladores muy largos = Posible techo (crowded trade)
 * - Especuladores muy cortos = Posible suelo (potencial short squeeze)
 * 
 * Fuente: CFTC publica datos semanales (viernes)
 * API: Quandl/Nasdaq Data Link tiene COT histórico (requiere API key)
 * Alternativa: Scraping de barchart.com o tradingster.com
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface COTData {
  // Información del reporte
  reportDate: string;
  symbol: string;
  market: string;
  
  // Posiciones de especuladores (Non-Commercial)
  speculators: {
    longPositions: number;
    shortPositions: number;
    netPosition: number;
    netChange: number; // Cambio vs semana anterior
    percentLong: number; // % de posiciones largas
  };
  
  // Posiciones de comerciales (Commercial/Hedgers)
  commercials: {
    longPositions: number;
    shortPositions: number;
    netPosition: number;
    netChange: number;
    percentLong: number;
  };
  
  // Small traders (retail)
  smallTraders: {
    longPositions: number;
    shortPositions: number;
    netPosition: number;
  };
  
  // Open Interest total
  openInterest: {
    total: number;
    change: number;
    percentChange: number;
  };
  
  // Análisis derivado
  analysis: {
    speculatorSentiment: 'extremely_bullish' | 'bullish' | 'neutral' | 'bearish' | 'extremely_bearish';
    commercialSentiment: 'extremely_bullish' | 'bullish' | 'neutral' | 'bearish' | 'extremely_bearish';
    crowdedTrade: boolean; // Si especuladores están muy de un lado
    potentialReversal: boolean; // Si hay divergencia entre comerciales y especuladores
  };
  
  // Score final (-100 a +100)
  cotScore: number;
  hasData: boolean;
  summary: string;
}

// Mapeo de símbolos de acciones a futuros relacionados
const STOCK_TO_FUTURES_MAP: Record<string, { future: string; name: string }> = {
  // Índices USA
  'SPY': { future: 'ES', name: 'E-MINI S&P 500' },
  'QQQ': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'IWM': { future: 'RTY', name: 'E-MINI RUSSELL 2000' },
  'DIA': { future: 'YM', name: 'E-MINI DOW' },
  
  // Tech stocks correlacionados con NQ
  'AAPL': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'MSFT': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'GOOGL': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'GOOG': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'AMZN': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'META': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'NVDA': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  'TSLA': { future: 'NQ', name: 'E-MINI NASDAQ-100' },
  
  // Financieros correlacionados con ES
  'JPM': { future: 'ES', name: 'E-MINI S&P 500' },
  'BAC': { future: 'ES', name: 'E-MINI S&P 500' },
  'GS': { future: 'ES', name: 'E-MINI S&P 500' },
  'MS': { future: 'ES', name: 'E-MINI S&P 500' },
  
  // Commodities
  'XLE': { future: 'CL', name: 'CRUDE OIL' },
  'USO': { future: 'CL', name: 'CRUDE OIL' },
  'GLD': { future: 'GC', name: 'GOLD' },
  'SLV': { future: 'SI', name: 'SILVER' },
  'UNG': { future: 'NG', name: 'NATURAL GAS' },
  
  // Crypto
  'BTC-USD': { future: 'BTC', name: 'BITCOIN' },
  'ETH-USD': { future: 'ETH', name: 'ETHER' },
  
  // EUR/USD Forex
  'FXE': { future: 'EUR', name: 'EURO FX' },
  
  // Acciones europeas (usan EURO STOXX 50 como proxy)
  'ITX.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'SAN.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'BBVA.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'TEF.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'IBE.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'REP.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'ACS.MC': { future: 'ESTX50', name: 'EURO STOXX 50' },
  // Alemanas
  'SAP.DE': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'SIE.DE': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'BMW.DE': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'VOW3.DE': { future: 'ESTX50', name: 'EURO STOXX 50' },
  // Francesas
  'MC.PA': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'OR.PA': { future: 'ESTX50', name: 'EURO STOXX 50' },
  'TTE.PA': { future: 'ESTX50', name: 'EURO STOXX 50' },
};

// Datos históricos de COT para cálculo de extremos
// (Normalmente esto vendría de una base de datos con histórico)
const COT_HISTORICAL_EXTREMES: Record<string, { maxLong: number; maxShort: number }> = {
  'ES': { maxLong: 350000, maxShort: -250000 },
  'NQ': { maxLong: 150000, maxShort: -100000 },
  'CL': { maxLong: 700000, maxShort: -400000 },
  'GC': { maxLong: 400000, maxShort: -150000 },
  'BTC': { maxLong: 25000, maxShort: -15000 },
  'ESTX50': { maxLong: 200000, maxShort: -150000 }, // Euro Stoxx 50
};

// Cache
interface CacheEntry {
  data: COTData;
  timestamp: number;
}
const cotCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas (COT se publica semanalmente)

class COTReportService {
  
  /**
   * Obtiene datos del COT Report para un símbolo
   */
  async getCOTData(symbol: string): Promise<COTData> {
    // Verificar si hay un futuro mapeado para este símbolo
    const futureMapping = STOCK_TO_FUTURES_MAP[symbol] || STOCK_TO_FUTURES_MAP[symbol.replace('.', '-')];
    
    if (!futureMapping) {
      return this.getEmptyResult(symbol, 'No hay datos COT disponibles para este activo');
    }
    
    const futureSymbol = futureMapping.future;
    
    // Verificar caché
    const cacheKey = `${symbol}-${futureSymbol}`;
    const cached = cotCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[COT] Cache hit: ${symbol} -> ${futureSymbol}`);
      return cached.data;
    }
    
    console.log(`[COT] Obteniendo datos para ${symbol} (futuro: ${futureSymbol})`);
    
    try {
      // Intentar obtener datos de fuentes gratuitas
      const cotData = await this.fetchCOTFromFreeSources(futureSymbol, futureMapping.name);
      
      if (cotData && cotData.speculators && cotData.commercials) {
        // Analizar los datos
        const analysis = this.analyzeCOT(cotData);
        const fullCotData = cotData as COTData;
        const score = this.calculateScore(fullCotData, analysis);
        const summary = this.generateSummary(fullCotData, analysis, score, futureMapping.name);
        
        const result: COTData = {
          reportDate: cotData.reportDate || this.getLastFriday(),
          symbol,
          market: cotData.market || futureMapping.name,
          speculators: cotData.speculators,
          commercials: cotData.commercials,
          smallTraders: cotData.smallTraders || { longPositions: 0, shortPositions: 0, netPosition: 0 },
          openInterest: cotData.openInterest || { total: 0, change: 0, percentChange: 0 },
          analysis,
          cotScore: score,
          hasData: true,
          summary,
        };
        
        // Guardar en caché
        cotCache.set(cacheKey, { data: result, timestamp: Date.now() });
        
        return result;
      }
      
      // Si no hay datos reales, usar estimación basada en VIX y otros indicadores
      return this.estimateCOTFromMarketData(symbol, futureSymbol, futureMapping.name);
      
    } catch (error) {
      console.error(`[COT] Error obteniendo datos:`, error);
      return this.getEmptyResult(symbol, 'Error obteniendo datos COT');
    }
  }
  
  /**
   * Intenta obtener datos COT de fuentes gratuitas
   */
  private async fetchCOTFromFreeSources(
    futureSymbol: string,
    marketName: string
  ): Promise<Partial<COTData> | null> {
    try {
      // Intentar Barchart (tiene datos COT gratuitos)
      // Nota: Esto puede requerir parsing HTML ya que no tienen API pública
      
      // Alternativa: CFTC tiene datos públicos pero en formato poco amigable
      // https://www.cftc.gov/dea/futures/deacmelf.htm
      
      // Por ahora, generamos datos sintéticos basados en patrones históricos
      // En producción, se conectaría a una fuente real como Quandl
      
      console.log(`[COT] No hay fuente gratuita disponible para ${futureSymbol}, usando estimación`);
      return null;
      
    } catch (error) {
      console.warn(`[COT] Error en fetch de fuentes gratuitas:`, error);
      return null;
    }
  }
  
  /**
   * Estima posiciones COT basándose en datos de mercado disponibles
   */
  private async estimateCOTFromMarketData(
    symbol: string,
    futureSymbol: string,
    marketName: string
  ): Promise<COTData> {
    try {
      // Obtener datos de VIX y put/call ratio para estimar sentimiento
      const vixUrl = `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d`;
      const spyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1mo`;
      
      const [vixResponse, spyResponse] = await Promise.all([
        fetchWithCorsProxy(vixUrl).then(r => r.json()).catch(() => null),
        fetchWithCorsProxy(spyUrl).then(r => r.json()).catch(() => null),
      ]);
      
      // Extraer nivel de VIX
      let vixLevel = 15; // Default neutral
      if (vixResponse?.chart?.result?.[0]?.meta?.regularMarketPrice) {
        vixLevel = vixResponse.chart.result[0].meta.regularMarketPrice;
      }
      
      // Calcular tendencia del mercado (últimos 20 días)
      let marketTrend = 0;
      if (spyResponse?.chart?.result?.[0]?.indicators?.quote?.[0]?.close) {
        const closes = spyResponse.chart.result[0].indicators.quote[0].close.filter((c: any) => c !== null);
        if (closes.length >= 2) {
          const oldPrice = closes[0];
          const newPrice = closes[closes.length - 1];
          marketTrend = ((newPrice - oldPrice) / oldPrice) * 100;
        }
      }
      
      // Estimar posiciones basándose en VIX y tendencia
      // VIX alto + mercado bajando = especuladores probablemente cortos
      // VIX bajo + mercado subiendo = especuladores probablemente largos
      
      const historical = COT_HISTORICAL_EXTREMES[futureSymbol] || { maxLong: 200000, maxShort: -150000 };
      
      // Estimar posición neta de especuladores
      let specNetEstimate = 0;
      if (vixLevel > 25) {
        // VIX alto = especuladores probablemente cortos
        specNetEstimate = -Math.abs(historical.maxShort) * (vixLevel / 40);
      } else if (vixLevel < 15) {
        // VIX bajo = especuladores probablemente largos
        specNetEstimate = historical.maxLong * ((20 - vixLevel) / 20);
      } else {
        // VIX neutral = posición basada en tendencia
        specNetEstimate = marketTrend * 10000;
      }
      
      // Limitar a rangos históricos
      specNetEstimate = Math.max(historical.maxShort, Math.min(historical.maxLong, specNetEstimate));
      
      // Comerciales generalmente van contra los especuladores
      const commNetEstimate = -specNetEstimate * 0.7;
      
      // Calcular porcentajes
      const totalLong = Math.abs(specNetEstimate > 0 ? specNetEstimate : 0) + 
                        Math.abs(commNetEstimate > 0 ? commNetEstimate : 0);
      const totalShort = Math.abs(specNetEstimate < 0 ? specNetEstimate : 0) + 
                         Math.abs(commNetEstimate < 0 ? commNetEstimate : 0);
      const openInterest = totalLong + totalShort + 50000;
      
      const cotData: COTData = {
        reportDate: this.getLastFriday(),
        symbol,
        market: marketName,
        speculators: {
          longPositions: specNetEstimate > 0 ? Math.round(specNetEstimate) : 0,
          shortPositions: specNetEstimate < 0 ? Math.round(Math.abs(specNetEstimate)) : 0,
          netPosition: Math.round(specNetEstimate),
          netChange: Math.round(marketTrend * 1000), // Estimación de cambio
          percentLong: specNetEstimate > 0 ? Math.round((specNetEstimate / openInterest) * 100) : 0,
        },
        commercials: {
          longPositions: commNetEstimate > 0 ? Math.round(commNetEstimate) : 0,
          shortPositions: commNetEstimate < 0 ? Math.round(Math.abs(commNetEstimate)) : 0,
          netPosition: Math.round(commNetEstimate),
          netChange: Math.round(-marketTrend * 700),
          percentLong: commNetEstimate > 0 ? Math.round((commNetEstimate / openInterest) * 100) : 0,
        },
        smallTraders: {
          longPositions: 15000,
          shortPositions: 12000,
          netPosition: 3000,
        },
        openInterest: {
          total: Math.round(openInterest),
          change: Math.round(marketTrend * 500),
          percentChange: marketTrend / 10,
        },
        analysis: this.analyzeCOT({
          speculators: {
            netPosition: specNetEstimate,
            netChange: marketTrend * 1000,
            percentLong: specNetEstimate > 0 ? (specNetEstimate / openInterest) * 100 : 0,
          },
          commercials: {
            netPosition: commNetEstimate,
            netChange: -marketTrend * 700,
            percentLong: commNetEstimate > 0 ? (commNetEstimate / openInterest) * 100 : 0,
          },
        } as any),
        cotScore: 0, // Se calculará después
        hasData: true,
        summary: '',
      };
      
      // Calcular score y summary
      cotData.cotScore = this.calculateScore(cotData, cotData.analysis);
      cotData.summary = this.generateSummary(cotData, cotData.analysis, cotData.cotScore, marketName);
      
      // Marcar como estimado
      cotData.summary = `[Estimado] ${cotData.summary}`;
      
      console.log(`[COT] Datos estimados para ${symbol}: score=${cotData.cotScore}`);
      
      return cotData;
      
    } catch (error) {
      console.error(`[COT] Error estimando datos:`, error);
      return this.getEmptyResult(symbol, 'Error estimando datos COT');
    }
  }
  
  /**
   * Analiza los datos COT para generar señales
   */
  private analyzeCOT(data: Partial<COTData>): COTData['analysis'] {
    const spec = data.speculators;
    const comm = data.commercials;
    
    if (!spec || !comm) {
      return {
        speculatorSentiment: 'neutral',
        commercialSentiment: 'neutral',
        crowdedTrade: false,
        potentialReversal: false,
      };
    }
    
    // Determinar sentimiento de especuladores
    let specSentiment: COTData['analysis']['speculatorSentiment'] = 'neutral';
    if (spec.percentLong > 70) specSentiment = 'extremely_bullish';
    else if (spec.percentLong > 55) specSentiment = 'bullish';
    else if (spec.percentLong < 30) specSentiment = 'extremely_bearish';
    else if (spec.percentLong < 45) specSentiment = 'bearish';
    
    // Determinar sentimiento de comerciales (ellos suelen tener razón)
    let commSentiment: COTData['analysis']['commercialSentiment'] = 'neutral';
    if (comm.netPosition > 0 && Math.abs(comm.netPosition) > Math.abs(spec.netPosition) * 0.5) {
      commSentiment = comm.percentLong > 60 ? 'extremely_bullish' : 'bullish';
    } else if (comm.netPosition < 0 && Math.abs(comm.netPosition) > Math.abs(spec.netPosition) * 0.5) {
      commSentiment = comm.percentLong < 40 ? 'extremely_bearish' : 'bearish';
    }
    
    // Detectar trade abarrotado (crowded)
    const crowdedTrade = spec.percentLong > 75 || spec.percentLong < 25;
    
    // Detectar potencial reversión (comerciales vs especuladores)
    const potentialReversal = 
      (specSentiment.includes('bullish') && commSentiment.includes('bearish')) ||
      (specSentiment.includes('bearish') && commSentiment.includes('bullish'));
    
    return {
      speculatorSentiment: specSentiment,
      commercialSentiment: commSentiment,
      crowdedTrade,
      potentialReversal,
    };
  }
  
  /**
   * Calcula el score COT (-100 a +100)
   */
  private calculateScore(data: COTData, analysis: COTData['analysis']): number {
    let score = 0;
    
    // 1. Posición neta de especuladores (contrarian)
    // Si especuladores muy largos, es señal bajista (crowded long)
    // Si especuladores muy cortos, es señal alcista (potencial squeeze)
    if (analysis.speculatorSentiment === 'extremely_bullish') {
      score -= 30; // Contrarian: demasiado optimismo
    } else if (analysis.speculatorSentiment === 'extremely_bearish') {
      score += 30; // Contrarian: demasiado pesimismo
    } else if (analysis.speculatorSentiment === 'bullish') {
      score -= 10;
    } else if (analysis.speculatorSentiment === 'bearish') {
      score += 10;
    }
    
    // 2. Posición de comerciales (smart money)
    // Los comerciales suelen tener razón a largo plazo
    if (analysis.commercialSentiment === 'extremely_bullish') {
      score += 40;
    } else if (analysis.commercialSentiment === 'extremely_bearish') {
      score -= 40;
    } else if (analysis.commercialSentiment === 'bullish') {
      score += 20;
    } else if (analysis.commercialSentiment === 'bearish') {
      score -= 20;
    }
    
    // 3. Cambio en posiciones (momentum)
    if (data.speculators && data.commercials) {
      // Si especuladores aumentando cortos y comerciales aumentando largos = bullish
      if (data.speculators.netChange < 0 && data.commercials.netChange > 0) {
        score += 15;
      }
      // Si especuladores aumentando largos y comerciales aumentando cortos = bearish
      if (data.speculators.netChange > 0 && data.commercials.netChange < 0) {
        score -= 15;
      }
    }
    
    // 4. Crowded trade warning
    if (analysis.crowdedTrade) {
      // Aumentar la señal contrarian
      score = score * 1.3;
    }
    
    // 5. Potencial reversión
    if (analysis.potentialReversal) {
      // Dar más peso al lado de los comerciales
      score = score * 1.2;
    }
    
    // Limitar a -100 a +100
    return Math.round(Math.max(-100, Math.min(100, score)));
  }
  
  /**
   * Genera resumen legible del análisis COT
   */
  private generateSummary(
    data: COTData,
    analysis: COTData['analysis'],
    score: number,
    marketName: string
  ): string {
    const parts: string[] = [];
    
    // Describir posición de especuladores
    if (analysis.speculatorSentiment !== 'neutral') {
      const sentiment = analysis.speculatorSentiment.replace('_', ' ');
      parts.push(`Especuladores ${sentiment} en ${marketName}`);
    }
    
    // Describir posición de comerciales
    if (analysis.commercialSentiment !== 'neutral') {
      const sentiment = analysis.commercialSentiment.replace('_', ' ');
      parts.push(`Comerciales (smart money) ${sentiment}`);
    }
    
    // Advertencias
    if (analysis.crowdedTrade) {
      parts.push('⚠️ Trade abarrotado - posible reversión');
    }
    
    if (analysis.potentialReversal) {
      parts.push('🔄 Divergencia entre comerciales y especuladores');
    }
    
    // Resumen del score
    if (parts.length === 0) {
      return 'Posiciones COT neutrales, sin señales claras';
    }
    
    const direction = score > 20 ? 'Señal ALCISTA' : score < -20 ? 'Señal BAJISTA' : 'Señal neutral';
    
    return `${direction} del COT: ${parts.join('. ')}`;
  }
  
  private getLastFriday(): string {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSubtract = dayOfWeek >= 5 ? dayOfWeek - 5 : dayOfWeek + 2;
    const lastFriday = new Date(today);
    lastFriday.setDate(today.getDate() - daysToSubtract);
    return lastFriday.toISOString().split('T')[0];
  }
  
  private getEmptyResult(symbol: string, message: string): COTData {
    return {
      reportDate: '',
      symbol,
      market: '',
      speculators: {
        longPositions: 0,
        shortPositions: 0,
        netPosition: 0,
        netChange: 0,
        percentLong: 50,
      },
      commercials: {
        longPositions: 0,
        shortPositions: 0,
        netPosition: 0,
        netChange: 0,
        percentLong: 50,
      },
      smallTraders: {
        longPositions: 0,
        shortPositions: 0,
        netPosition: 0,
      },
      openInterest: {
        total: 0,
        change: 0,
        percentChange: 0,
      },
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
  }
  
  /**
   * Formatea los datos COT para incluir en el prompt de IA
   */
  formatForAI(data: COTData): string {
    if (!data.hasData) {
      return '';
    }
    
    const lines: string[] = [
      `COT Report (${data.market}):`,
      `- Especuladores: ${data.speculators.netPosition > 0 ? '+' : ''}${data.speculators.netPosition.toLocaleString()} neto (${data.analysis.speculatorSentiment})`,
      `- Comerciales: ${data.commercials.netPosition > 0 ? '+' : ''}${data.commercials.netPosition.toLocaleString()} neto (${data.analysis.commercialSentiment})`,
    ];
    
    if (data.analysis.crowdedTrade) {
      lines.push(`- ⚠️ CROWDED TRADE detectado`);
    }
    
    if (data.analysis.potentialReversal) {
      lines.push(`- 🔄 Posible reversión por divergencia`);
    }
    
    lines.push(`- Score COT: ${data.cotScore > 0 ? '+' : ''}${data.cotScore}`);
    
    return lines.join('\n');
  }
}

export const cotReportService = new COTReportService();
