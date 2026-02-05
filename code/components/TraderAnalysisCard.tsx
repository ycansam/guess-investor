/**
 * Trader Analysis Card - VERSIÓN SIMPLIFICADA
 * Análisis técnico explicado de forma clara para cualquier persona
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import theme from '../config/theme';

const API_BASE = 'http://localhost:3001/api';

interface TraderAnalysisProps {
  symbol: string;
  onClose?: () => void;
}

interface RiskRewardData {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  riskPercent: number;
  rewardPercent: number;
  breakEvenWinRate: number;
  kellyPercent: number;
  suggestedPositionSize: string;
  tradeQuality: string;
  qualityScore: number;
  riskRewardDisplay: string;
  riskRewardEmoji: string;
}

interface DivergenceData {
  hasDivergence: boolean;
  overallBias: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  signals: Array<{
    type: 'bullish' | 'bearish';
    indicator: string;
    description: string;
  }>;
}

interface OptionsFlowData {
  putCallRatio: number;
  putCallSignal: string;
  impliedVolatility: number;
  ivSignal: string;
  overallSignal: string;
  summary: string;
  hasData: boolean;
}

interface Recommendation {
  action: 'strong_entry' | 'entry' | 'wait' | 'avoid';
  confidence: number;
  reasons: string[];
  warnings: string[];
}

interface TraderAnalysisData {
  symbol: string;
  direction: 'long' | 'short';
  divergences: DivergenceData;
  riskReward: RiskRewardData;
  optionsFlow: OptionsFlowData;
  recommendation: Recommendation;
}

// Componente para explicaciones
function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  
  if (!visible) {
    return (
      <TouchableOpacity onPress={() => setVisible(true)} style={styles.infoButton}>
        <Ionicons name="help-circle-outline" size={16} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    );
  }
  
  return (
    <TouchableOpacity onPress={() => setVisible(false)} style={styles.tooltipContainer}>
      <Text style={styles.tooltipText}>{text}</Text>
    </TouchableOpacity>
  );
}

export function TraderAnalysisCard({ symbol, onClose }: TraderAnalysisProps) {
  const [data, setData] = useState<TraderAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/analysis/trader-full/${symbol}?direction=long`);
      const json = await response.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError('No se pudo obtener el análisis');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };

  // Traducciones simples
  const getSimpleVerdict = (action: string): { text: string; emoji: string; color: string; explanation: string } => {
    switch (action) {
      case 'strong_entry':
        return {
          text: '¡BUENA OPORTUNIDAD!',
          emoji: '🚀',
          color: theme.colors.success,
          explanation: 'Las señales indican que es buen momento para comprar'
        };
      case 'entry':
        return {
          text: 'Puede ser buen momento',
          emoji: '👍',
          color: '#4CAF50',
          explanation: 'Hay señales positivas, pero no perfectas'
        };
      case 'wait':
        return {
          text: 'Mejor esperar',
          emoji: '⏳',
          color: theme.colors.warning,
          explanation: 'No hay señales claras, espera a que mejore'
        };
      case 'avoid':
        return {
          text: 'No recomendado ahora',
          emoji: '⛔',
          color: theme.colors.danger,
          explanation: 'Las señales son negativas, mejor buscar otra opción'
        };
      default:
        return {
          text: 'Sin datos',
          emoji: '❓',
          color: theme.colors.textSecondary,
          explanation: ''
        };
    }
  };

  const getTradeQualitySimple = (quality: string): { text: string; color: string } => {
    switch (quality) {
      case 'excellent':
        return { text: '⭐ Excelente', color: theme.colors.success };
      case 'good':
        return { text: '👍 Buena', color: '#4CAF50' };
      case 'acceptable':
        return { text: '👌 Aceptable', color: theme.colors.warning };
      case 'poor':
        return { text: '👎 Mala', color: theme.colors.danger };
      default:
        return { text: quality, color: theme.colors.textSecondary };
    }
  };

  const formatMoney = (value: number) => {
    return value >= 1000 
      ? `$${(value / 1000).toFixed(1)}k` 
      : `$${value.toFixed(2)}`;
  };

  // Vista colapsada
  if (!expanded) {
    return (
      <TouchableOpacity 
        style={styles.collapsedContainer}
        onPress={() => {
          setExpanded(true);
          if (!data) fetchAnalysis();
        }}
      >
        <View style={styles.collapsedHeader}>
          <Ionicons name="bulb-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.collapsedTitle}>¿Es buen momento para invertir?</Text>
          <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
        </View>
        <Text style={styles.collapsedSubtitle}>
          Toca para ver el análisis simplificado
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bulb" size={24} color={theme.colors.primary} />
          <Text style={styles.title}>Análisis Simplificado</Text>
        </View>
        <TouchableOpacity onPress={() => setExpanded(false)}>
          <Ionicons name="chevron-up" size={24} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Analizando {symbol}...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={32} color={theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchAnalysis}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          {/* VEREDICTO PRINCIPAL */}
          {(() => {
            const verdict = getSimpleVerdict(data.recommendation.action);
            return (
              <View style={[styles.verdictBanner, { backgroundColor: verdict.color }]}>
                <Text style={styles.verdictEmoji}>{verdict.emoji}</Text>
                <View style={styles.verdictContent}>
                  <Text style={styles.verdictText}>{verdict.text}</Text>
                  <Text style={styles.verdictExplanation}>{verdict.explanation}</Text>
                </View>
              </View>
            );
          })()}

          {/* RESUMEN EN ESPAÑOL LLANO */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>📋 Resumen rápido</Text>
            
            {/* Calidad de la operación */}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>¿Es buena operación?</Text>
              <Text style={[
                styles.summaryValue,
                { color: getTradeQualitySimple(data.riskReward.tradeQuality).color }
              ]}>
                {getTradeQualitySimple(data.riskReward.tradeQuality).text}
              </Text>
            </View>

            {/* Riesgo vs Ganancia explicado */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryLabelContainer}>
                <Text style={styles.summaryLabel}>¿Vale la pena el riesgo?</Text>
                <InfoTooltip text="Compara cuánto puedes ganar vs cuánto puedes perder. Si puedes ganar 3€ por cada 1€ que arriesgas, es 3:1 (bueno)" />
              </View>
              <Text style={[
                styles.summaryValue,
                { color: data.riskReward.riskRewardRatio >= 2 ? theme.colors.success : 
                         data.riskReward.riskRewardRatio >= 1 ? theme.colors.warning : theme.colors.danger }
              ]}>
                {data.riskReward.riskRewardRatio >= 2 ? '✅ Sí' : 
                 data.riskReward.riskRewardRatio >= 1 ? '⚠️ Regular' : '❌ No'}
              </Text>
            </View>

            {/* Porcentaje de acierto necesario */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryLabelContainer}>
                <Text style={styles.summaryLabel}>Para ganar dinero necesitas acertar</Text>
                <InfoTooltip text="Si necesitas acertar menos del 50%, es buena señal. Significa que aunque falles varias veces, puedes ganar dinero" />
              </View>
              <Text style={[
                styles.summaryValue,
                { color: data.riskReward.breakEvenWinRate <= 40 ? theme.colors.success : 
                         data.riskReward.breakEvenWinRate <= 50 ? theme.colors.warning : theme.colors.danger }
              ]}>
                {data.riskReward.breakEvenWinRate.toFixed(0)}% de las veces
              </Text>
            </View>
          </View>

          {/* CUÁNTO INVERTIR - MUY SIMPLIFICADO */}
          <View style={styles.investCard}>
            <Text style={styles.investTitle}>💰 ¿Cuánto debería invertir?</Text>
            
            <View style={styles.investRecommendation}>
              <Text style={styles.investLabel}>Recomendación:</Text>
              <Text style={[
                styles.investValue,
                { color: data.riskReward.suggestedPositionSize === 'small' ? theme.colors.warning :
                         data.riskReward.suggestedPositionSize === 'medium' ? theme.colors.success :
                         data.riskReward.suggestedPositionSize === 'max' ? theme.colors.primary : theme.colors.textSecondary }
              ]}>
                {data.riskReward.suggestedPositionSize === 'small' && '🤏 Poco (máx 5% de tu dinero)'}
                {data.riskReward.suggestedPositionSize === 'medium' && '✋ Moderado (5-10% de tu dinero)'}
                {data.riskReward.suggestedPositionSize === 'max' && '💪 Puedes invertir más (10-15%)'}
                {data.riskReward.suggestedPositionSize === 'none' && '🚫 No invertir ahora'}
              </Text>
            </View>

            <View style={styles.investExplanation}>
              <Ionicons name="information-circle" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.investExplanationText}>
                Nunca inviertas más de lo que puedas perder. Esta es solo una sugerencia basada en el análisis.
              </Text>
            </View>
          </View>

          {/* PRECIOS CLAVE */}
          <View style={styles.pricesCard}>
            <Text style={styles.pricesTitle}>🎯 Precios importantes</Text>
            
            <View style={styles.priceRow}>
              <View style={styles.priceBox}>
                <Text style={styles.priceLabel}>Precio actual</Text>
                <Text style={styles.priceValue}>{formatMoney(data.riskReward.entryPrice)}</Text>
              </View>
            </View>

            <View style={styles.priceRow}>
              <View style={[styles.priceBox, styles.priceBoxDanger]}>
                <Text style={styles.priceLabel}>🛑 Si baja a...</Text>
                <Text style={styles.priceValueDanger}>{formatMoney(data.riskReward.stopLoss)}</Text>
                <Text style={styles.priceHint}>Vende para no perder más</Text>
                <Text style={styles.priceLoss}>(-{data.riskReward.riskPercent.toFixed(1)}%)</Text>
              </View>
              
              <View style={[styles.priceBox, styles.priceBoxSuccess]}>
                <Text style={styles.priceLabel}>🎉 Si sube a...</Text>
                <Text style={styles.priceValueSuccess}>{formatMoney(data.riskReward.takeProfit)}</Text>
                <Text style={styles.priceHint}>Vende para asegurar ganancia</Text>
                <Text style={styles.priceGain}>(+{data.riskReward.rewardPercent.toFixed(1)}%)</Text>
              </View>
            </View>

            <View style={styles.rrExplanation}>
              <Text style={styles.rrExplanationText}>
                {data.riskReward.riskRewardRatio >= 2 
                  ? `✅ Por cada euro que arriesgas, puedes ganar ${data.riskReward.riskRewardRatio.toFixed(1)} euros`
                  : data.riskReward.riskRewardRatio >= 1
                    ? `⚠️ Por cada euro que arriesgas, puedes ganar ${data.riskReward.riskRewardRatio.toFixed(1)} euros (regular)`
                    : `❌ Arriesgas más de lo que puedes ganar (${data.riskReward.riskRewardRatio.toFixed(1)}:1)`
                }
              </Text>
            </View>
          </View>

          {/* SEÑALES TÉCNICAS (SIMPLIFICADAS) */}
          <View style={styles.signalsCard}>
            <Text style={styles.signalsTitle}>📊 Señales del mercado</Text>
            
            {/* Divergencias simplificadas */}
            <View style={styles.signalRow}>
              <Text style={styles.signalLabel}>Indicadores técnicos</Text>
              {data.divergences.hasDivergence ? (
                <View style={styles.signalBadge}>
                  <Text style={[
                    styles.signalBadgeText,
                    { color: data.divergences.overallBias === 'bullish' ? theme.colors.success : theme.colors.danger }
                  ]}>
                    {data.divergences.overallBias === 'bullish' 
                      ? '📈 Señal de subida' 
                      : '📉 Señal de bajada'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.signalNeutral}>➡️ Sin señales especiales</Text>
              )}
            </View>

            {/* Options Flow simplificado */}
            {data.optionsFlow.hasData && (
              <View style={styles.signalRow}>
                <View style={styles.signalLabelContainer}>
                  <Text style={styles.signalLabel}>Los grandes inversores</Text>
                  <InfoTooltip text="Analizamos qué están haciendo los inversores profesionales con las opciones" />
                </View>
                <Text style={[
                  styles.signalValue,
                  { color: data.optionsFlow.overallSignal === 'bullish' ? theme.colors.success :
                           data.optionsFlow.overallSignal === 'bearish' ? theme.colors.danger : theme.colors.textSecondary }
                ]}>
                  {data.optionsFlow.overallSignal === 'bullish' && '📈 Están comprando'}
                  {data.optionsFlow.overallSignal === 'bearish' && '📉 Están vendiendo'}
                  {data.optionsFlow.overallSignal === 'neutral' && '➡️ Sin movimiento claro'}
                </Text>
              </View>
            )}
          </View>

          {/* BOTÓN PARA VER DETALLES TÉCNICOS */}
          <TouchableOpacity 
            style={styles.technicalToggle}
            onPress={() => setShowTechnical(!showTechnical)}
          >
            <Ionicons 
              name={showTechnical ? "chevron-up" : "chevron-down"} 
              size={18} 
              color={theme.colors.primary} 
            />
            <Text style={styles.technicalToggleText}>
              {showTechnical ? 'Ocultar detalles técnicos' : 'Ver detalles técnicos (avanzado)'}
            </Text>
          </TouchableOpacity>

          {/* SECCIÓN TÉCNICA EXPANDIBLE */}
          {showTechnical && (
            <View style={styles.technicalSection}>
              <Text style={styles.technicalSectionTitle}>🔬 Análisis Técnico Detallado</Text>
              
              {/* Risk/Reward Detallado */}
              <View style={styles.techCard}>
                <Text style={styles.techCardTitle}>📊 Risk/Reward Ratio</Text>
                <View style={styles.techRow}>
                  <Text style={styles.techLabel}>R/R Ratio:</Text>
                  <Text style={[styles.techValue, { color: data.riskReward.riskRewardRatio >= 2 ? theme.colors.success : theme.colors.warning }]}>
                    {data.riskReward.riskRewardDisplay}
                  </Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={styles.techLabel}>Calidad del trade:</Text>
                  <Text style={styles.techValue}>{data.riskReward.tradeQuality} ({data.riskReward.qualityScore}/100)</Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={styles.techLabel}>Break-even win rate:</Text>
                  <Text style={styles.techValue}>{data.riskReward.breakEvenWinRate.toFixed(1)}%</Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={styles.techLabel}>Kelly Criterion:</Text>
                  <Text style={[styles.techValue, { color: theme.colors.primary }]}>{data.riskReward.kellyPercent.toFixed(1)}%</Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={styles.techLabel}>Posición sugerida:</Text>
                  <Text style={styles.techValue}>{data.riskReward.suggestedPositionSize}</Text>
                </View>
                <Text style={styles.techExplanation}>
                  💡 Kelly % indica qué porcentaje de tu capital deberías arriesgar según la probabilidad de éxito y el ratio riesgo/recompensa.
                </Text>
              </View>

              {/* Divergencias Detalladas */}
              <View style={styles.techCard}>
                <Text style={styles.techCardTitle}>📈 Divergencias (RSI/MACD/Stochastic)</Text>
                {data.divergences.hasDivergence ? (
                  <>
                    <View style={[
                      styles.divergenceBadge,
                      { backgroundColor: data.divergences.overallBias === 'bullish' ? theme.colors.success : theme.colors.danger }
                    ]}>
                      <Text style={styles.divergenceBadgeText}>
                        {data.divergences.overallBias === 'bullish' ? '🐂 DIVERGENCIA ALCISTA' : '🐻 DIVERGENCIA BAJISTA'}
                      </Text>
                    </View>
                    <Text style={styles.techDescription}>{data.divergences.summary}</Text>
                    {data.divergences.signals.map((signal, i) => (
                      <View key={i} style={styles.signalDetail}>
                        <Text style={styles.signalIndicator}>{signal.indicator}</Text>
                        <Text style={styles.signalDesc}>{signal.description}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.techNeutral}>✓ Sin divergencias detectadas. El precio y los indicadores están alineados.</Text>
                )}
                <Text style={styles.techExplanation}>
                  💡 Una divergencia ocurre cuando el precio va en una dirección pero los indicadores técnicos van en otra. Puede anticipar un cambio de tendencia.
                </Text>
              </View>

              {/* Options Flow Detallado */}
              <View style={styles.techCard}>
                <Text style={styles.techCardTitle}>🎯 Flujo de Opciones</Text>
                {data.optionsFlow.hasData ? (
                  <>
                    <View style={styles.techRow}>
                      <Text style={styles.techLabel}>Put/Call Ratio:</Text>
                      <Text style={[
                        styles.techValue,
                        { color: data.optionsFlow.putCallRatio > 1 ? theme.colors.danger : 
                                 data.optionsFlow.putCallRatio < 0.7 ? theme.colors.success : theme.colors.textSecondary }
                      ]}>
                        {data.optionsFlow.putCallRatio.toFixed(2)} ({data.optionsFlow.putCallSignal})
                      </Text>
                    </View>
                    <View style={styles.techRow}>
                      <Text style={styles.techLabel}>Volatilidad Implícita (IV):</Text>
                      <Text style={styles.techValue}>{data.optionsFlow.impliedVolatility.toFixed(0)}% ({data.optionsFlow.ivSignal})</Text>
                    </View>
                    <View style={styles.techRow}>
                      <Text style={styles.techLabel}>Señal general:</Text>
                      <Text style={[
                        styles.techValue,
                        { color: data.optionsFlow.overallSignal === 'bullish' ? theme.colors.success :
                                 data.optionsFlow.overallSignal === 'bearish' ? theme.colors.danger : theme.colors.textSecondary }
                      ]}>
                        {data.optionsFlow.overallSignal.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.techDescription}>{data.optionsFlow.summary}</Text>
                  </>
                ) : (
                  <Text style={styles.techNeutral}>📭 Sin datos de opciones disponibles para este activo.</Text>
                )}
                <Text style={styles.techExplanation}>
                  💡 Put/Call Ratio alto (&gt;1) = más gente apuesta a la baja. Bajo (&lt;0.7) = más alcistas. IV alta = se esperan movimientos grandes.
                </Text>
              </View>

              {/* Inspiración */}
              <View style={styles.inspirationBox}>
                <Text style={styles.inspirationText}>
                  💡 Inspirado en las estrategias de: George Soros • Paul Tudor Jones • Stanley Druckenmiller • Jim Simons • Steve Cohen • Jesse Livermore
                </Text>
              </View>
            </View>
          )}

          {/* ADVERTENCIAS */}
          {data.recommendation.warnings.length > 0 && (
            <View style={styles.warningsCard}>
              <Text style={styles.warningsTitle}>⚠️ Ten en cuenta</Text>
              {data.recommendation.warnings.map((warning, i) => (
                <Text key={i} style={styles.warningItem}>
                  • {warning.replace(/⚠️\s*/g, '')}
                </Text>
              ))}
            </View>
          )}

          {/* LO QUE ESTÁ A FAVOR */}
          {data.recommendation.reasons.length > 0 && (
            <View style={styles.reasonsCard}>
              <Text style={styles.reasonsTitle}>✅ A favor</Text>
              {data.recommendation.reasons.map((reason, i) => (
                <Text key={i} style={styles.reasonItem}>
                  • {reason.replace(/✅\s*/g, '')}
                </Text>
              ))}
            </View>
          )}

          {/* DISCLAIMER */}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.disclaimerText}>
              Esto es solo información. No es consejo financiero. Siempre investiga antes de invertir.
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <TouchableOpacity style={styles.loadButton} onPress={fetchAnalysis}>
            <Ionicons name="bulb" size={24} color="#fff" />
            <Text style={styles.loadButtonText}>Analizar {symbol}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  collapsedContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  collapsedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsedTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  collapsedSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginLeft: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  errorText: {
    marginTop: 8,
    color: theme.colors.danger,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  
  // Veredicto principal
  verdictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  verdictEmoji: {
    fontSize: 36,
    marginRight: 12,
  },
  verdictContent: {
    flex: 1,
  },
  verdictText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  verdictExplanation: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },

  // Resumen
  summaryCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  summaryLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Cuánto invertir
  investCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  investTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  investRecommendation: {
    marginBottom: 12,
  },
  investLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  investValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  investExplanation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    padding: 10,
    borderRadius: 8,
  },
  investExplanationText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },

  // Precios
  pricesCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  pricesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  priceBox: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  priceBoxDanger: {
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  priceBoxSuccess: {
    borderWidth: 1,
    borderColor: theme.colors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  priceLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  priceValueDanger: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  priceValueSuccess: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.success,
  },
  priceHint: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  priceLoss: {
    fontSize: 12,
    color: theme.colors.danger,
    fontWeight: '600',
    marginTop: 2,
  },
  priceGain: {
    fontSize: 12,
    color: theme.colors.success,
    fontWeight: '600',
    marginTop: 2,
  },
  rrExplanation: {
    backgroundColor: theme.colors.surface,
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  rrExplanationText: {
    fontSize: 13,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Señales
  signalsCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  signalsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  signalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  signalLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  signalLabel: {
    fontSize: 14,
    color: theme.colors.text,
  },
  signalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
  },
  signalBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  signalNeutral: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  signalValue: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Advertencias
  warningsCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  warningsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.warning,
    marginBottom: 8,
  },
  warningItem: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 4,
    lineHeight: 18,
  },

  // Razones a favor
  reasonsCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  reasonsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.success,
    marginBottom: 8,
  },
  reasonItem: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 4,
    lineHeight: 18,
  },

  // Disclaimer
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    color: theme.colors.textSecondary,
    lineHeight: 15,
  },

  // Tooltip
  infoButton: {
    marginLeft: 4,
    padding: 2,
  },
  tooltipContainer: {
    backgroundColor: theme.colors.surface,
    padding: 8,
    borderRadius: 8,
    marginLeft: 4,
    maxWidth: 200,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tooltipText: {
    fontSize: 11,
    color: theme.colors.text,
    lineHeight: 15,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  loadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  loadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Technical toggle button
  technicalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
  },
  technicalToggleText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },

  // Technical section
  technicalSection: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  technicalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  techCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  techCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 10,
  },
  techRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  techLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  techValue: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  techDescription: {
    fontSize: 12,
    color: theme.colors.text,
    marginTop: 8,
    lineHeight: 16,
  },
  techNeutral: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingVertical: 8,
  },
  techExplanation: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 10,
    padding: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 6,
    lineHeight: 15,
  },

  // Divergence badge
  divergenceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  divergenceBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  signalDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  signalIndicator: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    minWidth: 60,
  },
  signalDesc: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.text,
  },

  // Inspiration box
  inspirationBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
    padding: 10,
  },
  inspirationText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
