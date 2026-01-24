import React from 'react';
import { Pressable, Text, View } from 'react-native';
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
  onAnalysis?: (prediction: InvestmentPrediction) => void;
  onAlert?: (prediction: InvestmentPrediction) => void;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction, onRemove, onAnalysis, onAlert }) => {
  const changePercent = calculateChangePercent(
    prediction.currentPrice,
    prediction.predictedPriceMin,
    prediction.predictedPriceMax,
    prediction.predictedChange
  );

  const handleRemove = () => {
    if (onRemove) {
      onRemove(prediction.id);
    }
  };

  return (
    <View style={styles.card}>
      {onRemove && (
        <Pressable
          style={({ pressed }) => [
            styles.removeButton,
            pressed && { opacity: 0.7, backgroundColor: '#FECACA' }
          ]}
          onPress={handleRemove}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.removeButtonText}>✕</Text>
        </Pressable>
      )}
      <PredictionCardHeader prediction={prediction} />
      <PredictionCardPrices prediction={prediction} />
      <PredictionCardStats prediction={prediction} changePercent={changePercent} />
      <PredictionCardAnalysis prediction={prediction} />
      <PredictionCardFooter 
        createdAt={prediction.createdAt} 
        onAnalysis={onAnalysis ? () => onAnalysis(prediction) : undefined} 
        onAlert={onAlert ? () => onAlert(prediction) : undefined}
      />
    </View>
  );
};
