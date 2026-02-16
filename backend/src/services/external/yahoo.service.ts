/**
 * Yahoo Finance V8 Service
 * Migrado del frontend - Obtiene datos de mercado en tiempo real
 */

import { config } from '../../config/index.js';
import { logger } from '../../middleware/logger.js';
import { AssetQuote, HistoricalDataPoint } from '../../models/index.js';
import { historyCacheService } from './history-cache.service.js';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance';
const RAPIDAPI_HOST = 'yahoo-finance15.p.rapidapi.com';
const RAPIDAPI_BASE = 'https://yahoo-finance15.p.rapidapi.com/api/v1/markets';

/**
 * Utilidades de mercado - horarios y días
 * Mercado NYSE/NASDAQ: Lunes-Viernes, 9:30 AM - 4:00 PM ET
 */

/**
 * Verificar si una fecha es fin de semana
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Domingo = 0, Sábado = 6
}

/**
 * Obtener el último día de mercado (viernes si es fin de semana)
 * Para predicciones que expiran en sábado/domingo, el mercado cerró el viernes
 */
export function getLastMarketDay(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  
  if (day === 0) {
    // Domingo -> retroceder 2 días (viernes)
    result.setDate(result.getDate() - 2);
  } else if (day === 6) {
    // Sábado -> retroceder 1 día (viernes)
    result.setDate(result.getDate() - 1);
  }
  
  return result;
}

/**
 * Verificar si el mercado está cerrado para una predicción
 * Considera:
 * 1. Si la predicción ya expiró normalmente
 * 2. Si la predicción expira en fin de semana y el viernes ya cerró
 * 3. Si estamos en fin de semana y la predicción expira el lunes siguiente
 * 4. La predicción debe haber sido creada ANTES del cierre del mercado
 *    para poder verificarse (no puedes verificar predicciones hechas después del cierre)
 * 
 * Hora de cierre: 4 PM ET = 21:00 UTC (invierno) / 20:00 UTC (verano)
 * Usamos 21:00 UTC para ser conservadores
 */
export function isMarketClosedForPrediction(expiresAt: Date, createdAt?: Date): boolean {
  const now = new Date();
  
  // Si la predicción ya expiró normalmente
  if (expiresAt <= now) {
    return true;
  }
  
  const expiresDay = expiresAt.getDay();
  
  // Caso 1: La predicción expira en fin de semana
  if (isWeekend(expiresAt)) {
    const lastMarketDay = getLastMarketDay(expiresAt);
    const marketCloseTime = new Date(lastMarketDay);
    marketCloseTime.setUTCHours(21, 0, 0, 0);
    
    // Solo verificar si el mercado cerró Y la predicción fue creada antes del cierre
    if (now >= marketCloseTime) {
      // Si tenemos createdAt, verificar que fue creada antes del cierre
      if (createdAt && createdAt > marketCloseTime) {
        return false; // Predicción creada después del cierre, no verificar aún
      }
      return true;
    }
    return false;
  }
  
  // Caso 2: Estamos en fin de semana y la predicción expira el próximo lunes
  if (isWeekend(now) && expiresDay === 1) {
    const lastFriday = getLastMarketDay(now);
    const marketCloseTime = new Date(lastFriday);
    marketCloseTime.setUTCHours(21, 0, 0, 0);
    
    if (now >= marketCloseTime) {
      // Si tenemos createdAt, verificar que fue creada antes del cierre
      if (createdAt && createdAt > marketCloseTime) {
        return false; // Predicción creada después del cierre, no verificar aún
      }
      // Verificar que la expiración es dentro de los próximos 3 días
      const diffDays = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 2;
    }
  }
  
  return false;
}

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
   * Obtener cotizaciones en batch (múltiples símbolos en una sola llamada)
   * Usa el endpoint v7/finance/quote que soporta múltiples símbolos
   */
  async getQuotesBatch(symbols: string[]): Promise<Record<string, AssetQuote | null>> {
    const results: Record<string, AssetQuote | null> = {};
    
    if (symbols.length === 0) return results;

    // Separar símbolos cacheados de los que necesitan fetch
    const uncachedSymbols: string[] = [];
    for (const symbol of symbols) {
      const cacheKey = `quote:${symbol}`;
      const cached = getCached<AssetQuote>(cacheKey);
      if (cached) {
        results[symbol] = cached;
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    // Si todos están en caché, retornar
    if (uncachedSymbols.length === 0) {
      logger.debug(`[Yahoo] Batch: all ${symbols.length} quotes from cache`);
      return results;
    }

    logger.info(`[Yahoo] Batch fetch: ${uncachedSymbols.length} symbols (${symbols.length - uncachedSymbols.length} cached)`);

    try {
      // Usar endpoint v7 que soporta múltiples símbolos
      const symbolsParam = uncachedSymbols.map(s => encodeURIComponent(s)).join(',');
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsParam}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout for batch
      });

      if (!response.ok) {
        logger.warn(`[Yahoo] Batch fetch failed with status ${response.status}, falling back to individual`);
        // Fallback: fetch individual (en paralelo)
        return this.getQuotesBatchFallback(symbols);
      }

      const json: any = await response.json();
      const quotes = json.quoteResponse?.result || [];

      for (const quote of quotes) {
        if (!quote || !quote.symbol) continue;
        
        const price = quote.regularMarketPrice || 0;
        const prevClose = quote.regularMarketPreviousClose || quote.previousClose || price;
        const change = quote.regularMarketChange ?? (price - prevClose);
        const changePercent = quote.regularMarketChangePercent ?? (prevClose > 0 ? (change / prevClose) * 100 : 0);

        const assetQuote: AssetQuote = {
          symbol: quote.symbol,
          name: quote.shortName || quote.longName || quote.symbol,
          price,
          currency: quote.currency || 'USD',
          change,
          changePercent,
          volume: quote.regularMarketVolume,
          marketCap: quote.marketCap,
          previousClose: prevClose,
        };

        results[quote.symbol] = assetQuote;
        
        // Cachear individualmente
        const cacheKey = `quote:${quote.symbol}`;
        setCache(cacheKey, assetQuote, config.cache.quote);
      }

      // Marcar símbolos no encontrados como null
      for (const symbol of uncachedSymbols) {
        if (!(symbol in results)) {
          results[symbol] = null;
        }
      }

      logger.debug(`[Yahoo] Batch: fetched ${quotes.length}/${uncachedSymbols.length} quotes`);
      return results;

    } catch (error) {
      logger.error(`[Yahoo] Batch fetch error, falling back to individual:`, error);
      return this.getQuotesBatchFallback(symbols);
    }
  },

  /**
   * Fallback: fetch quotes en paralelo (individual) si el batch falla
   */
  async getQuotesBatchFallback(symbols: string[]): Promise<Record<string, AssetQuote | null>> {
    const results: Record<string, AssetQuote | null> = {};
    
    await Promise.all(symbols.map(async (symbol) => {
      results[symbol] = await this.getQuote(symbol);
    }));
    
    return results;
  },

  /**
   * Obtener datos históricos con caché inteligente
   * - Cachea por 2 semanas
   * - Solo pide datos nuevos si faltan
   */
  async getHistory(
    symbol: string,
    range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '1mo',
    interval: '1m' | '5m' | '15m' | '1h' | '1d' = '1d'
  ): Promise<HistoricalDataPoint[]> {
    // Verificar caché inteligente primero
    const smartCached = historyCacheService.getCached(symbol, interval, range);
    
    if (smartCached && !smartCached.needsUpdate) {
      // Caché válida y no necesita actualización
      logger.debug(`[Yahoo] Using cached history for ${symbol} (${smartCached.data.length} points)`);
      return this.filterByRange(smartCached.data, range);
    }
    
    // Si hay caché pero necesita actualización, intentar solo obtener datos nuevos
    if (smartCached && smartCached.needsUpdate) {
      try {
        const newData = await this.fetchHistoryFromApi(symbol, '5d', interval);
        if (newData.length > 0) {
          const combined = historyCacheService.update(symbol, interval, newData);
          logger.info(`[Yahoo] Updated history cache for ${symbol} with ${newData.length} new points`);
          return this.filterByRange(combined, range);
        }
      } catch (error) {
        // Si falla la actualización, usar caché existente
        logger.warn(`[Yahoo] Failed to update history for ${symbol}, using cache`);
        return this.filterByRange(smartCached.data, range);
      }
    }
    
    // No hay caché, obtener todo
    try {
      const history = await this.fetchHistoryFromApi(symbol, range, interval);
      if (history.length > 0) {
        historyCacheService.set(symbol, interval, history);
        logger.info(`[Yahoo] Fetched and cached ${history.length} historical points for ${symbol}`);
      }
      return history;
    } catch (error) {
      logger.error(`[Yahoo] Error fetching history for ${symbol}:`, error);
      return [];
    }
  },
  
  /**
   * Filtrar datos por rango temporal
   */
  filterByRange(data: HistoricalDataPoint[], range: string): HistoricalDataPoint[] {
    const now = Date.now();
    const rangeMap: Record<string, number> = {
      '1d': 1,
      '5d': 5,
      '1mo': 30,
      '3mo': 90,
      '6mo': 180,
      '1y': 365,
    };
    const days = rangeMap[range] || 30;
    const startTime = now - days * 24 * 60 * 60 * 1000;
    
    return data.filter(d => d.timestamp >= startTime);
  },
  
  /**
   * Fetch directo a la API de Yahoo
   */
  async fetchHistoryFromApi(
    symbol: string,
    range: string,
    interval: string
  ): Promise<HistoricalDataPoint[]> {
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

    return timestamps.map((ts: number, i: number) => ({
      timestamp: ts * 1000, // Convertir a ms
      open: quotes.open?.[i] || 0,
      high: quotes.high?.[i] || 0,
      low: quotes.low?.[i] || 0,
      close: quotes.close?.[i] || 0,
      volume: quotes.volume?.[i] || 0,
    })).filter((p: HistoricalDataPoint) => p.close > 0);
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
        previousClose: prevClose,
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
   * Buscar símbolos - Búsqueda mejorada con múltiples fuentes externas
   */
  async search(query: string): Promise<Array<{ symbol: string; name: string; type: string; exchange?: string }>> {
    const results: Array<{ symbol: string; name: string; type: string; exchange?: string }> = [];
    const seenSymbols = new Set<string>();

    // Función helper para añadir resultados sin duplicados
    const addResults = (items: Array<{ symbol: string; name: string; type: string; exchange?: string }>) => {
      for (const item of items) {
        const key = item.symbol.toUpperCase();
        if (!seenSymbols.has(key)) {
          seenSymbols.add(key);
          results.push(item);
        }
      }
    };

    // Ejecutar búsquedas en paralelo para mayor velocidad
    const searchPromises: Promise<void>[] = [];

    // 1. Búsqueda principal en Yahoo Finance (aumentado a 25 resultados)
    searchPromises.push((async () => {
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=25&newsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`;
        
        const yahooResponse = await fetch(yahooUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (yahooResponse.ok) {
          const json: any = await yahooResponse.json();
          const yahooResults = (json.quotes || []).map((q: any) => ({
            symbol: q.symbol,
            name: q.shortname || q.longname || q.symbol,
            type: q.quoteType || 'unknown',
            exchange: q.exchange || q.exchDisp,
          }));
          addResults(yahooResults);
          logger.debug(`[Yahoo Search] Found ${yahooResults.length} results for "${query}"`);
        }
      } catch (error) {
        logger.warn(`[Yahoo Search] Primary search failed: ${error}`);
      }
    })());

    // 2. Búsqueda alternativa con Yahoo autosuggest
    searchPromises.push((async () => {
      try {
        const suggestUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0&listsCount=0`;
        
        const suggestResponse = await fetch(suggestUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (suggestResponse.ok) {
          const json: any = await suggestResponse.json();
          const suggestResults = (json.quotes || []).map((q: any) => ({
            symbol: q.symbol,
            name: q.shortname || q.longname || q.symbol,
            type: q.quoteType || 'unknown',
            exchange: q.exchange || q.exchDisp,
          }));
          addResults(suggestResults);
        }
      } catch {
        // Silently fail
      }
    })());

    // 3. Financial Modeling Prep - Búsqueda por símbolo (API gratuita)
    searchPromises.push((async () => {
      try {
        // FMP tiene un tier gratuito con límite de requests
        const fmpUrl = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query)}&limit=20`;
        
        const fmpResponse = await fetch(fmpUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(4000),
        });

        if (fmpResponse.ok) {
          const fmpData: any = await fmpResponse.json();
          if (Array.isArray(fmpData)) {
            const fmpResults = fmpData.map((item: any) => ({
              symbol: item.symbol,
              name: item.name || item.symbol,
              type: item.stockExchange?.includes('ETF') ? 'ETF' : 'EQUITY',
              exchange: item.stockExchange || item.exchangeShortName,
            }));
            addResults(fmpResults);
            logger.debug(`[FMP Search] Found ${fmpResults.length} results for "${query}"`);
          }
        }
      } catch (error) {
        logger.debug(`[FMP Search] Failed (may need API key): ${error}`);
      }
    })());

    // 4. Alpha Vantage Symbol Search (tier gratuito limitado)
    searchPromises.push((async () => {
      try {
        // Alpha Vantage tiene un tier gratuito con 25 requests/día
        const avUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&datatype=json`;
        
        const avResponse = await fetch(avUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(4000),
        });

        if (avResponse.ok) {
          const avData: any = await avResponse.json();
          if (avData.bestMatches && Array.isArray(avData.bestMatches)) {
            const avResults = avData.bestMatches.map((item: any) => ({
              symbol: item['1. symbol'],
              name: item['2. name'],
              type: item['3. type'] || 'EQUITY',
              exchange: item['4. region'],
            }));
            addResults(avResults);
            logger.debug(`[Alpha Vantage] Found ${avResults.length} results for "${query}"`);
          }
        }
      } catch (error) {
        logger.debug(`[Alpha Vantage] Failed: ${error}`);
      }
    })());

    // 5. Búsqueda en Dukascopy (para Forex y CFDs)
    searchPromises.push((async () => {
      try {
        const dukasUrl = `https://freeserv.dukascopy.com/2.0/index.php?path=common/instruments&filter=${encodeURIComponent(query)}`;
        
        const dukasResponse = await fetch(dukasUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(3000),
        });

        if (dukasResponse.ok) {
          const dukasData: any = await dukasResponse.json();
          if (Array.isArray(dukasData)) {
            const dukasResults = dukasData.slice(0, 15).map((item: any) => ({
              symbol: item.name || item.title,
              name: item.title || item.description || item.name,
              type: item.group || 'CFD',
              exchange: 'Dukascopy',
            }));
            addResults(dukasResults);
          }
        }
      } catch {
        // Silently fail
      }
    })());

    // Esperar a todas las búsquedas paralelas
    await Promise.allSettled(searchPromises);

    // 6. Para búsquedas específicas, intentar variantes de símbolo (secuencial para no sobrecargar)
    const upperQuery = query.toUpperCase().trim();
    if (upperQuery.length <= 6 && /^[A-Z0-9]+$/.test(upperQuery)) {
      // Probar variantes comunes de exchanges europeos
      const variants = [
        upperQuery,           // Original (ej: AAPL)
        `${upperQuery}.MC`,   // Madrid (ej: ITX.MC)
        `${upperQuery}.DE`,   // Frankfurt/Xetra
        `${upperQuery}.L`,    // Londres
        `${upperQuery}.PA`,   // París
        `${upperQuery}.MI`,   // Milán
        `${upperQuery}.AS`,   // Amsterdam
        `${upperQuery}.BR`,   // Bruselas
        `${upperQuery}.SW`,   // Suiza
        `${upperQuery}.V`,    // Toronto Venture
        `${upperQuery}.TO`,   // Toronto
        `${upperQuery}-USD`,  // Crypto USD
        `${upperQuery}-EUR`,  // Crypto EUR
        `${upperQuery}3L.L`,  // ETPs apalancados Londres (Natural Gas 3x)
        `${upperQuery}3S.L`,  // ETPs inversos Londres
        `3${upperQuery}.L`,   // Formato alternativo
      ];

      for (const variant of variants) {
        if (!seenSymbols.has(variant)) {
          // Verificar si el símbolo existe con una llamada rápida
          try {
            const checkUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(variant)}?interval=1d&range=1d`;
            const checkResponse = await fetch(checkUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(2000),
            });
            
            if (checkResponse.ok) {
              const data: any = await checkResponse.json();
              const meta = data?.chart?.result?.[0]?.meta;
              if (meta && meta.regularMarketPrice) {
                addResults([{
                  symbol: variant,
                  name: meta.shortName || meta.longName || variant,
                  type: meta.instrumentType || 'EQUITY',
                  exchange: meta.exchangeName,
                }]);
              }
            }
          } catch {
            // Skip variant
          }
        }
      }
    }

    logger.info(`[Search] Total ${results.length} unique results for "${query}" (Yahoo + FMP + Alpha Vantage + variants)`);
    return results;
  },

  /**
   * Obtener precio de cierre de una fecha específica
   * Si la fecha es fin de semana o festivo, devuelve el cierre del último día de mercado anterior
   */
  async getPriceAtDate(symbol: string, targetDate: Date): Promise<{ price: number; actualDate: Date } | null> {
    try {
      // Obtener historial de los últimos 10 días para tener margen con festivos
      const history = await this.getHistory(symbol, '1mo', '1d');
      
      if (history.length === 0) {
        logger.warn(`[Yahoo] No history found for ${symbol} to get price at date`);
        return null;
      }
      
      // Normalizar target date a inicio del día
      const targetDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      
      // Buscar el día exacto o el día de mercado más cercano anterior
      let closestPoint: HistoricalDataPoint | null = null;
      
      for (const point of history) {
        const pointDate = new Date(point.timestamp);
        const pointDay = new Date(pointDate.getFullYear(), pointDate.getMonth(), pointDate.getDate());
        
        // Si encontramos el día exacto, usarlo
        if (pointDay.getTime() === targetDay.getTime()) {
          closestPoint = point;
          break;
        }
        
        // Si el punto es anterior o igual al target y es más reciente que el anterior encontrado
        if (pointDay <= targetDay) {
          if (!closestPoint || pointDay > new Date(closestPoint.timestamp)) {
            closestPoint = point;
          }
        }
      }
      
      if (!closestPoint) {
        logger.warn(`[Yahoo] Could not find price for ${symbol} at or before ${targetDate.toISOString()}`);
        return null;
      }
      
      logger.info(`[Yahoo] Price for ${symbol} at ${targetDate.toISOString().split('T')[0]}: ${closestPoint.close} (actual date: ${new Date(closestPoint.timestamp).toISOString().split('T')[0]})`);
      
      return {
        price: closestPoint.close,
        actualDate: new Date(closestPoint.timestamp),
      };
    } catch (error) {
      logger.error(`[Yahoo] Error getting price at date for ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Obtener extremos (high/low) del período entre dos fechas
   * Útil para verificar si el precio objetivo fue alcanzado en algún momento
   */
  async getPeriodExtremes(
    symbol: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<{ high: number; low: number; reachedHigh: Date; reachedLow: Date } | null> {
    try {
      const history = await this.getHistory(symbol, '3mo', '1d');
      
      if (history.length === 0) {
        return null;
      }
      
      // Normalizar fechas
      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      // Filtrar puntos en el rango
      const inRange = history.filter(point => {
        const pointDate = new Date(point.timestamp);
        const pointDay = new Date(pointDate.getFullYear(), pointDate.getMonth(), pointDate.getDate());
        return pointDay >= startDay && pointDay <= endDay;
      });
      
      if (inRange.length === 0) {
        return null;
      }
      
      // Encontrar máximo y mínimo
      let maxHigh = -Infinity;
      let minLow = Infinity;
      let reachedHigh = new Date();
      let reachedLow = new Date();
      
      for (const point of inRange) {
        if (point.high > maxHigh) {
          maxHigh = point.high;
          reachedHigh = new Date(point.timestamp);
        }
        if (point.low < minLow) {
          minLow = point.low;
          reachedLow = new Date(point.timestamp);
        }
      }
      
      logger.info(`[Yahoo] Period extremes for ${symbol} (${startDay.toISOString().split('T')[0]} to ${endDay.toISOString().split('T')[0]}): High=${maxHigh}, Low=${minLow}`);
      
      return {
        high: maxHigh,
        low: minLow,
        reachedHigh,
        reachedLow,
      };
    } catch (error) {
      logger.error(`[Yahoo] Error getting period extremes for ${symbol}:`, error);
      return null;
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
