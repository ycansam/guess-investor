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
  
  // Determinar el precio objetivo a mostrar
  // Si min y max son iguales o muy cercanos, mostrar solo un precio
  const showSinglePrice = prediction.predictedPriceMin && prediction.predictedPriceMax && 
    Math.abs(prediction.predictedPriceMax - prediction.predictedPriceMin) < 0.01;
  
  // Para SUBE: mostrar el max. Para BAJA: mostrar el min. Para MANTIENE: precio actual
  const targetPrice = prediction.direction === 'up' 
    ? prediction.predictedPriceMax 
    : prediction.direction === 'down'
      ? prediction.predictedPriceMin
      : prediction.currentPrice;

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
          {formatPrice(targetPrice || prediction.predictedPrice)}
        </Text>
      </View>
    </View>
  );
};
