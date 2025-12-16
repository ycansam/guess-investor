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
  // Siempre usar el precio predicho (predictedPriceMax), nunca el precio actual
  // El precio predicho ya incluye el cambio esperado calculado
  const targetPrice = prediction.predictedPriceMax || prediction.predictedPriceMin || prediction.predictedPrice;

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
