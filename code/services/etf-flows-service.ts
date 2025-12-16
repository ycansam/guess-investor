/**
 * Servicio para análisis de flujos de ETFs
 * 
 * Los flujos de ETFs muestran dónde están poniendo dinero los inversores:
 * - Inflows grandes = dinero entrando al sector/activo
 * - Outflows grandes = dinero saliendo del sector/activo
 * 
 * ETFs clave para cada sector:
 * - SPY/VOO/IVV: S&P 500
 * - QQQ: Nasdaq/Tech
 * - XLF: Financials
 * - XLE: Energy
 * - XLK: Technology
 * - GLD/IAU: Gold
 * - TLT/IEF: Bonds
 * 
 * Fuente: Datos de volumen y AUM de Yahoo Finance
 * (Los flujos reales requieren suscripción a ETF.com o Bloomberg)
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface ETFFlowData {
  symbol: string;
  
  // ETFs relacionados al activo/sector
  relatedETFs: Array<{
    symbol: string;
    name: string;
    aum: number; // Assets Under Management
    avgVolume: number;
    currentVolume: number;
    volumeRatio: number; // current/avg
    estimatedFlow: 'inflow' | 'outflow' | 'neutral';
    flowStrength: number; // 0-100
  }>;
  
  // Flujo agregado del sector
  sectorFlow: {
    direction: 'strong_inflow' | 'inflow' | 'neutral' | 'outflow' | 'strong_outflow';
    strength: number; // 0-100
    topInflows: string[];
    topOutflows: string[];
  };
  
  // Comparación con flujos de mercado general
  relativeToMarket: {
    spyFlow: 'inflow' | 'outflow' | 'neutral';
    qqqFlow: 'inflow' | 'outflow' | 'neutral';
    sectorVsMarket: 'outperforming' | 'underperforming' | 'inline';
  };
  
  // Score final (-100 a +100)
  etfFlowScore: number;
  hasData: boolean;
  summary: string;
}

// Mapeo de acciones a ETFs del sector
const STOCK_TO_SECTOR_ETF_MAP: Record<string, { sector: string; etfs: string[] }> = {
  // Tech
  'AAPL': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT', 'FTEC'] },
  'MSFT': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT', 'FTEC'] },
  'GOOGL': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT', 'FTEC'] },
  'GOOG': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT', 'FTEC'] },
  'META': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'VGT', 'FTEC'] },
  'NVDA': { sector: 'Technology', etfs: ['XLK', 'QQQ', 'SMH', 'SOXX'] },
  'AMD': { sector: 'Semiconductors', etfs: ['SMH', 'SOXX', 'XLK', 'QQQ'] },
  'INTC': { sector: 'Semiconductors', etfs: ['SMH', 'SOXX', 'XLK'] },
  
  // E-commerce/Consumer
  'AMZN': { sector: 'Consumer Discretionary', etfs: ['XLY', 'QQQ', 'IBUY'] },
  'TSLA': { sector: 'Consumer Discretionary', etfs: ['XLY', 'QQQ', 'DRIV'] },
  'HD': { sector: 'Consumer Discretionary', etfs: ['XLY', 'XHB'] },
  'NKE': { sector: 'Consumer Discretionary', etfs: ['XLY', 'PEJ'] },
  
  // Financials
  'JPM': { sector: 'Financials', etfs: ['XLF', 'KBE', 'KRE', 'VFH'] },
  'BAC': { sector: 'Financials', etfs: ['XLF', 'KBE', 'KRE'] },
  'GS': { sector: 'Financials', etfs: ['XLF', 'KBE', 'IAI'] },
  'MS': { sector: 'Financials', etfs: ['XLF', 'KBE', 'IAI'] },
  'V': { sector: 'Financials', etfs: ['XLF', 'IPAY'] },
  'MA': { sector: 'Financials', etfs: ['XLF', 'IPAY'] },
  
  // Healthcare
  'JNJ': { sector: 'Healthcare', etfs: ['XLV', 'VHT', 'IBB'] },
  'UNH': { sector: 'Healthcare', etfs: ['XLV', 'VHT'] },
  'PFE': { sector: 'Healthcare', etfs: ['XLV', 'IBB', 'XBI'] },
  'MRNA': { sector: 'Healthcare', etfs: ['XBI', 'IBB', 'ARKG'] },
  
  // Energy
  'XOM': { sector: 'Energy', etfs: ['XLE', 'VDE', 'OIH'] },
  'CVX': { sector: 'Energy', etfs: ['XLE', 'VDE', 'OIH'] },
  'COP': { sector: 'Energy', etfs: ['XLE', 'VDE'] },
  
  // Industrials
  'CAT': { sector: 'Industrials', etfs: ['XLI', 'VIS'] },
  'BA': { sector: 'Industrials', etfs: ['XLI', 'ITA'] },
  'UPS': { sector: 'Industrials', etfs: ['XLI', 'IYT'] },
  
  // Utilities
  'NEE': { sector: 'Utilities', etfs: ['XLU', 'VPU'] },
  'DUK': { sector: 'Utilities', etfs: ['XLU', 'VPU'] },
  
  // Real Estate
  'AMT': { sector: 'Real Estate', etfs: ['XLRE', 'VNQ', 'IYR'] },
  'PLD': { sector: 'Real Estate', etfs: ['XLRE', 'VNQ'] },
  
  // Materials
  'LIN': { sector: 'Materials', etfs: ['XLB', 'VAW'] },
  'FCX': { sector: 'Materials', etfs: ['XLB', 'COPX', 'XME'] },
  
  // Consumer Staples
  'PG': { sector: 'Consumer Staples', etfs: ['XLP', 'VDC'] },
  'KO': { sector: 'Consumer Staples', etfs: ['XLP', 'VDC'] },
  'PEP': { sector: 'Consumer Staples', etfs: ['XLP', 'VDC'] },
  'WMT': { sector: 'Consumer Staples', etfs: ['XLP', 'XRT'] },
  
  // Communication
  'DIS': { sector: 'Communication Services', etfs: ['XLC', 'VOX'] },
  'NFLX': { sector: 'Communication Services', etfs: ['XLC', 'VOX', 'QQQ'] },
  'VZ': { sector: 'Communication Services', etfs: ['XLC', 'VOX'] },
  'T': { sector: 'Communication Services', etfs: ['XLC', 'VOX'] },
  
  // Crypto
  'BTC-USD': { sector: 'Crypto', etfs: ['BITO', 'BTF', 'GBTC'] },
  'ETH-USD': { sector: 'Crypto', etfs: ['ETHE', 'ETHU'] },
  
  // Acciones europeas (usan ETFs de Europa como proxy)
  'ITX.MC': { sector: 'Consumer Discretionary EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'SAN.MC': { sector: 'Financials EU', etfs: ['EUFN', 'EZU', 'VGK'] },
  'BBVA.MC': { sector: 'Financials EU', etfs: ['EUFN', 'EZU', 'VGK'] },
  'TEF.MC': { sector: 'Communication EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'IBE.MC': { sector: 'Utilities EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'REP.MC': { sector: 'Energy EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'SAP.DE': { sector: 'Technology EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'SIE.DE': { sector: 'Industrials EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'BMW.DE': { sector: 'Consumer Discretionary EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'VOW3.DE': { sector: 'Consumer Discretionary EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'MC.PA': { sector: 'Consumer Discretionary EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'OR.PA': { sector: 'Consumer Staples EU', etfs: ['EZU', 'VGK', 'FEZ'] },
  'TTE.PA': { sector: 'Energy EU', etfs: ['EZU', 'VGK', 'FEZ'] },
};

// ETFs principales del mercado
const MARKET_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA'];

// Cache
interface CacheEntry {
  data: ETFFlowData;
  timestamp: number;
}
const etfFlowCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

class ETFFlowsService {
  
  /**
   * Obtiene datos de flujos de ETFs para un símbolo
   */
  async getETFFlows(symbol: string): Promise<ETFFlowData> {
    // Verificar caché
    const cached = etfFlowCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[ETFFlows] Cache hit: ${symbol}`);
      return cached.data;
    }
    
    console.log(`[ETFFlows] Analizando flujos para ${symbol}`);
    
    try {
      // Obtener mapeo de sector
      const sectorMapping = STOCK_TO_SECTOR_ETF_MAP[symbol];
      
      if (!sectorMapping) {
        // Si no está mapeado, usar ETFs generales del mercado
        return this.analyzeGeneralMarketFlows(symbol);
      }
      
      // Obtener datos de los ETFs del sector + mercado
      const etfsToAnalyze = [...new Set([...sectorMapping.etfs, ...MARKET_ETFS])];
      
      const etfDataPromises = etfsToAnalyze.map(etf => this.getETFData(etf));
      const etfResults = await Promise.allSettled(etfDataPromises);
      
      const relatedETFs: ETFFlowData['relatedETFs'] = [];
      const sectorETFData: Array<{ symbol: string; flow: string; strength: number }> = [];
      
      let spyFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
      let qqqFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
      
      for (let i = 0; i < etfResults.length; i++) {
        const result = etfResults[i];
        const etfSymbol = etfsToAnalyze[i];
        
        if (result.status === 'fulfilled' && result.value) {
          const data = result.value;
          
          // Calcular ratio de volumen
          const volumeRatio = data.avgVolume > 0 ? data.currentVolume / data.avgVolume : 1;
          
          // Estimar dirección del flujo basándose en precio y volumen
          let estimatedFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
          let flowStrength = 50;
          
          if (volumeRatio > 1.5 && data.priceChange > 0) {
            estimatedFlow = 'inflow';
            flowStrength = Math.min(100, 50 + volumeRatio * 15);
          } else if (volumeRatio > 1.5 && data.priceChange < 0) {
            estimatedFlow = 'outflow';
            flowStrength = Math.min(100, 50 + volumeRatio * 15);
          } else if (data.priceChange > 1) {
            estimatedFlow = 'inflow';
            flowStrength = 50 + data.priceChange * 5;
          } else if (data.priceChange < -1) {
            estimatedFlow = 'outflow';
            flowStrength = 50 + Math.abs(data.priceChange) * 5;
          }
          
          // Solo añadir a relatedETFs si es del sector (no mercado general)
          if (sectorMapping.etfs.includes(etfSymbol)) {
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
            
            sectorETFData.push({
              symbol: etfSymbol,
              flow: estimatedFlow,
              strength: flowStrength,
            });
          }
          
          // Guardar flujos de mercado
          if (etfSymbol === 'SPY') spyFlow = estimatedFlow;
          if (etfSymbol === 'QQQ') qqqFlow = estimatedFlow;
        }
      }
      
      // Calcular flujo agregado del sector
      const sectorFlow = this.calculateSectorFlow(sectorETFData);
      
      // Comparar sector vs mercado
      const sectorVsMarket = this.compareSectorToMarket(sectorFlow, spyFlow, qqqFlow);
      
      // Calcular score
      const score = this.calculateScore(sectorFlow, sectorVsMarket, relatedETFs);
      
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
        hasData: relatedETFs.length > 0,
        summary,
      };
      
      // Guardar en caché
      etfFlowCache.set(symbol, { data: result, timestamp: Date.now() });
      
      console.log(`[ETFFlows] Score: ${score} para ${symbol}`);
      
      return result;
      
    } catch (error) {
      console.error(`[ETFFlows] Error:`, error);
      return this.getEmptyResult(symbol, 'Error obteniendo flujos de ETFs');
    }
  }
  
  /**
   * Obtiene datos de un ETF específico
   */
  private async getETFData(etfSymbol: string): Promise<{
    name: string;
    aum: number;
    avgVolume: number;
    currentVolume: number;
    priceChange: number;
  } | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${etfSymbol}?interval=1d&range=1mo`;
      const response = await fetchWithCorsProxy(url);
      const data = await response.json();
      
      if (!data.chart?.result?.[0]) return null;
      
      const result = data.chart.result[0];
      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];
      
      if (!quote || !quote.volume) return null;
      
      // Calcular volumen promedio de los últimos 20 días
      const volumes = quote.volume.filter((v: any) => v !== null);
      const avgVolume = volumes.length > 0 
        ? volumes.slice(0, -1).reduce((a: number, b: number) => a + b, 0) / (volumes.length - 1)
        : 0;
      
      const currentVolume = volumes[volumes.length - 1] || 0;
      
      // Calcular cambio de precio
      const closes = quote.close.filter((c: any) => c !== null);
      const priceChange = closes.length >= 2
        ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
        : 0;
      
      return {
        name: meta.shortName || etfSymbol,
        aum: meta.totalAssets || 0,
        avgVolume,
        currentVolume,
        priceChange,
      };
      
    } catch (error) {
      console.warn(`[ETFFlows] Error obteniendo datos de ${etfSymbol}:`, error);
      return null;
    }
  }
  
  /**
   * Calcula el flujo agregado del sector
   */
  private calculateSectorFlow(
    etfData: Array<{ symbol: string; flow: string; strength: number }>
  ): ETFFlowData['sectorFlow'] {
    if (etfData.length === 0) {
      return {
        direction: 'neutral',
        strength: 50,
        topInflows: [],
        topOutflows: [],
      };
    }
    
    const inflows = etfData.filter(e => e.flow === 'inflow');
    const outflows = etfData.filter(e => e.flow === 'outflow');
    
    const avgInflowStrength = inflows.length > 0
      ? inflows.reduce((sum, e) => sum + e.strength, 0) / inflows.length
      : 0;
    
    const avgOutflowStrength = outflows.length > 0
      ? outflows.reduce((sum, e) => sum + e.strength, 0) / outflows.length
      : 0;
    
    let direction: ETFFlowData['sectorFlow']['direction'] = 'neutral';
    let strength = 50;
    
    if (inflows.length > outflows.length * 2 && avgInflowStrength > 70) {
      direction = 'strong_inflow';
      strength = avgInflowStrength;
    } else if (inflows.length > outflows.length) {
      direction = 'inflow';
      strength = avgInflowStrength;
    } else if (outflows.length > inflows.length * 2 && avgOutflowStrength > 70) {
      direction = 'strong_outflow';
      strength = avgOutflowStrength;
    } else if (outflows.length > inflows.length) {
      direction = 'outflow';
      strength = avgOutflowStrength;
    }
    
    return {
      direction,
      strength,
      topInflows: inflows.sort((a, b) => b.strength - a.strength).slice(0, 3).map(e => e.symbol),
      topOutflows: outflows.sort((a, b) => b.strength - a.strength).slice(0, 3).map(e => e.symbol),
    };
  }
  
  /**
   * Compara flujos del sector vs mercado general
   */
  private compareSectorToMarket(
    sectorFlow: ETFFlowData['sectorFlow'],
    spyFlow: 'inflow' | 'outflow' | 'neutral',
    qqqFlow: 'inflow' | 'outflow' | 'neutral'
  ): 'outperforming' | 'underperforming' | 'inline' {
    const sectorIsPositive = sectorFlow.direction.includes('inflow');
    const sectorIsNegative = sectorFlow.direction.includes('outflow');
    const marketIsPositive = spyFlow === 'inflow' || qqqFlow === 'inflow';
    const marketIsNegative = spyFlow === 'outflow' || qqqFlow === 'outflow';
    
    if (sectorIsPositive && !marketIsPositive) return 'outperforming';
    if (sectorIsNegative && !marketIsNegative) return 'underperforming';
    if (!sectorIsNegative && marketIsNegative) return 'outperforming';
    if (!sectorIsPositive && marketIsPositive) return 'underperforming';
    
    return 'inline';
  }
  
  /**
   * Calcula score de flujos ETF (-100 a +100)
   */
  private calculateScore(
    sectorFlow: ETFFlowData['sectorFlow'],
    sectorVsMarket: 'outperforming' | 'underperforming' | 'inline',
    relatedETFs: ETFFlowData['relatedETFs']
  ): number {
    let score = 0;
    
    // 1. Dirección del flujo del sector (60% del score)
    switch (sectorFlow.direction) {
      case 'strong_inflow':
        score += 50;
        break;
      case 'inflow':
        score += 25;
        break;
      case 'outflow':
        score -= 25;
        break;
      case 'strong_outflow':
        score -= 50;
        break;
    }
    
    // 2. Fuerza del flujo
    if (sectorFlow.strength > 75) {
      score = score * 1.3;
    } else if (sectorFlow.strength < 40) {
      score = score * 0.7;
    }
    
    // 3. Comparación con mercado (30% del score)
    if (sectorVsMarket === 'outperforming') {
      score += 30;
    } else if (sectorVsMarket === 'underperforming') {
      score -= 30;
    }
    
    // 4. Volumen anormal en ETFs (10% del score)
    const highVolumeETFs = relatedETFs.filter(e => e.volumeRatio > 2);
    if (highVolumeETFs.length > 0) {
      const avgFlow = highVolumeETFs.reduce((sum, e) => {
        return sum + (e.estimatedFlow === 'inflow' ? 1 : e.estimatedFlow === 'outflow' ? -1 : 0);
      }, 0) / highVolumeETFs.length;
      
      score += avgFlow * 15;
    }
    
    // Limitar a -100 a +100
    return Math.round(Math.max(-100, Math.min(100, score)));
  }
  
  /**
   * Analiza flujos del mercado general cuando no hay sector específico
   */
  private async analyzeGeneralMarketFlows(symbol: string): Promise<ETFFlowData> {
    const etfDataPromises = MARKET_ETFS.map(etf => this.getETFData(etf));
    const etfResults = await Promise.allSettled(etfDataPromises);
    
    let spyFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
    let qqqFlow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
    
    for (let i = 0; i < etfResults.length; i++) {
      const result = etfResults[i];
      const etfSymbol = MARKET_ETFS[i];
      
      if (result.status === 'fulfilled' && result.value) {
        const data = result.value;
        const volumeRatio = data.avgVolume > 0 ? data.currentVolume / data.avgVolume : 1;
        
        let flow: 'inflow' | 'outflow' | 'neutral' = 'neutral';
        if (volumeRatio > 1.3 && data.priceChange > 0) flow = 'inflow';
        else if (volumeRatio > 1.3 && data.priceChange < 0) flow = 'outflow';
        
        if (etfSymbol === 'SPY') spyFlow = flow;
        if (etfSymbol === 'QQQ') qqqFlow = flow;
      }
    }
    
    // Score basado solo en mercado general
    let score = 0;
    if (spyFlow === 'inflow') score += 25;
    if (spyFlow === 'outflow') score -= 25;
    if (qqqFlow === 'inflow') score += 25;
    if (qqqFlow === 'outflow') score -= 25;
    
    return {
      symbol,
      relatedETFs: [],
      sectorFlow: {
        direction: 'neutral',
        strength: 50,
        topInflows: [],
        topOutflows: [],
      },
      relativeToMarket: {
        spyFlow,
        qqqFlow,
        sectorVsMarket: 'inline',
      },
      etfFlowScore: score,
      hasData: true,
      summary: `Mercado general: SPY ${spyFlow}, QQQ ${qqqFlow}`,
    };
  }
  
  private generateSummary(
    sector: string,
    sectorFlow: ETFFlowData['sectorFlow'],
    sectorVsMarket: 'outperforming' | 'underperforming' | 'inline',
    score: number
  ): string {
    const parts: string[] = [];
    
    // Describir flujo del sector
    switch (sectorFlow.direction) {
      case 'strong_inflow':
        parts.push(`Fuertes entradas de capital en ${sector}`);
        break;
      case 'inflow':
        parts.push(`Entradas de capital en ${sector}`);
        break;
      case 'outflow':
        parts.push(`Salidas de capital de ${sector}`);
        break;
      case 'strong_outflow':
        parts.push(`Fuertes salidas de capital de ${sector}`);
        break;
      default:
        parts.push(`Flujos neutrales en ${sector}`);
    }
    
    // ETFs con mayor actividad
    if (sectorFlow.topInflows.length > 0) {
      parts.push(`Inflows: ${sectorFlow.topInflows.join(', ')}`);
    }
    if (sectorFlow.topOutflows.length > 0) {
      parts.push(`Outflows: ${sectorFlow.topOutflows.join(', ')}`);
    }
    
    // Comparación con mercado
    if (sectorVsMarket === 'outperforming') {
      parts.push('📈 Sector superando al mercado');
    } else if (sectorVsMarket === 'underperforming') {
      parts.push('📉 Sector por debajo del mercado');
    }
    
    return parts.join('. ');
  }
  
  private getEmptyResult(symbol: string, message: string): ETFFlowData {
    return {
      symbol,
      relatedETFs: [],
      sectorFlow: {
        direction: 'neutral',
        strength: 50,
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
  }
  
  /**
   * Formatea los datos para incluir en el prompt de IA
   */
  formatForAI(data: ETFFlowData): string {
    if (!data.hasData) {
      return '';
    }
    
    const lines: string[] = [
      `Flujos ETF del sector:`,
      `- Dirección: ${data.sectorFlow.direction} (fuerza: ${data.sectorFlow.strength.toFixed(0)}%)`,
    ];
    
    if (data.sectorFlow.topInflows.length > 0) {
      lines.push(`- Inflows: ${data.sectorFlow.topInflows.join(', ')}`);
    }
    
    if (data.sectorFlow.topOutflows.length > 0) {
      lines.push(`- Outflows: ${data.sectorFlow.topOutflows.join(', ')}`);
    }
    
    lines.push(`- SPY: ${data.relativeToMarket.spyFlow}, QQQ: ${data.relativeToMarket.qqqFlow}`);
    lines.push(`- Sector vs mercado: ${data.relativeToMarket.sectorVsMarket}`);
    lines.push(`- Score ETF: ${data.etfFlowScore > 0 ? '+' : ''}${data.etfFlowScore}`);
    
    return lines.join('\n');
  }
}

export const etfFlowsService = new ETFFlowsService();
