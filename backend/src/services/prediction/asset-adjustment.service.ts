/**
 * Asset Adjustment Service
 * 
 * Corrige predicciones para activos problemáticos basándose en:
 * 1. Historial de errores de predicción (auto-aprendido)
 * 2. Características conocidas del activo (predefinido)
 * 3. Ajustes manuales para activos que consistentemente fallan
 * 
 * Migrado de: code/services/asset-adjustment-service.ts
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// Interfaz para ajustes de un activo
export interface AssetAdjustment {
  symbol: string;
  
  // Factor de escala para el cambio predicho (1.0 = sin cambio, 0.5 = reducir a la mitad)
  magnitudeScale: number;
  
  // Sesgo direccional (-0.05 a +0.05, se añade al cambio final)
  directionalBias: number;
  
  // Factor de confianza (0.5 a 1.0, multiplica la confianza)
  confidenceScale: number;
  
  // Estadísticas de aprendizaje
  sampleCount: number;
  avgPredictedChange: number;
  avgActualChange: number;
  avgError: number;
  avgAbsError: number;
  hitRate: number;
  
  lastUpdated: Date;
  reason: 'auto_learned' | 'manual' | 'volatility_adjustment' | 'predefined';
}

// Ajustes predefinidos para activos conocidos problemáticos
const PREDEFINED_ADJUSTMENTS: Record<string, Partial<AssetAdjustment>> = {
  // Tesla: Alta volatilidad, predicciones exageradas
  'TSLA': {
    magnitudeScale: 0.55,
    directionalBias: -0.005,
    confidenceScale: 0.85,
    reason: 'predefined',
  },
  
  // Nvidia: Similar a Tesla
  'NVDA': {
    magnitudeScale: 0.60,
    directionalBias: -0.003,
    confidenceScale: 0.88,
    reason: 'predefined',
  },
  
  // AMD
  'AMD': {
    magnitudeScale: 0.65,
    directionalBias: -0.002,
    confidenceScale: 0.90,
    reason: 'predefined',
  },
  
  // Bitcoin
  'BTC-USD': {
    magnitudeScale: 0.70,
    directionalBias: 0,
    confidenceScale: 0.80,
    reason: 'volatility_adjustment',
  },
  'BTC-EUR': {
    magnitudeScale: 0.70,
    directionalBias: 0,
    confidenceScale: 0.80,
    reason: 'volatility_adjustment',
  },
  
  // Ethereum
  'ETH-USD': {
    magnitudeScale: 0.70,
    directionalBias: 0,
    confidenceScale: 0.80,
    reason: 'volatility_adjustment',
  },
  'ETH-EUR': {
    magnitudeScale: 0.70,
    directionalBias: 0,
    confidenceScale: 0.80,
    reason: 'volatility_adjustment',
  },
  
  // Meme stocks
  'GME': {
    magnitudeScale: 0.50,
    directionalBias: 0,
    confidenceScale: 0.70,
    reason: 'volatility_adjustment',
  },
  'AMC': {
    magnitudeScale: 0.50,
    directionalBias: 0,
    confidenceScale: 0.70,
    reason: 'volatility_adjustment',
  },
  
  // Palantir
  'PLTR': {
    magnitudeScale: 0.60,
    directionalBias: -0.002,
    confidenceScale: 0.85,
    reason: 'predefined',
  },
  
  // Coinbase
  'COIN': {
    magnitudeScale: 0.60,
    directionalBias: 0,
    confidenceScale: 0.75,
    reason: 'volatility_adjustment',
  },
  
  // MicroStrategy (proxy Bitcoin)
  'MSTR': {
    magnitudeScale: 0.55,
    directionalBias: 0,
    confidenceScale: 0.75,
    reason: 'volatility_adjustment',
  },
  
  // Solana
  'SOL-USD': {
    magnitudeScale: 0.65,
    directionalBias: 0,
    confidenceScale: 0.75,
    reason: 'volatility_adjustment',
  },
  'SOL-EUR': {
    magnitudeScale: 0.65,
    directionalBias: 0,
    confidenceScale: 0.75,
    reason: 'volatility_adjustment',
  },
};

// Umbrales para auto-ajuste
const AUTO_ADJUST_THRESHOLDS = {
  minSamples: 5,
  significantError: 2.0,
  extremeError: 4.0,
  lowHitRate: 0.45,
};

// Cache en memoria de ajustes aprendidos
const learnedAdjustments = new Map<string, AssetAdjustment>();
let cacheLoaded = false;

export const assetAdjustmentService = {
  /**
   * Carga ajustes aprendidos de la base de datos
   */
  async loadFromDatabase(): Promise<void> {
    if (cacheLoaded) return;
    
    try {
      const adjustments = await prisma.assetAdjustment.findMany();
      for (const adj of adjustments) {
        learnedAdjustments.set(adj.symbol, {
          symbol: adj.symbol,
          magnitudeScale: adj.magnitudeScale,
          directionalBias: adj.directionalBias,
          confidenceScale: adj.confidenceScale,
          sampleCount: adj.sampleCount,
          avgPredictedChange: adj.avgPredictedChange,
          avgActualChange: adj.avgActualChange,
          avgError: adj.avgError,
          avgAbsError: adj.avgAbsError,
          hitRate: adj.hitRate,
          lastUpdated: adj.updatedAt,
          reason: adj.reason as AssetAdjustment['reason'],
        });
      }
      cacheLoaded = true;
      logger.info(`[AssetAdjust] Loaded ${learnedAdjustments.size} learned adjustments`);
    } catch (error) {
      logger.warn('[AssetAdjust] Error loading adjustments:', error);
    }
  },

  /**
   * Obtiene el ajuste para un activo
   */
  getAdjustment(symbol: string): AssetAdjustment | null {
    // 1. Buscar ajuste aprendido
    const learned = learnedAdjustments.get(symbol);
    
    // 2. Buscar ajuste predefinido
    const predefined = PREDEFINED_ADJUSTMENTS[symbol];
    
    // 3. Usar aprendido si tiene suficientes muestras
    if (learned && learned.sampleCount >= AUTO_ADJUST_THRESHOLDS.minSamples) {
      return {
        ...learned,
        magnitudeScale: Math.max(0.3, Math.min(1.0, learned.magnitudeScale)),
        directionalBias: Math.max(-0.05, Math.min(0.05, learned.directionalBias)),
        confidenceScale: Math.max(0.5, Math.min(1.0, learned.confidenceScale)),
      };
    }
    
    // 4. Usar predefinido si existe
    if (predefined) {
      return {
        symbol,
        magnitudeScale: predefined.magnitudeScale ?? 1.0,
        directionalBias: predefined.directionalBias ?? 0,
        confidenceScale: predefined.confidenceScale ?? 1.0,
        sampleCount: 0,
        avgPredictedChange: 0,
        avgActualChange: 0,
        avgError: 0,
        avgAbsError: 0,
        hitRate: 0,
        lastUpdated: new Date(),
        reason: predefined.reason ?? 'predefined',
      };
    }
    
    return null;
  },

  /**
   * Aplica ajustes a una predicción
   */
  applyAdjustment(
    symbol: string,
    predictedChange: number,
    confidence: number
  ): { 
    adjustedChange: number; 
    adjustedConfidence: number; 
    wasAdjusted: boolean; 
    adjustment: AssetAdjustment | null;
  } {
    const adjustment = this.getAdjustment(symbol);
    
    if (!adjustment) {
      return {
        adjustedChange: predictedChange,
        adjustedConfidence: confidence,
        wasAdjusted: false,
        adjustment: null,
      };
    }
    
    // Aplicar escala de magnitud
    let adjustedChange = predictedChange * adjustment.magnitudeScale;
    
    // Aplicar sesgo direccional (convertir a porcentaje)
    adjustedChange += adjustment.directionalBias * 100;
    
    // Aplicar escala de confianza
    const adjustedConfidence = Math.round(confidence * adjustment.confidenceScale);
    
    logger.info(`[AssetAdjust] ${symbol}: ${predictedChange.toFixed(2)}% → ${adjustedChange.toFixed(2)}% (scale: ${adjustment.magnitudeScale})`);
    
    return {
      adjustedChange,
      adjustedConfidence,
      wasAdjusted: true,
      adjustment,
    };
  },

  /**
   * Actualiza el ajuste basándose en una predicción verificada
   */
  async updateFromVerification(
    symbol: string,
    predictedChange: number,
    actualChange: number,
    directionCorrect: boolean
  ): Promise<void> {
    await this.loadFromDatabase();
    
    let adjustment = learnedAdjustments.get(symbol);
    
    if (!adjustment) {
      adjustment = {
        symbol,
        magnitudeScale: 1.0,
        directionalBias: 0,
        confidenceScale: 1.0,
        sampleCount: 0,
        avgPredictedChange: 0,
        avgActualChange: 0,
        avgError: 0,
        avgAbsError: 0,
        hitRate: 0,
        lastUpdated: new Date(),
        reason: 'auto_learned',
      };
    }
    
    // Actualizar estadísticas con EMA (Exponential Moving Average)
    const alpha = 0.2;
    const error = predictedChange - actualChange;
    const absError = Math.abs(error);
    
    if (adjustment.sampleCount === 0) {
      adjustment.avgPredictedChange = predictedChange;
      adjustment.avgActualChange = actualChange;
      adjustment.avgError = error;
      adjustment.avgAbsError = absError;
      adjustment.hitRate = directionCorrect ? 1 : 0;
    } else {
      adjustment.avgPredictedChange = alpha * predictedChange + (1 - alpha) * adjustment.avgPredictedChange;
      adjustment.avgActualChange = alpha * actualChange + (1 - alpha) * adjustment.avgActualChange;
      adjustment.avgError = alpha * error + (1 - alpha) * adjustment.avgError;
      adjustment.avgAbsError = alpha * absError + (1 - alpha) * adjustment.avgAbsError;
      adjustment.hitRate = alpha * (directionCorrect ? 1 : 0) + (1 - alpha) * adjustment.hitRate;
    }
    
    adjustment.sampleCount++;
    adjustment.lastUpdated = new Date();
    
    // Recalcular factores si hay suficientes muestras
    if (adjustment.sampleCount >= AUTO_ADJUST_THRESHOLDS.minSamples) {
      if (adjustment.avgAbsError > AUTO_ADJUST_THRESHOLDS.significantError) {
        const avgAbsPredicted = Math.abs(adjustment.avgPredictedChange);
        const avgAbsActual = Math.abs(adjustment.avgActualChange);
        
        if (avgAbsPredicted > 0) {
          const optimalScale = avgAbsActual / avgAbsPredicted;
          adjustment.magnitudeScale = 0.7 * adjustment.magnitudeScale + 0.3 * optimalScale;
          adjustment.magnitudeScale = Math.max(0.3, Math.min(1.0, adjustment.magnitudeScale));
        }
        
        if (Math.abs(adjustment.avgError) > 1.0) {
          adjustment.directionalBias = -adjustment.avgError / 100;
          adjustment.directionalBias = Math.max(-0.05, Math.min(0.05, adjustment.directionalBias));
        }
        
        logger.info(`[AssetAdjust] ${symbol}: Auto-adjusted scale=${adjustment.magnitudeScale.toFixed(2)}`);
      }
      
      if (adjustment.hitRate < AUTO_ADJUST_THRESHOLDS.lowHitRate) {
        adjustment.confidenceScale = Math.max(0.6, adjustment.hitRate + 0.15);
      }
    }
    
    // Guardar en cache y DB
    learnedAdjustments.set(symbol, adjustment);
    
    try {
      await prisma.assetAdjustment.upsert({
        where: { symbol },
        create: {
          symbol,
          magnitudeScale: adjustment.magnitudeScale,
          directionalBias: adjustment.directionalBias,
          confidenceScale: adjustment.confidenceScale,
          sampleCount: adjustment.sampleCount,
          avgPredictedChange: adjustment.avgPredictedChange,
          avgActualChange: adjustment.avgActualChange,
          avgError: adjustment.avgError,
          avgAbsError: adjustment.avgAbsError,
          hitRate: adjustment.hitRate,
          reason: adjustment.reason,
        },
        update: {
          magnitudeScale: adjustment.magnitudeScale,
          directionalBias: adjustment.directionalBias,
          confidenceScale: adjustment.confidenceScale,
          sampleCount: adjustment.sampleCount,
          avgPredictedChange: adjustment.avgPredictedChange,
          avgActualChange: adjustment.avgActualChange,
          avgError: adjustment.avgError,
          avgAbsError: adjustment.avgAbsError,
          hitRate: adjustment.hitRate,
          reason: adjustment.reason,
        },
      });
    } catch (error) {
      logger.error('[AssetAdjust] Error saving adjustment:', error);
    }
  },

  /**
   * Obtiene estadísticas de un activo
   */
  getStats(symbol: string): {
    hasData: boolean;
    sampleCount: number;
    avgError: number;
    hitRate: number;
    magnitudeScale: number;
  } | null {
    const adjustment = learnedAdjustments.get(symbol);
    if (adjustment && adjustment.sampleCount > 0) {
      return {
        hasData: true,
        sampleCount: adjustment.sampleCount,
        avgError: adjustment.avgError,
        hitRate: adjustment.hitRate,
        magnitudeScale: adjustment.magnitudeScale,
      };
    }
    
    const predefined = PREDEFINED_ADJUSTMENTS[symbol];
    if (predefined) {
      return {
        hasData: false,
        sampleCount: 0,
        avgError: 0,
        hitRate: 0,
        magnitudeScale: predefined.magnitudeScale ?? 1.0,
      };
    }
    
    return null;
  },

  /**
   * Lista todos los activos con ajustes
   */
  listAdjustedAssets(): string[] {
    const symbols = new Set<string>();
    
    for (const symbol of Object.keys(PREDEFINED_ADJUSTMENTS)) {
      symbols.add(symbol);
    }
    
    for (const symbol of learnedAdjustments.keys()) {
      symbols.add(symbol);
    }
    
    return Array.from(symbols);
  },
};
