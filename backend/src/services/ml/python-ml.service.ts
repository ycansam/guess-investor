/**
 * Python ML Client Service
 * ========================
 * 
 * Cliente para comunicarse con el servidor de ML en Python.
 * El servidor Python maneja:
 * - Clasificación de activos (volatilidad, timeframe recomendado)
 * - Entrenamiento de pesos optimizados
 * - Perfiles de activos
 */

import { logger } from '../../middleware/logger.js';

const PYTHON_ML_URL = process.env.PYTHON_ML_URL || 'http://localhost:8765';

/**
 * Perfil de un activo clasificado por el sistema de ML
 */
export interface AssetProfile {
  symbol: string;
  name: string;
  asset_type: string;
  
  // Métricas de volatilidad
  daily_volatility: number;
  weekly_volatility: number;
  atr_percent: number;
  
  // Métricas de comportamiento
  avg_daily_range: number;
  gap_frequency: number;
  trend_persistence: number;
  mean_reversion_score: number;
  
  // Clasificación recomendada
  recommended_timeframe: 'intraday' | 'swing' | 'long';
  timeframe_scores: {
    intraday: number;
    swing: number;
    long: number;
  };
  
  // Modelos recomendados
  recommended_models: string[];
  model_weights: Record<string, number>;
  
  // Metadatos
  classified_at: string;
  samples_used: number;
  confidence: number;
}

/**
 * Respuesta del servidor de clasificación
 */
interface ClassifyResponse {
  success: boolean;
  profile?: AssetProfile;
  profiles?: Record<string, AssetProfile>;
  error?: string;
}

/**
 * Cache en memoria para perfiles
 */
const profileCache = new Map<string, { profile: AssetProfile; cachedAt: Date }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export const pythonMlService = {
  /**
   * Verifica si el servidor de Python ML está disponible
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${PYTHON_ML_URL}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Obtiene el estado del servidor de ML
   */
  async getStatus(): Promise<any> {
    try {
      const response = await fetch(`${PYTHON_ML_URL}/status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      logger.warn(`[PythonML] Server not available: ${error.message}`);
      return null;
    }
  },

  /**
   * Clasifica un activo usando el servidor de Python
   */
  async classifyAsset(
    symbol: string,
    assetType: string = 'stock',
    historicalData?: any[],
    force: boolean = false
  ): Promise<AssetProfile | null> {
    // Verificar cache primero
    if (!force && profileCache.has(symbol)) {
      const cached = profileCache.get(symbol)!;
      const age = Date.now() - cached.cachedAt.getTime();
      if (age < CACHE_TTL_MS) {
        logger.debug(`[PythonML] Using cached profile for ${symbol}`);
        return cached.profile;
      }
    }

    try {
      let response: Response;

      if (historicalData && historicalData.length > 0) {
        // POST con datos históricos
        response = await fetch(`${PYTHON_ML_URL}/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            asset_type: assetType,
            historical_data: historicalData,
            force,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } else {
        // GET simple
        response = await fetch(`${PYTHON_ML_URL}/classify/${symbol}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawData = await response.json() as Record<string, unknown>;
      
      // Verificar si es respuesta con success (POST)
      if ('success' in rawData && rawData.success === true && 'profile' in rawData) {
        const profile = rawData.profile as AssetProfile;
        // Guardar en cache
        profileCache.set(symbol, {
          profile,
          cachedAt: new Date(),
        });
        
        logger.info(`[PythonML] Classified ${symbol}: ${profile.recommended_timeframe} (confidence: ${profile.confidence}%)`);
        return profile;
      }

      // Si viene directamente el perfil (GET) - tiene 'symbol' como propiedad
      if ('symbol' in rawData && typeof rawData.symbol === 'string') {
        const profile = rawData as unknown as AssetProfile;
        profileCache.set(symbol, {
          profile,
          cachedAt: new Date(),
        });
        return profile;
      }

      return null;
    } catch (error: any) {
      logger.warn(`[PythonML] Error classifying ${symbol}: ${error.message}`);
      
      // Retornar perfil por defecto
      return this.getDefaultProfile(symbol, assetType);
    }
  },

  /**
   * Clasifica múltiples activos en batch
   */
  async classifyBatch(
    symbols: string[],
    historicalDataMap?: Record<string, any[]>
  ): Promise<Record<string, AssetProfile>> {
    try {
      const response = await fetch(`${PYTHON_ML_URL}/classify-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          historical_data: historicalDataMap || {},
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as ClassifyResponse;
      
      if (data.success && data.profiles) {
        // Guardar todos en cache
        for (const [symbol, profile] of Object.entries(data.profiles)) {
          profileCache.set(symbol, {
            profile,
            cachedAt: new Date(),
          });
        }
        
        logger.info(`[PythonML] Batch classified ${Object.keys(data.profiles).length} assets`);
        return data.profiles;
      }

      return {};
    } catch (error: any) {
      logger.warn(`[PythonML] Error in batch classify: ${error.message}`);
      
      // Retornar perfiles por defecto
      const result: Record<string, AssetProfile> = {};
      for (const symbol of symbols) {
        result[symbol] = this.getDefaultProfile(symbol, 'stock');
      }
      return result;
    }
  },

  /**
   * Obtiene todos los perfiles clasificados
   */
  async getAllProfiles(): Promise<Record<string, AssetProfile>> {
    try {
      const response = await fetch(`${PYTHON_ML_URL}/profiles`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json() as Record<string, AssetProfile>;
    } catch (error: any) {
      logger.warn(`[PythonML] Error getting profiles: ${error.message}`);
      return {};
    }
  },

  /**
   * Obtiene el timeframe recomendado para un activo
   */
  async getRecommendedTimeframe(symbol: string): Promise<{ timeframe: string; confidence: number }> {
    const profile = await this.classifyAsset(symbol);
    
    if (profile) {
      return {
        timeframe: profile.recommended_timeframe,
        confidence: profile.timeframe_scores[profile.recommended_timeframe] || 50,
      };
    }

    // Fallback basado en el símbolo
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      return { timeframe: 'swing', confidence: 40 };
    }
    if (symbol.startsWith('^') || symbol.includes('SPY') || symbol.includes('QQQ')) {
      return { timeframe: 'long', confidence: 50 };
    }
    
    return { timeframe: 'swing', confidence: 30 };
  },

  /**
   * Obtiene los pesos de modelos recomendados para un activo
   * 
   * NOTA: Los modelos 'symbol' y 'regime' requieren historial de predicciones
   * verificadas. Si samples_used < MIN_SAMPLES_FOR_SPECIFIC, su peso se
   * redistribuye al modelo 'global'.
   */
  async getModelWeights(symbol: string): Promise<Record<string, number>> {
    const MIN_SAMPLES_FOR_SPECIFIC = 10; // Mínimo para usar modelos específicos
    const profile = await this.classifyAsset(symbol);
    
    if (profile && profile.model_weights) {
      // Si no hay suficientes muestras, deshabilitar modelos que requieren historial
      if ((profile.samples_used || 0) < MIN_SAMPLES_FOR_SPECIFIC) {
        const weights = { ...profile.model_weights };
        // Redistribuir peso de symbol y regime al global
        const redistributed = (weights.symbol || 0) + (weights.regime || 0);
        weights.symbol = 0;
        weights.regime = 0;
        weights.global = (weights.global || 0.25) + redistributed;
        return weights;
      }
      return profile.model_weights;
    }

    // Pesos por defecto (sin historial = sin modelos específicos)
    return {
      global: 0.55, // Absorbe el peso de symbol y regime
      symbol: 0.00, // Deshabilitado: requiere historial
      regime: 0.00, // Deshabilitado: requiere historial
      momentum: 0.15,
      mean_reversion: 0.10,
      fundamental: 0.10,
      sentiment_driven: 0.10,
    };
  },

  /**
   * Genera un perfil por defecto cuando el servidor no está disponible
   */
  getDefaultProfile(symbol: string, assetType: string): AssetProfile {
    // Determinar tipo basándose en el símbolo
    let isCrypto = symbol.includes('-USD') || symbol.includes('-EUR');
    let isETF = symbol.startsWith('^') || ['SPY', 'QQQ', 'VOO', 'IWM', 'DIA'].includes(symbol);
    
    if (assetType === 'crypto') isCrypto = true;
    
    const defaultProfile: AssetProfile = {
      symbol,
      name: symbol,
      asset_type: isCrypto ? 'crypto' : isETF ? 'etf' : assetType,
      
      daily_volatility: isCrypto ? 50 : isETF ? 15 : 25,
      weekly_volatility: isCrypto ? 80 : isETF ? 25 : 40,
      atr_percent: isCrypto ? 3.0 : isETF ? 0.8 : 1.5,
      
      avg_daily_range: isCrypto ? 5.0 : isETF ? 1.0 : 2.0,
      gap_frequency: isCrypto ? 0.05 : isETF ? 0.15 : 0.10,
      trend_persistence: isCrypto ? 0.45 : isETF ? 0.70 : 0.60,
      mean_reversion_score: isCrypto ? 0.55 : isETF ? 0.30 : 0.40,
      
      recommended_timeframe: isCrypto ? 'swing' : isETF ? 'long' : 'swing',
      timeframe_scores: {
        intraday: isCrypto ? 35 : isETF ? 15 : 25,
        swing: isCrypto ? 40 : isETF ? 35 : 45,
        long: isCrypto ? 25 : isETF ? 50 : 30,
      },
      
      recommended_models: isCrypto 
        ? ['momentum', 'sentiment_driven', 'global']
        : isETF 
          ? ['fundamental', 'mean_reversion', 'global']
          : ['global', 'momentum', 'fundamental'],
      
      // NOTA: symbol y regime deshabilitados por defecto (requieren historial)
      model_weights: {
        global: 0.35, // Mayor peso sin modelos específicos
        symbol: 0.00, // Deshabilitado: requiere historial específico del activo
        regime: 0.00, // Deshabilitado: requiere historial para detectar régimen
        momentum: isCrypto ? 0.25 : 0.20,
        mean_reversion: isCrypto ? 0.15 : 0.15,
        fundamental: isCrypto ? 0.10 : isETF ? 0.20 : 0.15,
        sentiment_driven: isCrypto ? 0.15 : 0.15,
      },
      
      classified_at: new Date().toISOString(),
      samples_used: 0,
      confidence: 30, // Baja confianza por ser fallback
    };

    return defaultProfile;
  },

  /**
   * Limpia la cache de perfiles
   */
  clearCache(): void {
    profileCache.clear();
    logger.info('[PythonML] Profile cache cleared');
  },
};
