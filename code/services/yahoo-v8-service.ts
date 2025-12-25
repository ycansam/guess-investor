/**
 * Servicio Yahoo Finance v8 - SIN AUTENTICACIÓN
 * 
 * El endpoint v8/finance/chart NO requiere autenticación y devuelve:
 * - Precio actual
 * - Datos históricos
 * - Metadatos del símbolo
 * 
 * ¡GRATIS y SIN LÍMITES!
 */

import { Platform } from 'react-native';

const YAHOO_V8_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_V7_QUOTE = 'https://query1.finance.yahoo.com/v7/finance/quote';

// Proxies CORS para web - ordenados por velocidad (corsproxy.io es el más rápido)
const CORS_PROXIES = [
  'https://corsproxy.io/?',        // Más rápido y estable
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];

/**
 * Información de un dividendo
 */
export interface DividendInfo {
  amount: number;
  date: Date;
}

/**
 * Datos del endpoint v8/chart
 */
export interface YahooV8Data {
  symbol: string;
  
  // Nombre completo
  longName?: string;
  shortName?: string;
  
  // Precio actual
  regularMarketPrice: number;
  previousClose: number;
  
  // Info del mercado
  currency: string;
  exchangeName: string;
  instrumentType: string;
  timezone: string;
  
  // Rango
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  
  // Volumen
  regularMarketVolume: number;
  
  // Medias móviles
  fiftyDayAverage: number;
  twoHundredDayAverage: number;
  
  // Calculados
  priceChange: number;
  priceChangePercent: number;
  
  // === DATOS EXTENDIDOS (V8 con events) ===
  
  // Dividendos
  dividends?: DividendInfo[];
  annualDividend?: number; // Suma de dividendos últimos 12 meses
  dividendYield?: number; // (annualDividend / price) * 100
  
  // Splits
  splits?: { ratio: number; date: Date }[];
  
  // Volumen promedio
  averageVolume10days?: number;
  
  // Métricas calculadas del precio
  distanceFrom52WeekHigh?: number; // Porcentaje
  distanceFrom52WeekLow?: number; // Porcentaje
  volatility30d?: number; // Volatilidad últimos 30 días
  
  // Metadata
  dataGranularity: string;
  validRanges: string[];
  
  // Histórico (últimos puntos)
  historicalPrices?: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  
  // Metadata del servicio
  fetchedAt: Date;
}

/**
 * Cache local para reducir llamadas
 */
const cache = new Map<string, { data: YahooV8Data; timestamp: number }>();
const liteCache = new Map<string, { data: YahooV8Data; timestamp: number }>();
const historicalCache = new Map<string, { data: YahooV8Data; timestamp: number }>();
const batchCache = new Map<string, { data: YahooV8Data; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos
const HISTORICAL_CACHE_DURATION = 15 * 60 * 1000; // 15 minutos para históricos

let currentProxyIndex = 0;

/**
 * Datos mínimos del endpoint v7/quote
 */
export interface QuoteBatchResult {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  currency: string;
  shortName?: string;
  longName?: string;
}

/**
 * Obtiene la URL con proxy CORS si estamos en web
 * Incluye events=div,split para obtener dividendos y splits
 */
function getUrlWithProxy(symbol: string, range: string, interval: string, proxyIndex: number, includeEvents: boolean = true): string {
  // Añadir events para obtener dividendos y splits
  const eventsParam = includeEvents ? '&events=div,split' : '';
  const baseUrl = `${YAHOO_V8_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false${eventsParam}`;
  
  if (Platform.OS === 'web') {
    const proxy = CORS_PROXIES[proxyIndex];
    return `${proxy}${encodeURIComponent(baseUrl)}`;
  }
  
  return baseUrl;
}

/**
 * Intenta fetch con reintentos usando diferentes proxies
 */
async function fetchWithRetry(symbol: string, range: string, interval: string, includeEvents: boolean = true): Promise<Response | null> {
  const eventsParam = includeEvents ? '&events=div,split' : '';
  
  if (Platform.OS !== 'web') {
    // En móvil/nativo, no necesitamos CORS, llamar directamente
    try {
      const url = `${YAHOO_V8_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false${eventsParam}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok ? response : null;
    } catch (error) {
      console.error(`[YahooV8] Direct fetch failed for ${symbol}:`, error);
      return null;
    }
  }

  // En web, intentar con el proxy actual primero (más rápido)
  const url = getUrlWithProxy(symbol, range, interval, currentProxyIndex, includeEvents);
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000), // Timeout más corto para velocidad
    });
    
    if (response.ok) {
      return response;
    }
  } catch (error) {
    // Proxy actual falló, intentar otros
  }
  
  // Intentar con otros proxies si el actual falla
  for (let i = 1; i < CORS_PROXIES.length; i++) {
    const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
    const fallbackUrl = getUrlWithProxy(symbol, range, interval, proxyIndex, includeEvents);
    
    try {
      const response = await fetch(fallbackUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        currentProxyIndex = proxyIndex; // Cambiar al proxy que funciona
        return response;
      }
    } catch (error) {
      // Continuar con siguiente proxy
    }
  }
  
  return null;
}

/**
 * Calcula la volatilidad a partir de precios históricos
 */
function calculateVolatility(historicalPrices: { close: number }[]): number {
  if (historicalPrices.length < 5) return 0;
  
  const returns = [];
  for (let i = 1; i < historicalPrices.length; i++) {
    const prev = historicalPrices[i - 1].close;
    const curr = historicalPrices[i].close;
    if (prev > 0 && curr > 0) {
      returns.push((curr - prev) / prev);
    }
  }
  
  if (returns.length < 2) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  
  // Anualizar (aprox 252 días de trading)
  return dailyVol * Math.sqrt(252) * 100;
}

/**
 * Fetch ultra-lite: solo metadatos (precio actual y cambio)
 * Usa range=1d interval=1d sin eventos para minimizar datos
 */
async function fetchSymbolLite(symbol: string): Promise<YahooV8Data | null> {
  try {
    // Sin eventos, range mínimo, interval máximo = respuesta pequeña
    const response = await fetchWithRetry(symbol, '1d', '1d', false);
    
    if (!response) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.chart?.error) {
      return null;
    }
    
    const result = data.chart?.result?.[0];
    if (!result) {
      return null;
    }
    
    const meta = result.meta;
    const regularMarketPrice = meta.regularMarketPrice || 0;
    const previousClose = meta.previousClose || meta.chartPreviousClose || regularMarketPrice;
    
    if (!regularMarketPrice || regularMarketPrice <= 0) {
      return null;
    }
    
    const priceChange = regularMarketPrice - previousClose;
    const priceChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;
    
    return {
      symbol: meta.symbol || symbol,
      longName: meta.longName,
      shortName: meta.shortName,
      regularMarketPrice,
      previousClose,
      currency: meta.currency || 'USD',
      exchangeName: meta.exchangeName || '',
      instrumentType: meta.instrumentType || '',
      timezone: meta.timezone || '',
      regularMarketDayHigh: meta.regularMarketDayHigh || regularMarketPrice,
      regularMarketDayLow: meta.regularMarketDayLow || regularMarketPrice,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || regularMarketPrice,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || regularMarketPrice,
      regularMarketVolume: meta.regularMarketVolume || 0,
      fiftyDayAverage: meta.fiftyDayAverage || regularMarketPrice,
      twoHundredDayAverage: meta.twoHundredDayAverage || regularMarketPrice,
      priceChange,
      priceChangePercent,
      dataGranularity: '1d',
      validRanges: [],
      fetchedAt: new Date(),
    };
  } catch (error) {
    return null;
  }
}

/**
 * BATCH FETCH - Obtiene múltiples símbolos en UNA SOLA petición
 * Usa el endpoint v7/finance/quote que soporta múltiples símbolos
 * Esto es MUCHO más rápido que hacer peticiones individuales
 */
async function fetchBatchQuotes(symbols: string[]): Promise<Map<string, QuoteBatchResult>> {
  const result = new Map<string, QuoteBatchResult>();
  
  if (symbols.length === 0) return result;
  
  const symbolsParam = symbols.join(',');
  const baseUrl = `${YAHOO_V7_QUOTE}?symbols=${encodeURIComponent(symbolsParam)}`;
  
  console.log(`[YahooV8] Batch fetching ${symbols.length} symbols in ONE request...`);
  const startTime = Date.now();
  
  try {
    let response: Response | null = null;
    
    if (Platform.OS !== 'web') {
      // En móvil, llamar directamente
      response = await fetch(baseUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
    } else {
      // En web, intentar con proxies CORS
      for (let i = 0; i < CORS_PROXIES.length; i++) {
        const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
        const proxy = CORS_PROXIES[proxyIndex];
        const url = `${proxy}${encodeURIComponent(baseUrl)}`;
        
        try {
          response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
          });
          
          if (response.ok) {
            currentProxyIndex = proxyIndex;
            break;
          }
        } catch (error) {
          console.log(`[YahooV8] Batch proxy ${proxyIndex + 1} failed`);
        }
      }
    }
    
    if (!response || !response.ok) {
      console.error('[YahooV8] Batch fetch failed');
      return result;
    }
    
    const data = await response.json();
    const quotes = data.quoteResponse?.result || [];
    
    for (const quote of quotes) {
      if (quote.symbol && quote.regularMarketPrice) {
        result.set(quote.symbol, {
          symbol: quote.symbol,
          regularMarketPrice: quote.regularMarketPrice,
          regularMarketChange: quote.regularMarketChange || 0,
          regularMarketChangePercent: quote.regularMarketChangePercent || 0,
          currency: quote.currency || 'USD',
          shortName: quote.shortName,
          longName: quote.longName,
        });
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[YahooV8] ✅ Batch fetched ${result.size}/${symbols.length} symbols in ${elapsed}ms`);
    
  } catch (error: any) {
    console.error('[YahooV8] Batch fetch error:', error.message);
  }
  
  return result;
}

/**
 * Obtiene datos de un símbolo via v8/chart
 */
async function fetchSymbol(symbol: string, range: string = '1d', interval: string = '1m'): Promise<YahooV8Data | null> {
  try {
    console.log(`[YahooV8] Fetching ${symbol}...`);
    
    const response = await fetchWithRetry(symbol, range, interval, true);
    
    if (!response) {
      console.error(`[YahooV8] All proxies failed for ${symbol}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.chart?.error) {
      console.error(`[YahooV8] API error for ${symbol}:`, data.chart.error.description);
      return null;
    }
    
    const result = data.chart?.result?.[0];
    if (!result) {
      console.log(`[YahooV8] No data for ${symbol}`);
      return null;
    }
    
    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp || [];
    const events = result.events || {};
    
    // Construir array de precios históricos
    const historicalPrices = timestamps.map((ts: number, i: number) => ({
      timestamp: ts * 1000, // Convertir a ms
      open: quotes?.open?.[i] || 0,
      high: quotes?.high?.[i] || 0,
      low: quotes?.low?.[i] || 0,
      close: quotes?.close?.[i] || 0,
      volume: quotes?.volume?.[i] || 0,
    })).filter((p: any) => p.close > 0); // Filtrar datos inválidos
    
    // Precio actual
    const regularMarketPrice = meta.regularMarketPrice || 0;
    const previousClose = meta.previousClose || meta.chartPreviousClose || regularMarketPrice;
    
    // Validar que tenemos un precio válido
    if (!regularMarketPrice || regularMarketPrice <= 0) {
      console.error(`[YahooV8] Invalid price for ${symbol}: ${regularMarketPrice}`);
      return null;
    }
    
    // Calcular cambio
    const priceChange = regularMarketPrice - previousClose;
    const priceChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;
    
    // === EXTRAER DIVIDENDOS ===
    const dividendsRaw = events.dividends || {};
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    
    const dividends: DividendInfo[] = Object.values(dividendsRaw)
      .map((div: any) => ({
        amount: div.amount || 0,
        date: new Date(div.date * 1000),
      }))
      .filter((div: DividendInfo) => div.amount > 0);
    
    // Calcular dividendo anual (últimos 12 meses)
    const recentDividends = dividends.filter(d => d.date.getTime() > oneYearAgo);
    const annualDividend = recentDividends.reduce((sum, d) => sum + d.amount, 0);
    const dividendYield = regularMarketPrice > 0 && annualDividend > 0 
      ? (annualDividend / regularMarketPrice) * 100 
      : undefined;
    
    // === EXTRAER SPLITS ===
    const splitsRaw = events.splits || {};
    const splits = Object.values(splitsRaw)
      .map((split: any) => ({
        ratio: (split.numerator || 1) / (split.denominator || 1),
        date: new Date(split.date * 1000),
      }))
      .filter((s: any) => s.ratio !== 1);
    
    // === CALCULAR MÉTRICAS DE PRECIO ===
    const fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh || 0;
    const fiftyTwoWeekLow = meta.fiftyTwoWeekLow || 0;
    
    const distanceFrom52WeekHigh = fiftyTwoWeekHigh > 0 
      ? ((regularMarketPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100 
      : undefined;
    
    const distanceFrom52WeekLow = fiftyTwoWeekLow > 0 
      ? ((regularMarketPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100 
      : undefined;
    
    // Volatilidad (usar últimos 30 puntos si hay suficientes)
    const volatility30d = calculateVolatility(historicalPrices.slice(-30));
    
    const parsed: YahooV8Data = {
      symbol: meta.symbol || symbol,
      longName: meta.longName,
      shortName: meta.shortName,
      regularMarketPrice,
      previousClose,
      currency: meta.currency || 'USD',
      exchangeName: meta.exchangeName || '',
      instrumentType: meta.instrumentType || 'EQUITY',
      timezone: meta.timezone || 'UTC',
      regularMarketDayHigh: meta.regularMarketDayHigh || 0,
      regularMarketDayLow: meta.regularMarketDayLow || 0,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      regularMarketVolume: meta.regularMarketVolume || 0,
      fiftyDayAverage: meta.fiftyDayAverage || 0,
      twoHundredDayAverage: meta.twoHundredDayAverage || 0,
      priceChange,
      priceChangePercent,
      // Datos extendidos
      dividends: dividends.length > 0 ? dividends : undefined,
      annualDividend: annualDividend > 0 ? annualDividend : undefined,
      dividendYield,
      splits: splits.length > 0 ? splits : undefined,
      distanceFrom52WeekHigh,
      distanceFrom52WeekLow,
      volatility30d: volatility30d > 0 ? volatility30d : undefined,
      // Metadata
      dataGranularity: meta.dataGranularity || interval,
      validRanges: meta.validRanges || [],
      historicalPrices: historicalPrices.slice(-100), // Últimos 100 puntos
      fetchedAt: new Date(),
    };
    
    // Log mejorado
    let divInfo = '';
    if (dividendYield) {
      divInfo = `, Div: ${dividendYield.toFixed(2)}%`;
    }
    console.log(`[YahooV8] ${symbol}: ${parsed.regularMarketPrice} ${parsed.currency} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%${divInfo})`);
    
    return parsed;
  } catch (error: any) {
    console.error(`[YahooV8] Error fetching ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Clase principal del servicio Yahoo V8
 */
class YahooV8Service {
  /**
   * Obtiene datos LITE de un símbolo (solo precio y cambio, muy rápido)
   * Ideal para listas de mercado donde solo se muestra precio/cambio
   */
  async getQuoteLite(symbol: string): Promise<YahooV8Data | null> {
    // Verificar caché lite
    const cached = liteCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    
    // Fetch lite (sin logs para no saturar)
    const data = await fetchSymbolLite(symbol);
    
    if (data) {
      liteCache.set(symbol, { data, timestamp: Date.now() });
    }
    
    return data;
  }

  /**
   * Obtiene datos de un símbolo (versión completa con históricos)
   */
  async getQuote(symbol: string): Promise<YahooV8Data | null> {
    // Verificar caché
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[YahooV8] Cache hit: ${symbol}`);
      return cached.data;
    }
    
    // Fetch nuevo
    const data = await fetchSymbol(symbol, '1d', '5m');
    
    if (data) {
      cache.set(symbol, { data, timestamp: Date.now() });
    }
    
    return data;
  }
  
  /**
   * Obtiene datos extendidos de un símbolo (incluye dividendos, volatilidad, etc.)
   * Usa rango de 1 año para capturar dividendos y calcular métricas
   */
  async getExtendedQuote(symbol: string): Promise<YahooV8Data | null> {
    const cacheKey = `extended_${symbol}`;
    const cached = cache.get(cacheKey);
    
    // Cache más largo para datos extendidos (5 minutos)
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log(`[YahooV8] Extended cache hit: ${symbol}`);
      return cached.data;
    }
    
    // Fetch con rango de 1 año para obtener dividendos y mejor volatilidad
    const data = await fetchSymbol(symbol, '1y', '1d');
    
    if (data) {
      cache.set(cacheKey, { data, timestamp: Date.now() });
    }
    
    return data;
  }
  
  /**
   * Obtiene múltiples símbolos en paralelo
   */
  async getQuotes(symbols: string[]): Promise<Map<string, YahooV8Data>> {
    const results = new Map<string, YahooV8Data>();
    
    // Procesar en paralelo (máx 10 a la vez)
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(s => this.getQuote(s));
      const batchResults = await Promise.all(promises);
      
      batch.forEach((symbol, index) => {
        if (batchResults[index]) {
          results.set(symbol, batchResults[index]!);
        }
      });
    }
    
    return results;
  }

  /**
   * ⚡ BATCH FETCH RÁPIDO - Obtiene múltiples símbolos en UNA SOLA petición
   * Ideal para la home page - devuelve solo precio y cambio
   * 18 símbolos en ~500ms en lugar de 18 peticiones individuales
   */
  async getBatchQuotes(symbols: string[]): Promise<Map<string, QuoteBatchResult>> {
    const now = Date.now();
    const uncached: string[] = [];
    const result = new Map<string, QuoteBatchResult>();
    
    // Primero verificar caché
    for (const symbol of symbols) {
      const cached = batchCache.get(symbol);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        result.set(symbol, {
          symbol: cached.data.symbol,
          regularMarketPrice: cached.data.regularMarketPrice,
          regularMarketChange: cached.data.priceChange,
          regularMarketChangePercent: cached.data.priceChangePercent,
          currency: cached.data.currency,
          shortName: cached.data.shortName,
          longName: cached.data.longName,
        });
      } else {
        uncached.push(symbol);
      }
    }
    
    // Si todos en caché, retornar
    if (uncached.length === 0) {
      console.log(`[YahooV8] ✅ All ${symbols.length} symbols from batch cache`);
      return result;
    }
    
    // Fetch los que faltan en UNA SOLA petición
    const fetched = await fetchBatchQuotes(uncached);
    
    // Guardar en caché y añadir a resultado
    for (const [symbol, quote] of fetched) {
      // Crear un YahooV8Data mínimo para el caché
      const cacheData: YahooV8Data = {
        symbol: quote.symbol,
        regularMarketPrice: quote.regularMarketPrice,
        previousClose: quote.regularMarketPrice - quote.regularMarketChange,
        priceChange: quote.regularMarketChange,
        priceChangePercent: quote.regularMarketChangePercent,
        currency: quote.currency,
        shortName: quote.shortName,
        longName: quote.longName,
        exchangeName: '',
        instrumentType: '',
        timezone: '',
        regularMarketDayHigh: quote.regularMarketPrice,
        regularMarketDayLow: quote.regularMarketPrice,
        fiftyTwoWeekHigh: quote.regularMarketPrice,
        fiftyTwoWeekLow: quote.regularMarketPrice,
        regularMarketVolume: 0,
        fiftyDayAverage: quote.regularMarketPrice,
        twoHundredDayAverage: quote.regularMarketPrice,
        dataGranularity: 'batch',
        validRanges: [],
        fetchedAt: new Date(),
      };
      
      batchCache.set(symbol, { data: cacheData, timestamp: now });
      result.set(symbol, quote);
    }
    
    return result;
  }
  
  /**
   * Obtiene datos históricos con rango personalizado (con cache de 15 min)
   */
  async getHistorical(
    symbol: string,
    range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '1mo',
    interval: '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo' = '1d'
  ): Promise<YahooV8Data | null> {
    const cacheKey = `hist_${symbol}_${range}_${interval}`;
    const cached = historicalCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < HISTORICAL_CACHE_DURATION) {
      console.log(`[YahooV8] Historical cache hit: ${symbol} ${range}`);
      return cached.data;
    }
    
    const data = await fetchSymbol(symbol, range, interval);
    
    if (data) {
      historicalCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    
    return data;
  }
  
  /**
   * Obtiene datos históricos simplificados (para compatibilidad con asset-classifier)
   */
  async getHistoricalData(symbol: string, range: string): Promise<{ close: number; volume: number; timestamp: number }[] | null> {
    // Mapear rango a formato válido
    let validRange: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '3mo';
    if (range.includes('90') || range.includes('3m')) validRange = '3mo';
    else if (range.includes('30') || range.includes('1m')) validRange = '1mo';
    else if (range.includes('1y') || range.includes('365')) validRange = '1y';
    
    const data = await this.getHistorical(symbol, validRange, '1d');
    return data?.historicalPrices || null;
  }
  
  /**
   * Obtiene el precio actual de un símbolo (versión simplificada)
   */
  async getPrice(symbol: string): Promise<number> {
    const data = await this.getQuote(symbol);
    return data?.regularMarketPrice || 0;
  }
  
  /**
   * Verifica si un símbolo existe
   */
  async symbolExists(symbol: string): Promise<boolean> {
    const data = await this.getQuote(symbol);
    return data !== null && data.regularMarketPrice > 0;
  }
  
  /**
   * Limpia la caché
   */
  clearCache(): void {
    cache.clear();
    liteCache.clear();
    historicalCache.clear();
    batchCache.clear();
    console.log('[YahooV8] Cache cleared');
  }
  
  /**
   * Estadísticas de caché
   */
  getCacheStats(): { entries: number; symbols: string[] } {
    return {
      entries: cache.size,
      symbols: [...cache.keys()],
    };
  }
}

// Singleton
export const yahooV8Service = new YahooV8Service();
