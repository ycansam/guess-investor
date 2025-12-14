import React from 'react';
import { Text, View } from 'react-native';
import { styles } from './prediction-card-footer.styles';

interface PredictionCardFooterProps {
  createdAt: Date;
}

export const PredictionCardFooter: React.FC<PredictionCardFooterProps> = ({ createdAt }) => {
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
      <Text style={styles.disclaimer}>⚠️ No es consejo financiero</Text>
    </View>
  );
};
