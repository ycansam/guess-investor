import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from './prediction-card-footer.styles';

interface PredictionCardFooterProps {
  createdAt: Date;
  onAnalysis?: () => void;
  onAlert?: () => void;
}

export const PredictionCardFooter: React.FC<PredictionCardFooterProps> = ({ createdAt, onAnalysis, onAlert }) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.dateContainer}>
        <Text style={styles.dateIcon}>📅</Text>
        <Text style={styles.timestamp}>{formatDate(createdAt)}</Text>
      </View>
      <View style={styles.actions}>
        {onAlert && (
          <TouchableOpacity style={styles.alertButton} onPress={onAlert}>
            <Text style={styles.alertButtonText}>🔔</Text>
          </TouchableOpacity>
        )}
        {onAnalysis && (
          <TouchableOpacity style={styles.analysisButton} onPress={onAnalysis}>
            <Text style={styles.analysisButtonText}>🔍 Análisis</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.disclaimer}>⚠️ No es consejo financiero</Text>
      </View>
    </View>
  );
};
