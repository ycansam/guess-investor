import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { aiService } from '../services/ai-service';
import { predictionTrackingService } from '../services/prediction-tracking-service';
import { InvestmentPrediction, PredictionState } from '../types';

const PREDICTIONS_STORAGE_KEY = 'predictions-data';

// Generar ID único
const generateId = () => Math.random().toString(36).substring(2, 15);

interface PredictionStore extends PredictionState {
  // Estado
  error: string | null;
  
  // Acciones de predicciones
  addPrediction: (prediction: InvestmentPrediction) => void;
  removePrediction: (id: string) => void;
  clearPredictions: () => void;
  loadPredictions: () => Promise<void>;
  setError: (error: string | null) => void;
  
  // Análisis de activo
  analyzeAsset: (asset: string, assetType: string) => Promise<InvestmentPrediction | null>;
}

export const usePredictionStore = create<PredictionStore>((set, get) => ({
  // Estado inicial
  predictions: [],
  isAnalyzing: false,
  lastAnalysis: null,
  error: null,

  // Establecer error
  setError: (error) => {
    set({ error });
  },

  // Añadir predicción y guardar en AsyncStorage
  addPrediction: (prediction) => {
    set((state) => {
      const newPredictions = [prediction, ...state.predictions];
      // Guardar en AsyncStorage de forma asíncrona
      AsyncStorage.setItem(PREDICTIONS_STORAGE_KEY, JSON.stringify({
        predictions: newPredictions,
        lastAnalysis: new Date(),
      })).catch(err => console.error('[PredictionStore] Error guardando predicciones:', err));
      return {
        predictions: newPredictions,
        lastAnalysis: new Date(),
      };
    });
  },

  // Eliminar una predicción por ID
  removePrediction: (id) => {
    set((state) => {
      const newPredictions = state.predictions.filter((p) => p.id !== id);
      // Guardar en AsyncStorage de forma asíncrona
      AsyncStorage.setItem(PREDICTIONS_STORAGE_KEY, JSON.stringify({
        predictions: newPredictions,
        lastAnalysis: state.lastAnalysis,
      })).catch(err => console.error('[PredictionStore] Error guardando predicciones:', err));
      return {
        predictions: newPredictions,
      };
    });
  },

  // Limpiar predicciones y borrar de AsyncStorage
  clearPredictions: () => {
    AsyncStorage.removeItem(PREDICTIONS_STORAGE_KEY)
      .catch(err => console.error('[PredictionStore] Error eliminando predicciones:', err));
    set({ predictions: [], lastAnalysis: null });
  },

  // Cargar predicciones desde AsyncStorage al iniciar
  loadPredictions: async () => {
    console.log('[PredictionStore] Iniciando carga de predicciones...');
    try {
      const stored = await AsyncStorage.getItem(PREDICTIONS_STORAGE_KEY);
      
      if (stored) {
        const data = JSON.parse(stored) as {
          predictions: InvestmentPrediction[];
          lastAnalysis: string | null;
        };
        
        if (data && data.predictions) {
          console.log(`[PredictionStore] Cargadas ${data.predictions.length} predicciones`);
          set({
            predictions: data.predictions.map((p) => ({
              ...p,
              createdAt: new Date(p.createdAt),
            })),
            lastAnalysis: data.lastAnalysis ? new Date(data.lastAnalysis) : null,
          });
        }
      } else {
        console.log('[PredictionStore] No hay predicciones guardadas');
      }
    } catch (error) {
      console.error('[PredictionStore] Error cargando predicciones:', error);
    }
  },

  // Análisis de un activo - retorna la predicción directamente
  analyzeAsset: async (asset: string, assetType: string): Promise<InvestmentPrediction | null> => {
    const { addPrediction, setError } = get();
    
    set({ isAnalyzing: true, error: null });
    
    try {
      const response = await aiService.getQuickAnalysis(asset, assetType);

      if (response.prediction) {
        const prediction: InvestmentPrediction = {
          id: generateId(),
          asset: response.prediction.asset || asset,
          symbol: response.prediction.symbol,
          assetType: response.prediction.assetType || 'other',
          direction: response.prediction.direction || 'neutral',
          confidence: response.prediction.confidence || 50,
          timeframe: response.prediction.timeframe || 'No especificado',
          predictedChange: response.prediction.predictedChange,
          currentPrice: response.prediction.currentPrice,
          predictedPriceMin: response.prediction.predictedPriceMin,
          predictedPriceMax: response.prediction.predictedPriceMax,
          reasoning: response.prediction.reasoning || '',
          analysisData: response.prediction.analysisData,
          createdAt: new Date(),
        };
        
        addPrediction(prediction);
        
        // Registrar predicción para tracking (comparación con resultados reales)
        if (prediction.symbol && prediction.currentPrice) {
          // Extraer scores de factores y pesos del analysisData
          const factorScores: Record<string, number> = {};
          const factorWeightsUsed: Record<string, number> = {};
          
          if (prediction.analysisData?.factorBreakdown?.availableFactors) {
            for (const factor of prediction.analysisData.factorBreakdown.availableFactors) {
              if (factor.hasData) {
                factorScores[factor.name] = factor.score;
              }
            }
          }
          if (prediction.analysisData?.factorBreakdown?.weightsUsed) {
            Object.assign(factorWeightsUsed, prediction.analysisData.factorBreakdown.weightsUsed);
          }
          
          predictionTrackingService.trackPrediction({
            symbol: prediction.symbol,
            asset: prediction.asset,
            assetType: prediction.assetType,
            direction: prediction.direction,
            predictedChange: prediction.predictedChange || 0,
            predictedPriceMin: prediction.predictedPriceMin || prediction.currentPrice,
            predictedPriceMax: prediction.predictedPriceMax || prediction.currentPrice,
            confidence: prediction.confidence,
            currentPrice: prediction.currentPrice,
            timeframe: prediction.timeframe,
            factorScores,
            factorWeightsUsed,
            volatility: prediction.analysisData?.historical?.volatility,
            // Meta-learning: Uncertainty tracking
            uncertaintyScore: prediction.analysisData?.uncertainty?.score,
          }).catch(err => console.error('[Tracking] Error registrando predicción:', err));
        }
        
        return prediction;
      }
      
      return null;
    } catch (error: any) {
      setError(error.message);
      return null;
    } finally {
      set({ isAnalyzing: false });
    }
  },
}));

// Alias para compatibilidad con código existente
export const useChatStore = usePredictionStore;
