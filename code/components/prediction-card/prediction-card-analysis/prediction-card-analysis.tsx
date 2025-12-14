import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { InvestmentPrediction } from '../../../types';
import { styles } from './prediction-card-analysis.styles';

interface PredictionCardAnalysisProps {
  prediction: InvestmentPrediction;
}

export const PredictionCardAnalysis: React.FC<PredictionCardAnalysisProps> = ({ prediction }) => {
  const [showReasoning, setShowReasoning] = useState(false);

  if (!prediction.reasoning) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setShowReasoning(!showReasoning)}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleButtonText}>
          {showReasoning ? '🔽 Ocultar análisis' : '🔼 Ver análisis detallado'}
        </Text>
      </TouchableOpacity>

      {showReasoning && (
        <View style={styles.container}>
          <Text style={styles.label}>🧠 Análisis basado en datos reales:</Text>

          {/* Tendencia histórica */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Tendencia histórica:</Text>
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
              <Text style={styles.text}>Sin datos históricos disponibles</Text>
            )}
          </View>

          {/* Sentimiento RRSS */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🌐 Sentimiento en redes:</Text>
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
              <Text style={styles.text}>Sin datos de sentimiento disponibles</Text>
            )}
          </View>

          {/* Financials (solo acciones) */}
          {prediction.analysisData?.financials && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📈 Resultados financieros:</Text>
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

          {/* Noticias recientes */}
          {prediction.analysisData?.news && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📰 Noticias recientes:</Text>
              <View style={styles.newsContainer}>
                <View style={styles.newsHeader}>
                  <Text style={[
                    styles.newsSentiment,
                    { color: prediction.analysisData.news.sentiment === 'positive' ? '#4CAF50' :
                             prediction.analysisData.news.sentiment === 'negative' ? '#F44336' : '#FF9800' }
                  ]}>
                    {prediction.analysisData.news.sentiment === 'positive' ? '📈 Positivo' :
                     prediction.analysisData.news.sentiment === 'negative' ? '📉 Negativo' : '➖ Neutral'}
                  </Text>
                  <Text style={styles.newsCount}>
                    {prediction.analysisData.news.count} noticias analizadas
                  </Text>
                </View>
                <Text style={styles.newsSummary}>{prediction.analysisData.news.summary}</Text>
              </View>
            </View>
          )}

          {/* Contexto macroeconómico */}
          {prediction.analysisData?.macro && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🌍 Contexto macroeconómico:</Text>
              <View style={styles.macroContainer}>
                <View style={styles.macroHeader}>
                  <Text style={styles.macroRegion}>{prediction.analysisData.macro.region}</Text>
                  <Text style={[
                    styles.macroOutlook,
                    { color: prediction.analysisData.macro.outlook === 'favorable' ? '#4CAF50' :
                             prediction.analysisData.macro.outlook === 'unfavorable' ? '#F44336' : '#FF9800' }
                  ]}>
                    {prediction.analysisData.macro.outlook === 'favorable' ? '✅ Favorable' :
                     prediction.analysisData.macro.outlook === 'unfavorable' ? '⚠️ Desfavorable' : '➖ Neutral'}
                  </Text>
                </View>
                <Text style={styles.macroSummary}>{prediction.analysisData.macro.summary}</Text>
              </View>
            </View>
          )}

          {/* Análisis de competidores */}
          {prediction.analysisData?.competitors && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏢 Competidores y sector:</Text>
              <View style={styles.competitorsContainer}>
                <View style={styles.competitorsHeader}>
                  <Text style={styles.competitorsSector}>{prediction.analysisData.competitors.sector}</Text>
                  <Text style={[
                    styles.competitorsTrend,
                    { color: prediction.analysisData.competitors.sectorTrend === 'bullish' ? '#4CAF50' :
                             prediction.analysisData.competitors.sectorTrend === 'bearish' ? '#F44336' : '#FF9800' }
                  ]}>
                    {prediction.analysisData.competitors.sectorTrend === 'bullish' ? '📈 Sector alcista' :
                     prediction.analysisData.competitors.sectorTrend === 'bearish' ? '📉 Sector bajista' : '➖ Sector neutro'}
                  </Text>
                </View>
                <View style={styles.competitorsOutperform}>
                  <Text style={[
                    styles.outperformBadge,
                    { backgroundColor: prediction.analysisData.competitors.outperforming ? '#E8F5E9' : '#FFF3E0' }
                  ]}>
                    <Text style={{ color: prediction.analysisData.competitors.outperforming ? '#4CAF50' : '#FF9800' }}>
                      {prediction.analysisData.competitors.outperforming ? '🏆 Supera a competidores' : '📊 En línea con competidores'}
                    </Text>
                  </Text>
                </View>
                <Text style={styles.competitorsNames}>
                  Comparado con: {prediction.analysisData.competitors.competitorNames.join(', ')}
                </Text>
                <Text style={styles.competitorsSummary}>{prediction.analysisData.competitors.summary}</Text>
              </View>
            </View>
          )}

          {/* Tipos de cambio */}
          {prediction.analysisData?.forex && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💱 Tipos de cambio:</Text>
              <View style={styles.forexContainer}>
                <View style={styles.forexHeader}>
                  <Text style={styles.forexBaseCurrency}>Base: {prediction.analysisData.forex.baseCurrency}</Text>
                  <Text style={[
                    styles.forexTrend,
                    { color: prediction.analysisData.forex.trend === 'eur_weak' ? '#4CAF50' :
                             prediction.analysisData.forex.trend === 'eur_strong' ? '#F44336' : '#FF9800' }
                  ]}>
                    {prediction.analysisData.forex.trend === 'eur_weak' ? '📈 EUR débil (favorable)' :
                     prediction.analysisData.forex.trend === 'eur_strong' ? '📉 EUR fuerte (desfavorable)' : '➖ Estable'}
                  </Text>
                </View>
                <Text style={styles.forexPairs}>
                  Pares analizados: {prediction.analysisData.forex.mainPairs.join(', ')}
                </Text>
                <Text style={styles.forexSummary}>{prediction.analysisData.forex.summary}</Text>
              </View>
            </View>
          )}

          {/* Inversores institucionales */}
          {prediction.analysisData?.institutional && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏦 Grandes inversores:</Text>
              <View style={styles.institutionalContainer}>
                {/* Propiedad institucional */}
                {prediction.analysisData.institutional.ownershipPercent !== undefined && (
                  <View style={styles.institutionalRow}>
                    <View style={styles.institutionalItem}>
                      <Text style={styles.institutionalLabel}>Propiedad institucional</Text>
                      <Text style={styles.institutionalValue}>
                        {prediction.analysisData.institutional.ownershipPercent.toFixed(1)}%
                      </Text>
                    </View>
                    {prediction.analysisData.institutional.numberOfInstitutions !== undefined && (
                      <View style={styles.institutionalItem}>
                        <Text style={styles.institutionalLabel}>Nº de fondos</Text>
                        <Text style={styles.institutionalValue}>
                          {prediction.analysisData.institutional.numberOfInstitutions}
                        </Text>
                      </View>
                    )}
                    {prediction.analysisData.institutional.ownershipTrend && (
                      <View style={styles.institutionalItem}>
                        <Text style={styles.institutionalLabel}>Tendencia</Text>
                        <Text style={[
                          styles.institutionalValue,
                          { color: prediction.analysisData.institutional.ownershipTrend === 'increasing' ? '#4CAF50' :
                                   prediction.analysisData.institutional.ownershipTrend === 'decreasing' ? '#F44336' : '#FF9800' }
                        ]}>
                          {prediction.analysisData.institutional.ownershipTrend === 'increasing' ? '📈 Aumentando' :
                           prediction.analysisData.institutional.ownershipTrend === 'decreasing' ? '📉 Disminuyendo' : '➖ Estable'}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
                
                {/* Transacciones de insiders */}
                {prediction.analysisData.institutional.insiderTrend && (
                  <View style={styles.insiderSection}>
                    <Text style={[
                      styles.insiderBadge,
                      { backgroundColor: prediction.analysisData.institutional.insiderTrend === 'buying' ? '#E8F5E9' :
                                        prediction.analysisData.institutional.insiderTrend === 'selling' ? '#FFEBEE' : '#FFF3E0' }
                    ]}>
                      <Text style={{
                        color: prediction.analysisData.institutional.insiderTrend === 'buying' ? '#4CAF50' :
                               prediction.analysisData.institutional.insiderTrend === 'selling' ? '#F44336' : '#FF9800'
                      }}>
                        {prediction.analysisData.institutional.insiderTrend === 'buying' ? '💰 Insiders comprando' :
                         prediction.analysisData.institutional.insiderTrend === 'selling' ? '📤 Insiders vendiendo' : '⚖️ Actividad equilibrada'}
                      </Text>
                    </Text>
                    {prediction.analysisData.institutional.insiderNetValue !== undefined && (
                      <Text style={styles.insiderValue}>
                        Valor neto: {prediction.analysisData.institutional.insiderNetValue >= 0 ? '+' : ''}
                        ${(prediction.analysisData.institutional.insiderNetValue / 1000000).toFixed(2)}M
                      </Text>
                    )}
                  </View>
                )}
                
                {/* Top holders */}
                {prediction.analysisData.institutional.topHolders?.length > 0 && (
                  <Text style={styles.institutionalHolders}>
                    Principales: {prediction.analysisData.institutional.topHolders.join(', ')}
                  </Text>
                )}
                
                <Text style={styles.institutionalSummary}>{prediction.analysisData.institutional.summary}</Text>
              </View>
            </View>
          )}

          {/* Estacionalidad */}
          {prediction.analysisData?.seasonality && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📅 Estacionalidad:</Text>
              <View style={styles.seasonalityContainer}>
                <View style={styles.seasonalityHeader}>
                  <Text style={styles.seasonalitySector}>{prediction.analysisData.seasonality.sector}</Text>
                  <Text style={[
                    styles.seasonalityScore,
                    { color: prediction.analysisData.seasonality.score > 15 ? '#4CAF50' :
                             prediction.analysisData.seasonality.score < -15 ? '#F44336' : '#FF9800' }
                  ]}>
                    {prediction.analysisData.seasonality.score > 15 ? '📈 Favorable' :
                     prediction.analysisData.seasonality.score < -15 ? '📉 Desfavorable' : '➖ Neutral'}
                  </Text>
                </View>
                <View style={styles.seasonalityMetaRow}>
                  <Text style={styles.seasonalitySeason}>
                    Estación: {prediction.analysisData.seasonality.currentSeason}
                  </Text>
                  {prediction.analysisData.seasonality.region && prediction.analysisData.seasonality.region !== 'global' && (
                    <Text style={styles.seasonalityRegion}>
                      {prediction.analysisData.seasonality.region}
                    </Text>
                  )}
                </View>
                {prediction.analysisData.seasonality.events.length > 0 && (
                  <View style={styles.seasonalityEvents}>
                    {prediction.analysisData.seasonality.events.map((event, index) => (
                      <Text key={index} style={styles.seasonalityEvent}>
                        🎯 {event}
                      </Text>
                    ))}
                  </View>
                )}
                <Text style={styles.seasonalitySummary}>{prediction.analysisData.seasonality.summary}</Text>
              </View>
            </View>
          )}

          {/* Conclusión */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💡 Conclusión:</Text>
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
    </>
  );
};
