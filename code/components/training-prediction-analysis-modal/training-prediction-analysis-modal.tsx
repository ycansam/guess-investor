import React from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TIMEFRAME_INFO, TrainingPrediction } from '../../services/training-cache-service';

interface TrainingPredictionAnalysisModalProps {
  prediction: TrainingPrediction | null;
  onClose: () => void;
}

export const TrainingPredictionAnalysisModal: React.FC<TrainingPredictionAnalysisModalProps> = ({
  prediction,
  onClose,
}) => {
  if (!prediction) return null;

  const analysis = prediction.analysisData;

  // Helper para obtener el score de un factor por nombre
  const getFactorScore = (factorName: string): number | null => {
    if (!analysis?.factorBreakdown?.availableFactors) return null;
    const factor = analysis.factorBreakdown.availableFactors.find(
      f => f.name.toLowerCase() === factorName.toLowerCase()
    );
    return factor?.hasData ? factor.score : null;
  };

  const renderFactorScore = (name: string, emoji: string, factorKey: string) => {
    const score = getFactorScore(factorKey);
    if (score === null || isNaN(score)) {
      return (
        <View key={name} style={styles.factorItem}>
          <Text style={styles.factorEmoji}>{emoji}</Text>
          <View style={styles.factorContent}>
            <Text style={styles.factorName}>{name}</Text>
            <Text style={styles.factorScore}>N/D</Text>
          </View>
        </View>
      );
    }

    const color = score > 20 ? '#10b981' : score < -20 ? '#ef4444' : '#6b7280';
    const sign = score > 0 ? '+' : '';

    return (
      <View key={name} style={styles.factorItem}>
        <Text style={styles.factorEmoji}>{emoji}</Text>
        <View style={styles.factorContent}>
          <Text style={styles.factorName}>{name}</Text>
          <Text style={[styles.factorScore, { color }]}>
            {sign}{Math.round(score)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={prediction !== null}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.headerIcon}>{prediction.icon}</Text>
              <View style={styles.headerTexts}>
                <Text style={styles.title}>{prediction.name}</Text>
                <Text style={styles.subtitle}>{prediction.symbol}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Contenido */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Información Básica */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Información Básica</Text>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Timeframe</Text>
                  <Text style={styles.infoValue}>{TIMEFRAME_INFO[prediction.timeframe]?.label}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Creada</Text>
                  <Text style={styles.infoValue}>
                    {prediction.createdAt.toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Vencimiento</Text>
                  <Text style={styles.infoValue}>
                    {prediction.expiresAt.toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Predicción */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Predicción</Text>
              <View style={styles.predictionBox}>
                <View style={styles.predictionHeader}>
                  <Text style={styles.directionEmoji}>
                    {prediction.direction === 'up' ? '📈' : prediction.direction === 'down' ? '📉' : '➡️'}
                  </Text>
                  <View style={styles.predictionHeaderText}>
                    <Text style={styles.directionLabel}>
                      {prediction.direction === 'up' ? 'Alcista' : prediction.direction === 'down' ? 'Bajista' : 'Neutral'}
                    </Text>
                    <Text style={styles.confidenceLabel}>Confianza: {prediction.confidence}%</Text>
                  </View>
                </View>

                <View style={styles.predictionMetrics}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Cambio esperado</Text>
                    <Text style={[
                      styles.metricValue,
                      { color: prediction.predictedChange >= 0 ? '#10b981' : '#ef4444' }
                    ]}>
                      {prediction.predictedChange >= 0 ? '+' : ''}{prediction.predictedChange.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Precios */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💰 Análisis de Precios</Text>
              <View style={styles.priceAnalysis}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Precio actual</Text>
                  <Text style={styles.priceValue}>{prediction.currentPrice.toFixed(2)}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Precio objetivo</Text>
                  <Text style={[
                    styles.priceValue,
                    { color: prediction.targetPrice > prediction.currentPrice ? '#10b981' : '#ef4444' }
                  ]}>
                    {prediction.targetPrice.toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.priceRow, styles.priceDifference]}>
                  <Text style={styles.priceLabel}>Diferencia</Text>
                  <Text style={[
                    styles.priceValue,
                    { color: prediction.targetPrice >= prediction.currentPrice ? '#10b981' : '#ef4444', fontSize: 16, fontWeight: 'bold' }
                  ]}>
                    {prediction.targetPrice >= prediction.currentPrice ? '+' : ''}
                    {(prediction.targetPrice - prediction.currentPrice).toFixed(2)} ({((prediction.targetPrice - prediction.currentPrice) / prediction.currentPrice * 100).toFixed(2)}%)
                  </Text>
                </View>
              </View>
            </View>

            {/* Factores de Análisis */}
            {analysis?.factorBreakdown && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📊 Desglose de Factores</Text>
                <View style={styles.factorsGrid}>
                  {renderFactorScore('Tendencia', '📈', 'trend')}
                  {renderFactorScore('Técnico', '📊', 'technical')}
                  {renderFactorScore('Sentimiento', '💬', 'sentiment')}
                  {renderFactorScore('Noticias', '📰', 'news')}
                  {renderFactorScore('Macro', '🌍', 'macro')}
                  {renderFactorScore('Competidores', '🏭', 'competitors')}
                  {renderFactorScore('Forex', '💱', 'forex')}
                  {renderFactorScore('Institucionales', '🏛️', 'institutional')}
                  {renderFactorScore('Financieros', '💰', 'financials')}
                  {renderFactorScore('Expectativas', '🎯', 'expectations')}
                </View>

                {analysis.factorBreakdown.confidenceExplanation && (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      💡 {analysis.factorBreakdown.confidenceExplanation}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Tendencia Histórica */}
            {analysis?.historical && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📊 Tendencia histórica</Text>
                <View style={styles.historicalBox}>
                  <View style={styles.historicalRow}>
                    <Text style={styles.historicalLabel}>Últimos 30 días</Text>
                    <Text style={[
                      styles.historicalValue,
                      { color: analysis.historical.change30d >= 0 ? '#10b981' : '#ef4444' }
                    ]}>
                      {analysis.historical.change30d >= 0 ? '+' : ''}{analysis.historical.change30d.toFixed(2)}%
                    </Text>
                  </View>
                  <View style={styles.historicalRow}>
                    <Text style={styles.historicalLabel}>Últimos 90 días</Text>
                    <Text style={[
                      styles.historicalValue,
                      { color: analysis.historical.change90d >= 0 ? '#10b981' : '#ef4444' }
                    ]}>
                      {analysis.historical.change90d >= 0 ? '+' : ''}{analysis.historical.change90d.toFixed(2)}%
                    </Text>
                  </View>
                  <View style={styles.historicalRow}>
                    <Text style={styles.historicalLabel}>Volatilidad</Text>
                    <Text style={styles.historicalValue}>
                      {analysis.historical.volatility.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Sentimiento del Mercado */}
            {analysis?.sentiment && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🌐 Sentimiento del mercado</Text>
                <View style={styles.sentimentBox}>
                  <Text style={styles.sentimentScore}>
                    {analysis.sentiment.score}% {analysis.sentiment.score > 55 ? 'Alcista 📈' : analysis.sentiment.score < 45 ? 'Bajista 📉' : 'Neutral ➖'}
                  </Text>
                  <Text style={styles.sentimentSource}>Fuente: {analysis.sentiment.source}</Text>

                  {analysis.sentiment.vix && (
                    <View style={styles.sentimentDetail}>
                      <Text style={styles.sentimentDetailLabel}>📊 VIX (Índice del Miedo)</Text>
                      <Text style={styles.sentimentDetailValue}>
                        {analysis.sentiment.vix.value.toFixed(2)} - {analysis.sentiment.vix.sentiment}
                      </Text>
                    </View>
                  )}

                  {analysis.sentiment.putCallRatio && (
                    <View style={styles.sentimentDetail}>
                      <Text style={styles.sentimentDetailLabel}>📈 Put/Call Ratio (SPX)</Text>
                      <Text style={styles.sentimentDetailValue}>
                        {analysis.sentiment.putCallRatio.ratio.toFixed(2)} - {analysis.sentiment.putCallRatio.sentiment}
                      </Text>
                    </View>
                  )}

                  {analysis.sentiment.overallScore !== undefined && (
                    <View style={styles.sentimentDetail}>
                      <Text style={styles.sentimentDetailLabel}>Score combinado</Text>
                      <Text style={styles.sentimentDetailValue}>
                        {analysis.sentiment.overallScore > 0 ? '+' : ''}{analysis.sentiment.overallScore}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Noticias */}
            {analysis?.news && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📰 Noticias recientes</Text>
                <View style={styles.newsBox}>
                  <Text style={styles.newsScore}>
                    {analysis.news.sentiment === 'positive' ? '➕ Positivo' : analysis.news.sentiment === 'negative' ? '➖ Negativo' : '➖ Neutral'}
                  </Text>
                  <Text style={styles.newsCount}>
                    {analysis.news.count} noticias analizadas
                  </Text>
                  {analysis.news.summary && (
                    <Text style={styles.newsSummary}>{analysis.news.summary}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Análisis Técnico - removido porque no está en la estructura actual */}

            {/* Macro */}
            {analysis?.macro && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🌍 Contexto macroeconómico</Text>
                <View style={styles.macroBox}>
                  <Text style={styles.macroRegion}>{analysis.macro.region}</Text>
                  <Text style={styles.macroScore}>
                    {analysis.macro.outlook === 'favorable' ? '📈 Favorable' : analysis.macro.outlook === 'unfavorable' ? '📉 Desfavorable' : '➖ Neutral'}
                  </Text>
                  {analysis.macro.summary && (
                    <Text style={styles.macroSummary}>{analysis.macro.summary}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Competidores */}
            {analysis?.competitors && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏢 Competidores y sector</Text>
                <View style={styles.competitorsBox}>
                  <Text style={styles.competitorsSector}>{analysis.competitors.sector}</Text>
                  <Text style={styles.competitorsScore}>
                    {analysis.competitors.sectorTrend === 'bullish' ? '📈 Alcista' : analysis.competitors.sectorTrend === 'bearish' ? '📉 Bajista' : '➖ Neutral'}
                  </Text>
                  {analysis.competitors.summary && (
                    <Text style={styles.competitorsSummary}>{analysis.competitors.summary}</Text>
                  )}
                  {analysis.competitors.competitorNames && analysis.competitors.competitorNames.length > 0 && (
                    <Text style={styles.competitorsSummary}>Comparado con: {analysis.competitors.competitorNames.join(', ')}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Forex */}
            {analysis?.forex && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💱 Tipos de cambio</Text>
                <View style={styles.forexBox}>
                  <Text style={styles.forexBase}>Base: {analysis.forex.baseCurrency}</Text>
                  <Text style={styles.forexScore}>
                    {analysis.forex.trend === 'eur_strong' ? '📈 EUR fuerte' : analysis.forex.trend === 'eur_weak' ? '📉 EUR débil' : '➖ Estable'}
                  </Text>
                  {analysis.forex.mainPairs && analysis.forex.mainPairs.length > 0 && (
                    <Text style={styles.forexPairs}>Pares analizados: {analysis.forex.mainPairs.join(', ')}</Text>
                  )}
                  {analysis.forex.summary && (
                    <Text style={styles.forexSummary}>{analysis.forex.summary}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Financieros */}
            {analysis?.financials && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💰 Datos Financieros</Text>
                <View style={styles.financialsBox}>
                  {analysis.financials.revenueGrowth !== undefined && (
                    <View style={styles.financialRow}>
                      <Text style={styles.financialLabel}>Crecimiento ingresos</Text>
                      <Text style={styles.financialValue}>{analysis.financials.revenueGrowth.toFixed(1)}%</Text>
                    </View>
                  )}
                  {analysis.financials.profitMargin !== undefined && (
                    <View style={styles.financialRow}>
                      <Text style={styles.financialLabel}>Margen beneficio</Text>
                      <Text style={styles.financialValue}>{analysis.financials.profitMargin.toFixed(1)}%</Text>
                    </View>
                  )}
                  {analysis.financials.peRatio !== undefined && (
                    <View style={styles.financialRow}>
                      <Text style={styles.financialLabel}>PER</Text>
                      <Text style={styles.financialValue}>{analysis.financials.peRatio.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Conclusión - usar reasoning del prediction principal */}
            {prediction.reasoning && !analysis && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💡 Análisis</Text>
                <View style={styles.conclusionBox}>
                  <Text style={styles.conclusionText}>{prediction.reasoning}</Text>
                </View>
              </View>
            )}

            {/* Auditoría */}
            {analysis?.audit && analysis.audit.dataSources && analysis.audit.dataSources.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔍 Auditoría - Verificar datos</Text>
                <Text style={styles.auditSubtitle}>Puedes verificar cada dato haciendo clic en los enlaces:</Text>
                <View style={styles.auditBox}>
                  {analysis.audit.dataSources.map((source, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.auditItem}
                      onPress={() => {
                        if (source.url) {
                          Linking.openURL(source.url);
                        }
                      }}
                    >
                      <View style={styles.auditItemHeader}>
                        <Text style={styles.auditItemTitle}>{source.name}</Text>
                        {source.url && <Text style={styles.auditItemLink}>🔗 Verificar →</Text>}
                      </View>
                      {source.rawValue && (
                        <Text style={styles.auditItemData}>{source.rawValue}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Cálculo Matemático */}
            {analysis?.audit && analysis.audit.calculationSteps && analysis.audit.calculationSteps.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📐 Cálculo matemático</Text>
                <View style={styles.calculationBox}>
                  {analysis.audit.calculationSteps.map((calc, idx) => (
                    <View key={idx} style={styles.calculationItem}>
                      <Text style={styles.calculationStep}>{calc.step}</Text>
                      <Text style={styles.calculationFormula}>{calc.formula}</Text>
                      <Text style={styles.calculationResult}>= {calc.result}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Análisis Detallado (fallback al reasoning) */}
            {!analysis && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🧠 Análisis Detallado</Text>
                <View style={styles.reasoningBox}>
                  <Text style={styles.reasoningText}>{prediction.reasoning}</Text>
                </View>
              </View>
            )}

            {/* Disclaimer */}
            <View style={styles.section}>
              <View style={styles.disclaimerBox}>
                <Text style={styles.disclaimerText}>
                  ⚠️ Esta predicción fue generada por IA basándose en análisis de múltiples factores técnicos, fundamentales y de mercado. No constituye consejo financiero. El trading conlleva riesgo de pérdida total del capital.
                </Text>
              </View>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeFooterButton} onPress={onClose}>
              <Text style={styles.closeFooterButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  container: {
    flex: 0.95,
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#818cf8',
    marginBottom: 12,
  },
  infoGrid: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  infoLabel: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: '#818cf8',
    fontWeight: '600',
  },
  predictionBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  directionEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  predictionHeaderText: {
    flex: 1,
  },
  directionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  confidenceLabel: {
    fontSize: 14,
    color: '#818cf8',
    marginTop: 4,
    fontWeight: '600',
  },
  predictionMetrics: {
    marginTop: 12,
  },
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
  },
  metricLabel: {
    fontSize: 13,
    color: '#9ca3af',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  priceAnalysis: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  priceDifference: {
    borderTopWidth: 1,
    borderTopColor: '#2e2e2e',
    marginTop: 8,
    paddingTop: 12,
  },
  priceLabel: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
  },
  factorsGrid: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  factorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  factorEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  factorContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  factorName: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  factorScore: {
    fontSize: 14,
    fontWeight: '700',
  },
  warningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  warningText: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 18,
  },
  historicalBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  historicalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  historicalLabel: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  historicalValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  sentimentBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
  },
  sentimentScore: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 4,
  },
  sentimentSource: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 12,
  },
  sentimentDetail: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    marginTop: 8,
  },
  sentimentDetailLabel: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 4,
  },
  sentimentDetailValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
  },
  technicalBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  technicalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  technicalLabel: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  technicalValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
  },
  newsBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
  },
  newsScore: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 4,
  },
  newsCount: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  newsSummary: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 18,
  },
  macroBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
  },
  macroRegion: {
    fontSize: 14,
    color: '#818cf8',
    fontWeight: '600',
    marginBottom: 4,
  },
  macroScore: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 8,
  },
  macroSummary: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 18,
  },
  competitorsBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
  },
  competitorsSector: {
    fontSize: 14,
    color: '#818cf8',
    fontWeight: '600',
    marginBottom: 4,
  },
  competitorsScore: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 8,
  },
  competitorsSummary: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 18,
  },
  forexBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
  },
  forexBase: {
    fontSize: 14,
    color: '#818cf8',
    fontWeight: '600',
    marginBottom: 4,
  },
  forexScore: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 4,
  },
  forexPairs: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  forexSummary: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 18,
  },
  seasonalityBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
  },
  seasonalitySector: {
    fontSize: 14,
    color: '#818cf8',
    fontWeight: '600',
    marginBottom: 4,
  },
  seasonalityScore: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 4,
  },
  seasonalityCountry: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 8,
  },
  seasonalityEvents: {
    marginVertical: 8,
  },
  seasonalityEvent: {
    fontSize: 13,
    color: '#ffffff',
    marginBottom: 4,
  },
  seasonalitySummary: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 18,
  },
  financialsBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  financialLabel: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  financialValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
  },
  conclusionBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  conclusionText: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 20,
  },
  auditSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  auditBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  auditItem: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  auditItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  auditItemTitle: {
    fontSize: 13,
    color: '#818cf8',
    fontWeight: '600',
  },
  auditItemLink: {
    fontSize: 12,
    color: '#818cf8',
  },
  auditItemData: {
    fontSize: 12,
    color: '#9ca3af',
  },
  calculationBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  calculationItem: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  calculationStep: {
    fontSize: 13,
    color: '#818cf8',
    fontWeight: '600',
    marginBottom: 4,
  },
  calculationFormula: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  calculationResult: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
  },
  reasoningBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  reasoningText: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 20,
  },
  disclaimerBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#ffffff',
    lineHeight: 18,
  },
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#2e2e2e',
  },
  closeFooterButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
