/**
 * ETF Flows Service
 * 
 * Analiza flujos de entrada/salida en ETFs por sector:
 * - Inflows grandes = dinero entrando al sector
 * - Outflows grandes = dinero saliendo del sector
 * 
 * ETFs clave:
 * - SPY/VOO: S&P 500
 * - QQQ: Nasdaq/Tech
 * - XLF: Financials
 * - XLE: Energy
 * - GLD: Gold
 */

import { logger } from '../../middleware/logger.js';

export interface ETFFlowData {
  symbol: string;
  
  relatedETFs: Array<{
    symbol: string;
    name: string;
    aum: number;
    avgVolume: number;
    currentVolume: number;
    volumeRatio: number;
    estimatedFlow: 'inflow' | 'outflow' | 'neutral';
    flowStrength: number;
  }>;
  
  sectorFlow: {
    direction: 'strong_inflow' | 'inflow' | 'neutral' | 'outflow' | 'strong_outflow';
    strength: number;
    topInflows: string[];
    topOutflows: string[];
  };
  
  relativeToMarket: {
    spyFlow: 'inflow' | 'outflow' | 'neutral';
    qqqFlow: 'inflow' | 'outflow' | 'neutral';
    sectorVsMarket: 'outperforming' | 'underperforming' | 'inline';
  };
  
  etfFlowScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
}

// Mapeo de acciones a ETFs del sector
const STOCK_TO_SECTOR_ETF_MAP: Record<string, { sector: string; etfs: string[] }> = {
  // Tech
  'AAPL': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT'] },
  'MSFT': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT'] },
  'GOOGL': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT'] },
  'META': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT'] },
  'NVDA': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'SMH', 'SOXX'] },
  'AMD': { sector: 'Semiconductors', etfs: ['SMH', 'SOXX', 'XLK'] },
  
  // Consumer
  'AMZN': { sector: 'Consumer Discretionary', etfs: ['XLY', 'QQQ'] },
  'TSLA': { sector: 'Consumer Discretionary', etfs: ['XLY', 'QQQ'] },
  
  // Financials
  'JPM': { sector: 'Financials', etfs: ['XLF', 'KBE', 'VFH'] },
  'BAC': { sector: 'Financials', etfs: ['XLF', 'KBE'] },
  'GS': { sector: 'Financials', etfs: ['XLF', 'KBE'] },
  'V': { sector: 'Financials', etfs: ['XLF', 'IPAY'] },
  'MA': { sector: 'Financials', etfs: ['XLF', 'IPAY'] },
  
  // Healthcare
  'JNJ': { sector: 'Healthcare', etfs: ['XLV', 'VHT'] },
  'UNH': { sector: 'Healthcare', etfs: ['XLV', 'VHT'] },
  'PFE': { sector: 'Healthcare', etfs: ['XLV', 'IBB', 'XBI'] },
  
  // Energy
  'XOM': { sector: 'Energy', etfs: ['XLE', 'VDE'] },
  'CVX': { sector: 'Energy', etfs: ['XLE', 'VDE'] },
  
  // Crypto
  'BTC-USD': { sector: 'Crypto', etfs: ['BITO', 'GBTC'] },
  'ETH-USD': { sector: 'Crypto', etfs: ['ETHE'] },
  
  // Europeas
  'ITX.MC': { sector: 'EU Consumer', etfs: ['EZU', 'VGK', 'FEZ'] },
  'SAN.MC': { sector: 'EU Financials', etfs: ['EUFN', 'EZU', 'VGK'] },
  'BBVA.MC': { sector: 'EU Financials', etfs: ['EUFN', 'EZU', 'VGK'] },
  'SAP.DE': { sector: 'EU Technology', etfs: ['EZU', 'VGK', 'FEZ'] },
};

const MARKET_ETFS = ['SPY', 'QQQ', 'IWM'];

// Cache
const cache = new Map<string, { data: ETFFlowData; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

function getCached(symbol: string): ETFFlowData | null {
  const cached = cache.get(symbol.toUpperCase());
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(symbol.toUpperCase());
  return null;
}

function setCache(symbol: string, data: ETFFlowData): void {
  cache.set(symbol.toUpperCase(), { data, expiresAt: Date.now() + CACHE_TTL });
}

export const etfFlowsService = {
  /**
   * Obtiene datos de flujos de ETFs para un símbolo
   */
  async getETFFlows(symbol: string): Promise<ETFFlowData> {
    const cached = getCached(symbol);
    if (cached) return cached;
    
    logger.info(`[ETFFlows] Analyzing flows for ${symbol}`);
    
    try {
      const sectorMapping = STOCK_TO_SECTOR_ETF_MAP[symbol];
      
      if (!sectorMapping) {
        return this.analyzeGeneralMarketFlows(symbol);
      }
      
      // Obtener datos de ETFs del sector + mercado
      const etfsToAnalyze = [...new Set([...sectorMapping.etfs, ...MARKET_ETFS])];
      const etfDataPromises = etfsToAnalyze.map(etf => this.getETFData(etf));
      const etfResults = await Promise.allSettled(etfDataPromises);
      
      const relatedETFs: ETFFlowData['relatedETFs'] = [];
      let spyFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
      let qqqFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
      
      for (let i = 0; i < etfResults.length; i++) {
        const result = etfResults[i];
        const etfSymbol = etfsToAnalyze[i];
        
        if (result.status === 'fulfilled' && result.value) {
          const data = result.value;
          const volumeRatio = data.avgVolume > 0 ? data.currentVolume / data.avgVolume : 1;
          
          // Estimar flujo basado en volumen y precio
          const { estimatedFlow, flowStrength } = this.estimateFlow(data, volumeRatio);
          
          relatedETFs.push({
            symbol: etfSymbol,
            name: data.name,
            aum: data.aum,
            avgVolume: data.avgVolume,
            currentVolume: data.currentVolume,
            volumeRatio,
            estimatedFlow,
            flowStrength,
          });
          
          // Guardar flujos de SPY y QQQ
          if (etfSymbol === 'SPY') spyFlow = estimatedFlow;
          if (etfSymbol === 'QQQ') qqqFlow = estimatedFlow;
        }
      }
      
      // Calcular flujo del sector
      const sectorFlow = this.calculateSectorFlow(relatedETFs, sectorMapping.etfs);
      
      // Comparar con mercado
      const sectorVsMarket = this.compareSectorToMarket(sectorFlow, spyFlow, qqqFlow);
      
      // Calcular score
      const score = this.calculateScore(sectorFlow, spyFlow, qqqFlow, relatedETFs);
      
      // Generar summary
      const summary = this.generateSummary(sectorMapping.sector, sectorFlow, sectorVsMarket, score);
      
      const result: ETFFlowData = {
        symbol,
        relatedETFs,
        sectorFlow,
        relativeToMarket: {
          spyFlow,
          qqqFlow,
          sectorVsMarket,
        },
        etfFlowScore: score,
        hasData: true,
        summary,
      };
      
      setCache(symbol, result);
      logger.info(`[ETFFlows] Score: ${score} for ${symbol}`);
      
      return result;
      
    } catch (error) {
      logger.error(`[ETFFlows] Error:`, error);
      return this.getEmptyResult(symbol, 'Error analyzing ETF flows');
    }
  },

  /**
   * Obtiene datos de un ETF
   */
  async getETFData(etfSymbol: string): Promise<{
    name: string;
    aum: number;
    avgVolume: number;
    currentVolume: number;
    priceChange: number;
  } | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${etfSymbol}?interval=1d&range=1mo`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) return null;
      
      const data: any = await response.json();
      const result = data.chart?.result?.[0];
      
      if (!result) return null;
      
      const meta = result.meta || {};
      const quote = result.indicators?.quote?.[0];
      
      if (!quote?.volume) return null;
      
      const volumes = quote.volume.filter((v: any) => v !== null) as number[];
      const closes = quote.close.filter((c: any) => c !== null) as number[];
      
      const avgVolume = volumes.length > 5 
        ? volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length)
        : 0;
      
      const currentVolume = volumes[volumes.length - 1] || 0;
      const currentPrice = closes[closes.length - 1] || 0;
      const prevPrice = closes[closes.length - 2] || currentPrice;
      const priceChange = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;
      
      return {
        name: meta.shortName || etfSymbol,
        aum: meta.regularMarketVolume * meta.regularMarketPrice || 0,
        avgVolume,
        currentVolume,
        priceChange,
      };
      
    } catch (error) {
      logger.debug(`[ETFFlows] Error fetching ${etfSymbol}:`, error);
      return null;
    }
  },

  /**
   * Estima flujo basado en volumen y precio
   */
  estimateFlow(data: { priceChange: number; currentVolume: number; avgVolume: number }, volumeRatio: number): {
    estimatedFlow: 'inflow' | 'outflow' | 'neutral';
    flowStrength: number;
  } {
    // Alto volumen + precio subiendo = inflow
    // Alto volumen + precio bajando = outflow
    // Bajo volumen = neutral
    
    let estimatedFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
    let flowStrength = 0;
    
    if (volumeRatio > 1.2) {
      // Alto volumen
      if (data.priceChange > 0.5) {
        estimatedFlow = 'inflow';
        flowStrength = Math.min(100, volumeRatio * 40);
      } else if (data.priceChange < -0.5) {
        estimatedFlow = 'outflow';
        flowStrength = Math.min(100, volumeRatio * 40);
      } else {
        flowStrength = 20;
      }
    } else if (volumeRatio < 0.8) {
      // Bajo volumen
      flowStrength = 10;
    } else {
      // Volumen normal
      if (data.priceChange > 0.3) {
        estimatedFlow = 'inflow';
        flowStrength = 30;
      } else if (data.priceChange < -0.3) {
        estimatedFlow = 'outflow';
        flowStrength = 30;
      }
    }
    
    return { estimatedFlow, flowStrength };
  },

  /**
   * Calcula flujo agregado del sector
   */
  calculateSectorFlow(
    relatedETFs: ETFFlowData['relatedETFs'],
    sectorETFs: string[]
  ): ETFFlowData['sectorFlow'] {
    const sectorOnlyETFs = relatedETFs.filter(e => sectorETFs.includes(e.symbol));
    
    let inflowCount = 0;
    let outflowCount = 0;
    let totalStrength = 0;
    
    const topInflows: string[] = [];
    const topOutflows: string[] = [];
    
    for (const etf of sectorOnlyETFs) {
      if (etf.estimatedFlow === 'inflow') {
        inflowCount++;
        if (etf.flowStrength > 50) topInflows.push(etf.symbol);
      } else if (etf.estimatedFlow === 'outflow') {
        outflowCount++;
        if (etf.flowStrength > 50) topOutflows.push(etf.symbol);
      }
      totalStrength += etf.flowStrength;
    }
    
    const avgStrength = sectorOnlyETFs.length > 0 ? totalStrength / sectorOnlyETFs.length : 0;
    
    let direction: ETFFlowData['sectorFlow']['direction'] = 'neutral';
    
    if (inflowCount > outflowCount + 1 && avgStrength > 60) {
      direction = 'strong_inflow';
    } else if (inflowCount > outflowCount) {
      direction = 'inflow';
    } else if (outflowCount > inflowCount + 1 && avgStrength > 60) {
      direction = 'strong_outflow';
    } else if (outflowCount > inflowCount) {
      direction = 'outflow';
    }
    
    return {
      direction,
      strength: avgStrength,
      topInflows,
      topOutflows,
    };
  },

  /**
   * Compara sector con mercado
   */
  compareSectorToMarket(
    sectorFlow: ETFFlowData['sectorFlow'],
    spyFlow: 'inflow' | 'outflow' | 'neutral',
    qqqFlow: 'inflow' | 'outflow' | 'neutral'
  ): 'outperforming' | 'underperforming' | 'inline' {
    const sectorBullish = sectorFlow.direction.includes('inflow');
    const marketBullish = spyFlow === 'inflow' || qqqFlow === 'inflow';
    
    if (sectorBullish && !marketBullish) {
      return 'outperforming';
    } else if (!sectorBullish && marketBullish) {
      return 'underperforming';
    }
    
    return 'inline';
  },

  /**
   * Calcula score
   */
  calculateScore(
    sectorFlow: ETFFlowData['sectorFlow'],
    spyFlow: string,
    qqqFlow: string,
    relatedETFs: ETFFlowData['relatedETFs']
  ): number {
    let score = 0;
    
    // Flujo del sector (peso 50%)
    switch (sectorFlow.direction) {
      case 'strong_inflow': score += 50; break;
      case 'inflow': score += 25; break;
      case 'outflow': score -= 25; break;
      case 'strong_outflow': score -= 50; break;
    }
    
    // Flujo del mercado (peso 30%)
    if (spyFlow === 'inflow') score += 15;
    else if (spyFlow === 'outflow') score -= 15;
    
    if (qqqFlow === 'inflow') score += 15;
    else if (qqqFlow === 'outflow') score -= 15;
    
    // Fuerza promedio (peso 20%)
    const avgStrength = relatedETFs.length > 0
      ? relatedETFs.reduce((sum, e) => sum + e.flowStrength, 0) / relatedETFs.length
      : 0;
    
    score += (avgStrength - 50) * 0.2;
    
    return Math.round(Math.max(-100, Math.min(100, score)));
  },

  /**
   * Genera summary
   */
  generateSummary(
    sector: string,
    sectorFlow: ETFFlowData['sectorFlow'],
    sectorVsMarket: string,
    score: number
  ): string {
    const parts: string[] = [];
    
    // Dirección del sector
    switch (sectorFlow.direction) {
      case 'strong_inflow':
        parts.push(`📈 Fuertes entradas en ${sector}`);
        break;
      case 'inflow':
        parts.push(`📈 Entradas en ${sector}`);
        break;
      case 'outflow':
        parts.push(`📉 Salidas de ${sector}`);
        break;
      case 'strong_outflow':
        parts.push(`📉 Fuertes salidas de ${sector}`);
        break;
      default:
        parts.push(`➖ Flujos neutros en ${sector}`);
    }
    
    // Comparación con mercado
    if (sectorVsMarket === 'outperforming') {
      parts.push('✨ Superando al mercado');
    } else if (sectorVsMarket === 'underperforming') {
      parts.push('⚠️ Rezagado vs mercado');
    }
    
    // Top ETFs
    if (sectorFlow.topInflows.length > 0) {
      parts.push(`Inflows: ${sectorFlow.topInflows.join(', ')}`);
    }
    if (sectorFlow.topOutflows.length > 0) {
      parts.push(`Outflows: ${sectorFlow.topOutflows.join(', ')}`);
    }
    
    parts.push(`Score: ${score > 0 ? '+' : ''}${score}`);
    
    return parts.join(' | ');
  },

  /**
   * Analiza flujos de mercado general
   */
  async analyzeGeneralMarketFlows(symbol: string): Promise<ETFFlowData> {
    const etfDataPromises = MARKET_ETFS.map(etf => this.getETFData(etf));
    const results = await Promise.allSettled(etfDataPromises);
    
    const relatedETFs: ETFFlowData['relatedETFs'] = [];
    let spyFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
    let qqqFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const etfSymbol = MARKET_ETFS[i];
      
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        const volumeRatio = data.avgVolume > 0 ? data.currentVolume / data.avgVolume : 1;
        const { estimatedFlow, flowStrength } = this.estimateFlow(data, volumeRatio);
        
        relatedETFs.push({
          symbol: etfSymbol,
          name: data.name,
          aum: data.aum,
          avgVolume: data.avgVolume,
          currentVolume: data.currentVolume,
          volumeRatio,
          estimatedFlow,
          flowStrength,
        });
        
        if (etfSymbol === 'SPY') spyFlow = estimatedFlow;
        if (etfSymbol === 'QQQ') qqqFlow = estimatedFlow;
      }
    }
    
    const sectorFlow: ETFFlowData['sectorFlow'] = {
      direction: spyFlow === 'inflow' ? 'inflow' : spyFlow === 'outflow' ? 'outflow' : 'neutral',
      strength: 50,
      topInflows: [],
      topOutflows: [],
    };
    
    return {
      symbol,
      relatedETFs,
      sectorFlow,
      relativeToMarket: {
        spyFlow,
        qqqFlow,
        sectorVsMarket: 'inline',
      },
      etfFlowScore: 0,
      hasData: true,
      summary: `Flujos de mercado general (símbolo ${symbol} no mapeado a sector específico)`,
    };
  },

  /**
   * Resultado vacío
   */
  getEmptyResult(symbol: string, message: string): ETFFlowData {
    return {
      symbol,
      relatedETFs: [],
      sectorFlow: {
        direction: 'neutral',
        strength: 0,
        topInflows: [],
        topOutflows: [],
      },
      relativeToMarket: {
        spyFlow: 'neutral',
        qqqFlow: 'neutral',
        sectorVsMarket: 'inline',
      },
      etfFlowScore: 0,
      hasData: false,
      summary: message,
    };
  },

  /**
   * Calcula impacto en predicción
   */
  calculatePredictionImpact(data: ETFFlowData): number {
    if (!data.hasData) return 0;
    return Math.round(data.etfFlowScore * 0.02); // Max ±2%
  },
};
