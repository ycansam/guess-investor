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

/**
 * Obtiene el emoji y color para el nivel de incertidumbre
 */
const getUncertaintyDisplay = (score: number): { emoji: string; color: string; label: string } => {
  if (score >= 70) {
    return { emoji: '⚠️', color: '#DC2626', label: 'Alta incertidumbre' };
  } else if (score >= 50) {
    return { emoji: '⚡', color: '#D97706', label: 'Incertidumbre moderada' };
  } else if (score >= 30) {
    return { emoji: '📊', color: '#059669', label: 'Incertidumbre baja' };
  }
  return { emoji: '✅', color: '#10B981', label: 'Condiciones favorables' };
};

export const PredictionCardHeader: React.FC<PredictionCardHeaderProps> = ({ prediction }) => {
  const uncertaintyData = prediction.analysisData?.uncertainty;
  const showWarning = uncertaintyData && uncertaintyData.score >= 50;
  
  return (
    <>
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
      
      {/* Uncertainty Warning Banner */}
      {showWarning && uncertaintyData && (
        <View style={[
          styles.uncertaintyBanner,
          { backgroundColor: uncertaintyData.score >= 70 ? '#FEF2F2' : '#FFFBEB' }
        ]}>
          <View style={styles.uncertaintyHeader}>
            <Text style={styles.uncertaintyEmoji}>
              {getUncertaintyDisplay(uncertaintyData.score).emoji}
            </Text>
            <Text style={[
              styles.uncertaintyTitle,
              { color: getUncertaintyDisplay(uncertaintyData.score).color }
            ]}>
              {getUncertaintyDisplay(uncertaintyData.score).label} ({uncertaintyData.score}%)
            </Text>
          </View>
          {uncertaintyData.reasons && uncertaintyData.reasons.length > 0 && (
            <Text style={styles.uncertaintyReason} numberOfLines={2}>
              {uncertaintyData.reasons[0]}
            </Text>
          )}
          {!uncertaintyData.shouldPredict && (
            <Text style={styles.uncertaintyWarningText}>
              ⛔ No se recomienda predecir en estas condiciones
            </Text>
          )}
        </View>
      )}
    </>
  );
};
