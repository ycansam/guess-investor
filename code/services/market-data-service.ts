/**
 * Servicio de datos de mercado con cache
 * Proporciona precios de activos populares con cache de 15 minutos
 * Soporta paginación y categorías dinámicas
 */

import { apiClient, AssetQuote } from './api-client';

export interface MarketAsset {
  symbol: string;
  name: string;
  icon: string;
  type: 'stock' | 'crypto' | 'etf' | 'index';
  category: string;
  price?: number;
  change?: number;
  changePercent?: number;
  currency?: string;
  loading?: boolean;
  error?: boolean;
}

// Categorías de activos
export type AssetCategory = 
  | 'tech_us' 
  | 'crypto' 
  | 'spain' 
  | 'etf' 
  | 'europe' 
  | 'finance' 
  | 'healthcare' 
  | 'energy' 
  | 'consumer'
  | 'commodities'
  | 'index';

export const CATEGORY_INFO: Record<AssetCategory, { label: string; icon: string }> = {
  tech_us: { label: 'Tech USA', icon: '💻' },
  crypto: { label: 'Crypto', icon: '₿' },
  spain: { label: 'España', icon: '🇪🇸' },
  etf: { label: 'ETFs', icon: '📊' },
  europe: { label: 'Europa', icon: '🇪🇺' },
  finance: { label: 'Finanzas', icon: '🏦' },
  healthcare: { label: 'Salud', icon: '🏥' },
  energy: { label: 'Energía', icon: '⚡' },
  consumer: { label: 'Consumo', icon: '🛒' },
  commodities: { label: 'Commodities', icon: '🥇' },
  index: { label: 'Índices', icon: '📈' },
};

// Lista completa de activos organizados por categoría
export const ALL_ASSETS: MarketAsset[] = [
  // Tech USA
  { symbol: 'AAPL', name: 'Apple', icon: '🍎', type: 'stock', category: 'tech_us' },
  { symbol: 'MSFT', name: 'Microsoft', icon: '🪟', type: 'stock', category: 'tech_us' },
  { symbol: 'GOOGL', name: 'Google', icon: '🔍', type: 'stock', category: 'tech_us' },
  { symbol: 'AMZN', name: 'Amazon', icon: '📦', type: 'stock', category: 'tech_us' },
  { symbol: 'META', name: 'Meta', icon: '👤', type: 'stock', category: 'tech_us' },
  { symbol: 'NVDA', name: 'NVIDIA', icon: '🎮', type: 'stock', category: 'tech_us' },
  { symbol: 'TSLA', name: 'Tesla', icon: '🚗', type: 'stock', category: 'tech_us' },
  { symbol: 'AMD', name: 'AMD', icon: '🔴', type: 'stock', category: 'tech_us' },
  { symbol: 'INTC', name: 'Intel', icon: '🔵', type: 'stock', category: 'tech_us' },
  { symbol: 'CRM', name: 'Salesforce', icon: '☁️', type: 'stock', category: 'tech_us' },
  { symbol: 'NFLX', name: 'Netflix', icon: '🎬', type: 'stock', category: 'tech_us' },
  { symbol: 'ORCL', name: 'Oracle', icon: '🗄️', type: 'stock', category: 'tech_us' },
  
  // Crypto
  { symbol: 'BTC-USD', name: 'Bitcoin', icon: '₿', type: 'crypto', category: 'crypto' },
  { symbol: 'ETH-USD', name: 'Ethereum', icon: 'Ξ', type: 'crypto', category: 'crypto' },
  { symbol: 'SOL-USD', name: 'Solana', icon: '◎', type: 'crypto', category: 'crypto' },
  { symbol: 'XRP-USD', name: 'XRP', icon: '💧', type: 'crypto', category: 'crypto' },
  { symbol: 'DOGE-USD', name: 'Dogecoin', icon: '🐕', type: 'crypto', category: 'crypto' },
  { symbol: 'ADA-USD', name: 'Cardano', icon: '🔷', type: 'crypto', category: 'crypto' },
  { symbol: 'AVAX-USD', name: 'Avalanche', icon: '🔺', type: 'crypto', category: 'crypto' },
  { symbol: 'DOT-USD', name: 'Polkadot', icon: '⚫', type: 'crypto', category: 'crypto' },
  { symbol: 'MATIC-USD', name: 'Polygon', icon: '🟣', type: 'crypto', category: 'crypto' },
  { symbol: 'LINK-USD', name: 'Chainlink', icon: '🔗', type: 'crypto', category: 'crypto' },
  
  // España (IBEX 35)
  { symbol: 'ITX.MC', name: 'Inditex', icon: '👔', type: 'stock', category: 'spain' },
  { symbol: 'SAN.MC', name: 'Santander', icon: '🏦', type: 'stock', category: 'spain' },
  { symbol: 'BBVA.MC', name: 'BBVA', icon: '🏛️', type: 'stock', category: 'spain' },
  { symbol: 'IBE.MC', name: 'Iberdrola', icon: '⚡', type: 'stock', category: 'spain' },
  { symbol: 'TEF.MC', name: 'Telefónica', icon: '📱', type: 'stock', category: 'spain' },
  { symbol: 'REP.MC', name: 'Repsol', icon: '⛽', type: 'stock', category: 'spain' },
  { symbol: 'CABK.MC', name: 'CaixaBank', icon: '🏧', type: 'stock', category: 'spain' },
  { symbol: 'FER.MC', name: 'Ferrovial', icon: '🚧', type: 'stock', category: 'spain' },
  { symbol: 'AMS.MC', name: 'Amadeus', icon: '✈️', type: 'stock', category: 'spain' },
  { symbol: 'IAG.MC', name: 'IAG', icon: '🛫', type: 'stock', category: 'spain' },
  
  // ETFs populares
  { symbol: 'SPY', name: 'S&P 500 ETF', icon: '📈', type: 'etf', category: 'etf' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', icon: '💻', type: 'etf', category: 'etf' },
  { symbol: 'IWM', name: 'Russell 2000 ETF', icon: '📊', type: 'etf', category: 'etf' },
  { symbol: 'DIA', name: 'Dow Jones ETF', icon: '🏭', type: 'etf', category: 'etf' },
  { symbol: 'VTI', name: 'Total Stock ETF', icon: '🌐', type: 'etf', category: 'etf' },
  { symbol: 'VOO', name: 'Vanguard S&P 500', icon: '🚀', type: 'etf', category: 'etf' },
  { symbol: 'ARKK', name: 'ARK Innovation', icon: '🔮', type: 'etf', category: 'etf' },
  { symbol: 'GLD', name: 'Gold ETF', icon: '🥇', type: 'etf', category: 'etf' },
  { symbol: 'SLV', name: 'Silver ETF', icon: '🥈', type: 'etf', category: 'etf' },
  { symbol: 'USO', name: 'Oil ETF', icon: '🛢️', type: 'etf', category: 'etf' },
  
  // Europa
  { symbol: 'SAP.DE', name: 'SAP', icon: '💼', type: 'stock', category: 'europe' },
  { symbol: 'ASML.AS', name: 'ASML', icon: '🔬', type: 'stock', category: 'europe' },
  { symbol: 'MC.PA', name: 'LVMH', icon: '👜', type: 'stock', category: 'europe' },
  { symbol: 'OR.PA', name: "L'Oréal", icon: '💄', type: 'stock', category: 'europe' },
  { symbol: 'SIE.DE', name: 'Siemens', icon: '⚙️', type: 'stock', category: 'europe' },
  { symbol: 'ALV.DE', name: 'Allianz', icon: '🛡️', type: 'stock', category: 'europe' },
  { symbol: 'BAS.DE', name: 'BASF', icon: '🧪', type: 'stock', category: 'europe' },
  { symbol: 'NESN.SW', name: 'Nestlé', icon: '🍫', type: 'stock', category: 'europe' },
  { symbol: 'NOVN.SW', name: 'Novartis', icon: '💊', type: 'stock', category: 'europe' },
  { symbol: 'ROG.SW', name: 'Roche', icon: '🧬', type: 'stock', category: 'europe' },
  
  // Finanzas USA
  { symbol: 'JPM', name: 'JPMorgan', icon: '🏦', type: 'stock', category: 'finance' },
  { symbol: 'BAC', name: 'Bank of America', icon: '🏧', type: 'stock', category: 'finance' },
  { symbol: 'WFC', name: 'Wells Fargo', icon: '🐴', type: 'stock', category: 'finance' },
  { symbol: 'GS', name: 'Goldman Sachs', icon: '📊', type: 'stock', category: 'finance' },
  { symbol: 'MS', name: 'Morgan Stanley', icon: '💎', type: 'stock', category: 'finance' },
  { symbol: 'V', name: 'Visa', icon: '💳', type: 'stock', category: 'finance' },
  { symbol: 'MA', name: 'Mastercard', icon: '💳', type: 'stock', category: 'finance' },
  { symbol: 'PYPL', name: 'PayPal', icon: '🅿️', type: 'stock', category: 'finance' },
  { symbol: 'BLK', name: 'BlackRock', icon: '⬛', type: 'stock', category: 'finance' },
  { symbol: 'C', name: 'Citigroup', icon: '🏛️', type: 'stock', category: 'finance' },
  
  // Healthcare
  { symbol: 'JNJ', name: 'Johnson & Johnson', icon: '🏥', type: 'stock', category: 'healthcare' },
  { symbol: 'UNH', name: 'UnitedHealth', icon: '❤️', type: 'stock', category: 'healthcare' },
  { symbol: 'PFE', name: 'Pfizer', icon: '💉', type: 'stock', category: 'healthcare' },
  { symbol: 'ABBV', name: 'AbbVie', icon: '💊', type: 'stock', category: 'healthcare' },
  { symbol: 'MRK', name: 'Merck', icon: '🧬', type: 'stock', category: 'healthcare' },
  { symbol: 'LLY', name: 'Eli Lilly', icon: '🌿', type: 'stock', category: 'healthcare' },
  { symbol: 'TMO', name: 'Thermo Fisher', icon: '🔬', type: 'stock', category: 'healthcare' },
  { symbol: 'ABT', name: 'Abbott', icon: '🩺', type: 'stock', category: 'healthcare' },
  { symbol: 'AMGN', name: 'Amgen', icon: '🧪', type: 'stock', category: 'healthcare' },
  { symbol: 'GILD', name: 'Gilead', icon: '🌱', type: 'stock', category: 'healthcare' },
  
  // Energía
  { symbol: 'XOM', name: 'ExxonMobil', icon: '🛢️', type: 'stock', category: 'energy' },
  { symbol: 'CVX', name: 'Chevron', icon: '⛽', type: 'stock', category: 'energy' },
  { symbol: 'COP', name: 'ConocoPhillips', icon: '🔥', type: 'stock', category: 'energy' },
  { symbol: 'SLB', name: 'Schlumberger', icon: '🔧', type: 'stock', category: 'energy' },
  { symbol: 'EOG', name: 'EOG Resources', icon: '💨', type: 'stock', category: 'energy' },
  { symbol: 'NEE', name: 'NextEra Energy', icon: '🌞', type: 'stock', category: 'energy' },
  { symbol: 'DUK', name: 'Duke Energy', icon: '⚡', type: 'stock', category: 'energy' },
  { symbol: 'SO', name: 'Southern Co', icon: '🔌', type: 'stock', category: 'energy' },
  { symbol: 'ENPH', name: 'Enphase', icon: '☀️', type: 'stock', category: 'energy' },
  { symbol: 'FSLR', name: 'First Solar', icon: '🌅', type: 'stock', category: 'energy' },
  
  // Consumo
  { symbol: 'WMT', name: 'Walmart', icon: '🛒', type: 'stock', category: 'consumer' },
  { symbol: 'COST', name: 'Costco', icon: '📦', type: 'stock', category: 'consumer' },
  { symbol: 'PG', name: 'Procter & Gamble', icon: '🧴', type: 'stock', category: 'consumer' },
  { symbol: 'KO', name: 'Coca-Cola', icon: '🥤', type: 'stock', category: 'consumer' },
  { symbol: 'PEP', name: 'PepsiCo', icon: '🥤', type: 'stock', category: 'consumer' },
  { symbol: 'MCD', name: "McDonald's", icon: '🍔', type: 'stock', category: 'consumer' },
  { symbol: 'SBUX', name: 'Starbucks', icon: '☕', type: 'stock', category: 'consumer' },
  { symbol: 'NKE', name: 'Nike', icon: '👟', type: 'stock', category: 'consumer' },
  { symbol: 'DIS', name: 'Disney', icon: '🏰', type: 'stock', category: 'consumer' },
  { symbol: 'HD', name: 'Home Depot', icon: '🏠', type: 'stock', category: 'consumer' },
  
  // Commodities (Oro, Plata, Minería)
  { symbol: 'GC=F', name: 'Oro Físico (Futuros)', icon: '🥇', type: 'index', category: 'commodities' },
  { symbol: 'SI=F', name: 'Plata Física (Futuros)', icon: '🥈', type: 'index', category: 'commodities' },
  { symbol: 'NEM', name: 'Newmont Mining', icon: '⛏️', type: 'stock', category: 'commodities' },
  { symbol: 'GOLD', name: 'Barrick Gold', icon: '🪙', type: 'stock', category: 'commodities' },
  { symbol: 'FNV', name: 'Franco-Nevada', icon: '💰', type: 'stock', category: 'commodities' },
  { symbol: 'WPM', name: 'Wheaton Precious', icon: '💎', type: 'stock', category: 'commodities' },
  { symbol: 'GDX', name: 'Gold Miners ETF', icon: '⛏️', type: 'etf', category: 'commodities' },
  { symbol: 'GDXJ', name: 'Junior Gold Miners', icon: '🔨', type: 'etf', category: 'commodities' },
  { symbol: 'CL=F', name: 'Petróleo Crudo (Futuros)', icon: '🛢️', type: 'index', category: 'commodities' },
  { symbol: 'NG=F', name: 'Gas Natural (Futuros)', icon: '🔥', type: 'index', category: 'commodities' },
  
  // Índices
  { symbol: '^GSPC', name: 'S&P 500', icon: '📈', type: 'index', category: 'index' },
  { symbol: '^DJI', name: 'Dow Jones', icon: '🏭', type: 'index', category: 'index' },
  { symbol: '^IXIC', name: 'Nasdaq', icon: '💻', type: 'index', category: 'index' },
  { symbol: '^IBEX', name: 'IBEX 35', icon: '🇪🇸', type: 'index', category: 'index' },
  { symbol: '^GDAXI', name: 'DAX', icon: '🇩🇪', type: 'index', category: 'index' },
  { symbol: '^FTSE', name: 'FTSE 100', icon: '🇬🇧', type: 'index', category: 'index' },
  { symbol: '^FCHI', name: 'CAC 40', icon: '🇫🇷', type: 'index', category: 'index' },
  { symbol: '^N225', name: 'Nikkei 225', icon: '🇯🇵', type: 'index', category: 'index' },
  { symbol: '^HSI', name: 'Hang Seng', icon: '🇭🇰', type: 'index', category: 'index' },
  { symbol: '^VIX', name: 'VIX', icon: '😰', type: 'index', category: 'index' },
];

// Lista legacy para compatibilidad
export const POPULAR_ASSETS: MarketAsset[] = ALL_ASSETS.slice(0, 18);

// Cache con duración de 15 minutos
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos
const marketCache = new Map<string, { data: AssetQuote; timestamp: number }>();

// Tamaño de batch para paginación
const BATCH_SIZE = 10;

class MarketDataService {
  private lastBatchFetch: number = 0;
  private batchPromise: Promise<Map<string, MarketAsset>> | null = null;

  /**
   * Obtiene datos LITE de un símbolo (solo precio y cambio) con cache de 15 minutos
   * Optimizado para listas de mercado
   */
  async getQuoteLite(symbol: string): Promise<AssetQuote | null> {
    const cached = marketCache.get(symbol);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const data = await apiClient.getQuote(symbol);
      if (data) {
        marketCache.set(symbol, { data, timestamp: now });
      }
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Obtiene datos completos de un símbolo con cache de 15 minutos
   */
  async getQuote(symbol: string): Promise<AssetQuote | null> {
    const cached = marketCache.get(symbol);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log(`[MarketData] Cache hit for ${symbol}`);
      return cached.data;
    }

    console.log(`[MarketData] Fetching ${symbol}...`);
    try {
      const data = await apiClient.getQuote(symbol);
      if (data) {
        marketCache.set(symbol, { data, timestamp: now });
      }
      return data;
    } catch {
      return null;
    }
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

    console.log(`[MarketData] ⚡ Fetching ${symbols.length} symbols in parallel...`);
    const startTime = Date.now();

    try {
      // TODAS las peticiones en paralelo - máxima velocidad
      const promises = symbols.map(async (symbol) => {
        try {
          const data = await this.getQuoteLite(symbol);
          if (data) {
            const asset = POPULAR_ASSETS.find(a => a.symbol === symbol)!;
            return {
              symbol,
              asset: {
                ...asset,
                price: data.price,
                change: data.change,
                changePercent: data.changePercent,
                currency: data.currency,
              } as MarketAsset
            };
          }
        } catch (error) {
          // Silenciar errores individuales
        }
        return null;
      });
      
      const results = await Promise.all(promises);
      
      for (const r of results) {
        if (r) {
          result.set(r.symbol, r.asset);
        }
      }
      
      const elapsed = Date.now() - startTime;
      console.log(`[MarketData] ✅ Fetched ${result.size}/${symbols.length} symbols in ${elapsed}ms`);
    } catch (error) {
      console.error('[MarketData] Fetch error:', error);
    }

    return result;
  }

  private getAssetsFromCache(): MarketAsset[] {
    return POPULAR_ASSETS.map(asset => {
      const cached = marketCache.get(asset.symbol);
      if (cached) {
        return {
          ...asset,
          price: cached.data.price,
          change: cached.data.change,
          changePercent: cached.data.changePercent,
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
          price: cached.data.price,
          change: cached.data.change,
          changePercent: cached.data.changePercent,
          currency: cached.data.currency,
        };
      }
      return { ...asset, error: true };
    });
  }

  /**
   * Obtiene datos cacheados sincrónicamente (sin fetch)
   * Retorna null si no hay cache válido
   */
  getCachedAssets(): MarketAsset[] | null {
    const now = Date.now();
    const allCached = POPULAR_ASSETS.every(asset => {
      const cached = marketCache.get(asset.symbol);
      return cached && (now - cached.timestamp) < CACHE_DURATION;
    });

    if (!allCached) {
      return null;
    }

    return this.getAssetsFromCache();
  }

  /**
   * Obtiene activos paginados con datos de precios
   * @param page - Número de página (1-indexed)
   * @param category - Categoría opcional para filtrar
   * @param searchQuery - Búsqueda opcional por nombre/símbolo
   * @returns Activos con precios y flag hasMore
   */
  async getAssetsPaginated(
    page: number = 1,
    category?: AssetCategory,
    searchQuery?: string
  ): Promise<{ assets: MarketAsset[]; hasMore: boolean; total: number }> {
    // Filtrar activos
    let filteredAssets = [...ALL_ASSETS];
    
    if (category) {
      filteredAssets = filteredAssets.filter(a => a.category === category);
    }
    
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredAssets = filteredAssets.filter(a => 
        a.symbol.toLowerCase().includes(query) || 
        a.name.toLowerCase().includes(query)
      );
    }
    
    const total = filteredAssets.length;
    const startIndex = (page - 1) * BATCH_SIZE;
    const endIndex = startIndex + BATCH_SIZE;
    const pageAssets = filteredAssets.slice(startIndex, endIndex);
    const hasMore = endIndex < total;
    
    // Obtener precios para esta página
    const assetsWithPrices = await this.fetchAssetsWithPrices(pageAssets);
    
    return { assets: assetsWithPrices, hasMore, total };
  }

  /**
   * Obtiene activos de categorías específicas (para secciones)
   */
  async getAssetsByCategory(category: AssetCategory): Promise<MarketAsset[]> {
    const categoryAssets = ALL_ASSETS.filter(a => a.category === category);
    return this.fetchAssetsWithPrices(categoryAssets);
  }

  /**
   * Obtiene lista de categorías disponibles con conteo
   */
  getCategories(): { category: AssetCategory; label: string; icon: string; count: number }[] {
    const categories = Object.keys(CATEGORY_INFO) as AssetCategory[];
    return categories.map(cat => ({
      category: cat,
      ...CATEGORY_INFO[cat],
      count: ALL_ASSETS.filter(a => a.category === cat).length,
    }));
  }

  /**
   * Busca activos por nombre o símbolo
   */
  searchAssets(query: string): MarketAsset[] {
    if (!query || query.trim().length < 1) {
      return [];
    }
    
    const q = query.toLowerCase().trim();
    return ALL_ASSETS.filter(a => 
      a.symbol.toLowerCase().includes(q) || 
      a.name.toLowerCase().includes(q)
    ).slice(0, 20); // Máximo 20 resultados de búsqueda
  }

  /**
   * Obtiene precios para una lista de activos
   */
  private async fetchAssetsWithPrices(assets: MarketAsset[]): Promise<MarketAsset[]> {
    const now = Date.now();
    
    const promises = assets.map(async (asset) => {
      // Verificar cache primero
      const cached = marketCache.get(asset.symbol);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        return {
          ...asset,
          price: cached.data.price,
          change: cached.data.change,
          changePercent: cached.data.changePercent,
          currency: cached.data.currency,
        };
      }
      
      // Fetch nuevo
      try {
        const data = await this.getQuoteLite(asset.symbol);
        if (data) {
          return {
            ...asset,
            price: data.price,
            change: data.change,
            changePercent: data.changePercent,
            currency: data.currency,
          };
        }
      } catch (error) {
        // Silenciar error individual
      }
      
      return { ...asset, error: true };
    });
    
    return Promise.all(promises);
  }

  /**
   * Obtiene un activo por símbolo
   */
  getAssetBySymbol(symbol: string): MarketAsset | undefined {
    return ALL_ASSETS.find(a => a.symbol.toLowerCase() === symbol.toLowerCase());
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
