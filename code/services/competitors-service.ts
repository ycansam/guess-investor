/**
 * Servicio de análisis de competidores
 * Compara el rendimiento de una empresa con sus competidores del sector
 * 
 * Lógica:
 * - Si a los competidores les va mal → puede arrastrar a la empresa
 * - Si la empresa destaca vs competidores → señal positiva
 * - Si los competidores suben → puede indicar sector fuerte
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface CompetitorData {
  symbol: string;
  name: string;
  currentPrice: number;
  change1d: number; // Cambio % 1 día
  change1w: number; // Cambio % 1 semana
  change1m: number; // Cambio % 1 mes
  trend: 'up' | 'down' | 'neutral';
}

export interface CompetitorAnalysis {
  sector: string;
  sectorName: string;
  
  // Rendimiento de los competidores
  competitors: CompetitorData[];
  
  // Métricas agregadas del sector
  sectorAvgChange1d: number;
  sectorAvgChange1w: number;
  sectorAvgChange1m: number;
  sectorTrend: 'bullish' | 'bearish' | 'neutral';
  
  // Comparación de la empresa vs sector
  companyVsSector1d: number; // Diferencia % vs promedio sector
  companyVsSector1w: number;
  companyVsSector1m: number;
  outperforming: boolean; // ¿La empresa supera al sector?
  
  // Score final (-100 a +100)
  competitorScore: number;
  hasData: boolean;
  summary: string;
}

// Mapeo de empresas a sus competidores directos
// Máximo 2-3 competidores por empresa
const COMPANY_COMPETITORS: Record<string, { sector: string; sectorName: string; competitors: Array<{ symbol: string; name: string }> }> = {
  // Retail / Textil
  'ITX.MC': {
    sector: 'retail_fashion',
    sectorName: 'Moda y Textil',
    competitors: [
      { symbol: 'HM-B.ST', name: 'H&M' },
      { symbol: 'GAP', name: 'Gap Inc' },
    ]
  },
  
  // Tecnología - Big Tech
  'AAPL': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'MSFT', name: 'Microsoft' },
      { symbol: 'GOOGL', name: 'Google' },
    ]
  },
  'MSFT': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'GOOGL', name: 'Google' },
    ]
  },
  'GOOGL': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'META', name: 'Meta' },
      { symbol: 'MSFT', name: 'Microsoft' },
    ]
  },
  'META': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'GOOGL', name: 'Google' },
      { symbol: 'SNAP', name: 'Snap Inc' },
    ]
  },
  'TSLA': {
    sector: 'automotive_ev',
    sectorName: 'Vehículos Eléctricos',
    competitors: [
      { symbol: 'RIVN', name: 'Rivian' },
      { symbol: 'F', name: 'Ford' },
    ]
  },
  'AMZN': {
    sector: 'ecommerce',
    sectorName: 'E-commerce',
    competitors: [
      { symbol: 'WMT', name: 'Walmart' },
      { symbol: 'EBAY', name: 'eBay' },
    ]
  },
  'NVDA': {
    sector: 'semiconductors',
    sectorName: 'Semiconductores',
    competitors: [
      { symbol: 'AMD', name: 'AMD' },
      { symbol: 'INTC', name: 'Intel' },
    ]
  },
  
  // Banca España
  'SAN.MC': {
    sector: 'banking_eu',
    sectorName: 'Banca Europea',
    competitors: [
      { symbol: 'BBVA.MC', name: 'BBVA' },
      { symbol: 'BNP.PA', name: 'BNP Paribas' },
    ]
  },
  'BBVA.MC': {
    sector: 'banking_eu',
    sectorName: 'Banca Europea',
    competitors: [
      { symbol: 'SAN.MC', name: 'Santander' },
      { symbol: 'BNP.PA', name: 'BNP Paribas' },
    ]
  },
  
  // Banca USA
  'JPM': {
    sector: 'banking_us',
    sectorName: 'Banca USA',
    competitors: [
      { symbol: 'BAC', name: 'Bank of America' },
      { symbol: 'GS', name: 'Goldman Sachs' },
    ]
  },
  
  // Energía
  'REP.MC': {
    sector: 'energy_oil',
    sectorName: 'Petróleo y Gas',
    competitors: [
      { symbol: 'XOM', name: 'ExxonMobil' },
      { symbol: 'TTE.PA', name: 'TotalEnergies' },
    ]
  },
  'IBE.MC': {
    sector: 'energy_utilities',
    sectorName: 'Utilities',
    competitors: [
      { symbol: 'ELE.MC', name: 'Endesa' },
      { symbol: 'EDP.LS', name: 'EDP' },
    ]
  },
  
  // Telecomunicaciones
  'TEF.MC': {
    sector: 'telecom',
    sectorName: 'Telecomunicaciones',
    competitors: [
      { symbol: 'VOD.L', name: 'Vodafone' },
      { symbol: 'ORAN.PA', name: 'Orange' },
    ]
  },
  
  // Crypto
  'BTC-USD': {
    sector: 'crypto',
    sectorName: 'Criptomonedas',
    competitors: [
      { symbol: 'ETH-USD', name: 'Ethereum' },
      { symbol: 'SOL-USD', name: 'Solana' },
    ]
  },
  'ETH-USD': {
    sector: 'crypto',
    sectorName: 'Criptomonedas',
    competitors: [
      { symbol: 'BTC-USD', name: 'Bitcoin' },
      { symbol: 'SOL-USD', name: 'Solana' },
    ]
  },
  
  // Xiaomi
  '1810.HK': {
    sector: 'consumer_electronics',
    sectorName: 'Electrónica de Consumo',
    competitors: [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: '005930.KS', name: 'Samsung' },
    ]
  },
};

// Sectores genéricos para empresas no mapeadas
const GENERIC_SECTOR_COMPETITORS: Record<string, Array<{ symbol: string; name: string }>> = {
  'technology': [
    { symbol: 'QQQ', name: 'Nasdaq ETF' },
    { symbol: 'XLK', name: 'Tech Select ETF' },
  ],
  'banking': [
    { symbol: 'XLF', name: 'Financials ETF' },
  ],
  'energy': [
    { symbol: 'XLE', name: 'Energy ETF' },
  ],
  'default': [
    { symbol: '^GSPC', name: 'S&P 500' },
  ],
};

// Caché
interface CacheEntry {
  data: CompetitorData;
  timestamp: number;
}
const competitorCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

class CompetitorsService {
  
  /**
   * Obtiene datos de un competidor
   */
  private async getCompetitorData(symbol: string, name: string): Promise<CompetitorData | null> {
    // Verificar caché
    const cached = competitorCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Competitors] Cache hit: ${symbol}`);
      return cached.data;
    }
    
    try {
      // Obtener datos del último mes
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (35 * 24 * 60 * 60); // 35 días para tener margen
      
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startDate}&period2=${endDate}&interval=1d`;
      
      const response = await fetchWithCorsProxy(url);
      const data = await response.json();
      
      if (!data.chart?.result?.[0]) {
        console.warn(`[Competitors] Sin datos para ${symbol}`);
        return null;
      }
      
      const result = data.chart.result[0];
      const quotes = result.indicators?.quote?.[0];
      const closes = quotes?.close?.filter((c: number | null) => c !== null) || [];
      
      if (closes.length < 5) {
        console.warn(`[Competitors] Datos insuficientes para ${symbol}`);
        return null;
      }
      
      const currentPrice = closes[closes.length - 1];
      const previousClose = closes[closes.length - 2] || currentPrice;
      const weekAgoPrice = closes[Math.max(0, closes.length - 6)] || currentPrice;
      const monthAgoPrice = closes[0] || currentPrice;
      
      const change1d = ((currentPrice - previousClose) / previousClose) * 100;
      const change1w = ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
      const change1m = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
      
      // Determinar tendencia
      let trend: 'up' | 'down' | 'neutral' = 'neutral';
      if (change1w > 1 && change1m > 2) trend = 'up';
      else if (change1w < -1 && change1m < -2) trend = 'down';
      
      const competitorData: CompetitorData = {
        symbol,
        name,
        currentPrice,
        change1d,
        change1w,
        change1m,
        trend,
      };
      
      // Guardar en caché
      competitorCache.set(symbol, { data: competitorData, timestamp: Date.now() });
      
      console.log(`[Competitors] ${symbol}: 1d=${change1d.toFixed(2)}%, 1w=${change1w.toFixed(2)}%, 1m=${change1m.toFixed(2)}%`);
      
      return competitorData;
      
    } catch (error) {
      console.error(`[Competitors] Error obteniendo datos de ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Analiza competidores para un símbolo
   */
  async analyzeCompetitors(
    symbol: string,
    companyChange1d: number,
    companyChange1w: number,
    companyChange1m: number
  ): Promise<CompetitorAnalysis> {
    console.log(`[Competitors] Analizando competidores para ${symbol}`);
    
    // Obtener competidores mapeados
    const competitorConfig = COMPANY_COMPETITORS[symbol];
    
    if (!competitorConfig) {
      console.log(`[Competitors] Sin competidores mapeados para ${symbol}`);
      return {
        sector: 'unknown',
        sectorName: 'Desconocido',
        competitors: [],
        sectorAvgChange1d: 0,
        sectorAvgChange1w: 0,
        sectorAvgChange1m: 0,
        sectorTrend: 'neutral',
        companyVsSector1d: 0,
        companyVsSector1w: 0,
        companyVsSector1m: 0,
        outperforming: false,
        competitorScore: 0,
        hasData: false,
        summary: 'Sin datos de competidores disponibles',
      };
    }
    
    // Obtener datos de cada competidor en paralelo
    const competitorPromises = competitorConfig.competitors.map(comp => 
      this.getCompetitorData(comp.symbol, comp.name)
    );
    
    const competitorResults = await Promise.all(competitorPromises);
    const validCompetitors = competitorResults.filter((c): c is CompetitorData => c !== null);
    
    if (validCompetitors.length === 0) {
      console.log(`[Competitors] No se pudieron obtener datos de competidores`);
      return {
        sector: competitorConfig.sector,
        sectorName: competitorConfig.sectorName,
        competitors: [],
        sectorAvgChange1d: 0,
        sectorAvgChange1w: 0,
        sectorAvgChange1m: 0,
        sectorTrend: 'neutral',
        companyVsSector1d: 0,
        companyVsSector1w: 0,
        companyVsSector1m: 0,
        outperforming: false,
        competitorScore: 0,
        hasData: false,
        summary: 'Error obteniendo datos de competidores',
      };
    }
    
    // Calcular promedios del sector (competidores)
    const sectorAvgChange1d = validCompetitors.reduce((sum, c) => sum + c.change1d, 0) / validCompetitors.length;
    const sectorAvgChange1w = validCompetitors.reduce((sum, c) => sum + c.change1w, 0) / validCompetitors.length;
    const sectorAvgChange1m = validCompetitors.reduce((sum, c) => sum + c.change1m, 0) / validCompetitors.length;
    
    // Tendencia del sector
    let sectorTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (sectorAvgChange1w > 1 && sectorAvgChange1m > 2) sectorTrend = 'bullish';
    else if (sectorAvgChange1w < -1 && sectorAvgChange1m < -2) sectorTrend = 'bearish';
    
    // Comparar empresa vs sector
    const companyVsSector1d = companyChange1d - sectorAvgChange1d;
    const companyVsSector1w = companyChange1w - sectorAvgChange1w;
    const companyVsSector1m = companyChange1m - sectorAvgChange1m;
    
    // ¿Supera al sector?
    const outperforming = companyVsSector1w > 0 && companyVsSector1m > 0;
    
    // Calcular score (-100 a +100)
    let competitorScore = 0;
    
    // 1. Efecto del sector (40% del score)
    // Si el sector está mal, puede arrastrar a la empresa
    // Si el sector está bien, puede beneficiar
    if (sectorTrend === 'bullish') {
      competitorScore += 20; // Sector fuerte = positivo
    } else if (sectorTrend === 'bearish') {
      competitorScore -= 20; // Sector débil = negativo
    }
    
    // Ajuste por magnitud del cambio del sector
    competitorScore += Math.max(-20, Math.min(20, sectorAvgChange1w * 2));
    
    // 2. Rendimiento relativo (60% del score)
    // Si la empresa supera a competidores = muy positivo
    if (outperforming) {
      competitorScore += 30;
      // Bonus adicional si supera significativamente
      if (companyVsSector1w > 3) competitorScore += 15;
    } else {
      // Si está por debajo del sector
      if (companyVsSector1w < -3) competitorScore -= 25;
      else if (companyVsSector1w < 0) competitorScore -= 10;
    }
    
    // Ajuste fino por rendimiento relativo semanal
    competitorScore += Math.max(-15, Math.min(15, companyVsSector1w * 2));
    
    // Limitar a -100 a +100
    competitorScore = Math.max(-100, Math.min(100, competitorScore));
    
    // Generar resumen
    let summary = '';
    if (validCompetitors.length > 0) {
      const competitorNames = validCompetitors.map(c => c.name).join(' y ');
      
      if (sectorTrend === 'bearish') {
        if (outperforming) {
          summary = `Sector débil (${competitorNames} caen), pero ${symbol} destaca (+${companyVsSector1w.toFixed(1)}% vs sector)`;
        } else {
          summary = `Sector débil: ${competitorNames} en caída. Posible presión a la baja`;
        }
      } else if (sectorTrend === 'bullish') {
        if (outperforming) {
          summary = `Sector fuerte y ${symbol} lidera (+${companyVsSector1w.toFixed(1)}% vs competidores)`;
        } else {
          summary = `Sector fuerte pero ${symbol} rezagado vs ${competitorNames}`;
        }
      } else {
        if (outperforming) {
          summary = `${symbol} supera a ${competitorNames} en +${companyVsSector1w.toFixed(1)}%`;
        } else {
          summary = `${symbol} similar a competidores (${competitorNames})`;
        }
      }
    }
    
    console.log(`[Competitors] Score: ${competitorScore}, Sector: ${sectorTrend}, Outperforming: ${outperforming}`);
    console.log(`[Competitors] ${summary}`);
    
    return {
      sector: competitorConfig.sector,
      sectorName: competitorConfig.sectorName,
      competitors: validCompetitors,
      sectorAvgChange1d,
      sectorAvgChange1w,
      sectorAvgChange1m,
      sectorTrend,
      companyVsSector1d,
      companyVsSector1w,
      companyVsSector1m,
      outperforming,
      competitorScore,
      hasData: true,
      summary,
    };
  }
}

export const competitorsService = new CompetitorsService();
