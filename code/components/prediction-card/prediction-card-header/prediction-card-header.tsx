import React from 'react';
import { Text, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import {
    getAssetTypeEmoji,
    getAssetTypeLabel,
    getDirectionColor,
    getDirectionIcon,
    getDirectionText,
} from './_helpers';
import { styles } from './prediction-card-header.styles';

interface PredictionCardHeaderProps {
  prediction: InvestmentPrediction;
}

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
