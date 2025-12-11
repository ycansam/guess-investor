import React from 'react';
import { Text, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { styles } from './prediction-card-stats.styles';

interface PredictionCardStatsProps {
  prediction: InvestmentPrediction;
  changePercent?: number;
}

const getDirectionColor = (direction: string) => {
  switch (direction) {
    case 'up': return '#4CAF50';
    case 'down': return '#F44336';
    default: return '#FF9800';
  }
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 70) return '#4CAF50';
  if (confidence >= 40) return '#FF9800';
  return '#F44336';
};

export const PredictionCardStats: React.FC<PredictionCardStatsProps> = ({ 
  prediction, 
  changePercent 
}) => {
  const confidenceColor = getConfidenceColor(prediction.confidence);
  const directionColor = getDirectionColor(prediction.direction);

  return (
    <View style={styles.container}>
      <View style={styles.statItem}>
        <Text style={styles.statLabel}>Confianza</Text>
        <View style={styles.confidenceContainer}>
          <View style={[
            styles.confidenceBar, 
            { width: `${prediction.confidence}%`, backgroundColor: confidenceColor }
          ]} />
        </View>
        <Text style={[styles.confidenceText, { color: confidenceColor }]}>
          {prediction.confidence}%
        </Text>
      </View>

      <View style={styles.statItem}>
        <Text style={styles.statLabel}>Timeframe</Text>
        <Text style={styles.statValue}>{prediction.timeframe}</Text>
      </View>

      <View style={styles.statItem}>
        <Text style={styles.statLabel}>Cambio Est.</Text>
        <Text style={[styles.statValue, { color: directionColor, fontWeight: '700' }]}>
          {changePercent !== undefined
            ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`
            : 'N/A'
          }
        </Text>
      </View>
    </View>
  );
};
