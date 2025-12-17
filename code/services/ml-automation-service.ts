/**
 * Servicio de Automatización ML
 * Se encarga de verificar predicciones automáticamente y
 * sincronizar los datos con el sistema de Python para entrenamiento
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { predictionTrackingService, TrackedPrediction } from './prediction-tracking-service';

// Claves de almacenamiento
const LAST_VERIFICATION_KEY = 'ml-last-verification';
const LAST_EXPORT_KEY = 'ml-last-export';
const ML_SYNC_STATUS_KEY = 'ml-sync-status';
const ML_TRAINING_DATA_KEY = 'ml-training-data';
const LEARNED_WEIGHTS_KEY = 'learned-weights';

// Configuración
const AUTO_VERIFY_INTERVAL_HOURS = 6; // Verificar cada 6 horas
const MIN_PREDICTIONS_FOR_EXPORT = 10; // Mínimo para exportar
const EXPORT_INTERVAL_HOURS = 24; // Exportar máximo cada 24 horas

export interface MLSyncStatus {
  lastVerification: string | null;
  lastExport: string | null;
  predictionsVerified: number;
  predictionsExported: number;
  weightsVersion: number;
  isTraining: boolean;
}

/**
 * Convierte timeframeDays a categoría para ML
 */
function getTimeframeCategory(timeframeDays: number): 'intraday' | 'swing' | 'long' {
  if (timeframeDays <= 1) return 'intraday';
  if (timeframeDays <= 7) return 'swing';
  return 'long';
}

/**
 * Prepara las predicciones verificadas en formato para Python ML
 */
function formatForPythonML(predictions: TrackedPrediction[]): object {
  return predictions.map(p => ({
    // Identificación
    id: p.id,
    symbol: p.symbol,
    asset_type: p.assetType,
    
    // Timeframe
    timeframe_days: p.timeframeDays,
    timeframe: getTimeframeCategory(p.timeframeDays),
    
    // Predicción
    predicted_direction: p.predictedDirection,
    predicted_change: p.predictedChange,
    predicted_price_min: p.predictedPriceMin,
    predicted_price_max: p.predictedPriceMax,
    confidence: p.confidence,
    price_at_prediction: p.priceAtPrediction,
    
    // Factor scores (renombrados para Python)
    factor_scores: p.factorScores || {},
    factor_weights: p.factorWeightsUsed || {},
    
    // Resultados reales
    actual_price: p.actualPrice,
    actual_change: p.actualChange,
    actual_direction: p.actualDirection,
    
    // Métricas de error
    direction_correct: p.directionCorrect,
    price_error: p.priceError,
    within_range: p.withinRange,
    
    // Timestamps
    prediction_date: p.predictionDate,
    verified_at: p.verifiedAt,
  }));
}

class MLAutomationService {
  private isProcessing = false;
  private status: MLSyncStatus = {
    lastVerification: null,
    lastExport: null,
    predictionsVerified: 0,
    predictionsExported: 0,
    weightsVersion: 0,
    isTraining: false,
  };
  
  /**
   * Carga el estado desde AsyncStorage
   */
  async loadStatus(): Promise<MLSyncStatus> {
    try {
      const data = await AsyncStorage.getItem(ML_SYNC_STATUS_KEY);
      if (data) {
        this.status = JSON.parse(data);
      }
    } catch (error) {
      console.error('[ML Auto] Error cargando estado:', error);
    }
    return this.status;
  }
  
  /**
   * Guarda el estado en AsyncStorage
   */
  private async saveStatus(): Promise<void> {
    try {
      await AsyncStorage.setItem(ML_SYNC_STATUS_KEY, JSON.stringify(this.status));
    } catch (error) {
      console.error('[ML Auto] Error guardando estado:', error);
    }
  }
  
  /**
   * Verifica si ya pasó el intervalo desde la última verificación
   */
  private shouldVerify(): boolean {
    if (!this.status.lastVerification) return true;
    
    const lastCheck = new Date(this.status.lastVerification);
    const now = new Date();
    const hoursSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLastCheck >= AUTO_VERIFY_INTERVAL_HOURS;
  }
  
  /**
   * Verifica si debemos exportar datos para entrenamiento
   */
  private shouldExport(verifiedCount: number): boolean {
    // Necesitamos mínimo de predicciones
    if (verifiedCount < MIN_PREDICTIONS_FOR_EXPORT) return false;
    
    // Si nunca hemos exportado, hacerlo
    if (!this.status.lastExport) return true;
    
    // Si hay nuevas predicciones desde el último export
    if (verifiedCount > this.status.predictionsExported) {
      const lastExport = new Date(this.status.lastExport);
      const now = new Date();
      const hoursSinceLastExport = (now.getTime() - lastExport.getTime()) / (1000 * 60 * 60);
      
      // Solo exportar si pasaron suficientes horas
      return hoursSinceLastExport >= EXPORT_INTERVAL_HOURS;
    }
    
    return false;
  }
  
  /**
   * Ejecuta el ciclo completo de automatización ML
   * - Verifica predicciones pendientes que ya cumplieron su fecha
   * - Exporta datos si hay suficientes predicciones nuevas
   * - Retorna resumen de lo que se hizo
   */
  async runAutomation(): Promise<{
    verified: number;
    exported: boolean;
    message: string;
  }> {
    if (this.isProcessing) {
      return { verified: 0, exported: false, message: 'Proceso en curso...' };
    }
    
    this.isProcessing = true;
    await this.loadStatus();
    
    let verifiedCount = 0;
    let exported = false;
    const messages: string[] = [];
    
    try {
      // 1. Verificar predicciones pendientes
      if (this.shouldVerify()) {
        console.log('[ML Auto] Verificando predicciones pendientes...');
        const verified = await predictionTrackingService.verifyPendingPredictions();
        verifiedCount = verified.length;
        
        this.status.lastVerification = new Date().toISOString();
        this.status.predictionsVerified += verifiedCount;
        
        if (verifiedCount > 0) {
          messages.push(`✅ ${verifiedCount} predicción(es) verificada(s)`);
          console.log(`[ML Auto] Verificadas ${verifiedCount} predicciones`);
        }
      }
      
      // 2. Obtener total de predicciones verificadas
      const stats = await predictionTrackingService.getStats();
      
      // 3. Exportar datos si corresponde
      if (this.shouldExport(stats.verified)) {
        console.log('[ML Auto] Exportando datos para ML...');
        exported = await this.exportTrainingData();
        
        if (exported) {
          this.status.lastExport = new Date().toISOString();
          this.status.predictionsExported = stats.verified;
          messages.push(`📤 Datos exportados para entrenamiento (${stats.verified} predicciones)`);
        }
      }
      
      // 4. Limpiar predicciones antiguas (cada verificación)
      if (verifiedCount > 0) {
        await predictionTrackingService.cleanOldPredictions(90);
      }
      
      await this.saveStatus();
      
    } catch (error) {
      console.error('[ML Auto] Error en automatización:', error);
      messages.push('⚠️ Error en proceso de automatización');
    } finally {
      this.isProcessing = false;
    }
    
    return {
      verified: verifiedCount,
      exported,
      message: messages.length > 0 ? messages.join('\n') : 'Sin cambios',
    };
  }
  
  /**
   * Exporta los datos de entrenamiento a un archivo JSON
   * que el sistema Python puede leer
   */
  async exportTrainingData(): Promise<boolean> {
    try {
      const allPredictions = await predictionTrackingService.getAllPredictions();
      const verified = allPredictions.filter(p => p.status === 'verified');
      
      if (verified.length === 0) {
        console.log('[ML Auto] No hay predicciones verificadas para exportar');
        return false;
      }
      
      const exportData = {
        version: '2.0',
        exported_at: new Date().toISOString(),
        app_version: '1.0.0',
        total_predictions: allPredictions.length,
        verified_count: verified.length,
        predictions: formatForPythonML(verified),
      };
      
      // Guardar en AsyncStorage (para acceso desde la app)
      await AsyncStorage.setItem(ML_TRAINING_DATA_KEY, JSON.stringify(exportData));
      console.log(`[ML Auto] Datos exportados a AsyncStorage (${verified.length} predicciones)`);
      
      return true;
      
    } catch (error) {
      console.error('[ML Auto] Error exportando datos:', error);
      return false;
    }
  }
  
  /**
   * Obtiene los datos de entrenamiento como string JSON
   * Útil para mostrar en UI o copiar
   */
  async getTrainingDataJSON(): Promise<string> {
    const data = await AsyncStorage.getItem(ML_TRAINING_DATA_KEY);
    return data || '{}';
  }
  
  /**
   * Carga pesos aprendidos desde AsyncStorage
   */
  async loadLearnedWeights(): Promise<Record<string, Record<string, number>> | null> {
    try {
      const stored = await AsyncStorage.getItem(LEARNED_WEIGHTS_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.weights && data.training_samples > 0) {
          console.log(`[ML Auto] Pesos aprendidos cargados (${data.training_samples} muestras)`);
          return data.weights;
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('[ML Auto] Error cargando pesos:', error);
      return null;
    }
  }
  
  /**
   * Guarda pesos aprendidos (llamado después del entrenamiento)
   */
  async saveLearnedWeights(
    weights: Record<string, Record<string, number>>,
    trainingSamples: number
  ): Promise<void> {
    try {
      const data = {
        weights,
        training_samples: trainingSamples,
        updated_at: new Date().toISOString(),
        version: this.status.weightsVersion + 1,
      };
      
      await AsyncStorage.setItem(LEARNED_WEIGHTS_KEY, JSON.stringify(data));
      
      this.status.weightsVersion = data.version;
      await this.saveStatus();
      
      console.log(`[ML Auto] Pesos guardados (versión ${data.version})`);
      
    } catch (error) {
      console.error('[ML Auto] Error guardando pesos:', error);
    }
  }
  
  /**
   * Obtiene el estado actual del sistema ML
   */
  async getStatus(): Promise<MLSyncStatus & { stats: any }> {
    await this.loadStatus();
    const stats = await predictionTrackingService.getStats();
    
    return {
      ...this.status,
      stats,
    };
  }
  
  /**
   * Fuerza una verificación inmediata (ignora el intervalo)
   */
  async forceVerification(): Promise<TrackedPrediction[]> {
    const verified = await predictionTrackingService.verifyPendingPredictions();
    
    this.status.lastVerification = new Date().toISOString();
    this.status.predictionsVerified += verified.length;
    await this.saveStatus();
    
    return verified;
  }
  
  /**
   * Fuerza una exportación inmediata
   */
  async forceExport(): Promise<boolean> {
    const success = await this.exportTrainingData();
    
    if (success) {
      const stats = await predictionTrackingService.getStats();
      this.status.lastExport = new Date().toISOString();
      this.status.predictionsExported = stats.verified;
      await this.saveStatus();
    }
    
    return success;
  }
}

export const mlAutomationService = new MLAutomationService();

// Función para iniciar automatización en background
export function startMLAutomation(): void {
  // Ejecutar inmediatamente al cargar la app
  mlAutomationService.runAutomation().then(result => {
    if (result.verified > 0 || result.exported) {
      console.log('[ML Auto]', result.message);
    }
  });
  
  // Configurar intervalo para verificaciones periódicas (cada hora)
  setInterval(() => {
    mlAutomationService.runAutomation();
  }, 60 * 60 * 1000); // 1 hora
}
