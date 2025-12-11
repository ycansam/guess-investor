import React from 'react';
import { Text, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { formatPrice, getDirectionColor, getDirectionIcon } from './_helpers';
import { styles } from './prediction-card-prices.styles';

interface PredictionCardPricesProps {
  prediction: InvestmentPrediction;
}

export const PredictionCardPrices: React.FC<PredictionCardPricesProps> = ({ prediction }) => {
  const directionColor = getDirectionColor(prediction.direction);

  return (
    <View style={styles.container}>
      <View style={styles.priceItem}>
        <Text style={styles.priceLabel}>💰 Precio Actual</Text>
        <Text style={styles.priceValue}>{formatPrice(prediction.currentPrice)}</Text>
      </View>
      <View style={styles.priceArrow}>
        <Text style={[styles.arrowText, { color: directionColor }]}>
          {getDirectionIcon(prediction.direction)}
        </Text>
      </View>
      <View style={styles.priceItem}>
        <Text style={styles.priceLabel}>🎯 Precio Objetivo</Text>
        <Text style={[styles.priceValue, { color: directionColor }]}>
          {prediction.predictedPriceMin && prediction.predictedPriceMax
            ? `${formatPrice(prediction.predictedPriceMin)} - ${formatPrice(prediction.predictedPriceMax)}`
            : formatPrice(prediction.predictedPrice)
          }
        </Text>
      </View>
    </View>
  );
};
