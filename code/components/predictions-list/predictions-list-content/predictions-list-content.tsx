import React from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { PredictionCard } from '../../prediction-card';
import { styles } from './predictions-list-content.styles';

interface PredictionsListContentProps {
  predictions: InvestmentPrediction[];
  onClear?: () => void;
}

export const PredictionsListContent: React.FC<PredictionsListContentProps> = ({
  predictions,
  onClear,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎯 Predicciones ({predictions.length})</Text>
        {onClear && (
          <TouchableOpacity onPress={onClear}>
            <Text style={styles.clearButton}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={predictions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PredictionCard prediction={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};
