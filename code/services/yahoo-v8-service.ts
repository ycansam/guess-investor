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

// Proxies CORS para web (rotamos si uno falla)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://cors.bridged.cc/', // Proxy alternativo más estable
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
const CACHE_DURATION = 60 * 1000; // 1 minuto (datos casi en tiempo real)

let currentProxyIndex = 0;

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
        signal: AbortSignal.timeout(10000),
      });
      return response.ok ? response : null;
    } catch (error) {
      console.error(`[YahooV8] Direct fetch failed for ${symbol}:`, error);
      return null;
    }
  }

  // En web, intentar con cada proxy
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
    const url = getUrlWithProxy(symbol, range, interval, proxyIndex, includeEvents);
    
    try {
      console.log(`[YahooV8] Trying proxy ${proxyIndex + 1}/${CORS_PROXIES.length} for ${symbol}...`);
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      
      if (response.ok) {
        currentProxyIndex = proxyIndex; // Recordar el proxy que funcionó
        return response;
      }
    } catch (error) {
      console.log(`[YahooV8] Proxy ${proxyIndex + 1} failed for ${symbol}`);
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
   * Obtiene datos de un símbolo (versión rápida - solo datos del día)
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
   * Obtiene datos históricos con rango personalizado
   */
  async getHistorical(
    symbol: string,
    range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '1mo',
    interval: '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo' = '1d'
  ): Promise<YahooV8Data | null> {
    return fetchSymbol(symbol, range, interval);
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
