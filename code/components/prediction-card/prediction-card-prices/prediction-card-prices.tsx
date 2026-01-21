import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { currencyService } from '../../../services/currency-service';
import { InvestmentPrediction } from '../../../types';
import { getDirectionColor, getDirectionIcon } from './_helpers';
import { styles } from './prediction-card-prices.styles';

interface PredictionCardPricesProps {
  prediction: InvestmentPrediction;
}

export const PredictionCardPrices: React.FC<PredictionCardPricesProps> = ({ prediction }) => {
  const [eurRate, setEurRate] = useState<number>(1);
  const directionColor = getDirectionColor(prediction.direction);
  
  // Obtener rate de conversión a EUR (usando la moneda real del activo, no adivinando por símbolo)
  useEffect(() => {
    if (prediction.symbol) {
      // Usar la moneda de la predicción si está disponible, sino detectar del símbolo
      const currency = (prediction as any).currency || currencyService.getCurrencyFromSymbol(prediction.symbol);
      currencyService.getExchangeRateToEUR(currency).then(setEurRate);
    }
  }, [prediction.symbol, (prediction as any).currency]);
  
  // Formatear precio en EUR
  const formatPriceEur = (price?: number): string => {
    if (!price) return 'N/A';
    const priceInEur = price * eurRate;
    return `€${priceInEur.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Determinar el precio objetivo a mostrar
  // Siempre usar el precio predicho (predictedPriceMax), nunca el precio actual
  // El precio predicho ya incluye el cambio esperado calculado
  const targetPrice = prediction.predictedPriceMax || prediction.predictedPriceMin || prediction.predictedPrice;

  return (
    <View style={styles.container}>
      <View style={styles.priceItem}>
        <Text style={styles.priceLabel}>💰 Precio Actual</Text>
        <Text style={styles.priceValue}>{formatPriceEur(prediction.currentPrice)}</Text>
      </View>
      <View style={styles.priceArrow}>
        <Text style={[styles.arrowText, { color: directionColor }]}>
          {getDirectionIcon(prediction.direction)}
        </Text>
      </View>
      <View style={styles.priceItem}>
        <Text style={styles.priceLabel}>🎯 Precio Objetivo</Text>
        <Text style={[styles.priceValue, { color: directionColor }]}>
          {formatPriceEur(targetPrice || prediction.predictedPrice)}
        </Text>
      </View>
    </View>
  );
};
