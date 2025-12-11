import React from 'react';
import { Text, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { styles } from './prediction-card-prices.styles';

interface PredictionCardPricesProps {
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

const formatPrice = (price?: number) => {
  if (!price) return 'N/A';
  return `€${price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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
