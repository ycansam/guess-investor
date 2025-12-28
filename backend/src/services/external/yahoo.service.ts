/**
 * Yahoo Finance V8 Service
 * Migrado del frontend - Obtiene datos de mercado en tiempo real
 */

import { config } from '../../config/index.js';
import { logger } from '../../middleware/logger.js';
import { AssetQuote, HistoricalDataPoint } from '../../models/index.js';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance';
const RAPIDAPI_HOST = 'yahoo-finance15.p.rapidapi.com';
const RAPIDAPI_BASE = 'https://yahoo-finance15.p.rapidapi.com/api/v1/markets';

// Cache en memoria simple
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttlSeconds: number): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export const yahooService = {
  /**
   * Obtener cotización actual
   */
  async getQuote(symbol: string): Promise<AssetQuote | null> {
    const cacheKey = `quote:${symbol}`;
    const cached = getCached<AssetQuote>(cacheKey);
    if (cached) return cached;

    try {
      // Intentar primero Yahoo directo (gratis)
      const data = await this.fetchYahooDirect(symbol);
      if (data) {
        setCache(cacheKey, data, config.cache.quote);
        return data;
      }

      // Fallback a RapidAPI si hay key
      if (config.rapidApiKey) {
        const rapidData = await this.fetchRapidApi(symbol);
        if (rapidData) {
          setCache(cacheKey, rapidData, config.cache.quote);
          return rapidData;
        }
      }

      return null;
    } catch (error) {
      logger.error(`[Yahoo] Error fetching quote for ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Obtener datos históricos
   */
  async getHistory(
    symbol: string,
    range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '1mo',
    interval: '1m' | '5m' | '15m' | '1h' | '1d' = '1d'
  ): Promise<HistoricalDataPoint[]> {
    const cacheKey = `history:${symbol}:${range}:${interval}`;
    const cached = getCached<HistoricalDataPoint[]>(cacheKey);
    if (cached) return cached;

    try {
      const url = `${YAHOO_BASE_URL}/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }

      const json: any = await response.json();
      const result = json.chart?.result?.[0];

      if (!result) {
        return [];
      }

      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};

      const history: HistoricalDataPoint[] = timestamps.map((ts: number, i: number) => ({
        timestamp: ts * 1000, // Convertir a ms
        open: quotes.open?.[i] || 0,
        high: quotes.high?.[i] || 0,
        low: quotes.low?.[i] || 0,
        close: quotes.close?.[i] || 0,
        volume: quotes.volume?.[i] || 0,
      })).filter((p: HistoricalDataPoint) => p.close > 0);

      setCache(cacheKey, history, config.cache.history);
      logger.info(`[Yahoo] Fetched ${history.length} historical points for ${symbol}`);
      return history;
    } catch (error) {
      logger.error(`[Yahoo] Error fetching history for ${symbol}:`, error);
      return [];
    }
  },

  /**
   * Fetch directo a Yahoo (puede fallar por CORS en browser, funciona en Node)
   */
  async fetchYahooDirect(symbol: string): Promise<AssetQuote | null> {
    try {
      const url = `${YAHOO_BASE_URL}/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return null;
      }

      const json: any = await response.json();
      const result = json.chart?.result?.[0];
      const meta = result?.meta;

      if (!meta) return null;

      const price = meta.regularMarketPrice || 0;
      const prevClose = meta.chartPreviousClose || meta.previousClose || price;
      const change = price - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      return {
        symbol: meta.symbol,
        name: meta.shortName || meta.longName || meta.symbol,
        price,
        currency: meta.currency || 'USD',
        change,
        changePercent,
        volume: meta.regularMarketVolume,
        marketCap: meta.marketCap,
      };
    } catch {
      return null;
    }
  },

  /**
   * Fetch vía RapidAPI (backup)
   */
  async fetchRapidApi(symbol: string): Promise<AssetQuote | null> {
    if (!config.rapidApiKey) return null;

    try {
      const url = `${RAPIDAPI_BASE}/stock/quotes?ticker=${encodeURIComponent(symbol)}`;
      
      const response = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': config.rapidApiKey,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      });

      if (!response.ok) return null;

      const json: any = await response.json();
      const quote = json.body?.[0];

      if (!quote) return null;

      return {
        symbol: quote.symbol,
        name: quote.shortName || quote.longName || quote.symbol,
        price: quote.regularMarketPrice || 0,
        currency: quote.currency || 'USD',
        change: quote.regularMarketChange || 0,
        changePercent: quote.regularMarketChangePercent || 0,
        volume: quote.regularMarketVolume,
        marketCap: quote.marketCap,
      };
    } catch {
      return null;
    }
  },

  /**
   * Buscar símbolos
   */
  async search(query: string): Promise<Array<{ symbol: string; name: string; type: string }>> {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (!response.ok) return [];

      const json: any = await response.json();
      return (json.quotes || []).map((q: { symbol: string; shortname?: string; longname?: string; quoteType?: string }) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType || 'unknown',
      }));
    } catch {
      return [];
    }
  },

  /**
   * Limpiar cache
   */
  clearCache(): void {
    cache.clear();
    logger.info('[Yahoo] Cache cleared');
  },
};
