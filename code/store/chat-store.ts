import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { geminiService } from '../services/gemini-service';
import { predictionTrackingService } from '../services/prediction-tracking-service';
import { ChatMessage, ChatState, InvestmentPrediction, PredictionState } from '../types';

const PREDICTIONS_STORAGE_KEY = 'predictions-data';

// Generar ID único
const generateId = () => Math.random().toString(36).substring(2, 15);

interface ChatStore extends ChatState, PredictionState {
  // Acciones del chat
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  setError: (error: string | null) => void;
  
  // Acciones de predicciones
  addPrediction: (prediction: InvestmentPrediction) => void;
  removePrediction: (id: string) => void;
  clearPredictions: () => void;
  loadPredictions: () => Promise<void>;
  
  // Análisis rápido
  analyzeAsset: (asset: string, assetType: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Estado inicial del chat
  messages: [],
  isLoading: false,
  error: null,
  
  // Estado inicial de predicciones
  predictions: [],
  isAnalyzing: false,
  lastAnalysis: null,

  // Añadir mensaje al chat
  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: new Date(),
    };
    
    set((state) => ({
      messages: [...state.messages, newMessage],
    }));
  },

  // Enviar mensaje y obtener respuesta de Gemini
  sendMessage: async (content: string) => {
    const { addMessage, messages, addPrediction, setError } = get();
    
    // Añadir mensaje del usuario
    addMessage({
      role: 'user',
      content,
    });

    set({ isLoading: true, error: null });

    try {
      // Obtener respuesta de Gemini
      const response = await geminiService.sendMessage(content, messages);
      
      // Añadir respuesta del asistente
      const assistantMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
        role: 'assistant',
        content: response.message,
      };

      // Si hay una predicción, añadirla
      if (response.prediction) {
        const prediction: InvestmentPrediction = {
          id: generateId(),
          asset: response.prediction.asset || 'Desconocido',
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
        
        assistantMessage.prediction = prediction;
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
            id: prediction.id,
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
            uncertaintyFactors: prediction.analysisData?.uncertainty?.factors,
            uncertaintyRecommendation: prediction.analysisData?.uncertainty?.warning,
          }).catch(err => console.error('[Tracking] Error registrando predicción:', err));
        }
      }

      addMessage(assistantMessage);
      
    } catch (error: any) {
      setError(error.message);
      addMessage({
        role: 'assistant',
        content: `❌ Error: ${error.message}`,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // Limpiar mensajes
  clearMessages: () => {
    set({ messages: [], error: null });
  },

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
      })).catch(err => console.error('[ChatStore] Error guardando predicciones:', err));
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
      })).catch(err => console.error('[ChatStore] Error guardando predicciones:', err));
      return {
        predictions: newPredictions,
      };
    });
  },

  // Limpiar predicciones y borrar de AsyncStorage
  clearPredictions: () => {
    AsyncStorage.removeItem(PREDICTIONS_STORAGE_KEY)
      .catch(err => console.error('[ChatStore] Error eliminando predicciones:', err));
    set({ predictions: [], lastAnalysis: null });
  },

  // Cargar predicciones desde AsyncStorage al iniciar
  loadPredictions: async () => {
    console.log('[ChatStore] Iniciando carga de predicciones...');
    try {
      const stored = await AsyncStorage.getItem(PREDICTIONS_STORAGE_KEY);
      
      if (stored) {
        const data = JSON.parse(stored) as {
          predictions: InvestmentPrediction[];
          lastAnalysis: string | null;
        };
        
        if (data && data.predictions) {
          console.log(`[ChatStore] Cargadas ${data.predictions.length} predicciones`);
          set({
            predictions: data.predictions.map((p) => ({
              ...p,
              createdAt: new Date(p.createdAt),
            })),
            lastAnalysis: data.lastAnalysis ? new Date(data.lastAnalysis) : null,
          });
        }
      } else {
        console.log('[ChatStore] No hay predicciones guardadas');
      }
    } catch (error) {
      console.error('[ChatStore] Error cargando predicciones:', error);
    }
  },

  // Análisis rápido de un activo
  analyzeAsset: async (asset: string, assetType: string) => {
    set({ isAnalyzing: true, error: null });
    
    try {
      const response = await geminiService.getQuickAnalysis(asset, assetType);
      
      get().addMessage({
        role: 'user',
        content: `Analiza ${asset}`,
      });
      
      const assistantMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
        role: 'assistant',
        content: response.message,
      };

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
        
        assistantMessage.prediction = prediction;
        get().addPrediction(prediction);
        
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
            id: prediction.id,
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
            uncertaintyFactors: prediction.analysisData?.uncertainty?.factors,
            uncertaintyRecommendation: prediction.analysisData?.uncertainty?.warning,
          }).catch(err => console.error('[Tracking] Error registrando predicción:', err));
        }
      }

      get().addMessage(assistantMessage);
      
    } catch (error: any) {
      get().setError(error.message);
    } finally {
      set({ isAnalyzing: false });
    }
  },
}));
