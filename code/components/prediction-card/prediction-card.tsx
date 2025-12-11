import React from 'react';
import { View } from 'react-native';
import { InvestmentPrediction } from '../../types';
import { PredictionCardAnalysis } from './prediction-card-analysis';
import { PredictionCardFooter } from './prediction-card-footer';
import { PredictionCardHeader } from './prediction-card-header';
import { PredictionCardPrices } from './prediction-card-prices';
import { PredictionCardStats } from './prediction-card-stats';
import { styles } from './prediction-card.styles';

interface PredictionCardProps {
  prediction: InvestmentPrediction;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction }) => {
  const calculateChangePercent = () => {
    if (!prediction.currentPrice || !prediction.predictedPriceMin || !prediction.predictedPriceMax) {
      return prediction.predictedChange;
    }
    const avgPredicted = (prediction.predictedPriceMin + prediction.predictedPriceMax) / 2;
    return ((avgPredicted - prediction.currentPrice) / prediction.currentPrice) * 100;
  };

  return (
    <View style={styles.card}>
      <PredictionCardHeader prediction={prediction} />
      <PredictionCardPrices prediction={prediction} />
      <PredictionCardStats prediction={prediction} changePercent={calculateChangePercent()} />
      <PredictionCardAnalysis prediction={prediction} />
      <PredictionCardFooter createdAt={prediction.createdAt} />
    </View>
  );
};
