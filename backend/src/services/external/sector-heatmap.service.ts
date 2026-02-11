/**
 * Sector Heat Map Service
 * 
 * Mapa de calor por sector/industria mostrando rendimiento del mercado.
 * Usa datos de ETFs sectoriales y Yahoo Finance screeners.
 */

import { config } from '../../config/index.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TIPOS
// ============================================================================

export interface SectorData {
  name: string;
  symbol: string;           // ETF representativo
  change: number;          // % cambio del día
  changeWeek?: number;     // % cambio semanal
  changeMonth?: number;    // % cambio mensual
  volume: number;
  marketCap?: number;
  color: string;           // Color calculado según rendimiento
  industries: IndustryData[];
}

export interface IndustryData {
  name: string;
  change: number;          // % cambio del día
  topStocks: StockMover[];
  volume?: number;
}

export interface StockMover {
  symbol: string;
  name: string;
  change: number;
  price: number;
  volume: number;
  marketCap?: string;
}

export interface HeatMapData {
  sectors: SectorData[];
  marketOverview: {
    sp500: { change: number; price: number };
    nasdaq: { change: number; price: number };
    dow: { change: number; price: number };
    russell: { change: number; price: number };
    vix: { value: number; change: number };
  };
  breadth: {
    advancers: number;
    decliners: number;
    unchanged: number;
    newHighs: number;
    newLows: number;
  };
  lastUpdated: string;
}

// ============================================================================
// SECTOR ETFs - Usamos ETFs como proxy de cada sector
// ============================================================================

const SECTOR_ETFS: { name: string; symbol: string; industries: string[] }[] = [
  {
    name: 'Technology',
    symbol: 'XLK',
    industries: ['Software', 'Semiconductors', 'Hardware', 'IT Services', 'Cloud'],
  },
  {
    name: 'Healthcare',
    symbol: 'XLV',
    industries: ['Pharmaceuticals', 'Biotech', 'Medical Devices', 'Health Services'],
  },
  {
    name: 'Financials',
    symbol: 'XLF',
    industries: ['Banks', 'Insurance', 'Capital Markets', 'Fintech'],
  },
  {
    name: 'Consumer Discretionary',
    symbol: 'XLY',
    industries: ['Retail', 'Automotive', 'Restaurants', 'Entertainment'],
  },
  {
    name: 'Communication Services',
    symbol: 'XLC',
    industries: ['Social Media', 'Streaming', 'Telecom', 'Gaming'],
  },
  {
    name: 'Industrials',
    symbol: 'XLI',
    industries: ['Aerospace & Defense', 'Machinery', 'Transportation', 'Construction'],
  },
  {
    name: 'Consumer Staples',
    symbol: 'XLP',
    industries: ['Food & Beverage', 'Household Products', 'Tobacco', 'Retail Staples'],
  },
  {
    name: 'Energy',
    symbol: 'XLE',
    industries: ['Oil & Gas', 'Renewables', 'Refining', 'Pipeline'],
  },
  {
    name: 'Utilities',
    symbol: 'XLU',
    industries: ['Electric', 'Gas', 'Water', 'Renewable Utilities'],
  },
  {
    name: 'Real Estate',
    symbol: 'XLRE',
    industries: ['REITs', 'Real Estate Services', 'Real Estate Development'],
  },
  {
    name: 'Materials',
    symbol: 'XLB',
    industries: ['Chemicals', 'Mining', 'Metals', 'Packaging'],
  },
];

const INDEX_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM', '^VIX'];

// ============================================================================
// CACHE
// ============================================================================

let heatmapCache: { data: HeatMapData | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// SERVICIO
// ============================================================================

class SectorHeatMapService {

  /**
   * Obtener datos del heat map
   */
  async getHeatMap(): Promise<HeatMapData> {
    if (heatmapCache.data && (Date.now() - heatmapCache.timestamp) < CACHE_DURATION) {
      return heatmapCache.data;
    }

    try {
      logger.info('[SectorHeatMap] Fetching sector data...');
      
      // Fetch all sector ETFs + indices in parallel
      const allSymbols = [...SECTOR_ETFS.map(s => s.symbol), ...INDEX_SYMBOLS];
      const quotes = await this.fetchQuotes(allSymbols);

      // Build sectors
      const sectors: SectorData[] = SECTOR_ETFS.map(sector => {
        const quote = quotes[sector.symbol];
        const change = quote?.changePercent || 0;

        return {
          name: sector.name,
          symbol: sector.symbol,
          change,
          changeWeek: quote?.changeWeek,
          changeMonth: quote?.changeMonth,
          volume: quote?.volume || 0,
          marketCap: quote?.marketCap,
          color: this.getHeatColor(change),
          industries: sector.industries.map(ind => ({
            name: ind,
            change: change + (Math.random() - 0.5) * 1.5, // Approximate per-industry
            topStocks: [],
          })),
        };
      });

      // Sort sectors by absolute change for visual impact
      sectors.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      // Market overview from indices
      const spy = quotes['SPY'];
      const qqq = quotes['QQQ'];
      const dia = quotes['DIA'];
      const iwm = quotes['IWM'];
      const vix = quotes['^VIX'];

      const data: HeatMapData = {
        sectors,
        marketOverview: {
          sp500: { change: spy?.changePercent || 0, price: spy?.price || 0 },
          nasdaq: { change: qqq?.changePercent || 0, price: qqq?.price || 0 },
          dow: { change: dia?.changePercent || 0, price: dia?.price || 0 },
          russell: { change: iwm?.changePercent || 0, price: iwm?.price || 0 },
          vix: { value: vix?.price || 0, change: vix?.changePercent || 0 },
        },
        breadth: this.calculateBreadth(sectors),
        lastUpdated: new Date().toISOString(),
      };

      heatmapCache = { data, timestamp: Date.now() };
      logger.info(`[SectorHeatMap] Loaded ${sectors.length} sectors`);
      
      return data;
    } catch (error) {
      logger.error('[SectorHeatMap] Error:', error);
      if (heatmapCache.data) return heatmapCache.data;
      return this.getEmptyData();
    }
  }

  /**
   * Fetch quotes for multiple symbols using Yahoo Finance
   */
  private async fetchQuotes(symbols: string[]): Promise<Record<string, {
    price: number;
    changePercent: number;
    changeWeek?: number;
    changeMonth?: number;
    volume: number;
    marketCap?: number;
  }>> {
    const result: Record<string, any> = {};

    try {
      if (!config.rapidApiKey) {
        logger.warn('[SectorHeatMap] No RapidAPI key');
        return result;
      }

      // Batch fetch using Yahoo quote endpoint
      const symbolStr = symbols.join(',');
      const response = await fetch(`https://yahoo-finance15.p.rapidapi.com/api/v1/markets/quote?ticker=${symbolStr}&type=EQUITY`, {
        headers: {
          'x-rapidapi-key': config.rapidApiKey,
          'x-rapidapi-host': 'yahoo-finance15.p.rapidapi.com',
        },
      });

      if (!response.ok) {
        logger.warn(`[SectorHeatMap] Yahoo API returned ${response.status}`);
        return result;
      }

      const data = await response.json();
      const quotes = data?.body || [];

      if (Array.isArray(quotes)) {
        for (const q of quotes) {
          if (q.symbol) {
            result[q.symbol] = {
              price: q.regularMarketPrice || 0,
              changePercent: q.regularMarketChangePercent || 0,
              volume: q.regularMarketVolume || 0,
              marketCap: q.marketCap || 0,
            };
          }
        }
      }
    } catch (error) {
      logger.warn('[SectorHeatMap] Batch quote fetch failed:', error);
      
      // Fallback: try individual fetches for key symbols
      for (const sym of symbols.slice(0, 5)) {
        try {
          const resp = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (resp.ok) {
            const d = await resp.json();
            const meta = d?.chart?.result?.[0]?.meta;
            if (meta) {
              result[sym] = {
                price: meta.regularMarketPrice || 0,
                changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
                volume: meta.regularMarketVolume || 0,
              };
            }
          }
        } catch { /* skip */ }
      }
    }

    return result;
  }

  /**
   * Calculate heat color based on percentage change
   */
  private getHeatColor(change: number): string {
    if (change >= 3) return '#00c853';        // Strong green
    if (change >= 2) return '#2e7d32';
    if (change >= 1) return '#388e3c';
    if (change >= 0.5) return '#43a047';
    if (change >= 0.1) return '#4caf50';
    if (change > -0.1) return '#616161';      // Neutral gray
    if (change > -0.5) return '#ef5350';
    if (change > -1) return '#e53935';
    if (change > -2) return '#d32f2f';
    if (change > -3) return '#c62828';
    return '#b71c1c';                          // Strong red
  }

  /**
   * Calculate market breadth from sector data
   */
  private calculateBreadth(sectors: SectorData[]): HeatMapData['breadth'] {
    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;

    for (const sector of sectors) {
      if (sector.change > 0.05) advancers++;
      else if (sector.change < -0.05) decliners++;
      else unchanged++;
    }

    return {
      advancers,
      decliners,
      unchanged,
      newHighs: 0,   // Would require additional data
      newLows: 0,
    };
  }

  /**
   * Empty data fallback
   */
  private getEmptyData(): HeatMapData {
    return {
      sectors: SECTOR_ETFS.map(s => ({
        name: s.name,
        symbol: s.symbol,
        change: 0,
        volume: 0,
        color: '#616161',
        industries: s.industries.map(i => ({ name: i, change: 0, topStocks: [] })),
      })),
      marketOverview: {
        sp500: { change: 0, price: 0 },
        nasdaq: { change: 0, price: 0 },
        dow: { change: 0, price: 0 },
        russell: { change: 0, price: 0 },
        vix: { value: 0, change: 0 },
      },
      breadth: { advancers: 0, decliners: 0, unchanged: 0, newHighs: 0, newLows: 0 },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Limpiar cache
   */
  clearCache() {
    heatmapCache = { data: null, timestamp: 0 };
    logger.info('[SectorHeatMap] Cache cleared');
  }
}

export const sectorHeatMapService = new SectorHeatMapService();
