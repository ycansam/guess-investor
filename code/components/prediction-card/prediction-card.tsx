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
          <Text style={styles.reasoningLabel}>🧠 Análisis basado en datos reales:</Text>
          
          {/* Datos de mercado reales */}
          <View style={styles.reasoningSection}>
            <Text style={styles.reasoningSectionTitle}>📊 Tendencia histórica:</Text>
            {prediction.analysisData?.historical ? (
              <View style={styles.dataGrid}>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Últimos 30 días</Text>
                  <Text style={[
                    styles.dataValue, 
                    { color: prediction.analysisData.historical.change30d >= 0 ? '#4CAF50' : '#F44336' }
                  ]}>
                    {prediction.analysisData.historical.change30d >= 0 ? '+' : ''}
                    {prediction.analysisData.historical.change30d.toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Últimos 90 días</Text>
                  <Text style={[
                    styles.dataValue, 
                    { color: prediction.analysisData.historical.change90d >= 0 ? '#4CAF50' : '#F44336' }
                  ]}>
                    {prediction.analysisData.historical.change90d >= 0 ? '+' : ''}
                    {prediction.analysisData.historical.change90d.toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Volatilidad</Text>
                  <Text style={[
                    styles.dataValue,
                    { color: prediction.analysisData.historical.volatility > 40 ? '#F44336' : 
                             prediction.analysisData.historical.volatility > 25 ? '#FF9800' : '#4CAF50' }
                  ]}>
                    {prediction.analysisData.historical.volatility.toFixed(1)}%
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.reasoningText}>Sin datos históricos disponibles</Text>
            )}
          </View>

          {/* Sentimiento RRSS real */}
          <View style={styles.reasoningSection}>
            <Text style={styles.reasoningSectionTitle}>🌐 Sentimiento en redes:</Text>
            {prediction.analysisData?.sentiment ? (
              <View style={styles.sentimentContainer}>
                <View style={styles.sentimentBar}>
                  <View style={[
                    styles.sentimentFill,
                    { 
                      width: `${prediction.analysisData.sentiment.score}%`,
                      backgroundColor: prediction.analysisData.sentiment.score >= 60 ? '#4CAF50' : 
                                      prediction.analysisData.sentiment.score >= 40 ? '#FF9800' : '#F44336'
                    }
                  ]} />
                </View>
                <View style={styles.sentimentInfo}>
                  <Text style={styles.sentimentScore}>
                    {prediction.analysisData.sentiment.score}% 
                    {prediction.analysisData.sentiment.score >= 60 ? ' Bullish 🐂' : 
                     prediction.analysisData.sentiment.score >= 40 ? ' Neutro 😐' : ' Bearish 🐻'}
                  </Text>
                  <Text style={styles.sentimentSource}>
                    Fuente: {prediction.analysisData.sentiment.source}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.reasoningText}>Sin datos de sentimiento disponibles</Text>
            )}
          </View>

          {/* Datos financieros (solo para acciones) */}
          {prediction.analysisData?.financials && (
            <View style={styles.reasoningSection}>
              <Text style={styles.reasoningSectionTitle}>📈 Resultados financieros:</Text>
              <View style={styles.financialsContainer}>
                <View style={styles.financialsRow}>
                  <View style={styles.financialItem}>
                    <Text style={styles.financialLabel}>Ingresos</Text>
                    <Text style={styles.financialValue}>{prediction.analysisData.financials.revenue}</Text>
                  </View>
                  <View style={styles.financialItem}>
                    <Text style={styles.financialLabel}>Crec. Ingresos</Text>
                    <Text style={[
                      styles.financialValue,
                      { color: prediction.analysisData.financials.revenueGrowth >= 0 ? '#4CAF50' : '#F44336' }
                    ]}>
                      {prediction.analysisData.financials.revenueGrowth >= 0 ? '+' : ''}
                      {prediction.analysisData.financials.revenueGrowth.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.financialItem}>
                    <Text style={styles.financialLabel}>Beneficio</Text>
                    <Text style={styles.financialValue}>{prediction.analysisData.financials.netIncome}</Text>
                  </View>
                </View>
                <View style={styles.financialsRow}>
                  <View style={styles.financialItem}>
                    <Text style={styles.financialLabel}>Crec. Beneficio</Text>
                    <Text style={[
                      styles.financialValue,
                      { color: prediction.analysisData.financials.earningsGrowth >= 0 ? '#4CAF50' : '#F44336' }
                    ]}>
                      {prediction.analysisData.financials.earningsGrowth >= 0 ? '+' : ''}
                      {prediction.analysisData.financials.earningsGrowth.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.financialItem}>
                    <Text style={styles.financialLabel}>Margen Neto</Text>
                    <Text style={[
                      styles.financialValue,
                      { color: prediction.analysisData.financials.profitMargin >= 10 ? '#4CAF50' : 
                               prediction.analysisData.financials.profitMargin >= 5 ? '#FF9800' : '#F44336' }
                    ]}>
                      {prediction.analysisData.financials.profitMargin.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.financialItem}>
                    <Text style={styles.financialLabel}>PER</Text>
                    <Text style={[
                      styles.financialValue,
                      { color: prediction.analysisData.financials.peRatio > 0 && prediction.analysisData.financials.peRatio < 25 
                          ? '#4CAF50' 
                          : prediction.analysisData.financials.peRatio > 40 ? '#F44336' : '#FF9800' }
                    ]}>
                      {prediction.analysisData.financials.peRatio > 0 
                        ? prediction.analysisData.financials.peRatio.toFixed(1) 
                        : 'N/A'}
                    </Text>
                  </View>
                </View>
                {/* Rating y precio objetivo */}
                <View style={styles.analystRow}>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingLabel}>Rating Analistas</Text>
                    <Text style={[
                      styles.ratingValue,
                      { color: prediction.analysisData.financials.analystRating.includes('Compra') ? '#4CAF50' : 
                               prediction.analysisData.financials.analystRating.includes('Venta') ? '#F44336' : '#FF9800' }
                    ]}>
                      {prediction.analysisData.financials.analystRating}
                    </Text>
                  </View>
                  {prediction.analysisData.financials.targetPrice > 0 && (
                    <View style={styles.targetPriceContainer}>
                      <Text style={styles.targetPriceLabel}>Precio objetivo</Text>
                      <Text style={styles.targetPriceValue}>
                        €{prediction.analysisData.financials.targetPrice.toFixed(2)}
                      </Text>
                      <Text style={[
                        styles.targetPriceDiff,
                        { color: prediction.analysisData.financials.currentVsTarget >= 0 ? '#4CAF50' : '#F44336' }
                      ]}>
                        ({prediction.analysisData.financials.currentVsTarget >= 0 ? '+' : ''}
                        {prediction.analysisData.financials.currentVsTarget.toFixed(1)}%)
                      </Text>
                    </View>
                  )}
                </View>
                {/* Score general */}
                <View style={styles.overallScoreContainer}>
                  <Text style={styles.overallScoreLabel}>Score Fundamentales</Text>
                  <View style={styles.overallScoreBarBg}>
                    <View style={[
                      styles.overallScoreBar,
                      { 
                        width: `${prediction.analysisData.financials.overallScore}%`,
                        backgroundColor: prediction.analysisData.financials.overallScore >= 70 ? '#4CAF50' : 
                                        prediction.analysisData.financials.overallScore >= 50 ? '#FF9800' : '#F44336'
                      }
                    ]} />
                  </View>
                  <Text style={[
                    styles.overallScoreValue,
                    { color: prediction.analysisData.financials.overallScore >= 70 ? '#4CAF50' : 
                             prediction.analysisData.financials.overallScore >= 50 ? '#FF9800' : '#F44336' }
                  ]}>
                    {prediction.analysisData.financials.overallScore}/100
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Conclusión */}
          <View style={styles.reasoningSection}>
            <Text style={styles.reasoningSectionTitle}>💡 Conclusión:</Text>
            <Text style={styles.conclusionText}>
              {prediction.analysisData?.historical && prediction.analysisData?.sentiment ? (
                prediction.analysisData.historical.change30d >= 0 && prediction.analysisData.sentiment.score >= 50
                  ? `La tendencia a 30 días es positiva (+${prediction.analysisData.historical.change30d.toFixed(1)}%) y el sentimiento social es ${prediction.analysisData.sentiment.score >= 60 ? 'optimista' : 'neutro'} (${prediction.analysisData.sentiment.score}%), lo que sugiere momentum alcista.`
                  : prediction.analysisData.historical.change30d < 0 && prediction.analysisData.sentiment.score < 50
                    ? `La tendencia a 30 días es negativa (${prediction.analysisData.historical.change30d.toFixed(1)}%) y el sentimiento social es ${prediction.analysisData.sentiment.score < 40 ? 'pesimista' : 'neutro'} (${prediction.analysisData.sentiment.score}%), lo que sugiere presión bajista.`
                    : `Señales mixtas: tendencia ${prediction.analysisData.historical.change30d >= 0 ? 'positiva' : 'negativa'} (${prediction.analysisData.historical.change30d.toFixed(1)}%) pero sentimiento ${prediction.analysisData.sentiment.score >= 50 ? 'positivo' : 'negativo'} (${prediction.analysisData.sentiment.score}%). Se recomienda cautela.`
              ) : (
                prediction.reasoning.replace(/```json[\s\S]*?```/g, '').trim().substring(0, 300)
              )}
            </Text>
          </View>
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
