import { create } from 'zustand';
import { aiService } from '../services/ai-service';
import { apiClient } from '../services/api-client';
import { predictionTrackingService } from '../services/prediction-tracking-service';
import { InvestmentPrediction, PredictionState } from '../types';

// Generar ID único
const generateId = () => Math.random().toString(36).substring(2, 15);

interface PredictionStore extends PredictionState {
  // Estado
  error: string | null;
  
  // Acciones de predicciones
  addPrediction: (prediction: InvestmentPrediction) => void;
  removePrediction: (id: string) => Promise<void>;
  clearPredictions: () => Promise<void>;
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

  // Añadir predicción al estado local (backend ya lo guarda via predictionTrackingService)
  addPrediction: (prediction) => {
    set((state) => ({
      predictions: [prediction, ...state.predictions],
      lastAnalysis: new Date(),
    }));
  },

  // Eliminar una predicción por ID (del backend y estado local)
  removePrediction: async (id) => {
    try {
      await apiClient.deletePrediction(id);
      set((state) => ({
        predictions: state.predictions.filter((p) => p.id !== id),
      }));
    } catch (err) {
      console.error('[PredictionStore] Error eliminando predicción:', err);
      // Eliminar localmente aunque falle el backend
      set((state) => ({
        predictions: state.predictions.filter((p) => p.id !== id),
      }));
    }
  },

  // Limpiar predicciones (del backend y estado local)
  clearPredictions: async () => {
    try {
      await apiClient.clearAllPredictions();
    } catch (err) {
      console.error('[PredictionStore] Error limpiando predicciones:', err);
    }
    set({ predictions: [], lastAnalysis: null });
  },

  // Cargar predicciones desde el backend al iniciar
  loadPredictions: async () => {
    console.log('[PredictionStore] Iniciando carga de predicciones desde backend...');
    try {
      const { predictions: backendPredictions } = await apiClient.getAllPredictions({ limit: 100 });
      
      if (backendPredictions && backendPredictions.length > 0) {
        console.log(`[PredictionStore] Cargadas ${backendPredictions.length} predicciones del backend`);
        
        // Mapear predicciones del backend al formato del frontend
        const mappedPredictions: InvestmentPrediction[] = backendPredictions.map((p: any) => ({
          id: p.id,
          asset: p.asset || p.symbol,
          symbol: p.symbol,
          assetType: p.assetType || 'stock',
          direction: p.direction || 'neutral',
          confidence: p.confidence || 50,
          timeframe: p.timeframe || 'No especificado',
          predictedChange: p.predictedChange,
          currentPrice: p.currentPrice,
          predictedPriceMin: p.predictedPriceMin,
          predictedPriceMax: p.predictedPriceMax,
          reasoning: p.reasoning || '',
          analysisData: p.analysisData,
          createdAt: new Date(p.createdAt),
        }));
        
        set({
          predictions: mappedPredictions,
          lastAnalysis: mappedPredictions[0]?.createdAt || null,
        });
      } else {
        console.log('[PredictionStore] No hay predicciones en el backend');
        set({ predictions: [] });
      }
    } catch (error) {
      console.error('[PredictionStore] Error cargando predicciones del backend:', error);
      set({ predictions: [] });
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
        // Esto guarda en el backend automáticamente
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
          
          // El ID de la predicción trackeada se usa para sincronizar
          const trackedPrediction = await predictionTrackingService.trackPrediction({
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
          });
          
          // Actualizar el ID local con el del backend para sincronización
          if (trackedPrediction?.id) {
            prediction.id = trackedPrediction.id;
          }
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
