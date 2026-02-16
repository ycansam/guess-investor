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
  { symbol: 'BTC-EUR', name: 'Bitcoin EUR', icon: '₿', type: 'crypto', category: 'crypto' },
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
  { symbol: 'EGLN.L', name: 'iShares Physical Gold USD', icon: '🥇', type: 'etf', category: 'commodities' },
  { symbol: 'PPFB.DE', name: 'iShares Physical Gold', icon: '🪙', type: 'etf', category: 'commodities' },
  { symbol: 'PHAG.MI', name: 'WisdomTree Physical Silver', icon: '🥈', type: 'etf', category: 'commodities' },
  { symbol: '4GLD.DE', name: 'Xetra-Gold', icon: '🏆', type: 'etf', category: 'commodities' },
  { symbol: 'GC=F', name: 'Oro Físico (Futuros)', icon: '📊', type: 'index', category: 'commodities' },
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
  { symbol: '^IBEX35', name: 'IBEX 35', icon: '🇪🇸', type: 'index', category: 'index' },
  { symbol: '^GDAXI', name: 'DAX', icon: '🇩🇪', type: 'index', category: 'index' },
  { symbol: '^FTSE', name: 'FTSE 100', icon: '🇬🇧', type: 'index', category: 'index' },
  { symbol: '^FCHI', name: 'CAC 40', icon: '🇫🇷', type: 'index', category: 'index' },
  { symbol: '^N225', name: 'Nikkei 225', icon: '🇯🇵', type: 'index', category: 'index' },
  { symbol: '^HSI', name: 'Hang Seng', icon: '🇭🇰', type: 'index', category: 'index' },
  { symbol: '^VIX', name: 'VIX', icon: '😰', type: 'index', category: 'index' },
];

// Lista legacy para compatibilidad - se cargará dinámicamente desde el backend
export let POPULAR_ASSETS: MarketAsset[] = ALL_ASSETS.slice(0, 18);

// Cache con duración de 15 minutos
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos
const marketCache = new Map<string, { data: AssetQuote; timestamp: number }>();

// Cache de activos dinámicos del backend
let dynamicAssets: MarketAsset[] | null = null;
let dynamicAssetsTimestamp = 0;
const ASSETS_CACHE_DURATION = 60 * 60 * 1000; // 1 hora para lista de activos

// Tamaño de batch para paginación (42 = 3 columnas x 14 filas en desktop)
const BATCH_SIZE = 42;

// Control de rate limiting para peticiones paralelas
const MAX_CONCURRENT_REQUESTS = 15;

class MarketDataService {
  private lastBatchFetch: number = 0;
  private batchPromise: Promise<Map<string, MarketAsset>> | null = null;
  private loadingAssets: Promise<MarketAsset[]> | null = null;

  /**
   * Carga los activos desde el backend (dinámico)
   * Combina con la lista estática local como fallback
   */
  async loadDynamicAssets(): Promise<MarketAsset[]> {
    const now = Date.now();
    
    // Si ya tenemos activos cacheados válidos, devolverlos
    if (dynamicAssets && (now - dynamicAssetsTimestamp) < ASSETS_CACHE_DURATION) {
      return dynamicAssets;
    }

    // Si ya hay una petición en curso, esperarla
    if (this.loadingAssets) {
      return this.loadingAssets;
    }

    this.loadingAssets = (async () => {
      try {
        console.log('[MarketData] Loading assets from backend...');
        const backendAssets = await apiClient.getAllAssets();
        
        // Convertir a formato MarketAsset
        const converted: MarketAsset[] = backendAssets.map(a => ({
          symbol: a.symbol,
          name: a.name,
          icon: a.icon,
          type: a.type as 'stock' | 'crypto' | 'etf' | 'index',
          category: a.category,
        }));

        // Combinar: primero los populares locales, luego los del backend que no estén
        // Esto asegura que Apple, Microsoft, etc. aparezcan primero
        const localSymbolSet = new Set(ALL_ASSETS.map(a => a.symbol.toUpperCase()));
        const backendOnlyAssets = converted.filter(a => !localSymbolSet.has(a.symbol.toUpperCase()));
        
        // Lista local primero (populares), luego los extras del backend
        dynamicAssets = [...ALL_ASSETS, ...backendOnlyAssets];
        dynamicAssetsTimestamp = now;
        
        console.log(`[MarketData] Loaded ${ALL_ASSETS.length} local (popular) + ${backendOnlyAssets.length} backend-only = ${dynamicAssets.length} total`);
        
        return dynamicAssets;
      } catch (error) {
        console.warn('[MarketData] Failed to load from backend, using local list:', error);
        // Fallback a lista local
        dynamicAssets = ALL_ASSETS;
        dynamicAssetsTimestamp = now;
        return dynamicAssets;
      } finally {
        this.loadingAssets = null;
      }
    })();

    return this.loadingAssets;
  }

  /**
   * Obtiene la lista de activos (carga dinámica si es necesario)
   */
  async getAssets(): Promise<MarketAsset[]> {
    if (dynamicAssets) {
      return dynamicAssets;
    }
    return this.loadDynamicAssets();
  }

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
    const now = Date.now();

    // Separar símbolos que necesitan fetch de los que están en cache
    const uncachedSymbols: string[] = [];
    for (const symbol of symbols) {
      const cached = marketCache.get(symbol);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        const asset = POPULAR_ASSETS.find(a => a.symbol === symbol)!;
        result.set(symbol, {
          ...asset,
          price: cached.data.price,
          change: cached.data.change,
          changePercent: cached.data.changePercent,
          currency: cached.data.currency,
        });
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    if (uncachedSymbols.length === 0) {
      console.log(`[MarketData] ✅ All ${symbols.length} symbols from cache`);
      return result;
    }

    console.log(`[MarketData] ⚡ Batch fetching ${uncachedSymbols.length} symbols (${result.size} from cache)...`);
    const startTime = Date.now();

    try {
      // Una sola llamada batch al backend
      const quotes = await apiClient.getQuotesBatch(uncachedSymbols);
      
      for (const symbol of uncachedSymbols) {
        const data = quotes[symbol];
        if (data) {
          marketCache.set(symbol, { data, timestamp: now });
          const asset = POPULAR_ASSETS.find(a => a.symbol === symbol)!;
          result.set(symbol, {
            ...asset,
            price: data.price,
            change: data.change,
            changePercent: data.changePercent,
            currency: data.currency,
          });
        }
      }
      
      const elapsed = Date.now() - startTime;
      console.log(`[MarketData] ✅ Batch fetched ${result.size}/${symbols.length} symbols in ${elapsed}ms`);
    } catch (error) {
      console.error('[MarketData] Batch fetch error, falling back to parallel:', error);
      // Fallback a llamadas paralelas si el batch falla
      const promises = uncachedSymbols.map(async (symbol) => {
        try {
          const data = await this.getQuoteLite(symbol);
          if (data) {
            const asset = POPULAR_ASSETS.find(a => a.symbol === symbol)!;
            return { symbol, asset: { ...asset, price: data.price, change: data.change, changePercent: data.changePercent, currency: data.currency } as MarketAsset };
          }
        } catch { /* ignore */ }
        return null;
      });
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r) result.set(r.symbol, r.asset);
      }
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
   * Usa el endpoint paginado del backend para soporte de infinite scroll
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
    try {
      // Usar el nuevo endpoint paginado del backend
      const response = await apiClient.getAssetsPaginated(
        page,
        BATCH_SIZE,
        category,
        searchQuery
      );

      // Convertir respuesta a formato MarketAsset
      const pageAssets: MarketAsset[] = response.assets.map(a => ({
        symbol: a.symbol,
        name: a.name,
        icon: a.icon,
        type: this.mapAssetType(a.type),
        category: a.category as AssetCategory,
      }));

      // Obtener precios para esta página
      const assetsWithPrices = await this.fetchAssetsWithPrices(pageAssets);

      console.log(`[MarketData] Page ${page}: ${assetsWithPrices.length} assets, hasMore: ${response.pagination.hasMore}, total: ${response.pagination.total}`);

      return {
        assets: assetsWithPrices,
        hasMore: response.pagination.hasMore,
        total: response.pagination.total,
      };
    } catch (error) {
      console.warn('[MarketData] Backend pagination failed, falling back to local:', error);
      
      // Fallback: usar lista local si el backend falla
      const allAssets = await this.getAssets();
      let filteredAssets = [...allAssets];
      
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
      
      const assetsWithPrices = await this.fetchAssetsWithPrices(pageAssets);
      
      return { assets: assetsWithPrices, hasMore, total };
    }
  }

  /**
   * Obtiene icono según tipo de activo
   */
  private getIconForType(type: string): string {
    const typeUpper = type.toUpperCase();
    if (typeUpper === 'CRYPTOCURRENCY') return '₿';
    if (typeUpper === 'ETF') return '📊';
    if (typeUpper === 'INDEX') return '📈';
    if (typeUpper === 'FUTURE' || typeUpper === 'FUTURES') return '📅';
    if (typeUpper === 'CURRENCY' || typeUpper === 'FOREX') return '💱';
    return '📈'; // Default stock
  }

  /**
   * Mapea tipo de Yahoo a tipo interno
   */
  private mapAssetType(type: string): 'stock' | 'crypto' | 'etf' | 'index' {
    const typeUpper = type.toUpperCase();
    if (typeUpper === 'CRYPTOCURRENCY') return 'crypto';
    if (typeUpper === 'ETF' || typeUpper === 'ETC') return 'etf';
    if (typeUpper === 'INDEX' || typeUpper === 'FUTURE' || typeUpper === 'FUTURES') return 'index';
    return 'stock';
  }

  /**
   * Detecta categoría basándose en símbolo y tipo
   */
  private detectCategory(symbol: string, type: string): string {
    const symbolUpper = symbol.toUpperCase();
    const typeUpper = type.toUpperCase();
    
    // Crypto
    if (typeUpper === 'CRYPTOCURRENCY' || symbolUpper.includes('-USD') || symbolUpper.includes('-EUR')) {
      return 'crypto';
    }
    
    // Índices
    if (typeUpper === 'INDEX' || symbolUpper.startsWith('^')) {
      return 'index';
    }
    
    // ETF
    if (typeUpper === 'ETF' || typeUpper === 'ETC') {
      return 'etf';
    }
    
    // Commodities (futuros y ETFs de materias primas)
    if (symbolUpper.includes('GOLD') || symbolUpper.includes('GLD') || symbolUpper.includes('GC=') ||
        symbolUpper.includes('SILVER') || symbolUpper.includes('SLV') || symbolUpper.includes('SI=') ||
        symbolUpper.includes('OIL') || symbolUpper.includes('USO') || symbolUpper.includes('CL=') ||
        symbolUpper.includes('NG=') || symbolUpper.endsWith('=F')) {
      return 'commodities';
    }
    
    // España (mercado continuo español)
    if (symbolUpper.endsWith('.MC')) {
      return 'spain';
    }
    
    // Europa (otros mercados europeos)
    if (symbolUpper.endsWith('.DE') || symbolUpper.endsWith('.PA') ||
        symbolUpper.endsWith('.MI') || symbolUpper.endsWith('.AS') || symbolUpper.endsWith('.L') ||
        symbolUpper.endsWith('.SW') || symbolUpper.endsWith('.BR')) {
      return 'europe';
    }
    
    // Default a tech_us para acciones USA
    return 'tech_us';
  }

  /**
   * Obtiene activos de categorías específicas (para secciones)
   */
  async getAssetsByCategory(category: AssetCategory): Promise<MarketAsset[]> {
    const allAssets = await this.getAssets();
    const categoryAssets = allAssets.filter(a => a.category === category);
    return this.fetchAssetsWithPrices(categoryAssets);
  }

  /**
   * Obtiene lista de categorías disponibles con conteo
   */
  async getCategories(): Promise<{ category: AssetCategory; label: string; icon: string; count: number }[]> {
    const allAssets = await this.getAssets();
    const categories = Object.keys(CATEGORY_INFO) as AssetCategory[];
    return categories.map(cat => ({
      category: cat,
      ...CATEGORY_INFO[cat],
      count: allAssets.filter(a => a.category === cat).length,
    }));
  }

  /**
   * Busca activos por nombre o símbolo
   */
  async searchAssets(query: string): Promise<MarketAsset[]> {
    if (!query || query.trim().length < 1) {
      return [];
    }
    
    const allAssets = await this.getAssets();
    const q = query.toLowerCase().trim();
    return allAssets.filter(a => 
      a.symbol.toLowerCase().includes(q) || 
      a.name.toLowerCase().includes(q)
    ).slice(0, 20); // Máximo 20 resultados de búsqueda
  }

  /**
   * Obtiene precios para una lista de activos
   * Con control de rate limiting para evitar bloqueos de API
   */
  private async fetchAssetsWithPrices(assets: MarketAsset[]): Promise<MarketAsset[]> {
    const now = Date.now();
    const results: MarketAsset[] = [];
    
    // Separar los que están en cache de los que necesitan fetch
    const needsFetch: MarketAsset[] = [];
    
    for (const asset of assets) {
      const cached = marketCache.get(asset.symbol);
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        results.push({
          ...asset,
          price: cached.data.price,
          change: cached.data.change,
          changePercent: cached.data.changePercent,
          currency: cached.data.currency,
        });
      } else {
        needsFetch.push(asset);
      }
    }
    
    // Fetch con control de concurrencia
    if (needsFetch.length > 0) {
      const fetchResults = await this.fetchWithRateLimit(needsFetch);
      results.push(...fetchResults);
    }
    
    // Ordenar según el orden original
    const symbolOrder = new Map(assets.map((a, i) => [a.symbol, i]));
    results.sort((a, b) => (symbolOrder.get(a.symbol) ?? 0) - (symbolOrder.get(b.symbol) ?? 0));
    
    return results;
  }
  
  /**
   * Fetch con batch endpoint en lugar de llamadas individuales
   */
  private async fetchWithRateLimit(assets: MarketAsset[]): Promise<MarketAsset[]> {
    if (assets.length === 0) return [];
    
    const symbols = assets.map(a => a.symbol);
    const now = Date.now();
    
    try {
      // Una sola llamada batch
      const quotes = await apiClient.getQuotesBatch(symbols);
      
      return assets.map(asset => {
        const data = quotes[asset.symbol];
        if (data) {
          marketCache.set(asset.symbol, { data, timestamp: now });
          return {
            ...asset,
            price: data.price,
            change: data.change,
            changePercent: data.changePercent,
            currency: data.currency,
          };
        }
        return { ...asset, error: true };
      });
    } catch (error) {
      console.error('[MarketData] Batch fetch error in fetchWithRateLimit:', error);
      // Fallback a llamadas paralelas
      const results = await Promise.all(
        assets.map(async (asset) => {
          try {
            const data = await this.getQuoteLite(asset.symbol);
            if (data) {
              return { ...asset, price: data.price, change: data.change, changePercent: data.changePercent, currency: data.currency };
            }
          } catch { /* ignore */ }
          return { ...asset, error: true };
        })
      );
      return results;
    }
  }

  /**
   * Obtiene un activo por símbolo
   */
  async getAssetBySymbol(symbol: string): Promise<MarketAsset | undefined> {
    const allAssets = await this.getAssets();
    return allAssets.find(a => a.symbol.toLowerCase() === symbol.toLowerCase());
  }

  /**
   * Obtiene múltiples activos por símbolos con sus precios
   */
  async getAssetsBySymbols(symbols: string[]): Promise<MarketAsset[]> {
    if (symbols.length === 0) return [];
    
    const allAssets = await this.getAssets();
    const symbolSet = new Set(symbols.map(s => s.toUpperCase()));
    
    // Encontrar los activos que coinciden
    const matchedAssets = allAssets.filter(a => 
      symbolSet.has(a.symbol.toUpperCase())
    );
    
    // Obtener precios para todos
    return this.fetchAssetsWithPrices(matchedAssets);
  }

  /**
   * Obtiene un activo por símbolo (sincrono, solo si ya están cargados)
   */
  getAssetBySymbolSync(symbol: string): MarketAsset | undefined {
    if (dynamicAssets) {
      return dynamicAssets.find(a => a.symbol.toLowerCase() === symbol.toLowerCase());
    }
    return ALL_ASSETS.find(a => a.symbol.toLowerCase() === symbol.toLowerCase());
  }

  /**
   * Limpia el cache (útil para forzar refresh)
   */
  clearCache(): void {
    marketCache.clear();
    this.batchPromise = null;
    this.lastBatchFetch = 0;
    // También resetear activos dinámicos para forzar recarga
    dynamicAssets = null;
    dynamicAssetsTimestamp = 0;
  }
}

export const marketDataService = new MarketDataService();
