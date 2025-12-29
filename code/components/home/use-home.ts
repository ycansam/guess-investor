import { useEffect } from 'react';
import { usePredictionStore } from '../../store/prediction-store';



/**
 * Hook que encapsula la lógica de la pantalla Home
 */
export function useHome() {
  const {
    predictions,
    isAnalyzing,
    error,
    analyzeAsset,
    clearPredictions,
    removePrediction,
    loadPredictions,
  } = usePredictionStore();

  // Cargar predicciones guardadas al montar
  useEffect(() => {
    // Cargar predicciones desde AsyncStorage
    loadPredictions();
  }, []);

  const handleAnalyzeAsset = async (asset: string, assetType: string) => {
    return analyzeAsset(asset, assetType);
  };

  const handleClearPredictions = () => {
    clearPredictions();
  };

  const handleRemovePrediction = (id: string) => {
    removePrediction(id);
  };

  return {
    predictions,
    isAnalyzing,
    error,
    handleAnalyzeAsset,
    handleClearPredictions,
    handleRemovePrediction,
  };
}
