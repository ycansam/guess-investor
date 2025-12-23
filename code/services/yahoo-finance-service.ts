import apiConfig from '../data/api-config.json';
import { MarketData } from '../types';
import { formatMarketDataForAI } from '../utils/format-market-data';
import { createMarketDataFromYahoo } from '../utils/yahoo-data-mapper';

const config = apiConfig.yahoo;

/**
 * Tipo de activo para determinar el formato del símbolo
 */
export type AssetType = 'stock' | 'crypto';

/**
 * Datos históricos procesados
 */
export interface HistoricalData {
  prices: number[];
  dates: string[];
  high52Week: number;
  low52Week: number;
  avgPrice30d: number;
  avgPrice90d: number;
  change30d: number;
  change90d: number;
  change1y: number;
  volatility: number;
}

// Caché para evitar peticiones repetidas
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos de caché
const FETCH_TIMEOUT = 15000; // 15 segundos timeout
const MAX_RETRIES = 2;

/**
 * Servicio unificado para obtener datos de mercado via Yahoo Finance
 * Soporta acciones (US, EU) y criptomonedas
 * Incluye: reintentos, timeout, y caché
 */
class YahooFinanceService {
  private quoteCache = new Map<string, CacheEntry<MarketData>>();
  private historicalCache = new Map<string, CacheEntry<HistoricalData>>();

  /**
   * Convierte un símbolo al formato de Yahoo Finance
   */
  private formatSymbolForYahoo(symbol: string, type: AssetType): string {
    if (type === 'crypto') {
      if (symbol.includes('-')) return symbol;
      return `${symbol.toUpperCase()}-EUR`;
    }
    return symbol.toUpperCase();
  }

  /**
   * Fetch con timeout y reintentos
   */
  private async fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (retries > 0) {
        console.log(`[YahooFinance] Reintentando... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
        // Esperar un poco antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.fetchWithRetry(url, retries - 1);
      }
      
      throw error;
    }
  }

  /**
   * Obtiene cotización de Yahoo Finance via proxy CORS
   */
  async getQuote(symbol: string, type: AssetType = 'stock'): Promise<MarketData> {
    const yahooSymbol = this.formatSymbolForYahoo(symbol, type);
    const cacheKey = `${yahooSymbol}-quote`;

    // Verificar caché
    const cached = this.quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[YahooFinance] Usando caché para ${yahooSymbol}`);
      return cached.data;
    }

    try {
      console.log(`[YahooFinance] Obteniendo datos para ${yahooSymbol} (${type})`);

      const yahooUrl = `${config.baseUrl}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
      const proxyUrl = `${config.corsProxy}${encodeURIComponent(yahooUrl)}`;

      const response = await this.fetchWithRetry(proxyUrl);
      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) {
        throw new Error(`No se encontraron datos para ${yahooSymbol}`);
      }

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];
      const marketData = createMarketDataFromYahoo(yahooSymbol, meta, quote, type);

      // Guardar en caché
      this.quoteCache.set(cacheKey, { data: marketData, timestamp: Date.now() });

      return marketData;
    } catch (error: any) {
      console.error(`[YahooFinance] Error para ${yahooSymbol}:`, error.message);
      throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
    }
  }

  /**
   * Obtiene datos históricos de 1 año
   */
  async getHistoricalData(symbol: string, type: AssetType = 'stock'): Promise<HistoricalData> {
    const yahooSymbol = this.formatSymbolForYahoo(symbol, type);
    const cacheKey = `${yahooSymbol}-historical`;

    // Verificar caché (histórico dura más, 5 minutos)
    const cached = this.historicalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION * 5) {
      console.log(`[YahooFinance] Usando caché histórico para ${yahooSymbol}`);
      return cached.data;
    }

    try {
      console.log(`[YahooFinance] Obteniendo histórico 1Y para ${yahooSymbol}`);

      const yahooUrl = `${config.baseUrl}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1y`;
      const proxyUrl = `${config.corsProxy}${encodeURIComponent(yahooUrl)}`;

      const response = await this.fetchWithRetry(proxyUrl);
      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) {
        throw new Error(`No se encontraron datos históricos para ${yahooSymbol}`);
      }

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const highs = result.indicators?.quote?.[0]?.high || [];
      const lows = result.indicators?.quote?.[0]?.low || [];

      const validPrices = closes.filter((p: number | null) => p !== null);
      const validHighs = highs.filter((p: number | null) => p !== null);
      const validLows = lows.filter((p: number | null) => p !== null);

      if (validPrices.length === 0) {
        throw new Error('No hay datos de precios válidos');
      }

      const currentPrice = validPrices[validPrices.length - 1];
      const price30dAgo = validPrices[Math.max(0, validPrices.length - 22)] || currentPrice;
      const price90dAgo = validPrices[Math.max(0, validPrices.length - 66)] || currentPrice;
      const price1yAgo = validPrices[0] || currentPrice;

      const last30 = validPrices.slice(-22);
      const last90 = validPrices.slice(-66);

      const avgPrice30d = last30.reduce((a: number, b: number) => a + b, 0) / last30.length;
      const avgPrice90d = last90.reduce((a: number, b: number) => a + b, 0) / last90.length;

      const returns: number[] = [];
      for (let i = 1; i < validPrices.length; i++) {
        returns.push((validPrices[i] - validPrices[i - 1]) / validPrices[i - 1]);
      }
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

      const historicalData: HistoricalData = {
        prices: validPrices.slice(-52),
        dates: timestamps.slice(-52).map((t: number) => new Date(t * 1000).toISOString().split('T')[0]),
        high52Week: Math.max(...validHighs),
        low52Week: Math.min(...validLows),
        avgPrice30d,
        avgPrice90d,
        change30d: ((currentPrice - price30dAgo) / price30dAgo) * 100,
        change90d: ((currentPrice - price90dAgo) / price90dAgo) * 100,
        change1y: ((currentPrice - price1yAgo) / price1yAgo) * 100,
        volatility,
      };

      // Guardar en caché
      this.historicalCache.set(cacheKey, { data: historicalData, timestamp: Date.now() });

      return historicalData;
    } catch (error: any) {
      console.error(`[YahooFinance] Error histórico para ${yahooSymbol}:`, error.message);
      throw new Error(`Error al obtener histórico de ${symbol}: ${error.message}`);
    }
  }

  /**
   * Obtiene cotización de una acción
   */
  async getStockQuote(symbol: string): Promise<MarketData> {
    return this.getQuote(symbol, 'stock');
  }

  /**
   * Obtiene cotización de una criptomoneda
   */
  async getCryptoQuote(symbol: string): Promise<MarketData> {
    return this.getQuote(symbol, 'crypto');
  }

  /**
   * Obtiene datos completos (tiempo real + histórico) para la IA
   */
  async getCompleteDataForAI(symbol: string, type: AssetType = 'stock'): Promise<string> {
    try {
      // Obtener datos en paralelo
      const [marketData, historicalData] = await Promise.all([
        this.getQuote(symbol, type),
        this.getHistoricalData(symbol, type).catch(() => null),
      ]);

      let result = formatMarketDataForAI(marketData);

      if (historicalData) {
        result += this.formatHistoricalForAI(historicalData, marketData.currency || 'USD');
      }

      return result;
    } catch (error: any) {
      console.error(`[YahooFinance] Error completo para AI:`, error.message);
      return `No se pudieron obtener datos para ${symbol}: ${error.message}`;
    }
  }

  /**
   * Formatea datos históricos para la IA
   */
  private formatHistoricalForAI(data: HistoricalData, currency: string): string {
    const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    
    return `
📈 DATOS HISTÓRICOS (1 AÑO):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Máximo 52 semanas: ${currencySymbol}${data.high52Week.toFixed(2)}
📊 Mínimo 52 semanas: ${currencySymbol}${data.low52Week.toFixed(2)}
📊 Precio promedio 30 días: ${currencySymbol}${data.avgPrice30d.toFixed(2)}
📊 Precio promedio 90 días: ${currencySymbol}${data.avgPrice90d.toFixed(2)}
📉 Cambio 30 días: ${data.change30d >= 0 ? '+' : ''}${data.change30d.toFixed(2)}%
📉 Cambio 90 días: ${data.change90d >= 0 ? '+' : ''}${data.change90d.toFixed(2)}%
📉 Cambio 1 año: ${data.change1y >= 0 ? '+' : ''}${data.change1y.toFixed(2)}%
⚡ Volatilidad anual: ${data.volatility.toFixed(1)}%
`;
  }

  /**
   * Obtiene datos formateados para incluir en el prompt de la IA (solo tiempo real)
   */
  async getMarketDataForAI(symbol: string, type: AssetType = 'stock'): Promise<string> {
    // Ahora usa el método completo que incluye histórico
    return this.getCompleteDataForAI(symbol, type);
  }

  /**
   * Obtiene múltiples cotizaciones en paralelo
   */
  async getMultipleQuotes(
    symbols: { symbol: string; type: AssetType }[]
  ): Promise<Map<string, MarketData>> {
    const results = new Map<string, MarketData>();
    
    const promises = symbols.map(async ({ symbol, type }) => {
      try {
        const data = await this.getQuote(symbol, type);
        results.set(symbol, data);
      } catch (error) {
        console.log(`[YahooFinance] No se pudo obtener ${symbol}`);
      }
    });

    await Promise.all(promises);
    return results;
  }
}

// Exportar instancia singleton
export const yahooFinanceService = new YahooFinanceService();
