/**
 * Servicio de Automatización ML
 * Se encarga de verificar predicciones automáticamente y
 * entrenar el modelo cuando hay suficientes datos.
 * 
 * TODO EL PROCESO ES 100% AUTOMÁTICO - NO REQUIERE INTERVENCIÓN
 * 
 * El entrenamiento se hace:
 * 1. En TypeScript (dentro de la app)
 * 2. Enviando datos al servidor Python local (si está corriendo)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { predictionTrackingService, TrackedPrediction } from './prediction-tracking-service';
import { weightOptimizerService } from './weight-optimizer-service';

// Claves de almacenamiento
const ML_SYNC_STATUS_KEY = 'ml-sync-status';
const ML_EXPORT_KEY = 'ml-export-data';
const LEARNED_WEIGHTS_KEY = 'learned-weights';

// Servidor Python local
const PYTHON_SERVER_URL = 'http://localhost:8765';

// Configuración
const AUTO_VERIFY_INTERVAL_HOURS = 6; // Verificar cada 6 horas
const MIN_PREDICTIONS_FOR_TRAINING = 10; // Mínimo para entrenar
const TRAINING_INTERVAL_HOURS = 24; // Entrenar máximo cada 24 horas
const MIN_NEW_PREDICTIONS_TO_RETRAIN = 3; // Mínimo de nuevas para re-entrenar

export interface MLSyncStatus {
  lastVerification: string | null;
  lastTraining: string | null;
  predictionsVerified: number;
  lastTrainingSamples: number;
  weightsVersion: number;
  isTraining: boolean;
  pythonServerAvailable: boolean;
}

class MLAutomationService {
  private isProcessing = false;
  private status: MLSyncStatus = {
    lastVerification: null,
    lastTraining: null,
    predictionsVerified: 0,
    lastTrainingSamples: 0,
    weightsVersion: 0,
    isTraining: false,
    pythonServerAvailable: false,
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
   * Verifica si debemos entrenar el modelo
   */
  private shouldTrain(verifiedCount: number): boolean {
    // Necesitamos mínimo de predicciones
    if (verifiedCount < MIN_PREDICTIONS_FOR_TRAINING) return false;
    
    // Si nunca hemos entrenado, hacerlo
    if (!this.status.lastTraining) return true;
    
    // Si hay nuevas predicciones desde el último entrenamiento
    const newPredictions = verifiedCount - this.status.lastTrainingSamples;
    if (newPredictions >= MIN_NEW_PREDICTIONS_TO_RETRAIN) {
      const lastTraining = new Date(this.status.lastTraining);
      const now = new Date();
      const hoursSinceLastTraining = (now.getTime() - lastTraining.getTime()) / (1000 * 60 * 60);
      
      // Solo entrenar si pasaron suficientes horas
      return hoursSinceLastTraining >= TRAINING_INTERVAL_HOURS;
    }
    
    return false;
  }
  
  /**
   * Ejecuta el ciclo completo de automatización ML
   * - Verifica predicciones pendientes que ya cumplieron su fecha
   * - Entrena el modelo si hay suficientes predicciones nuevas
   * - TODO ES AUTOMÁTICO
   */
  async runAutomation(): Promise<{
    verified: number;
    trained: boolean;
    message: string;
  }> {
    if (this.isProcessing) {
      return { verified: 0, trained: false, message: 'Proceso en curso...' };
    }
    
    this.isProcessing = true;
    await this.loadStatus();
    
    let verifiedCount = 0;
    let trained = false;
    const messages: string[] = [];
    
    try {
      // 1. Verificar predicciones pendientes
      if (this.shouldVerify()) {
        console.log('[ML Auto] 🔍 Verificando predicciones pendientes...');
        const verified = await predictionTrackingService.verifyPendingPredictions();
        verifiedCount = verified.length;
        
        this.status.lastVerification = new Date().toISOString();
        this.status.predictionsVerified += verifiedCount;
        
        if (verifiedCount > 0) {
          messages.push(`✅ ${verifiedCount} predicción(es) verificada(s)`);
          console.log(`[ML Auto] Verificadas ${verifiedCount} predicciones`);
        }
      }
      
      // 2. Obtener todas las predicciones verificadas
      const allPredictions = await predictionTrackingService.getAllPredictions();
      const verifiedPredictions = allPredictions.filter(p => p.status === 'verified');
      
      // 3. Exportar datos para Python (siempre que haya verificadas)
      if (verifiedPredictions.length > 0) {
        await this.exportForPython(verifiedPredictions);
      }
      
      // 4. Entrenar modelo si corresponde
      if (this.shouldTrain(verifiedPredictions.length)) {
        console.log('[ML Auto] 🧠 Iniciando entrenamiento automático...');
        this.status.isTraining = true;
        await this.saveStatus();
        
        const result = await weightOptimizerService.train(verifiedPredictions);
        
        if (result) {
          trained = true;
          this.status.lastTraining = new Date().toISOString();
          this.status.lastTrainingSamples = verifiedPredictions.length;
          this.status.weightsVersion++;
          messages.push(`🧠 Modelo entrenado (${(result.improvement * 100).toFixed(1)}% mejora)`);
        }
        
        this.status.isTraining = false;
      }
      
      // 5. Limpiar predicciones antiguas (cada verificación)
      if (verifiedCount > 0) {
        await predictionTrackingService.cleanOldPredictions(90);
      }
      
      await this.saveStatus();
      
    } catch (error) {
      console.error('[ML Auto] Error en automatización:', error);
      messages.push('⚠️ Error en proceso de automatización');
      this.status.isTraining = false;
    } finally {
      this.isProcessing = false;
    }
    
    return {
      verified: verifiedCount,
      trained,
      message: messages.length > 0 ? messages.join('\n') : 'Sin cambios',
    };
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
   * Exporta datos para que Python los pueda leer
   */
  private async exportForPython(predictions: TrackedPrediction[]): Promise<void> {
    try {
      const exportData = {
        version: '2.0',
        exported_at: new Date().toISOString(),
        verified_count: predictions.length,
        predictions: predictions.map(p => ({
          id: p.id,
          symbol: p.symbol,
          asset_type: p.assetType,
          timeframe_days: p.timeframeDays,
          timeframe: p.timeframeDays <= 1 ? 'intraday' : p.timeframeDays <= 7 ? 'swing' : 'long',
          predicted_direction: p.predictedDirection,
          predicted_change: p.predictedChange,
          predicted_price_min: p.predictedPriceMin,
          predicted_price_max: p.predictedPriceMax,
          confidence: p.confidence,
          price_at_prediction: p.priceAtPrediction,
          factor_scores: p.factorScores || {},
          factor_weights: p.factorWeightsUsed || {},
          actual_price: p.actualPrice,
          actual_change: p.actualChange,
          actual_direction: p.actualDirection,
          direction_correct: p.directionCorrect,
          price_error: p.priceError,
          within_range: p.withinRange,
          prediction_date: p.predictionDate,
          verified_at: p.verifiedAt,
        })),
      };
      
      // Guardar en AsyncStorage para acceso interno y TypeScript optimizer
      await AsyncStorage.setItem(ML_EXPORT_KEY, JSON.stringify(exportData));
      console.log(`[ML Auto] 📤 Datos exportados (${predictions.length} predicciones)`);
      
      // Intentar enviar al servidor Python local
      await this.sendToPythonServer(exportData);
      
    } catch (error) {
      console.error('[ML Auto] Error exportando para Python:', error);
    }
  }
  
  /**
   * Envía datos al servidor Python local y solicita entrenamiento
   */
  private async sendToPythonServer(data: object): Promise<void> {
    try {
      // Enviar predicciones
      const response = await fetch(`${PYTHON_SERVER_URL}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {
        console.log('[ML Auto] 🐍 Datos enviados al servidor Python');
        this.status.pythonServerAvailable = true;
        
        // Solicitar entrenamiento
        const trainResponse = await fetch(`${PYTHON_SERVER_URL}/train`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (trainResponse.ok) {
          const result = await trainResponse.json();
          if (result.success) {
            console.log('[ML Auto] 🐍 Entrenamiento Python completado');
            
            // Obtener pesos actualizados del servidor
            await this.fetchWeightsFromPython();
          }
        }
      }
    } catch (error) {
      // El servidor Python no está corriendo - no es un error crítico
      this.status.pythonServerAvailable = false;
      console.log('[ML Auto] ℹ️ Servidor Python no disponible (usando TypeScript)');
    }
  }
  
  /**
   * Obtiene los pesos entrenados del servidor Python
   */
  private async fetchWeightsFromPython(): Promise<void> {
    try {
      const response = await fetch(`${PYTHON_SERVER_URL}/weights`);
      if (response.ok) {
        const weightsData = await response.json();
        if (weightsData.weights) {
          await AsyncStorage.setItem(LEARNED_WEIGHTS_KEY, JSON.stringify(weightsData));
          console.log('[ML Auto] 🐍 Pesos de Python cargados');
        }
      }
    } catch (error) {
      // Silencioso - el servidor no está disponible
    }
  }
  
  /**
   * Obtiene los datos exportados como JSON string
   */
  async getExportedData(): Promise<string> {
    const data = await AsyncStorage.getItem(ML_EXPORT_KEY);
    return data || '{}';
  }
  
  /**
   * Fuerza una verificación y entrenamiento inmediato
   */
  async forceTraining(): Promise<{ verified: number; trained: boolean }> {
    // Verificar predicciones
    const verified = await predictionTrackingService.verifyPendingPredictions();
    
    this.status.lastVerification = new Date().toISOString();
    this.status.predictionsVerified += verified.length;
    
    // Obtener todas las verificadas
    const allPredictions = await predictionTrackingService.getAllPredictions();
    const verifiedPredictions = allPredictions.filter(p => p.status === 'verified');
    
    // Exportar para Python
    if (verifiedPredictions.length > 0) {
      await this.exportForPython(verifiedPredictions);
    }
    
    // Entrenar
    let trained = false;
    if (verifiedPredictions.length >= MIN_PREDICTIONS_FOR_TRAINING) {
      const result = await weightOptimizerService.train(verifiedPredictions);
      if (result) {
        trained = true;
        this.status.lastTraining = new Date().toISOString();
        this.status.lastTrainingSamples = verifiedPredictions.length;
        this.status.weightsVersion++;
      }
    }
    
    await this.saveStatus();
    
    return { verified: verified.length, trained };
  }
  
  /**
   * Obtiene el historial de entrenamientos
   */
  async getTrainingHistory() {
    return weightOptimizerService.getHistory();
  }
}

export const mlAutomationService = new MLAutomationService();

// Función para iniciar automatización en background
export function startMLAutomation(): void {
  // Ejecutar inmediatamente al cargar la app
  mlAutomationService.runAutomation().then(result => {
    if (result.verified > 0 || result.trained) {
      console.log('[ML Auto]', result.message);
    }
  });
  
  // Configurar intervalo para verificaciones periódicas (cada hora)
  setInterval(() => {
    mlAutomationService.runAutomation();
  }, 60 * 60 * 1000); // 1 hora
}
