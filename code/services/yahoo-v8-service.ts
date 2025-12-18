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
];

/**
 * Datos del endpoint v8/chart
 */
export interface YahooV8Data {
  symbol: string;
  
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
 */
function getUrlWithProxy(symbol: string, range: string, interval: string, proxyIndex: number): string {
  const baseUrl = `${YAHOO_V8_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  
  if (Platform.OS === 'web') {
    const proxy = CORS_PROXIES[proxyIndex];
    return `${proxy}${encodeURIComponent(baseUrl)}`;
  }
  
  return baseUrl;
}

/**
 * Intenta fetch con reintentos usando diferentes proxies
 */
async function fetchWithRetry(symbol: string, range: string, interval: string): Promise<Response | null> {
  if (Platform.OS !== 'web') {
    const url = getUrlWithProxy(symbol, range, interval, 0);
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    return response.ok ? response : null;
  }

  // En web, intentar con cada proxy
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
    const url = getUrlWithProxy(symbol, range, interval, proxyIndex);
    
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
 * Obtiene datos de un símbolo via v8/chart
 */
async function fetchSymbol(symbol: string, range: string = '1d', interval: string = '1m'): Promise<YahooV8Data | null> {
  try {
    console.log(`[YahooV8] Fetching ${symbol}...`);
    
    const response = await fetchWithRetry(symbol, range, interval);
    
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
    
    // Calcular cambio
    const priceChange = regularMarketPrice - previousClose;
    const priceChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;
    
    const parsed: YahooV8Data = {
      symbol: meta.symbol || symbol,
      regularMarketPrice,
      previousClose,
      currency: meta.currency || 'USD',
      exchangeName: meta.exchangeName || '',
      instrumentType: meta.instrumentType || 'EQUITY',
      timezone: meta.timezone || 'UTC',
      regularMarketDayHigh: meta.regularMarketDayHigh || 0,
      regularMarketDayLow: meta.regularMarketDayLow || 0,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
      regularMarketVolume: meta.regularMarketVolume || 0,
      fiftyDayAverage: meta.fiftyDayAverage || 0,
      twoHundredDayAverage: meta.twoHundredDayAverage || 0,
      priceChange,
      priceChangePercent,
      dataGranularity: meta.dataGranularity || interval,
      validRanges: meta.validRanges || [],
      historicalPrices: historicalPrices.slice(-100), // Últimos 100 puntos
      fetchedAt: new Date(),
    };
    
    console.log(`[YahooV8] ${symbol}: ${parsed.regularMarketPrice} ${parsed.currency} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)`);
    
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
   * Obtiene datos de un símbolo
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
