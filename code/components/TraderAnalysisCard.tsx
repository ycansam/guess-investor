/**
 * Trader Analysis Card
 * Muestra análisis avanzado para traders de corto plazo
 * 
 * Features:
 * - Divergencias RSI/MACD (Soros, Tudor Jones)
 * - Risk/Reward ratio (Druckenmiller, Livermore)
 * - Options Flow (Cohen, Simons)
 * - Recomendación consolidada
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../config/theme';

// API Base URL
const API_BASE = 'http://localhost:3001/api';

interface TraderAnalysisProps {
  symbol: string;
  onClose?: () => void;
}

interface DivergenceData {
  hasDivergence: boolean;
  signals: Array<{
    type: 'bullish' | 'bearish';
    indicator: string;
    strength: string;
    description: string;
    confidence: number;
    tradingImplication: string;
  }>;
  overallBias: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  recommendation: string;
}

interface RiskRewardData {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  riskPercent: number;
  rewardPercent: number;
  breakEvenWinRate: number;
  expectedValue: number;
  kellyPercent: number;
  suggestedPositionSize: string;
  tradeQuality: string;
  qualityScore: number;
  reasoning: string;
  warnings: string[];
  riskRewardDisplay: string;
  riskRewardEmoji: string;
}

interface OptionsFlowData {
  putCallRatio: number;
  putCallSignal: string;
  impliedVolatility: number;
  ivPercentile: number;
  ivSignal: string;
  maxPain: number | null;
  unusualActivity: boolean;
  unusualSignal: string | null;
  overallSignal: string;
  summary: string;
  institutionalHint: string;
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

export function TraderAnalysisCard({ symbol, onClose }: TraderAnalysisProps) {
  const [data, setData] = useState<TraderAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [expanded, setExpanded] = useState(false);

  const fetchAnalysis = async (dir: 'long' | 'short') => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/analysis/trader-full/${symbol}?direction=${dir}`);
      const json = await response.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'No se pudo obtener el análisis');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar análisis');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectionChange = (dir: 'long' | 'short') => {
    setDirection(dir);
    fetchAnalysis(dir);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'strong_entry': return theme.colors.success;
      case 'entry': return '#4CAF50';
      case 'wait': return theme.colors.warning;
      case 'avoid': return theme.colors.danger;
      default: return theme.colors.textSecondary;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'strong_entry': return 'rocket';
      case 'entry': return 'arrow-forward-circle';
      case 'wait': return 'time';
      case 'avoid': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'strong_entry': return 'ENTRADA FUERTE';
      case 'entry': return 'ENTRAR';
      case 'wait': return 'ESPERAR';
      case 'avoid': return 'EVITAR';
      default: return action;
    }
  };

  if (!expanded) {
    return (
      <TouchableOpacity 
        style={styles.collapsedContainer}
        onPress={() => {
          setExpanded(true);
          if (!data) fetchAnalysis(direction);
        }}
      >
        <View style={styles.collapsedHeader}>
          <Ionicons name="analytics" size={20} color={theme.colors.primary} />
          <Text style={styles.collapsedTitle}>Análisis Trader Pro</Text>
          <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
        </View>
        <Text style={styles.collapsedSubtitle}>
          Divergencias • R/R • Options Flow
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="analytics" size={24} color={theme.colors.primary} />
          <Text style={styles.title}>Trader Pro Analysis</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setExpanded(false)}>
            <Ionicons name="chevron-up" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Direction Toggle */}
      <View style={styles.directionToggle}>
        <TouchableOpacity
          style={[styles.directionButton, direction === 'long' && styles.directionButtonActive]}
          onPress={() => handleDirectionChange('long')}
        >
          <Ionicons 
            name="trending-up" 
            size={16} 
            color={direction === 'long' ? '#fff' : theme.colors.success} 
          />
          <Text style={[styles.directionText, direction === 'long' && styles.directionTextActive]}>
            LONG
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.directionButton, direction === 'short' && styles.directionButtonActiveShort]}
          onPress={() => handleDirectionChange('short')}
        >
          <Ionicons 
            name="trending-down" 
            size={16} 
            color={direction === 'short' ? '#fff' : theme.colors.danger} 
          />
          <Text style={[styles.directionText, direction === 'short' && styles.directionTextActive]}>
            SHORT
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Analizando...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={32} color={theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchAnalysis(direction)}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <>
          {/* Recommendation Banner */}
          <View style={[styles.recommendationBanner, { backgroundColor: getActionColor(data.recommendation.action) }]}>
            <Ionicons name={getActionIcon(data.recommendation.action) as any} size={28} color="#fff" />
            <View style={styles.recommendationContent}>
              <Text style={styles.recommendationAction}>
                {getActionText(data.recommendation.action)}
              </Text>
              <Text style={styles.recommendationConfidence}>
                Confianza: {data.recommendation.confidence}%
              </Text>
            </View>
          </View>

          {/* Reasons */}
          {data.recommendation.reasons.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✅ A favor</Text>
              {data.recommendation.reasons.map((reason, i) => (
                <Text key={i} style={styles.reasonText}>{reason}</Text>
              ))}
            </View>
          )}

          {/* Warnings */}
          {data.recommendation.warnings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitleWarning}>⚠️ Advertencias</Text>
              {data.recommendation.warnings.map((warning, i) => (
                <Text key={i} style={styles.warningText}>{warning}</Text>
              ))}
            </View>
          )}

          {/* Risk/Reward */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Risk/Reward</Text>
            <View style={styles.rrContainer}>
              <View style={styles.rrBox}>
                <Text style={styles.rrLabel}>Entrada</Text>
                <Text style={styles.rrValue}>${data.riskReward.entryPrice.toFixed(2)}</Text>
              </View>
              <View style={[styles.rrBox, styles.rrBoxStop]}>
                <Text style={styles.rrLabel}>Stop Loss</Text>
                <Text style={styles.rrValueStop}>${data.riskReward.stopLoss.toFixed(2)}</Text>
                <Text style={styles.rrPercent}>-{data.riskReward.riskPercent.toFixed(1)}%</Text>
              </View>
              <View style={[styles.rrBox, styles.rrBoxTarget]}>
                <Text style={styles.rrLabel}>Take Profit</Text>
                <Text style={styles.rrValueTarget}>${data.riskReward.takeProfit.toFixed(2)}</Text>
                <Text style={styles.rrPercent}>+{data.riskReward.rewardPercent.toFixed(1)}%</Text>
              </View>
            </View>
            <View style={styles.rrRatioContainer}>
              <Text style={styles.rrRatioEmoji}>{data.riskReward.riskRewardEmoji}</Text>
              <Text style={styles.rrRatioText}>
                R/R {data.riskReward.riskRewardDisplay}
              </Text>
              <Text style={styles.rrQuality}>
                ({data.riskReward.tradeQuality})
              </Text>
            </View>
            <Text style={styles.rrReasoning}>{data.riskReward.reasoning}</Text>
            <View style={styles.kellyContainer}>
              <Text style={styles.kellyLabel}>Kelly %:</Text>
              <Text style={styles.kellyValue}>{data.riskReward.kellyPercent.toFixed(1)}%</Text>
              <Text style={styles.kellySuggested}>
                → Posición: {data.riskReward.suggestedPositionSize}
              </Text>
            </View>
          </View>

          {/* Divergences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📈 Divergencias</Text>
            {data.divergences.hasDivergence ? (
              <>
                <View style={[
                  styles.divergenceBadge,
                  { backgroundColor: data.divergences.overallBias === 'bullish' ? theme.colors.success : theme.colors.danger }
                ]}>
                  <Text style={styles.divergenceBadgeText}>
                    {data.divergences.overallBias === 'bullish' ? '🐂 ALCISTA' : '🐻 BAJISTA'}
                  </Text>
                </View>
                <Text style={styles.divergenceSummary}>{data.divergences.summary}</Text>
                {data.divergences.recommendation && (
                  <Text style={styles.divergenceRecommendation}>{data.divergences.recommendation}</Text>
                )}
              </>
            ) : (
              <Text style={styles.noDivergence}>
                ✓ Sin divergencias - Precio e indicadores alineados
              </Text>
            )}
          </View>

          {/* Options Flow */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎯 Options Flow</Text>
            {data.optionsFlow.hasData ? (
              <>
                <View style={styles.optionsRow}>
                  <View style={styles.optionBox}>
                    <Text style={styles.optionLabel}>Put/Call</Text>
                    <Text style={styles.optionValue}>{data.optionsFlow.putCallRatio.toFixed(2)}</Text>
                    <Text style={styles.optionSignal}>{data.optionsFlow.putCallSignal}</Text>
                  </View>
                  <View style={styles.optionBox}>
                    <Text style={styles.optionLabel}>IV</Text>
                    <Text style={styles.optionValue}>{data.optionsFlow.impliedVolatility.toFixed(0)}%</Text>
                    <Text style={styles.optionSignal}>{data.optionsFlow.ivSignal}</Text>
                  </View>
                  {data.optionsFlow.maxPain && (
                    <View style={styles.optionBox}>
                      <Text style={styles.optionLabel}>Max Pain</Text>
                      <Text style={styles.optionValue}>${data.optionsFlow.maxPain.toFixed(0)}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.optionsSummary}>{data.optionsFlow.summary}</Text>
                {data.optionsFlow.unusualActivity && (
                  <View style={styles.unusualBadge}>
                    <Text style={styles.unusualText}>{data.optionsFlow.unusualSignal}</Text>
                  </View>
                )}
                <Text style={styles.institutionalHint}>{data.optionsFlow.institutionalHint}</Text>
              </>
            ) : (
              <Text style={styles.noOptionsData}>
                📭 Sin datos de opciones disponibles para este activo
              </Text>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              💡 Inspirado en: Soros • Tudor Jones • Druckenmiller • Simons • Cohen • Livermore
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <TouchableOpacity style={styles.loadButton} onPress={() => fetchAnalysis(direction)}>
            <Ionicons name="analytics" size={24} color="#fff" />
            <Text style={styles.loadButtonText}>Cargar Análisis</Text>
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
    padding: 12,
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
    fontSize: 14,
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
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  closeButton: {
    marginLeft: 8,
  },
  directionToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  directionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  directionButtonActive: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  directionButtonActiveShort: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  directionText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  directionTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  recommendationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  recommendationContent: {
    flex: 1,
  },
  recommendationAction: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  recommendationConfidence: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  sectionTitleWarning: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.warning,
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 4,
    paddingLeft: 8,
  },
  warningText: {
    fontSize: 13,
    color: theme.colors.warning,
    marginBottom: 4,
    paddingLeft: 8,
  },
  rrContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  rrBox: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  rrBoxStop: {
    borderColor: theme.colors.danger,
    borderWidth: 1,
  },
  rrBoxTarget: {
    borderColor: theme.colors.success,
    borderWidth: 1,
  },
  rrLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  rrValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  rrValueStop: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.danger,
  },
  rrValueTarget: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.success,
  },
  rrPercent: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  rrRatioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  rrRatioEmoji: {
    fontSize: 20,
  },
  rrRatioText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  rrQuality: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  rrReasoning: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  kellyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.background,
    padding: 8,
    borderRadius: 6,
  },
  kellyLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  kellyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  kellySuggested: {
    fontSize: 12,
    color: theme.colors.text,
  },
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
  divergenceSummary: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 4,
  },
  divergenceRecommendation: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  noDivergence: {
    fontSize: 13,
    color: theme.colors.success,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  optionBox: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  optionValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  optionSignal: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  optionsSummary: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  unusualBadge: {
    backgroundColor: theme.colors.warning,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  unusualText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '500',
  },
  institutionalHint: {
    fontSize: 12,
    color: theme.colors.text,
    fontStyle: 'italic',
  },
  noOptionsData: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
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
    paddingVertical: 12,
    borderRadius: 8,
  },
  loadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
