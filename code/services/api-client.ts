/**
 * API Client para comunicación con el backend
 * 
 * Este cliente reemplaza toda la lógica de servicios del frontend.
 * El frontend solo hace fetch y muestra datos.
 */

// URL base del backend
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://your-production-url.com/api';

// Timeout para peticiones
const TIMEOUT = 30000;

// Tipo de respuesta genérico
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Fetch wrapper con timeout y manejo de errores
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

/**
 * Helper para hacer peticiones GET
 */
async function get<T>(endpoint: string): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`);
  const json: ApiResponse<T> = await response.json();
  
  if (!json.success) {
    throw new Error(json.error || 'Unknown error');
  }
  
  return json.data;
}

/**
 * Helper para hacer peticiones POST
 */
async function post<T>(endpoint: string, body: any): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const json: ApiResponse<T> = await response.json();
  
  if (!json.success) {
    throw new Error(json.error || 'Unknown error');
  }
  
  return json.data;
}

/**
 * Helper para hacer peticiones DELETE
 */
async function del<T>(endpoint: string): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
    method: 'DELETE',
  });
  const json: ApiResponse<T> = await response.json();
  
  if (!json.success) {
    throw new Error(json.error || 'Unknown error');
  }
  
  return json.data;
}

// ============================================================================
// TIPOS - Definidos para match con el backend
// ============================================================================

export interface AssetQuote {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap: number | null;
}

export interface HistoricalDataPoint {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export interface TechnicalAnalysis {
  currentPrice: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  rsiSignal: 'oversold' | 'overbought' | 'neutral';
  macdTrend: 'bullish' | 'bearish' | 'neutral';
  technicalScore: number;
  trend: string;
  summary: string;
  hasData: boolean;
}

export interface NewsSummary {
  items: Array<{
    title: string;
    publisher: string;
    link: string;
    publishedAt: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    sentimentScore: number;
  }>;
  overallSentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  hasNews: boolean;
  newsCount: number;
  summary: string;
}

export interface SentimentData {
  symbol?: string;
  type: string;
  vix?: { value: number; sentiment: string; score: number };
  fearGreed?: { value: number; classification: string; score: number };
  overallScore: number;
  bullishPercent: number;
  hasData: boolean;
  summary: string;
}

export interface MacroIndicators {
  region: string;
  country: string;
  macroScore: number;
  macroOutlook: string;
  hasData: boolean;
  summary: string;
}

export interface CalculatedPrediction {
  asset: string;
  symbol: string;
  assetType: string;
  currentPrice: number;
  currency: string;
  predictedPriceMin: number;
  predictedPriceMax: number;
  predictedChange: number;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  factorBreakdown: {
    assetGroup: string;
    assetGroupDescription: string;
    relevantFactors: string[];
    availableFactors: Array<{ name: string; score: number; hasData: boolean }>;
    weightsUsed?: Record<string, number>;
    usingLearnedWeights?: boolean;
    confidenceExplanation: string;
    signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
  };
  // Usando any para compatibilidad con diferentes versiones del frontend
  sentiment: any;
  historical: any;
  technical?: any;
  news?: any;
  macro?: any;
  timeframe: string;
  calculatedAt: string;
  audit?: any;
  financials?: any;
  competitors?: any;
  forex?: any;
  institutional?: any;
  seasonality?: any;
  technicalAnalysis?: any;
  uncertaintyScore?: number;
  shouldPredict?: boolean;
  uncertaintyWarning?: string;
  uncertaintyReasons?: string[];
  // Eventos del calendario (earnings, dividendos, splits)
  events?: {
    hasData: boolean;
    warnings: string[];
    eventRiskScore?: number;
    nextEarnings?: {
      date: string;
      daysUntil: number;
      estimate?: number;
    };
    dividend?: {
      yield: number;
      exDate?: string;
      daysUntilEx?: number;
      frequency?: string;
    };
    nextSplit?: {
      date: string;
      daysUntil: number;
      ratio: string;
    };
  };
}

export interface FullAnalysis {
  symbol: string;
  type: string;
  technical: TechnicalAnalysis;
  news: NewsSummary;
  sentiment: SentimentData;
  macro: MacroIndicators;
  analyzedAt: string;
}

export interface TrendStreak {
  direction: 'up' | 'down' | 'sideways';
  days: number;
  totalChange: number;
  avgDailyChange: number;
  startDate: string;
  endDate: string;
}

export interface TrendMomentum {
  short: number;
  medium: number;
  long: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
}

export interface TrendSupport {
  level: number;
  strength: 'strong' | 'moderate' | 'weak';
  distancePercent: number;
}

export interface TrendResistance {
  level: number;
  strength: 'strong' | 'moderate' | 'weak';
  distancePercent: number;
}

export interface TrendVolatility {
  current: number;
  average: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  percentile: number;
}

export interface TrendAnalysis {
  symbol: string;
  currentPrice: number;
  currentStreak: TrendStreak;
  momentum: TrendMomentum;
  supports: TrendSupport[];
  resistances: TrendResistance[];
  volatility: TrendVolatility;
  stats: {
    up_days_30d: number;
    down_days_30d: number;
    flat_days_30d: number;
    best_day_30d: { date: string; change: number };
    worst_day_30d: { date: string; change: number };
    avg_up_move: number;
    avg_down_move: number;
  };
  trendPrediction: {
    direction: 'continue' | 'reverse' | 'uncertain';
    probability: number;
    reasoning: string;
  };
  analyzedAt: string;
}

export interface TrendRanking {
  symbol: string;
  name: string;
  currentPrice: number;
  streak: {
    direction: 'up' | 'down' | 'sideways';
    days: number;
    totalChange: number;
  };
  momentum: {
    signal: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    score: number;
  };
  change24h: number;
  change7d: number;
  change30d: number;
  change90d: number;
  trendScore: number;
  trendPrediction: 'continue' | 'reverse' | 'uncertain';
}

export type TrendCategory = 'gainers' | 'losers' | 'streaks' | 'momentum' | 'all';

export interface TopTrendsResponse {
  category: TrendCategory;
  count: number;
  trends: TrendRanking[];
  analyzedAt: string;
}

// Tipos para ML Diagnostics
export interface WeightComparison {
  base: number;
  learned: number;
  change: string;
  changePercent: number;
}

export interface MLWeightsStatus {
  summary: {
    lastUpdated: string | null;
    trainingSamples: number;
    hasLearnedWeights: boolean;
    error: string | null;
  };
  baseWeights: Record<string, number>;
  learnedWeights: {
    intraday: Record<string, number>;
    swing: Record<string, number>;
    long: Record<string, number>;
  } | null;
  comparison: {
    intraday: Record<string, WeightComparison> | null;
    swing: Record<string, WeightComparison> | null;
    long: Record<string, WeightComparison> | null;
  };
  assetGroupMultipliers: Record<string, Record<string, number>>;
  assetGroupStats: Record<string, {
    sampleCount: number;
    successRate: number;
    avgAccuracy: number;
    lastUpdated: string;
  }>;
  availableAssetGroups: string[];
}

export interface MLModelsStatus {
  reinforcementLearning: {
    status: string;
    totalEpisodes: number;
    successRate: number;
  };
  probabilisticModel: {
    status: string;
    sampleCount: number;
  };
  factorCorrelation: { status: string };
  metaLearning: { status: string };
  featureEngineering: { status: string };
  temporalCrossValidation: { status: string };
}

// ============================================================================
// API CLIENT - Funciones exportadas
// ============================================================================

export const apiClient = {
  // -------------------------------------------------------------------------
  // ASSETS
  // -------------------------------------------------------------------------
  
  /**
   * Obtener lista completa de activos disponibles
   */
  getAllAssets: (): Promise<Array<{ symbol: string; name: string; type: string; category: string; icon: string }>> => {
    return get('/assets');
  },

  /**
   * Buscar activos por nombre o símbolo
   * @param query - Término de búsqueda
   * @param limit - Máximo de resultados (default 30, max 50)
   */
  searchAssets: (query: string, limit: number = 30): Promise<SearchResult[]> => {
    return get(`/assets/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  },

  /**
   * Obtener cotización actual de un activo
   */
  getQuote: (symbol: string): Promise<AssetQuote> => {
    return get(`/assets/${encodeURIComponent(symbol)}/quote`);
  },

  /**
   * Obtener datos históricos
   */
  getHistory: async (
    symbol: string,
    range: '1d' | '3d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' = '1mo',
    interval: '1m' | '5m' | '15m' | '1h' | '1d' = '1d'
  ): Promise<HistoricalDataPoint[]> => {
    const response = await get<{ symbol: string; range: string; interval: string; count: number; prices: HistoricalDataPoint[] }>(
      `/assets/${encodeURIComponent(symbol)}/history?range=${range}&interval=${interval}`
    );
    return response.prices;
  },

  /**
   * Limpiar caché de historial de un símbolo específico
   */
  clearSymbolCache: (symbol: string): Promise<{ symbol: string; clearedEntries: number; message: string }> => {
    return del(`/assets/${encodeURIComponent(symbol)}/cache`);
  },

  /**
   * Obtener estadísticas del caché de historial
   */
  getCacheStats: (): Promise<{ entries: number; symbols: string[] }> => {
    return get('/assets/cache/stats');
  },

  /**
   * Limpiar todo el caché de historial
   */
  clearAllCache: (): Promise<{ clearedEntries: number; message: string }> => {
    return del('/assets/cache');
  },

  /**
   * Obtener información detallada para inversores (earnings, dividendos, valoración)
   */
  getInvestorInfo: async (symbol: string): Promise<any | null> => {
    try {
      const response = await get<any>(`/assets/${encodeURIComponent(symbol)}/investor-info`);
      return response;
    } catch (error) {
      console.log('[API] Investor info not available for', symbol);
      return null;
    }
  },

  // -------------------------------------------------------------------------
  // ANALYSIS
  // -------------------------------------------------------------------------

  /**
   * Obtener análisis técnico completo
   */
  getTechnicalAnalysis: (symbol: string): Promise<TechnicalAnalysis> => {
    return get(`/analysis/technical/${encodeURIComponent(symbol)}`);
  },

  /**
   * Obtener noticias y análisis de sentimiento de noticias
   */
  getNews: (symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<NewsSummary> => {
    return get(`/analysis/news/${encodeURIComponent(symbol)}?type=${type}`);
  },

  /**
   * Obtener sentimiento del mercado (VIX, Fear & Greed)
   */
  getSentiment: (symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<SentimentData> => {
    return get(`/analysis/sentiment/${encodeURIComponent(symbol)}?type=${type}`);
  },

  /**
   * Obtener indicadores macroeconómicos
   */
  getMacroIndicators: (symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<MacroIndicators> => {
    return get(`/analysis/macro/${encodeURIComponent(symbol)}?type=${type}`);
  },

  /**
   * Obtener análisis completo (todos los datos de una vez)
   */
  getFullAnalysis: (symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<FullAnalysis> => {
    return get(`/analysis/full/${encodeURIComponent(symbol)}?type=${type}`);
  },

  /**
   * Obtener análisis de tendencias (rachas, momentum, soportes/resistencias)
   */
  getTrends: (symbol: string): Promise<TrendAnalysis | null> => {
    return get(`/analysis/trends/${encodeURIComponent(symbol)}`);
  },

  /**
   * Obtener ranking de activos por tendencia
   * @param category - 'gainers' | 'losers' | 'streaks' | 'momentum' | 'all'
   * @param limit - Número máximo de resultados (max 50)
   */
  getTopTrends: (category: TrendCategory = 'all', limit: number = 20): Promise<TopTrendsResponse> => {
    return get(`/analysis/top-trends?category=${category}&limit=${limit}`);
  },

  // -------------------------------------------------------------------------
  // PREDICTIONS
  // -------------------------------------------------------------------------

  /**
   * Calcular predicción (sin guardar) - Para preview
   */
  calculatePrediction: (symbol: string, days: number = 1): Promise<CalculatedPrediction> => {
    return post('/predictions/calculate', { symbol, days });
  },

  /**
   * Crear y guardar predicción (recalcula todo)
   */
  createPrediction: (symbol: string, days: number = 1): Promise<CalculatedPrediction & { id: string }> => {
    return post('/predictions', { symbol, days });
  },

  /**
   * Registrar predicción ya calculada para tracking
   */
  trackPrediction: (data: {
    symbol: string;
    asset?: string;
    assetType?: string;
    currency?: string; // Moneda del activo
    direction: string;
    predictedChange: number;
    predictedPriceMin?: number;
    predictedPriceMax?: number;
    confidence: number;
    currentPrice: number;
    timeframe?: string;
    timeframeDays?: number;
    volatility?: number;
    volatilityCategory?: string;
    factorBreakdown?: any;
    factorWeights?: any;
    reasoning?: string;
    uncertaintyScore?: number;
    uncertaintyData?: any;
  }): Promise<{ id: string; symbol: string; direction: string; expiresAt: string }> => {
    return post('/predictions/track', data);
  },

  /**
   * Obtener predicción por ID
   */
  getPrediction: (id: string): Promise<any> => {
    return get(`/predictions/${id}`);
  },

  /**
   * Obtener predicciones por símbolo
   */
  getPredictionsBySymbol: (symbol: string, limit: number = 10): Promise<any[]> => {
    return get(`/predictions/symbol/${encodeURIComponent(symbol)}?limit=${limit}`);
  },

  /**
   * Obtener predicciones pendientes de verificar
   */
  getPendingPredictions: (): Promise<any[]> => {
    return get('/predictions/pending');
  },

  /**
   * Obtener predicciones activas (no expiradas)
   */
  getActivePredictions: (): Promise<any[]> => {
    return get('/predictions/active');
  },

  /**
   * Verificar predicción con precio actual
   */
  verifyPrediction: (id: string, actualPrice: number): Promise<any> => {
    return post(`/predictions/${id}/verify`, { actualPrice });
  },

  /**
   * Obtener estadísticas de predicciones
   */
  getPredictionStats: (): Promise<any> => {
    return get('/predictions/stats');
  },

  /**
   * Obtener todas las predicciones con paginación
   */
  getAllPredictions: async (options: { limit?: number; offset?: number; verified?: boolean } = {}): Promise<{ predictions: any[]; total: number }> => {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.verified !== undefined) params.append('verified', options.verified.toString());
    
    // Necesitamos acceso a pagination, no solo data
    const response = await fetchWithTimeout(`${API_BASE_URL}/predictions?${params.toString()}`);
    const json = await response.json();
    
    if (!json.success) {
      throw new Error(json.error || 'Unknown error');
    }
    
    return {
      predictions: json.data || [],
      total: json.pagination?.total || 0,
    };
  },

  /**
   * Verificar todas las predicciones pendientes automáticamente
   */
  verifyAllPending: (): Promise<{ verified: number; results: any[] }> => {
    return post('/predictions/verify-pending', {});
  },

  /**
   * Obtener predicciones verificadas
   */
  getVerifiedPredictions: (limit: number = 100): Promise<any[]> => {
    return get(`/predictions/verified?limit=${limit}`);
  },

  /**
   * Eliminar una predicción por ID
   */
  deletePrediction: (id: string): Promise<{ deleted: boolean }> => {
    return del(`/predictions/${id}`);
  },

  /**
   * Limpiar TODAS las predicciones (zona de peligro)
   */
  clearAllPredictions: (): Promise<{ deleted: number }> => {
    return del('/predictions');
  },

  /**
   * Resetear pesos aprendidos del ML
   */
  resetLearnedWeights: (): Promise<{ reset: boolean }> => {
    return del('/training/weights');
  },

  /**
   * Importar predicciones en masa (migración desde AsyncStorage)
   */
  importPredictionsBulk: (data: {
    predictions: any[];
    source: string;
  }): Promise<{ imported: number; total: number; errors: string[] }> => {
    return post('/predictions/import-bulk', data);
  },

  /**
   * Importar datos de training desde el frontend (migración)
   */
  importTrainingData: (data: {
    predictions: any[];
    chatPredictions?: any[];
    source: string;
  }): Promise<{ imported: number; errors: string[] }> => {
    return post('/training/import', data);
  },

  /**
   * Obtener estadísticas de training del backend
   */
  getTrainingStats: (): Promise<any> => {
    return get('/training/stats');
  },

  /**
   * Obtener todo el cache de training activo
   */
  getTrainingCache: (): Promise<any[]> => {
    return get('/training/cache');
  },

  /**
   * Guardar predicción en cache de training
   */
  saveTrainingCache: (data: {
    symbol: string;
    timeframe: string;
    predictedChange: number;
    confidence: number;
    direction: string;
    currentPrice: number;
    targetPrice: number;
    currency?: string;
    analysisData?: any;
    expiresAt: string;
  }): Promise<any> => {
    return post('/training/cache', data);
  },

  /**
   * Obtener predicción específica del cache
   */
  getTrainingCacheItem: (symbol: string, timeframe: string): Promise<any> => {
    return get(`/training/cache/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}`);
  },

  /**
   * Eliminar predicción del cache
   */
  deleteTrainingCache: (symbol: string, timeframe: string): Promise<{ deleted: boolean }> => {
    return del(`/training/cache/${encodeURIComponent(symbol)}/${encodeURIComponent(timeframe)}`);
  },

  /**
   * Obtener datos de training por símbolo
   */
  getTrainingBySymbol: (symbol: string): Promise<any[]> => {
    return get(`/training/symbol/${encodeURIComponent(symbol)}`);
  },

  /**
   * Limpiar cache de training expirado
   */
  cleanupTrainingCache: (): Promise<{ deleted: number }> => {
    return post('/training/cleanup', {});
  },

  /**
   * Borrar TODO el cache de training
   */
  clearAllTrainingCache: (): Promise<{ deleted: number }> => {
    return del('/training/cache/all');
  },

  /**
   * Resetear TODO el sistema ML: predicciones, cache, pesos y Python
   */
  resetAllML: (): Promise<{
    predictions: number;
    cache: number;
    weights: boolean;
    pythonReset: boolean;
  }> => {
    return del('/training/reset-all');
  },

  /**
   * Forzar re-aprendizaje de pesos y clasificadores desde predicciones verificadas
   */
  forceRelearn: (): Promise<{
    message: string;
    weightsLearned: number;
    classifiersLearned: number;
    totalVerified: number;
    withFactorData: number;
    withoutFactorData: number;
    errors: string[];
    details: string[];
    pythonResult: { success: boolean; message: string };
  }> => {
    return post('/training/force-relearn', {});
  },

  /**
   * Exportar todos los datos de training
   */
  exportTrainingData: (): Promise<any> => {
    return get('/training/export');
  },

  /**
   * Obtener pesos aprendidos
   */
  getLearnedWeights: (): Promise<any> => {
    return get('/training/weights');
  },

  /**
   * Guardar pesos aprendidos
   */
  saveLearnedWeights: (weights: any): Promise<any> => {
    return post('/training/weights', weights);
  },

  // -------------------------------------------------------------------------
  // FAVORITES
  // -------------------------------------------------------------------------

  /**
   * Obtener lista de favoritos
   */
  getFavorites: (): Promise<Array<{ symbol: string; order: number }>> => {
    return get('/favorites');
  },

  /**
   * Añadir favorito
   */
  addFavorite: (symbol: string, name?: string, assetType?: string): Promise<{ symbol: string }> => {
    // Determinar tipo de activo basado en el símbolo
    const type = assetType || (symbol.includes('-USD') || symbol.includes('-EUR') ? 'crypto' : 'stock');
    return post('/favorites', { 
      symbol, 
      name: name || symbol,
      assetType: type
    });
  },

  /**
   * Eliminar favorito
   */
  removeFavorite: (symbol: string): Promise<{ removed: boolean }> => {
    return del(`/favorites/${encodeURIComponent(symbol)}`);
  },

  /**
   * Comprobar si es favorito
   */
  isFavorite: (symbol: string): Promise<{ isFavorite: boolean }> => {
    return get(`/favorites/${encodeURIComponent(symbol)}/check`);
  },

  /**
   * Toggle favorito (atómico - añadir o eliminar)
   */
  toggleFavorite: (symbol: string, name?: string, assetType?: string): Promise<{ symbol: string; isFavorite: boolean; action: string }> => {
    const type = assetType || (symbol.includes('-USD') || symbol.includes('-EUR') ? 'crypto' : 'stock');
    return post('/favorites/toggle', {
      symbol,
      name: name || symbol,
      assetType: type
    });
  },

  // -------------------------------------------------------------------------
  // HEALTH
  // -------------------------------------------------------------------------

  /**
   * Verificar salud del backend
   */
  health: (): Promise<{ status: string; timestamp: string }> => {
    return get('/health');
  },

  // -------------------------------------------------------------------------
  // ML DIAGNOSTICS
  // -------------------------------------------------------------------------

  /**
   * Obtener estado de pesos ML y clasificadores
   */
  getMLWeightsStatus: (): Promise<MLWeightsStatus> => {
    return get('/ml/weights/status');
  },

  /**
   * Obtener comparación de pesos para un símbolo (incluye clasificación)
   */
  getWeightsComparison: (symbol: string): Promise<{
    symbol: string;
    assetGroup: string;
    assetGroupDescription: string;
    weightsApplied: Record<string, number>;
    usingLearnedWeights: boolean;
  }> => {
    return get(`/ml/weights/compare/${encodeURIComponent(symbol)}`);
  },

  /**
   * Obtener estado de todos los modelos ML
   */
  getMLStatus: (): Promise<MLModelsStatus> => {
    return get('/ml/status');
  },
};

// Export por defecto
export default apiClient;
