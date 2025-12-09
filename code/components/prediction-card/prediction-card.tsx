import React from 'react';
import { Text, View } from 'react-native';
import { InvestmentPrediction } from '../../types';
import { styles } from './prediction-card.styles';

interface PredictionCardProps {
  prediction: InvestmentPrediction;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction }) => {
  const getDirectionColor = () => {
    switch (prediction.direction) {
      case 'up': return '#4CAF50';
      case 'down': return '#F44336';
      default: return '#FF9800';
    }
  };

  const getDirectionIcon = () => {
    switch (prediction.direction) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  const getDirectionText = () => {
    switch (prediction.direction) {
      case 'up': return 'SUBIDA';
      case 'down': return 'BAJADA';
      default: return 'NEUTRAL';
    }
  };

  const getAssetTypeEmoji = () => {
    switch (prediction.assetType) {
      case 'stock': return '📊';
      case 'crypto': return '🪙';
      case 'forex': return '💱';
      case 'commodity': return '🛢️';
      case 'index': return '📈';
      case 'energy': return '⚡';
      default: return '💼';
    }
  };

  const getConfidenceColor = () => {
    if (prediction.confidence >= 70) return '#4CAF50';
    if (prediction.confidence >= 40) return '#FF9800';
    return '#F44336';
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.assetInfo}>
          <Text style={styles.assetEmoji}>{getAssetTypeEmoji()}</Text>
          <View>
            <Text style={styles.assetName}>{prediction.asset}</Text>
            <Text style={styles.assetType}>{prediction.assetType.toUpperCase()}</Text>
          </View>
        </View>
        <View style={[styles.directionBadge, { backgroundColor: getDirectionColor() }]}>
          <Text style={styles.directionIcon}>{getDirectionIcon()}</Text>
          <Text style={styles.directionText}>{getDirectionText()}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Confianza</Text>
          <View style={styles.confidenceContainer}>
            <View style={[styles.confidenceBar, { width: `${prediction.confidence}%`, backgroundColor: getConfidenceColor() }]} />
          </View>
          <Text style={[styles.confidenceText, { color: getConfidenceColor() }]}>
            {prediction.confidence}%
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Timeframe</Text>
          <Text style={styles.statValue}>{prediction.timeframe}</Text>
        </View>

        {prediction.predictedChange !== undefined && (
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Cambio Est.</Text>
            <Text style={[styles.statValue, { color: getDirectionColor() }]}>
              {prediction.predictedChange > 0 ? '+' : ''}{prediction.predictedChange}%
            </Text>
          </View>
        )}
      </View>

      {prediction.reasoning && (
        <View style={styles.reasoningContainer}>
          <Text style={styles.reasoningLabel}>💡 Razonamiento:</Text>
          <Text style={styles.reasoningText} numberOfLines={3}>
            {prediction.reasoning.substring(0, 200)}...
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.timestamp}>
          {prediction.createdAt.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
        <Text style={styles.disclaimer}>⚠️ No es consejo financiero</Text>
      </View>
    </View>
  );
};
