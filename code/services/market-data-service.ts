/**
 * Servicio de datos de mercado con cache
 * Proporciona precios de activos populares con cache de 15 minutos
 */

import { YahooV8Data, yahooV8Service } from './yahoo-v8-service';

export interface MarketAsset {
  symbol: string;
  name: string;
  icon: string;
  type: 'stock' | 'crypto' | 'etf';
  price?: number;
  change?: number;
  changePercent?: number;
  currency?: string;
  loading?: boolean;
  error?: boolean;
}

// Lista de activos populares para mostrar en el home
export const POPULAR_ASSETS: MarketAsset[] = [
  // Tech Giants
  { symbol: 'AAPL', name: 'Apple', icon: '🍎', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', icon: '🪟', type: 'stock' },
  { symbol: 'GOOGL', name: 'Google', icon: '🔍', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', icon: '📦', type: 'stock' },
  { symbol: 'META', name: 'Meta', icon: '👤', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', icon: '🎮', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', icon: '🚗', type: 'stock' },
  
  // Crypto
  { symbol: 'BTC-USD', name: 'Bitcoin', icon: '₿', type: 'crypto' },
  { symbol: 'ETH-USD', name: 'Ethereum', icon: 'Ξ', type: 'crypto' },
  { symbol: 'SOL-USD', name: 'Solana', icon: '◎', type: 'crypto' },
  
  // España
  { symbol: 'ITX.MC', name: 'Inditex', icon: '👔', type: 'stock' },
  { symbol: 'SAN.MC', name: 'Santander', icon: '🏦', type: 'stock' },
  { symbol: 'BBVA.MC', name: 'BBVA', icon: '🏛️', type: 'stock' },
  { symbol: 'IBE.MC', name: 'Iberdrola', icon: '⚡', type: 'stock' },
  
  // ETFs populares
  { symbol: 'SPY', name: 'S&P 500 ETF', icon: '📈', type: 'etf' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', icon: '💻', type: 'etf' },
];

// Cache con duración de 15 minutos
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos
const marketCache = new Map<string, { data: YahooV8Data; timestamp: number }>();

class MarketDataService {
  private lastBatchFetch: number = 0;
  private batchPromise: Promise<Map<string, MarketAsset>> | null = null;

  /**
   * Obtiene datos de un símbolo con cache de 15 minutos
   */
  async getQuote(symbol: string): Promise<YahooV8Data | null> {
    const cached = marketCache.get(symbol);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log(`[MarketData] Cache hit for ${symbol}`);
      return cached.data;
    }

    console.log(`[MarketData] Fetching ${symbol}...`);
    const data = await yahooV8Service.getQuote(symbol);
    
    if (data) {
      marketCache.set(symbol, { data, timestamp: now });
    }

    return data;
  }

  /**
   * Obtiene todos los activos populares con sus precios
   * Usa cache de 15 minutos y batch fetching
   */
  async getPopularAssets(): Promise<MarketAsset[]> {
    const now = Date.now();

    // Si hay una petición en curso, esperarla
    if (this.batchPromise && (now - this.lastBatchFetch) < CACHE_DURATION) {
      const cachedResult = await this.batchPromise;
      return this.mergeWithAssets(cachedResult);
    }

    // Verificar si todos están en cache
    const allCached = POPULAR_ASSETS.every(asset => {
      const cached = marketCache.get(asset.symbol);
      return cached && (now - cached.timestamp) < CACHE_DURATION;
    });

    if (allCached) {
      console.log('[MarketData] All assets in cache');
      return this.getAssetsFromCache();
    }

    // Hacer batch fetch
    this.lastBatchFetch = now;
    this.batchPromise = this.fetchAllAssets();
    
    return this.batchPromise.then(result => this.mergeWithAssets(result));
  }

  private async fetchAllAssets(): Promise<Map<string, MarketAsset>> {
    const result = new Map<string, MarketAsset>();
    const symbols = POPULAR_ASSETS.map(a => a.symbol);

    console.log(`[MarketData] Batch fetching ${symbols.length} symbols...`);

    // Fetch en paralelo con límite de concurrencia
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(async (symbol) => {
        try {
          const data = await this.getQuote(symbol);
          if (data) {
            const asset = POPULAR_ASSETS.find(a => a.symbol === symbol)!;
            result.set(symbol, {
              ...asset,
              price: data.regularMarketPrice,
              change: data.priceChange,
              changePercent: data.priceChangePercent,
              currency: data.currency,
            });
          }
        } catch (error) {
          console.error(`[MarketData] Error fetching ${symbol}:`, error);
        }
      });
      await Promise.all(promises);
    }

    console.log(`[MarketData] Fetched ${result.size}/${symbols.length} symbols`);
    return result;
  }

  private getAssetsFromCache(): MarketAsset[] {
    return POPULAR_ASSETS.map(asset => {
      const cached = marketCache.get(asset.symbol);
      if (cached) {
        return {
          ...asset,
          price: cached.data.regularMarketPrice,
          change: cached.data.priceChange,
          changePercent: cached.data.priceChangePercent,
          currency: cached.data.currency,
        };
      }
      return asset;
    });
  }

  private mergeWithAssets(dataMap: Map<string, MarketAsset>): MarketAsset[] {
    return POPULAR_ASSETS.map(asset => {
      const data = dataMap.get(asset.symbol);
      if (data) {
        return data;
      }
      // Intentar del cache si no está en el resultado
      const cached = marketCache.get(asset.symbol);
      if (cached) {
        return {
          ...asset,
          price: cached.data.regularMarketPrice,
          change: cached.data.priceChange,
          changePercent: cached.data.priceChangePercent,
          currency: cached.data.currency,
        };
      }
      return { ...asset, error: true };
    });
  }

  /**
   * Limpia el cache (útil para forzar refresh)
   */
  clearCache(): void {
    marketCache.clear();
    this.batchPromise = null;
    this.lastBatchFetch = 0;
  }
}

export const marketDataService = new MarketDataService();
