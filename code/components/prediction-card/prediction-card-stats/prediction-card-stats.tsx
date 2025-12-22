import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { CalibratedConfidence, confidenceCalibrationService } from '../../../services/confidence-calibration-service';
import { InvestmentPrediction } from '../../../types';
import { getConfidenceColor, getDirectionColor } from './_helpers';
import { styles } from './prediction-card-stats.styles';

interface PredictionCardStatsProps {
  prediction: InvestmentPrediction;
  changePercent?: number;
}

export const PredictionCardStats: React.FC<PredictionCardStatsProps> = ({ 
  prediction, 
  changePercent 
}) => {
  const [calibrated, setCalibrated] = useState<CalibratedConfidence | null>(null);
  
  useEffect(() => {
    // Load calibrated confidence
    confidenceCalibrationService.calibrateConfidence(prediction.confidence)
      .then(setCalibrated)
      .catch(() => setCalibrated(null));
  }, [prediction.confidence]);

  const confidenceColor = getConfidenceColor(prediction.confidence);
  const directionColor = getDirectionColor(prediction.direction);
  
  // Show real accuracy if we have reliable calibration data
  const showCalibratedInfo = calibrated && calibrated.reliability !== 'low' && calibrated.sampleSize >= 3;

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
        <View style={styles.confidenceTextContainer}>
          <Text style={[styles.confidenceText, { color: confidenceColor }]}>
            {prediction.confidence}%
          </Text>
          {showCalibratedInfo && (
            <Text style={styles.calibratedText}>
              (real: ~{calibrated.realAccuracyEstimate.toFixed(0)}%)
            </Text>
          )}
        </View>
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
