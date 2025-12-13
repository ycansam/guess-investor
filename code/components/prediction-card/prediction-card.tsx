import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { InvestmentPrediction } from '../../types';
import { calculateChangePercent } from './_helpers';
import { PredictionCardAnalysis } from './prediction-card-analysis';
import { PredictionCardFooter } from './prediction-card-footer';
import { PredictionCardHeader } from './prediction-card-header';
import { PredictionCardPrices } from './prediction-card-prices';
import { PredictionCardStats } from './prediction-card-stats';
import { styles } from './prediction-card.styles';

interface PredictionCardProps {
  prediction: InvestmentPrediction;
  onRemove?: (id: string) => void;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction, onRemove }) => {
  const changePercent = calculateChangePercent(
    prediction.currentPrice,
    prediction.predictedPriceMin,
    prediction.predictedPriceMax,
    prediction.predictedChange
  );

  return (
    <View style={styles.card}>
      {onRemove && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemove(prediction.id)}
        >
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      )}
      <PredictionCardHeader prediction={prediction} />
      <PredictionCardPrices prediction={prediction} />
      <PredictionCardStats prediction={prediction} changePercent={changePercent} />
      <PredictionCardAnalysis prediction={prediction} />
      <PredictionCardFooter createdAt={prediction.createdAt} />
    </View>
  );
};
