/**
 * Servicio de Análisis de Competidores
 * 
 * Compara el rendimiento de una empresa con sus competidores del sector
 */

import { logger } from '../../middleware/logger.js';

export interface CompetitorData {
  symbol: string;
  name: string;
  change1d: number;
  change1w: number;
  change1m: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface CompetitorAnalysis {
  sector: string;
  sectorName: string;
  competitors: CompetitorData[];
  
  // Métricas del sector
  sectorAvgChange1d: number;
  sectorAvgChange1w: number;
  sectorAvgChange1m: number;
  sectorTrend: 'bullish' | 'bearish' | 'neutral';
  
  // Comparación empresa vs sector
  companyVsSector1m: number;
  outperforming: boolean;
  
  // Score final (-100 a +100)
  competitorScore: number;
  hasData: boolean;
  summary: string;
}

// Mapeo de empresas a competidores
const COMPANY_COMPETITORS: Record<string, { sector: string; sectorName: string; peers: string[] }> = {
  // Tech - Big Tech
  'AAPL': { sector: 'technology', sectorName: 'Tecnología', peers: ['MSFT', 'GOOGL'] },
  'MSFT': { sector: 'technology', sectorName: 'Tecnología', peers: ['AAPL', 'GOOGL'] },
  'GOOGL': { sector: 'technology', sectorName: 'Tecnología', peers: ['META', 'MSFT'] },
  'META': { sector: 'technology', sectorName: 'Tecnología', peers: ['GOOGL', 'SNAP'] },
  'NVDA': { sector: 'semiconductors', sectorName: 'Semiconductores', peers: ['AMD', 'INTC'] },
  'AMD': { sector: 'semiconductors', sectorName: 'Semiconductores', peers: ['NVDA', 'INTC'] },
  'INTC': { sector: 'semiconductors', sectorName: 'Semiconductores', peers: ['NVDA', 'AMD'] },
  'TSLA': { sector: 'ev_auto', sectorName: 'Vehículos Eléctricos', peers: ['RIVN', 'F'] },
  
  // Retail
  'AMZN': { sector: 'ecommerce', sectorName: 'E-commerce', peers: ['WMT', 'EBAY'] },
  'WMT': { sector: 'retail', sectorName: 'Retail', peers: ['TGT', 'COST'] },
  'ITX.MC': { sector: 'fashion_retail', sectorName: 'Moda y Textil', peers: ['H&M B', 'GAP'] },
  
  // Finance
  'JPM': { sector: 'banking', sectorName: 'Banca', peers: ['BAC', 'GS'] },
  'BAC': { sector: 'banking', sectorName: 'Banca', peers: ['JPM', 'C'] },
  'V': { sector: 'payments', sectorName: 'Pagos', peers: ['MA', 'PYPL'] },
  'MA': { sector: 'payments', sectorName: 'Pagos', peers: ['V', 'PYPL'] },
  
  // Energy
  'XOM': { sector: 'oil_gas', sectorName: 'Petróleo y Gas', peers: ['CVX', 'COP'] },
  'CVX': { sector: 'oil_gas', sectorName: 'Petróleo y Gas', peers: ['XOM', 'COP'] },
  
  // Healthcare
  'JNJ': { sector: 'pharma', sectorName: 'Farmacéutica', peers: ['PFE', 'MRK'] },
  'PFE': { sector: 'pharma', sectorName: 'Farmacéutica', peers: ['JNJ', 'MRK'] },
  
  // Consumer
  'KO': { sector: 'beverages', sectorName: 'Bebidas', peers: ['PEP', 'MNST'] },
  'PEP': { sector: 'beverages', sectorName: 'Bebidas', peers: ['KO', 'MNST'] },
  'MCD': { sector: 'restaurants', sectorName: 'Restaurantes', peers: ['SBUX', 'YUM'] },
  'NKE': { sector: 'apparel', sectorName: 'Ropa Deportiva', peers: ['LULU', 'UAA'] },
  'DIS': { sector: 'entertainment', sectorName: 'Entretenimiento', peers: ['NFLX', 'CMCSA'] },
  'NFLX': { sector: 'streaming', sectorName: 'Streaming', peers: ['DIS', 'WBD'] },
};

// ETFs sectoriales como fallback
const SECTOR_ETFS: Record<string, string> = {
  'technology': 'XLK',
  'semiconductors': 'SOXX',
  'finance': 'XLF',
  'banking': 'XLF',
  'payments': 'XLF',
  'energy': 'XLE',
  'oil_gas': 'XLE',
  'healthcare': 'XLV',
  'pharma': 'XLV',
  'retail': 'XLY',
  'fashion_retail': 'XLY',
  'ecommerce': 'XLY',
  'beverages': 'XLP',
  'restaurants': 'XLY',
  'apparel': 'XLY',
  'entertainment': 'XLC',
  'streaming': 'XLC',
  'ev_auto': 'XLY',
};

// Cache
const cache = new Map<string, { data: CompetitorAnalysis; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

export const competitorsService = {
  async analyzeCompetitors(
    symbol: string,
    companyChange1d: number,
    companyChange1w: number,
    companyChange1m: number
  ): Promise<CompetitorAnalysis> {
    // Verificar cache
    const cacheKey = symbol;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      // Actualizar comparación con datos frescos de la empresa
      const updated = this.updateComparison(cached.data, companyChange1d, companyChange1w, companyChange1m);
      return updated;
    }

    const mapping = COMPANY_COMPETITORS[symbol];
    
    if (!mapping) {
      // Sin mapeo, usar ETF sectorial si existe
      return this.getDefaultAnalysis(symbol);
    }

    try {
      // Obtener datos de competidores
      const competitorData = await this.fetchCompetitorData(mapping.peers);
      
      if (competitorData.length === 0) {
        return this.getDefaultAnalysis(symbol);
      }

      // Calcular promedios del sector
      const sectorAvgChange1d = competitorData.reduce((sum, c) => sum + c.change1d, 0) / competitorData.length;
      const sectorAvgChange1w = competitorData.reduce((sum, c) => sum + c.change1w, 0) / competitorData.length;
      const sectorAvgChange1m = competitorData.reduce((sum, c) => sum + c.change1m, 0) / competitorData.length;

      // Determinar tendencia del sector
      let sectorTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (sectorAvgChange1m > 3) sectorTrend = 'bullish';
      else if (sectorAvgChange1m < -3) sectorTrend = 'bearish';

      // Comparar empresa vs sector
      const companyVsSector1m = companyChange1m - sectorAvgChange1m;
      const outperforming = companyVsSector1m > 0;

      // Calcular score
      let competitorScore = 0;
      
      // Tendencia del sector (hasta ±30)
      if (sectorTrend === 'bullish') competitorScore += 20;
      else if (sectorTrend === 'bearish') competitorScore -= 20;

      // Outperformance (hasta ±50)
      if (outperforming) {
        competitorScore += Math.min(40, companyVsSector1m * 5);
      } else {
        competitorScore += Math.max(-40, companyVsSector1m * 5);
      }

      // Si competidores suben mucho pero empresa no tanto, puede alcanzar
      if (sectorAvgChange1m > 5 && companyChange1m < sectorAvgChange1m) {
        competitorScore += 10; // Potencial de catch-up
      }

      competitorScore = Math.max(-100, Math.min(100, competitorScore));

      // Generar summary
      let summary = '';
      if (outperforming) {
        summary = `Supera al sector ${mapping.sectorName} por ${companyVsSector1m.toFixed(1)}%.`;
      } else {
        summary = `Rezagado vs sector ${mapping.sectorName} por ${Math.abs(companyVsSector1m).toFixed(1)}%.`;
      }
      if (sectorTrend !== 'neutral') {
        summary += ` Sector ${sectorTrend === 'bullish' ? 'alcista' : 'bajista'}.`;
      }

      const analysis: CompetitorAnalysis = {
        sector: mapping.sector,
        sectorName: mapping.sectorName,
        competitors: competitorData,
        sectorAvgChange1d,
        sectorAvgChange1w,
        sectorAvgChange1m,
        sectorTrend,
        companyVsSector1m,
        outperforming,
        competitorScore,
        hasData: true,
        summary,
      };

      cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
      logger.info(`[Competitors] ${symbol}: score=${competitorScore}, outperforming=${outperforming}`);
      
      return analysis;
    } catch (error) {
      logger.error(`[Competitors] Error for ${symbol}:`, error);
      return this.getDefaultAnalysis(symbol);
    }
  },

  async fetchCompetitorData(peers: string[]): Promise<CompetitorData[]> {
    const results: CompetitorData[] = [];

    for (const peer of peers) {
      try {
        // Obtener datos históricos de 1 mes
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(peer)}?range=1mo&interval=1d`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        if (!response.ok) continue;

        const json: any = await response.json();
        const result = json.chart?.result?.[0];
        const meta = result?.meta;
        const quotes = result?.indicators?.quote?.[0];

        if (!meta || !quotes) continue;

        const closes = quotes.close?.filter((c: number) => c > 0) || [];
        if (closes.length < 2) continue;

        const currentPrice = closes[closes.length - 1];
        const prevDayPrice = closes[closes.length - 2] || currentPrice;
        const weekAgoPrice = closes.length >= 5 ? closes[closes.length - 5] : closes[0];
        const monthAgoPrice = closes[0];

        const change1d = ((currentPrice - prevDayPrice) / prevDayPrice) * 100;
        const change1w = ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
        const change1m = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;

        let trend: 'up' | 'down' | 'neutral' = 'neutral';
        if (change1m > 3) trend = 'up';
        else if (change1m < -3) trend = 'down';

        results.push({
          symbol: peer,
          name: meta.shortName || peer,
          change1d,
          change1w,
          change1m,
          trend,
        });
      } catch (error) {
        logger.warn(`[Competitors] Failed to fetch ${peer}`);
      }
    }

    return results;
  },

  updateComparison(
    cached: CompetitorAnalysis,
    companyChange1d: number,
    companyChange1w: number,
    companyChange1m: number
  ): CompetitorAnalysis {
    const companyVsSector1m = companyChange1m - cached.sectorAvgChange1m;
    const outperforming = companyVsSector1m > 0;

    // Recalcular score
    let competitorScore = 0;
    if (cached.sectorTrend === 'bullish') competitorScore += 20;
    else if (cached.sectorTrend === 'bearish') competitorScore -= 20;

    if (outperforming) {
      competitorScore += Math.min(40, companyVsSector1m * 5);
    } else {
      competitorScore += Math.max(-40, companyVsSector1m * 5);
    }

    competitorScore = Math.max(-100, Math.min(100, competitorScore));

    return {
      ...cached,
      companyVsSector1m,
      outperforming,
      competitorScore,
    };
  },

  getDefaultAnalysis(symbol: string): CompetitorAnalysis {
    return {
      sector: 'unknown',
      sectorName: 'Desconocido',
      competitors: [],
      sectorAvgChange1d: 0,
      sectorAvgChange1w: 0,
      sectorAvgChange1m: 0,
      sectorTrend: 'neutral',
      companyVsSector1m: 0,
      outperforming: false,
      competitorScore: 0,
      hasData: false,
      summary: 'Sin datos de competidores.',
    };
  },
};
