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

  // Cargar predicciones guardadas al montar (desde backend)
  useEffect(() => {
    loadPredictions();
  }, []);

  const handleAnalyzeAsset = async (asset: string, assetType: string) => {
    return analyzeAsset(asset, assetType);
  };

  const handleClearPredictions = async () => {
    await clearPredictions();
  };

  const handleRemovePrediction = async (id: string) => {
    await removePrediction(id);
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
