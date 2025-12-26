/**
 * Servicio de Ajustes por Activo
 * 
 * Permite aplicar correcciones específicas a activos problemáticos basándose en:
 * 1. Historial de errores de predicción
 * 2. Características conocidas del activo (alta volatilidad, comportamiento errático)
 * 3. Ajustes manuales para activos que consistentemente fallan
 * 
 * Problema que resuelve:
 * - TSLA siempre predice +4% pero raramente sube tanto
 * - Algunos activos tienen patrones que el modelo no captura bien
 * - Permite "domesticar" predicciones exageradas
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Clave para guardar ajustes aprendidos
const ASSET_ADJUSTMENTS_KEY = 'asset-adjustments-v1';

// Interfaz para ajustes de un activo
export interface AssetAdjustment {
  symbol: string;
  
  // Factor de escala para el cambio predicho (1.0 = sin cambio, 0.5 = reducir a la mitad)
  magnitudeScale: number;
  
  // Sesgo direccional (-0.5 a +0.5, se añade al cambio final)
  // Negativo = tiende a predecir demasiado alcista
  // Positivo = tiende a predecir demasiado bajista
  directionalBias: number;
  
  // Factor de confianza (0.5 a 1.0, multiplica la confianza)
  // Menor = predicciones menos confiables para este activo
  confidenceScale: number;
  
  // Estadísticas de aprendizaje
  sampleCount: number;
  avgPredictedChange: number;
  avgActualChange: number;
  avgError: number;  // predicted - actual
  avgAbsError: number;
  hitRate: number;   // % de veces que acertó dirección
  
  // Última actualización
  lastUpdated: string;
  
  // Razón del ajuste
  reason: 'auto_learned' | 'manual' | 'volatility_adjustment';
}

// Ajustes predefinidos para activos conocidos problemáticos
const PREDEFINED_ADJUSTMENTS: Record<string, Partial<AssetAdjustment>> = {
  // Tesla: Alta volatilidad, tiende a predecir movimientos demasiado grandes
  'TSLA': {
    magnitudeScale: 0.55,      // Reducir predicciones a 55% de lo calculado
    directionalBias: -0.005,   // Ligero sesgo hacia menos alcista (-0.5%)
    confidenceScale: 0.85,     // Reducir confianza 15%
    reason: 'manual',
  },
  
  // Nvidia: Similar a Tesla, muy volátil pero predicciones exageradas
  'NVDA': {
    magnitudeScale: 0.60,
    directionalBias: -0.003,
    confidenceScale: 0.88,
    reason: 'manual',
  },
  
  // AMD: Muy correlacionado con NVDA, similar comportamiento
  'AMD': {
    magnitudeScale: 0.65,
    directionalBias: -0.002,
    confidenceScale: 0.90,
    reason: 'manual',
  },
  
  // Bitcoin: Extremadamente volátil
  'BTC-USD': {
    magnitudeScale: 0.70,
    directionalBias: 0,
    confidenceScale: 0.80,
    reason: 'volatility_adjustment',
  },
  
  // Ethereum: Similar a Bitcoin
  'ETH-USD': {
    magnitudeScale: 0.70,
    directionalBias: 0,
    confidenceScale: 0.80,
    reason: 'volatility_adjustment',
  },
  
  // Meme stocks / High volatility
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
  
  // Palantir: Tech volátil
  'PLTR': {
    magnitudeScale: 0.60,
    directionalBias: -0.002,
    confidenceScale: 0.85,
    reason: 'manual',
  },
  
  // Coinbase: Muy correlacionado con crypto
  'COIN': {
    magnitudeScale: 0.60,
    directionalBias: 0,
    confidenceScale: 0.75,
    reason: 'volatility_adjustment',
  },
  
  // MicroStrategy: Básicamente un proxy de Bitcoin
  'MSTR': {
    magnitudeScale: 0.55,
    directionalBias: 0,
    confidenceScale: 0.75,
    reason: 'volatility_adjustment',
  },
};

// Umbrales para auto-ajuste
const AUTO_ADJUST_THRESHOLDS = {
  minSamples: 5,              // Mínimo de predicciones para empezar a ajustar
  significantError: 2.0,      // Error promedio > 2% = significativo
  extremeError: 4.0,          // Error promedio > 4% = muy problemático
  lowHitRate: 0.45,           // Hit rate < 45% = hay que ajustar
};

class AssetAdjustmentService {
  private adjustments: Map<string, AssetAdjustment> = new Map();
  private initialized: boolean = false;
  
  /**
   * Inicializa el servicio cargando ajustes guardados
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const saved = await AsyncStorage.getItem(ASSET_ADJUSTMENTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, AssetAdjustment>;
        for (const [symbol, adjustment] of Object.entries(parsed)) {
          this.adjustments.set(symbol, adjustment);
        }
        console.log(`[AssetAdjust] Cargados ${this.adjustments.size} ajustes guardados`);
      }
    } catch (error) {
      console.warn('[AssetAdjust] Error cargando ajustes:', error);
    }
    
    this.initialized = true;
  }
  
  /**
   * Guarda los ajustes en AsyncStorage
   */
  private async saveAdjustments(): Promise<void> {
    try {
      const obj: Record<string, AssetAdjustment> = {};
      for (const [symbol, adjustment] of this.adjustments) {
        obj[symbol] = adjustment;
      }
      await AsyncStorage.setItem(ASSET_ADJUSTMENTS_KEY, JSON.stringify(obj));
    } catch (error) {
      console.warn('[AssetAdjust] Error guardando ajustes:', error);
    }
  }
  
  /**
   * Obtiene el ajuste para un activo (combinando predefinido + aprendido)
   */
  getAdjustment(symbol: string): AssetAdjustment | null {
    // 1. Buscar ajuste aprendido
    const learned = this.adjustments.get(symbol);
    
    // 2. Buscar ajuste predefinido
    const predefined = PREDEFINED_ADJUSTMENTS[symbol];
    
    // 3. Combinar (aprendido tiene prioridad si tiene suficientes muestras)
    if (learned && learned.sampleCount >= AUTO_ADJUST_THRESHOLDS.minSamples) {
      // Usar aprendido, pero limitar los valores extremos
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
        lastUpdated: new Date().toISOString(),
        reason: predefined.reason ?? 'manual',
      };
    }
    
    // 5. Sin ajuste
    return null;
  }
  
  /**
   * Aplica ajustes a una predicción
   */
  applyAdjustment(
    symbol: string,
    predictedChange: number,
    confidence: number
  ): { adjustedChange: number; adjustedConfidence: number; wasAdjusted: boolean; adjustment: AssetAdjustment | null } {
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
    
    // Aplicar sesgo direccional
    adjustedChange += adjustment.directionalBias * 100; // Convertir a porcentaje
    
    // Aplicar escala de confianza
    const adjustedConfidence = Math.round(confidence * adjustment.confidenceScale);
    
    console.log(`[AssetAdjust] ${symbol}: ${predictedChange.toFixed(2)}% → ${adjustedChange.toFixed(2)}% (scale: ${adjustment.magnitudeScale}, bias: ${adjustment.directionalBias})`);
    console.log(`[AssetAdjust] ${symbol}: Confianza ${confidence}% → ${adjustedConfidence}% (reason: ${adjustment.reason})`);
    
    return {
      adjustedChange,
      adjustedConfidence,
      wasAdjusted: true,
      adjustment,
    };
  }
  
  /**
   * Actualiza el ajuste basándose en una nueva predicción verificada
   */
  async updateFromVerification(
    symbol: string,
    predictedChange: number,
    actualChange: number,
    directionCorrect: boolean
  ): Promise<void> {
    await this.initialize();
    
    // Obtener ajuste actual o crear uno nuevo
    let adjustment = this.adjustments.get(symbol);
    
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
        lastUpdated: new Date().toISOString(),
        reason: 'auto_learned',
      };
    }
    
    // Actualizar estadísticas con media móvil exponencial
    const alpha = 0.2; // Factor de suavizado (más peso a nuevas observaciones)
    const error = predictedChange - actualChange;
    const absError = Math.abs(error);
    
    if (adjustment.sampleCount === 0) {
      // Primera muestra
      adjustment.avgPredictedChange = predictedChange;
      adjustment.avgActualChange = actualChange;
      adjustment.avgError = error;
      adjustment.avgAbsError = absError;
      adjustment.hitRate = directionCorrect ? 1 : 0;
    } else {
      // Actualización EMA
      adjustment.avgPredictedChange = alpha * predictedChange + (1 - alpha) * adjustment.avgPredictedChange;
      adjustment.avgActualChange = alpha * actualChange + (1 - alpha) * adjustment.avgActualChange;
      adjustment.avgError = alpha * error + (1 - alpha) * adjustment.avgError;
      adjustment.avgAbsError = alpha * absError + (1 - alpha) * adjustment.avgAbsError;
      adjustment.hitRate = alpha * (directionCorrect ? 1 : 0) + (1 - alpha) * adjustment.hitRate;
    }
    
    adjustment.sampleCount++;
    adjustment.lastUpdated = new Date().toISOString();
    
    // Recalcular factores de ajuste si hay suficientes muestras
    if (adjustment.sampleCount >= AUTO_ADJUST_THRESHOLDS.minSamples) {
      // Si las predicciones son consistentemente demasiado grandes, reducir magnitud
      if (adjustment.avgAbsError > AUTO_ADJUST_THRESHOLDS.significantError) {
        // Calcular ratio de predicción vs realidad
        const avgAbsPredicted = Math.abs(adjustment.avgPredictedChange);
        const avgAbsActual = Math.abs(adjustment.avgActualChange);
        
        if (avgAbsPredicted > 0) {
          // Nueva escala = promedio real / promedio predicho
          const optimalScale = avgAbsActual / avgAbsPredicted;
          
          // Suavizar el cambio (no saltar directamente)
          adjustment.magnitudeScale = 0.7 * adjustment.magnitudeScale + 0.3 * optimalScale;
          adjustment.magnitudeScale = Math.max(0.3, Math.min(1.0, adjustment.magnitudeScale));
        }
        
        // Si hay sesgo consistente (siempre predice más alto/bajo)
        if (Math.abs(adjustment.avgError) > 1.0) {
          // Sesgo negativo = predicciones demasiado alcistas
          adjustment.directionalBias = -adjustment.avgError / 100;
          adjustment.directionalBias = Math.max(-0.05, Math.min(0.05, adjustment.directionalBias));
        }
        
        console.log(`[AssetAdjust] ${symbol}: Auto-ajuste actualizado - scale: ${adjustment.magnitudeScale.toFixed(2)}, bias: ${adjustment.directionalBias.toFixed(4)}`);
      }
      
      // Si el hit rate es bajo, reducir confianza
      if (adjustment.hitRate < AUTO_ADJUST_THRESHOLDS.lowHitRate) {
        adjustment.confidenceScale = Math.max(0.6, adjustment.hitRate + 0.15);
        console.log(`[AssetAdjust] ${symbol}: Hit rate bajo (${(adjustment.hitRate * 100).toFixed(0)}%), reduciendo confianza a ${(adjustment.confidenceScale * 100).toFixed(0)}%`);
      }
    }
    
    // Guardar
    this.adjustments.set(symbol, adjustment);
    await this.saveAdjustments();
  }
  
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
    const adjustment = this.adjustments.get(symbol);
    if (!adjustment || adjustment.sampleCount === 0) {
      // Verificar si hay predefinido
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
    }
    
    return {
      hasData: true,
      sampleCount: adjustment.sampleCount,
      avgError: adjustment.avgError,
      hitRate: adjustment.hitRate,
      magnitudeScale: adjustment.magnitudeScale,
    };
  }
  
  /**
   * Lista todos los activos con ajustes
   */
  listAdjustedAssets(): string[] {
    const symbols = new Set<string>();
    
    // Predefinidos
    for (const symbol of Object.keys(PREDEFINED_ADJUSTMENTS)) {
      symbols.add(symbol);
    }
    
    // Aprendidos
    for (const symbol of this.adjustments.keys()) {
      symbols.add(symbol);
    }
    
    return Array.from(symbols);
  }
  
  /**
   * Establece un ajuste manual
   */
  async setManualAdjustment(
    symbol: string,
    magnitudeScale: number,
    directionalBias: number = 0,
    confidenceScale: number = 1.0
  ): Promise<void> {
    await this.initialize();
    
    const existing = this.adjustments.get(symbol);
    
    const adjustment: AssetAdjustment = {
      symbol,
      magnitudeScale: Math.max(0.3, Math.min(1.0, magnitudeScale)),
      directionalBias: Math.max(-0.05, Math.min(0.05, directionalBias)),
      confidenceScale: Math.max(0.5, Math.min(1.0, confidenceScale)),
      sampleCount: existing?.sampleCount ?? 0,
      avgPredictedChange: existing?.avgPredictedChange ?? 0,
      avgActualChange: existing?.avgActualChange ?? 0,
      avgError: existing?.avgError ?? 0,
      avgAbsError: existing?.avgAbsError ?? 0,
      hitRate: existing?.hitRate ?? 0,
      lastUpdated: new Date().toISOString(),
      reason: 'manual',
    };
    
    this.adjustments.set(symbol, adjustment);
    await this.saveAdjustments();
    
    console.log(`[AssetAdjust] ${symbol}: Ajuste manual establecido - scale: ${magnitudeScale}, bias: ${directionalBias}, conf: ${confidenceScale}`);
  }
  
  /**
   * Resetea el ajuste de un activo
   */
  async resetAdjustment(symbol: string): Promise<void> {
    this.adjustments.delete(symbol);
    await this.saveAdjustments();
    console.log(`[AssetAdjust] ${symbol}: Ajuste reseteado`);
  }
}

export const assetAdjustmentService = new AssetAdjustmentService();
