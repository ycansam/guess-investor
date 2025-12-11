import React from 'react';
import { View } from 'react-native';
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
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction }) => {
  const changePercent = calculateChangePercent(
    prediction.currentPrice,
    prediction.predictedPriceMin,
    prediction.predictedPriceMax,
    prediction.predictedChange
  );

  return (
    <View style={styles.card}>
      <PredictionCardHeader prediction={prediction} />
      <PredictionCardPrices prediction={prediction} />
      <PredictionCardStats prediction={prediction} changePercent={changePercent} />
      <PredictionCardAnalysis prediction={prediction} />
      <PredictionCardFooter createdAt={prediction.createdAt} />
    </View>
  );
};
