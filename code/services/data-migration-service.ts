/**
 * Servicio de Migración de Datos
 * Migra TODOS los datos de AsyncStorage al backend
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api-client';

// Claves de AsyncStorage que necesitan migración
const LEGACY_KEYS = {
  trainingCache: 'training-predictions-cache',
  predictionTracking: 'prediction-tracking',
  predictionsData: 'predictions-data',
  favorites: 'user-favorites',
  learnedWeights: 'learned-weights',
};

// Clave para saber si ya se migró
const MIGRATION_DONE_KEY = 'backend-migration-v2-done';

export interface MigrationResult {
  predictionTracking: { migrated: number; errors: string[] };
  trainingCache: { migrated: number; errors: string[] };
  learnedWeights: { migrated: boolean; error?: string };
  total: number;
}

class DataMigrationService {
  private migrationInProgress = false;

  constructor() {
    // Auto-diagnóstico al inicializar
    this.runDiagnostic();
  }

  /**
   * Ejecutar diagnóstico automático al cargar
   */
  private async runDiagnostic(): Promise<void> {
    console.log('[Migration] ══════════════════════════════════════════');
    console.log('[Migration] 🔍 DIAGNÓSTICO AUTOMÁTICO DE ASYNCSTORAGE');
    console.log('[Migration] ══════════════════════════════════════════');
    
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      console.log('[Migration] Claves encontradas:', allKeys);

      for (const key of allKeys) {
        try {
          const value = await AsyncStorage.getItem(key);
          if (!value) continue;

          const parsed = JSON.parse(value);
          
          if (Array.isArray(parsed)) {
            // Contar verificados
            let verifiedCount = 0;
            let withAccuracy = 0;
            let sample: any = null;
            
            for (const item of parsed.slice(0, 50)) { // Solo primeros 50 para no tardar
              const p = typeof item === 'string' ? JSON.parse(item) : item;
              if (p.verified === true) verifiedCount++;
              if (p.accuracyScore !== undefined) {
                withAccuracy++;
                if (!sample) sample = p;
              }
            }
            
            console.log(`[Migration] 📦 ${key}: Array[${parsed.length}] - verified:${verifiedCount}, withAccuracy:${withAccuracy}`);
            if (sample) {
              console.log(`[Migration]    Sample con accuracy - TODOS LOS CAMPOS:`, JSON.stringify(sample, null, 2));
            }
          } else if (typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed);
            console.log(`[Migration] 📦 ${key}: Object{${keys.length} keys} - ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
            
            // Buscar en valores del objeto
            let verifiedCount = 0;
            let sample: any = null;
            for (const v of Object.values(parsed).slice(0, 20)) {
              if (v && typeof v === 'object') {
                const obj = v as any;
                if (obj.verified === true || obj.accuracyScore !== undefined) {
                  verifiedCount++;
                  if (!sample) sample = obj;
                }
              }
            }
            if (verifiedCount > 0) {
              console.log(`[Migration]    Con datos verificados: ${verifiedCount}`);
              console.log(`[Migration]    Sample:`, sample);
            }
          }
        } catch (e) {
          // No es JSON válido
          console.log(`[Migration] 📦 ${key}: (no JSON)`);
        }
      }
    } catch (error: any) {
      console.error('[Migration] Error en diagnóstico:', error.message);
    }
    
    console.log('[Migration] ══════════════════════════════════════════');
  }

  /**
   * Verificar si ya se hizo la migración
   */
  async isMigrated(): Promise<boolean> {
    const done = await AsyncStorage.getItem(MIGRATION_DONE_KEY);
    return done === 'true';
  }

  /**
   * Marcar migración como completada
   */
  async markMigrated(): Promise<void> {
    await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
  }

  /**
   * Ejecutar migración completa si no se ha hecho
   */
  async runMigrationIfNeeded(): Promise<MigrationResult | null> {
    if (await this.isMigrated()) {
      console.log('[Migration] Ya migrado anteriormente');
      return null;
    }

    if (this.migrationInProgress) {
      console.log('[Migration] Migración ya en progreso');
      return null;
    }

    return this.migrateAll();
  }

  /**
   * Migrar TODOS los datos al backend
   */
  async migrateAll(): Promise<MigrationResult> {
    console.log('[Migration] ═══════════════════════════════════════');
    console.log('[Migration] Iniciando migración completa...');
    console.log('[Migration] ═══════════════════════════════════════');

    this.migrationInProgress = true;

    const result: MigrationResult = {
      predictionTracking: { migrated: 0, errors: [] },
      trainingCache: { migrated: 0, errors: [] },
      learnedWeights: { migrated: false },
      total: 0,
    };

    try {
      // 1. Migrar prediction-tracking (133 predicciones verificadas)
      console.log('[Migration] 1/3 Migrando prediction-tracking...');
      result.predictionTracking = await this.migratePredictionTracking();
      result.total += result.predictionTracking.migrated;

      // 2. Migrar training-predictions-cache
      console.log('[Migration] 2/3 Migrando training-cache...');
      result.trainingCache = await this.migrateTrainingCache();
      result.total += result.trainingCache.migrated;

      // 3. Migrar learned-weights
      console.log('[Migration] 3/3 Migrando learned-weights...');
      result.learnedWeights = await this.migrateLearnedWeights();
      if (result.learnedWeights.migrated) result.total++;

      // Marcar como migrado si hubo éxito
      if (result.total > 0) {
        await this.markMigrated();
        console.log(`[Migration] ✅ Migración completada: ${result.total} items`);
      } else {
        console.log('[Migration] ⚠️ No se migró ningún dato');
      }

    } catch (error: any) {
      console.error('[Migration] ❌ Error en migración:', error.message);
    } finally {
      this.migrationInProgress = false;
    }

    return result;
  }

  /**
   * Migrar prediction-tracking (array de 133 predicciones)
   */
  async migratePredictionTracking(): Promise<{ migrated: number; errors: string[] }> {
    try {
      const rawData = await AsyncStorage.getItem(LEGACY_KEYS.predictionTracking);
      if (!rawData) {
        console.log('[Migration] No hay prediction-tracking');
        return { migrated: 0, errors: [] };
      }

      const predictions = JSON.parse(rawData);
      if (!Array.isArray(predictions) || predictions.length === 0) {
        console.log('[Migration] prediction-tracking vacío');
        return { migrated: 0, errors: [] };
      }

      console.log(`[Migration] Encontradas ${predictions.length} predicciones tracking`);

      // Enviar al backend
      try {
        console.log('[Migration] Enviando al backend...');
        const result = await apiClient.importPredictionsBulk({
          predictions,
          source: 'asyncstorage-migration-prediction-tracking',
        });
        console.log('[Migration] Respuesta backend:', JSON.stringify(result));
        console.log(`[Migration] Importadas ${result.imported}/${result.total} predicciones`);
        return { migrated: result.imported, errors: result.errors || [] };
      } catch (apiError: any) {
        console.error('[Migration] Error API importPredictionsBulk:', apiError.message);
        console.error('[Migration] Stack:', apiError.stack);
        return { migrated: 0, errors: [apiError.message] };
      }

    } catch (error: any) {
      console.error('[Migration] Error migrando prediction-tracking:', error.message);
      return { migrated: 0, errors: [error.message] };
    }
  }

  /**
   * Migrar training-predictions-cache
   */
  async migrateTrainingCache(): Promise<{ migrated: number; errors: string[] }> {
    try {
      const rawData = await AsyncStorage.getItem(LEGACY_KEYS.trainingCache);
      if (!rawData) {
        console.log('[Migration] No hay training-cache');
        return { migrated: 0, errors: [] };
      }

      const parsed = JSON.parse(rawData);
      if (typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
        console.log('[Migration] training-cache vacío');
        return { migrated: 0, errors: [] };
      }

      // Convertir de objeto a array
      const predictions: any[] = [];
      for (const [key, value] of Object.entries(parsed)) {
        const prediction = value as any;
        predictions.push({
          symbol: prediction.symbol,
          timeframe: prediction.timeframe,
          predictedChange: prediction.predictedChange,
          confidence: prediction.confidence,
          direction: prediction.direction,
          currentPrice: prediction.currentPrice,
          targetPrice: prediction.targetPrice,
          analysisData: prediction.analysisData,
          expiresAt: prediction.expiresAt,
        });
      }

      console.log(`[Migration] Encontradas ${predictions.length} predicciones en cache`);

      // Enviar al backend
      try {
        console.log('[Migration] Enviando training cache al backend...');
        const result = await apiClient.importTrainingData({
          predictions,
          source: 'asyncstorage-migration-training-cache',
        });
        console.log('[Migration] Respuesta training:', JSON.stringify(result));
        console.log(`[Migration] Importadas ${result.imported} predicciones de training`);
        return { migrated: result.imported, errors: result.errors || [] };
      } catch (apiError: any) {
        console.error('[Migration] Error API importTrainingData:', apiError.message);
        return { migrated: 0, errors: [apiError.message] };
      }

    } catch (error: any) {
      console.error('[Migration] Error migrando training-cache:', error.message);
      return { migrated: 0, errors: [error.message] };
    }
  }

  /**
   * Migrar learned-weights
   */
  async migrateLearnedWeights(): Promise<{ migrated: boolean; error?: string }> {
    try {
      const rawData = await AsyncStorage.getItem(LEGACY_KEYS.learnedWeights);
      if (!rawData) {
        console.log('[Migration] No hay learned-weights');
        return { migrated: false };
      }

      const legacyWeights = JSON.parse(rawData);
      console.log('[Migration] Encontrados learned-weights');

      // Convertir del formato AsyncStorage al formato del backend
      // AsyncStorage tiene: { version, updated_at, training_samples, weights: { intraday, swing, long }, metadata }
      // Backend espera: { trend, technical, sentiment, news, macro, competitors, forex, institutional, seasonality, financials, expectations, sampleCount, accuracy }
      
      // Usar los pesos de 'intraday' como base (el backend no tiene timeframes)
      const intradayWeights = legacyWeights.weights?.intraday || {};
      
      const backendWeights = {
        trend: intradayWeights.trend ?? 0.2,
        technical: intradayWeights.technical ?? 0.25,
        sentiment: intradayWeights.sentiment ?? 0.15,
        news: intradayWeights.news ?? 0.18,
        macro: intradayWeights.macro ?? 0.04,
        competitors: intradayWeights.competitors ?? 0.04,
        forex: intradayWeights.forex ?? 0.04,
        institutional: intradayWeights.institutional ?? 0.05,
        seasonality: intradayWeights.seasonality ?? 0.02,
        financials: intradayWeights.financials ?? 0.02,
        expectations: intradayWeights.expectations ?? 0.01,
        sampleCount: legacyWeights.training_samples ?? 0,
        accuracy: undefined,
      };

      // Enviar al backend
      try {
        console.log('[Migration] Enviando learned-weights al backend...', backendWeights);
        await apiClient.saveLearnedWeights(backendWeights);
        console.log('[Migration] Learned-weights enviados exitosamente');
      } catch (apiError: any) {
        console.error('[Migration] Error API saveLearnedWeights:', apiError.message);
        return { migrated: false, error: apiError.message };
      }

      console.log('[Migration] Learned-weights migrados');
      return { migrated: true };

    } catch (error: any) {
      console.error('[Migration] Error migrando learned-weights:', error.message);
      return { migrated: false, error: error.message };
    }
  }

  /**
   * Obtener resumen de datos pendientes de migrar
   */
  async getLegacyDataSummary(): Promise<{
    predictionTracking: number;
    trainingCache: number;
    hasLearnedWeights: boolean;
  }> {
    let predictionTracking = 0;
    let trainingCache = 0;
    let hasLearnedWeights = false;

    try {
      const tracking = await AsyncStorage.getItem(LEGACY_KEYS.predictionTracking);
      if (tracking) {
        const parsed = JSON.parse(tracking);
        predictionTracking = Array.isArray(parsed) ? parsed.length : 0;
      }
    } catch {}

    try {
      const cache = await AsyncStorage.getItem(LEGACY_KEYS.trainingCache);
      if (cache) {
        const parsed = JSON.parse(cache);
        trainingCache = typeof parsed === 'object' ? Object.keys(parsed).length : 0;
      }
    } catch {}

    try {
      hasLearnedWeights = (await AsyncStorage.getItem(LEGACY_KEYS.learnedWeights)) !== null;
    } catch {}

    return { predictionTracking, trainingCache, hasLearnedWeights };
  }

  /**
   * Diagnóstico detallado de predicciones en AsyncStorage
   */
  async diagnosePredictions(): Promise<{
    total: number;
    verified: number;
    pending: number;
    sample?: any;
  }> {
    try {
      const tracking = await AsyncStorage.getItem(LEGACY_KEYS.predictionTracking);
      if (!tracking) {
        return { total: 0, verified: 0, pending: 0 };
      }

      const predictions = JSON.parse(tracking);
      if (!Array.isArray(predictions)) {
        return { total: 0, verified: 0, pending: 0 };
      }

      let verified = 0;
      let sample: any = null;

      for (const p of predictions) {
        const parsed = typeof p === 'string' ? JSON.parse(p) : p;
        if (parsed.verified === true) {
          verified++;
          if (!sample) sample = parsed;
        }
      }

      console.log('[Diagnose] Total:', predictions.length);
      console.log('[Diagnose] Verified:', verified);
      console.log('[Diagnose] Pending:', predictions.length - verified);
      if (sample) {
        console.log('[Diagnose] Sample verified prediction:', sample);
      }

      return {
        total: predictions.length,
        verified,
        pending: predictions.length - verified,
        sample,
      };
    } catch (error: any) {
      console.error('[Diagnose] Error:', error.message);
      return { total: 0, verified: 0, pending: 0 };
    }
  }

  /**
   * Explorar todas las claves de AsyncStorage buscando datos verificados
   */
  async exploreAllKeys(): Promise<Record<string, any>> {
    const allKeys = await AsyncStorage.getAllKeys();
    const result: Record<string, any> = {};

    console.log('[Explore] Todas las claves:', allKeys);

    for (const key of allKeys) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (!value) continue;

        const parsed = JSON.parse(value);
        
        // Buscar cualquier dato que tenga verified=true o accuracyScore
        if (Array.isArray(parsed)) {
          const verifiedItems = parsed.filter((item: any) => {
            const p = typeof item === 'string' ? JSON.parse(item) : item;
            return p.verified === true || p.accuracyScore !== undefined;
          });
          if (verifiedItems.length > 0) {
            result[key] = {
              type: 'array',
              total: parsed.length,
              withVerified: verifiedItems.length,
              sample: typeof verifiedItems[0] === 'string' ? JSON.parse(verifiedItems[0]) : verifiedItems[0],
            };
          }
        } else if (typeof parsed === 'object' && parsed !== null) {
          // Para objetos, buscar propiedades que indiquen datos verificados
          const hasVerified = Object.values(parsed).some((v: any) => 
            v && typeof v === 'object' && (v.verified === true || v.accuracyScore !== undefined)
          );
          if (hasVerified) {
            const sample = Object.values(parsed).find((v: any) => 
              v && typeof v === 'object' && (v.verified === true || v.accuracyScore !== undefined)
            );
            result[key] = {
              type: 'object',
              keys: Object.keys(parsed).length,
              sample,
            };
          }
        }
      } catch (e) {
        // Ignorar claves que no sean JSON válido
      }
    }

    console.log('[Explore] Claves con datos verificados:', result);
    return result;
  }

  /**
   * Forzar re-migración (resetea el flag y vuelve a migrar)
   */
  async forceMigration(): Promise<MigrationResult> {
    await AsyncStorage.removeItem(MIGRATION_DONE_KEY);
    return this.migrateAll();
  }

  /**
   * Alias para compatibilidad
   */
  async hasLegacyData(): Promise<boolean> {
    const summary = await this.getLegacyDataSummary();
    return summary.predictionTracking > 0 || summary.trainingCache > 0 || summary.hasLearnedWeights;
  }

  /**
   * Limpiar datos legacy después de verificar que la migración fue exitosa
   */
  async cleanupLegacyData(): Promise<string[]> {
    const cleaned: string[] = [];
    
    const isMigrated = await this.isMigrated();
    if (!isMigrated) {
      console.warn('[Migration] No se puede limpiar: migración no completada');
      return cleaned;
    }

    const keysToClean = [
      LEGACY_KEYS.predictionTracking,
      LEGACY_KEYS.trainingCache,
    ];

    for (const key of keysToClean) {
      try {
        await AsyncStorage.removeItem(key);
        cleaned.push(key);
        console.log(`[Migration] Limpiado: ${key}`);
      } catch (error: any) {
        console.error(`[Migration] Error limpiando ${key}:`, error.message);
      }
    }

    return cleaned;
  }
}

export const dataMigrationService = new DataMigrationService();
