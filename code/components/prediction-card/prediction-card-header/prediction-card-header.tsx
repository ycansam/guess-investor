import React from 'react';
import { Text, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { styles } from './prediction-card-header.styles';

interface PredictionCardHeaderProps {
  prediction: InvestmentPrediction;
}

const getDirectionColor = (direction: string) => {
  switch (direction) {
    case 'up': return '#4CAF50';
    case 'down': return '#F44336';
    default: return '#FF9800';
  }
};

const getDirectionIcon = (direction: string) => {
  switch (direction) {
    case 'up': return '📈';
    case 'down': return '📉';
    default: return '➡️';
  }
};

const getDirectionText = (direction: string) => {
  switch (direction) {
    case 'up': return 'SUBIDA';
    case 'down': return 'BAJADA';
    default: return 'LATERAL';
  }
};

const getAssetTypeLabel = (assetType: string) => {
  switch (assetType) {
    case 'stock': return 'Acción';
    case 'crypto': return 'Criptomoneda';
    case 'forex': return 'Divisa';
    case 'commodity': return 'Materia Prima';
    case 'index': return 'Índice';
    case 'energy': return 'Energía';
    default: return 'Activo';
  }
};

const getAssetTypeEmoji = (assetType: string) => {
  switch (assetType) {
    case 'stock': return '📊';
    case 'crypto': return '🪙';
    case 'forex': return '💱';
    case 'commodity': return '🛢️';
    case 'index': return '📈';
    case 'energy': return '⚡';
    default: return '💼';
  }
};

export const PredictionCardHeader: React.FC<PredictionCardHeaderProps> = ({ prediction }) => {
  return (
    <View style={styles.container}>
      <View style={styles.assetInfo}>
        <Text style={styles.assetEmoji}>{getAssetTypeEmoji(prediction.assetType)}</Text>
        <View>
          <Text style={styles.assetName}>{prediction.asset}</Text>
          <Text style={styles.assetType}>{getAssetTypeLabel(prediction.assetType)}</Text>
        </View>
      </View>
      <View style={[styles.directionBadge, { backgroundColor: getDirectionColor(prediction.direction) }]}>
        <Text style={styles.directionIcon}>{getDirectionIcon(prediction.direction)}</Text>
        <Text style={styles.directionText}>{getDirectionText(prediction.direction)}</Text>
      </View>
    </View>
  );
};
