import React, { useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { PredictionAnalysisModal } from '../../prediction-analysis-modal';
import { PredictionCard } from '../../prediction-card';
import { styles } from './predictions-list-content.styles';

interface PredictionsListContentProps {
  predictions: InvestmentPrediction[];
  onClear?: () => void;
  onRemove?: (id: string) => void;
  onClose?: () => void;
}

export const PredictionsListContent: React.FC<PredictionsListContentProps> = ({
  predictions,
  onClear,
  onRemove,
  onClose,
}) => {
  const [selectedPrediction, setSelectedPrediction] = useState<InvestmentPrediction | null>(null);

  return (
    <View style={styles.container}>
      {/* Modal de análisis detallado */}
      {selectedPrediction && (
        <PredictionAnalysisModal
          prediction={selectedPrediction}
          onClose={() => setSelectedPrediction(null)}
        />
      )}

      <View style={styles.header}>
        <Text style={styles.title}>🎯 Predicciones ({predictions.length})</Text>
        <View style={styles.headerActions}>
          {onClear && (
            <TouchableOpacity onPress={onClear}>
              <Text style={styles.clearButton}>Limpiar</Text>
            </TouchableOpacity>
          )}
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <FlatList
        data={predictions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PredictionCard 
            prediction={item} 
            onRemove={onRemove}
            onAnalysis={() => setSelectedPrediction(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};
