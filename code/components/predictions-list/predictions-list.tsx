import React from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { InvestmentPrediction } from '../../types';
import { PredictionCard } from '../prediction-card';
import { styles } from './predictions-list.styles';

interface PredictionsListProps {
  predictions: InvestmentPrediction[];
  onClear?: () => void;
}

export const PredictionsList: React.FC<PredictionsListProps> = ({ 
  predictions, 
  onClear 
}) => {
  if (predictions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={styles.emptyTitle}>Sin predicciones aún</Text>
        <Text style={styles.emptyText}>
          Pregunta al asistente sobre cualquier activo para obtener predicciones
        </Text>
      </View>
    );
  }

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
