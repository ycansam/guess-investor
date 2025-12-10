import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { InvestmentPrediction } from '../../types';
import { styles } from './prediction-card.styles';

interface PredictionCardProps {
  prediction: InvestmentPrediction;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({ prediction }) => {
  const [showReasoning, setShowReasoning] = useState(false);

  const getDirectionColor = () => {
    switch (prediction.direction) {
      case 'up': return '#4CAF50';
      case 'down': return '#F44336';
      default: return '#FF9800';
    }
  };

  const getDirectionIcon = () => {
    switch (prediction.direction) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  const getDirectionText = () => {
    switch (prediction.direction) {
      case 'up': return 'SUBIDA';
      case 'down': return 'BAJADA';
      default: return 'LATERAL';
    }
  };

  const getAssetTypeLabel = () => {
    switch (prediction.assetType) {
      case 'stock': return 'Acción';
      case 'crypto': return 'Criptomoneda';
      case 'forex': return 'Divisa';
      case 'commodity': return 'Materia Prima';
      case 'index': return 'Índice';
      case 'energy': return 'Energía';
      default: return 'Activo';
    }
  };

  const getAssetTypeEmoji = () => {
    switch (prediction.assetType) {
      case 'stock': return '📊';
      case 'crypto': return '🪙';
      case 'forex': return '💱';
      case 'commodity': return '🛢️';
      case 'index': return '📈';
      case 'energy': return '⚡';
      default: return '💼';
    }
  };

  const getConfidenceColor = () => {
    if (prediction.confidence >= 70) return '#4CAF50';
    if (prediction.confidence >= 40) return '#FF9800';
    return '#F44336';
  };

  const formatPrice = (price?: number) => {
    if (!price) return 'N/A';
    return `€${price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const calculateChangePercent = () => {
    if (!prediction.currentPrice || !prediction.predictedPriceMin || !prediction.predictedPriceMax) {
      return prediction.predictedChange;
    }
    const avgPredicted = (prediction.predictedPriceMin + prediction.predictedPriceMax) / 2;
    return ((avgPredicted - prediction.currentPrice) / prediction.currentPrice) * 100;
  };

  const changePercent = calculateChangePercent();

  return (
    <View style={styles.card}>
      {/* Header: Asset name + direction */}
      <View style={styles.header}>
        <View style={styles.assetInfo}>
          <Text style={styles.assetEmoji}>{getAssetTypeEmoji()}</Text>
          <View>
            <Text style={styles.assetName}>{prediction.asset}</Text>
            <Text style={styles.assetType}>{getAssetTypeLabel()}</Text>
          </View>
        </View>
        <View style={[styles.directionBadge, { backgroundColor: getDirectionColor() }]}>
          <Text style={styles.directionIcon}>{getDirectionIcon()}</Text>
          <Text style={styles.directionText}>{getDirectionText()}</Text>
        </View>
      </View>

      {/* Prices row */}
      <View style={styles.pricesRow}>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>💰 Precio Actual</Text>
          <Text style={styles.priceValue}>{formatPrice(prediction.currentPrice)}</Text>
        </View>
        <View style={styles.priceArrow}>
          <Text style={{ fontSize: 20, color: getDirectionColor() }}>{getDirectionIcon()}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>🎯 Precio Objetivo</Text>
          <Text style={[styles.priceValue, { color: getDirectionColor() }]}>
            {prediction.predictedPriceMin && prediction.predictedPriceMax
              ? `${formatPrice(prediction.predictedPriceMin)} - ${formatPrice(prediction.predictedPriceMax)}`
              : formatPrice(prediction.predictedPrice)
            }
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Confianza</Text>
          <View style={styles.confidenceContainer}>
            <View style={[styles.confidenceBar, { width: `${prediction.confidence}%`, backgroundColor: getConfidenceColor() }]} />
          </View>
          <Text style={[styles.confidenceText, { color: getConfidenceColor() }]}>
            {prediction.confidence}%
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Timeframe</Text>
          <Text style={styles.statValue}>{prediction.timeframe}</Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Cambio Est.</Text>
          <Text style={[styles.statValue, { color: getDirectionColor(), fontWeight: '700' }]}>
            {changePercent !== undefined 
              ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`
              : 'N/A'
            }
          </Text>
        </View>
      </View>

      {/* Expandable reasoning */}
      {prediction.reasoning && (
        <TouchableOpacity 
          style={styles.reasoningToggle}
          onPress={() => setShowReasoning(!showReasoning)}
          activeOpacity={0.7}
        >
          <Text style={styles.reasoningToggleText}>
            {showReasoning ? '🔽 Ocultar análisis' : '🔼 Ver análisis detallado'}
          </Text>
        </TouchableOpacity>
      )}

      {showReasoning && prediction.reasoning && (
        <View style={styles.reasoningContainer}>
          <Text style={styles.reasoningLabel}>🧠 Análisis basado en:</Text>
          <View style={styles.reasoningSection}>
            <Text style={styles.reasoningSectionTitle}>📊 Datos de mercado:</Text>
            <Text style={styles.reasoningText}>
              Precio actual, tendencia histórica, volatilidad y volumen del activo.
            </Text>
          </View>
          <View style={styles.reasoningSection}>
            <Text style={styles.reasoningSectionTitle}>🌐 Sentimiento RRSS:</Text>
            <Text style={styles.reasoningText}>
              Análisis de StockTwits, Reddit y Fear & Greed Index para medir el sentimiento del mercado.
            </Text>
          </View>
          {prediction.reasoning.length > 10 && (
            <View style={styles.reasoningSection}>
              <Text style={styles.reasoningSectionTitle}>💡 Conclusión:</Text>
              <Text style={styles.reasoningText}>
                {prediction.reasoning.replace(/```json[\s\S]*?```/g, '').trim().substring(0, 300)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.timestamp}>
          {prediction.createdAt.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
        <Text style={styles.disclaimer}>⚠️ No es consejo financiero</Text>
      </View>
    </View>
  );
};
