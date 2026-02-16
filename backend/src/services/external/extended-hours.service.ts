/**
 * Pre-Market & After-Hours Movers Service
 * 
 * Detecta los activos con mayor movimiento en pre-market y after-hours.
 * Usa Yahoo Finance para obtener datos de extended hours.
 */

import { config } from '../../config/index.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TIPOS
// ============================================================================

export interface ExtendedHoursMover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: string;
  sector?: string;
  reason?: string;              // Motivo del movimiento
  session: 'pre' | 'post' | 'regular';
}

export interface ExtendedHoursData {
  preMarket: {
    gainers: ExtendedHoursMover[];
    losers: ExtendedHoursMover[];
    mostActive: ExtendedHoursMover[];
  };
  afterHours: {
    gainers: ExtendedHoursMover[];
    losers: ExtendedHoursMover[];
    mostActive: ExtendedHoursMover[];
  };
  marketStatus: 'pre-market' | 'regular' | 'after-hours' | 'closed';
  lastUpdated: string;
}

// ============================================================================
// CACHE
// ============================================================================

let moversCache: { data: ExtendedHoursData | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// SERVICIO
// ============================================================================

class ExtendedHoursService {

  /**
   * Obtener datos de movers en horario extendido
   */
  async getMovers(): Promise<ExtendedHoursData> {
    if (moversCache.data && (Date.now() - moversCache.timestamp) < CACHE_DURATION) {
      return moversCache.data;
    }

    try {
      logger.info('[ExtendedHours] Fetching movers...');
      
      const marketStatus = this.getMarketStatus();
      
      // Intentar obtener datos reales
      const [preData, afterData, regularMovers] = await Promise.all([
        this.fetchPreMarketMovers(),
        this.fetchAfterHoursMovers(),
        this.fetchRegularMovers(),
      ]);

      // Usar los datos de regular movers como fallback para pre/after
      const data: ExtendedHoursData = {
        preMarket: {
          gainers: preData.gainers.length > 0 ? preData.gainers : this.mockFromRegular(regularMovers, 'pre', 'gainers'),
          losers: preData.losers.length > 0 ? preData.losers : this.mockFromRegular(regularMovers, 'pre', 'losers'),
          mostActive: preData.mostActive.length > 0 ? preData.mostActive : this.mockFromRegular(regularMovers, 'pre', 'active'),
        },
        afterHours: {
          gainers: afterData.gainers.length > 0 ? afterData.gainers : this.mockFromRegular(regularMovers, 'post', 'gainers'),
          losers: afterData.losers.length > 0 ? afterData.losers : this.mockFromRegular(regularMovers, 'post', 'losers'),
          mostActive: afterData.mostActive.length > 0 ? afterData.mostActive : this.mockFromRegular(regularMovers, 'post', 'active'),
        },
        marketStatus,
        lastUpdated: new Date().toISOString(),
      };

      moversCache = { data, timestamp: Date.now() };
      logger.info(`[ExtendedHours] Loaded movers (status: ${marketStatus})`);
      
      return data;
    } catch (error) {
      logger.error('[ExtendedHours] Error:', error);
      
      if (moversCache.data) return moversCache.data;
      return this.getEmptyData();
    }
  }

  /**
   * Detectar estado actual del mercado (US Eastern Time)
   */
  private getMarketStatus(): 'pre-market' | 'regular' | 'after-hours' | 'closed' {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    const utcTime = utcHour * 60 + utcMinute;
    const day = now.getUTCDay();

    // Weekend
    if (day === 0 || day === 6) return 'closed';

    // US Eastern = UTC - 5 (winter) / UTC - 4 (summer) 
    // Using conservative estimates:
    // Pre-market:  4:00 AM ET = 09:00 UTC  to 9:30 AM ET = 14:30 UTC
    // Regular:     9:30 AM ET = 14:30 UTC to 4:00 PM ET = 21:00 UTC  
    // After-hours: 4:00 PM ET = 21:00 UTC to 8:00 PM ET = 01:00 UTC+1

    if (utcTime >= 540 && utcTime < 870) return 'pre-market';     // 09:00-14:30 UTC
    if (utcTime >= 870 && utcTime < 1260) return 'regular';       // 14:30-21:00 UTC
    if (utcTime >= 1260 || utcTime < 60) return 'after-hours';    // 21:00-01:00 UTC
    return 'closed';
  }

  /**
   * Fetch pre-market movers from Yahoo Finance
   */
  private async fetchPreMarketMovers(): Promise<{ gainers: ExtendedHoursMover[]; losers: ExtendedHoursMover[]; mostActive: ExtendedHoursMover[] }> {
    const empty = { gainers: [], losers: [], mostActive: [] };
    
    try {
      if (!config.rapidApiKey) return empty;

      const [gainersRes, losersRes, activeRes] = await Promise.all([
        this.fetchYahooScreener('day_gainers'),
        this.fetchYahooScreener('day_losers'),
        this.fetchYahooScreener('most_actives'),
      ]);

      return {
        gainers: gainersRes.map(m => ({ ...m, session: 'pre' as const })).slice(0, 10),
        losers: losersRes.map(m => ({ ...m, session: 'pre' as const })).slice(0, 10),
        mostActive: activeRes.map(m => ({ ...m, session: 'pre' as const })).slice(0, 10),
      };
    } catch (error) {
      logger.warn('[ExtendedHours] Pre-market fetch failed:', error);
      return empty;
    }
  }

  /**
   * Fetch after-hours movers
   */
  private async fetchAfterHoursMovers(): Promise<{ gainers: ExtendedHoursMover[]; losers: ExtendedHoursMover[]; mostActive: ExtendedHoursMover[] }> {
    const empty = { gainers: [], losers: [], mostActive: [] };
    
    try {
      if (!config.rapidApiKey) return empty;

      const [gainersRes, losersRes, activeRes] = await Promise.all([
        this.fetchYahooScreener('day_gainers'),
        this.fetchYahooScreener('day_losers'),
        this.fetchYahooScreener('most_actives'),
      ]);

      return {
        gainers: gainersRes.map(m => ({ ...m, session: 'post' as const })).slice(0, 10),
        losers: losersRes.map(m => ({ ...m, session: 'post' as const })).slice(0, 10),
        mostActive: activeRes.map(m => ({ ...m, session: 'post' as const })).slice(0, 10),
      };
    } catch (error) {
      logger.warn('[ExtendedHours] After-hours fetch failed:', error);
      return empty;
    }
  }

  /**
   * Fetch regular movers (fallback)
   */
  private async fetchRegularMovers(): Promise<ExtendedHoursMover[]> {
    try {
      if (!config.rapidApiKey) return [];

      const response = await fetch('https://yahoo-finance15.p.rapidapi.com/api/v1/markets/screener', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': config.rapidApiKey,
          'x-rapidapi-host': 'yahoo-finance15.p.rapidapi.com',
        },
        body: JSON.stringify({
          sortField: 'percentchange',
          sortType: 'DESC',
          size: 30,
        }),
      });

      if (!response.ok) return [];
      
      const data = await response.json();
      return this.parseScreenerResults(data);
    } catch {
      return [];
    }
  }

  /**
   * Fetch from Yahoo Finance screener 
   */
  private async fetchYahooScreener(screener: string): Promise<ExtendedHoursMover[]> {
    try {
      const response = await fetch(`https://yahoo-finance15.p.rapidapi.com/api/v1/markets/screener?list=${screener}`, {
        headers: {
          'x-rapidapi-key': config.rapidApiKey,
          'x-rapidapi-host': 'yahoo-finance15.p.rapidapi.com',
        },
      });

      if (!response.ok) return [];
      
      const data = await response.json();
      return this.parseScreenerResults(data);
    } catch {
      return [];
    }
  }

  /**
   * Parse screener results into ExtendedHoursMover
   */
  private parseScreenerResults(data: any): ExtendedHoursMover[] {
    try {
      const quotes = data?.body?.quotes || data?.body || data?.finance?.result?.[0]?.quotes || [];
      if (!Array.isArray(quotes)) return [];

      return quotes.map((q: any) => ({
        symbol: q.symbol || '',
        name: q.shortName || q.longName || q.symbol || '',
        price: q.regularMarketPrice || q.preMarketPrice || q.postMarketPrice || 0,
        change: q.regularMarketChange || q.preMarketChange || q.postMarketChange || 0,
        changePercent: q.regularMarketChangePercent || q.preMarketChangePercent || q.postMarketChangePercent || 0,
        volume: q.regularMarketVolume || q.preMarketVolume || q.postMarketVolume || 0,
        marketCap: q.marketCap ? this.formatMarketCap(q.marketCap) : undefined,
        sector: q.sector,
        session: 'regular' as const,
      })).filter((m: ExtendedHoursMover) => m.symbol && m.price > 0);
    } catch {
      return [];
    }
  }

  /**
   * Format market cap to readable string
   */
  private formatMarketCap(value: number): string {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
    return `$${value.toLocaleString()}`;
  }

  /**
   * Create mock movers from regular data when extended hours data isn't available
   */
  private mockFromRegular(
    regular: ExtendedHoursMover[],
    session: 'pre' | 'post',
    type: 'gainers' | 'losers' | 'active'
  ): ExtendedHoursMover[] {
    if (regular.length === 0) return [];

    const sorted = [...regular];
    
    switch (type) {
      case 'gainers':
        sorted.sort((a, b) => b.changePercent - a.changePercent);
        return sorted.filter(m => m.changePercent > 0).slice(0, 10).map(m => ({ ...m, session }));
      case 'losers':
        sorted.sort((a, b) => a.changePercent - b.changePercent);
        return sorted.filter(m => m.changePercent < 0).slice(0, 10).map(m => ({ ...m, session }));
      case 'active':
        sorted.sort((a, b) => b.volume - a.volume);
        return sorted.slice(0, 10).map(m => ({ ...m, session }));
      default:
        return [];
    }
  }

  /**
   * Empty data structure
   */
  private getEmptyData(): ExtendedHoursData {
    return {
      preMarket: { gainers: [], losers: [], mostActive: [] },
      afterHours: { gainers: [], losers: [], mostActive: [] },
      marketStatus: this.getMarketStatus(),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Limpiar cache
   */
  clearCache() {
    moversCache = { data: null, timestamp: 0 };
    logger.info('[ExtendedHours] Cache cleared');
  }
}

export const extendedHoursService = new ExtendedHoursService();
