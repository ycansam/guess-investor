/**
 * TechnicalIndicators Component
 * 
 * Muestra indicadores técnicos: RSI, MACD, Bollinger Bands, Soportes/Resistencias
 * Panel colapsable debajo del gráfico principal
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { apiClient } from '../../services/api-client';

// Tipos
interface TechnicalAnalysis {
  currentPrice: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  goldenCross: boolean;
  deathCross: boolean;
  priceAboveSMA200: boolean;
  priceAboveSMA50: boolean;
  priceAboveSMA20: boolean;
  rsi14: number | null;
  rsiSignal: 'oversold' | 'overbought' | 'neutral';
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  macdTrend: 'bullish' | 'bearish' | 'neutral';
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  bollingerPosition: 'above' | 'below' | 'inside';
  bollingerWidth: number | null;
  avgVolume20: number | null;
  currentVolume: number | null;
  volumeRatio: number | null;
  volumeSignal: 'high' | 'low' | 'normal';
  technicalScore: number;
  signals: TechnicalSignal[];
  trend: string;
  summary: string;
  hasData: boolean;
}

interface TechnicalSignal {
  indicator: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  description: string;
  weight: number;
}

// Colores
const COLORS = {
  background: '#0a0a1a',
  card: '#1a1a2e',
  cardLight: '#252547',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  orange: '#f97316',
  border: '#333355',
};

// Props
interface Props {
  symbol: string;
  currentPrice: number;
}

// ============================================================================
// Sub-componentes
// ============================================================================

// Barra de RSI visual
const RSIBar = ({ value }: { value: number | null }) => {
  if (value === null) return <Text style={styles.noData}>Sin datos</Text>;
  
  const getZoneColor = () => {
    if (value >= 70) return COLORS.red;
    if (value <= 30) return COLORS.green;
    return COLORS.yellow;
  };
  
  const getZoneText = () => {
    if (value >= 70) return 'Sobrecompra';
    if (value <= 30) return 'Sobreventa';
    return 'Neutral';
  };
  
  return (
    <View style={styles.rsiContainer}>
      <View style={styles.rsiBarContainer}>
        {/* Zonas de fondo */}
        <View style={[styles.rsiZone, styles.rsiZoneOversold]} />
        <View style={[styles.rsiZone, styles.rsiZoneNeutral]} />
        <View style={[styles.rsiZone, styles.rsiZoneOverbought]} />
        {/* Indicador */}
        <View style={[styles.rsiIndicator, { left: `${value}%`, backgroundColor: getZoneColor() }]} />
      </View>
      <View style={styles.rsiLabels}>
        <Text style={styles.rsiLabel}>0</Text>
        <Text style={styles.rsiLabel}>30</Text>
        <Text style={styles.rsiLabel}>70</Text>
        <Text style={styles.rsiLabel}>100</Text>
      </View>
      <View style={styles.rsiValueRow}>
        <Text style={[styles.rsiValue, { color: getZoneColor() }]}>{value.toFixed(1)}</Text>
        <Text style={[styles.rsiSignal, { color: getZoneColor() }]}>{getZoneText()}</Text>
      </View>
    </View>
  );
};

// Indicador MACD
const MACDIndicator = ({ 
  macd, 
  signal, 
  histogram, 
  trend 
}: { 
  macd: number | null; 
  signal: number | null; 
  histogram: number | null;
  trend: string;
}) => {
  if (macd === null) return <Text style={styles.noData}>Sin datos</Text>;
  
  const trendColor = trend === 'bullish' ? COLORS.green : trend === 'bearish' ? COLORS.red : COLORS.yellow;
  const histogramColor = (histogram || 0) >= 0 ? COLORS.green : COLORS.red;
  
  return (
    <View style={styles.macdContainer}>
      <View style={styles.macdRow}>
        <View style={styles.macdItem}>
          <Text style={styles.macdLabel}>MACD</Text>
          <Text style={[styles.macdValue, { color: trendColor }]}>{macd.toFixed(4)}</Text>
        </View>
        <View style={styles.macdItem}>
          <Text style={styles.macdLabel}>Señal</Text>
          <Text style={styles.macdValue}>{signal?.toFixed(4) || '-'}</Text>
        </View>
        <View style={styles.macdItem}>
          <Text style={styles.macdLabel}>Histograma</Text>
          <Text style={[styles.macdValue, { color: histogramColor }]}>
            {histogram !== null ? (histogram >= 0 ? '+' : '') + histogram.toFixed(4) : '-'}
          </Text>
        </View>
      </View>
      <View style={[styles.trendBadge, { backgroundColor: trendColor + '33' }]}>
        <Text style={[styles.trendText, { color: trendColor }]}>
          {trend === 'bullish' ? '📈 Alcista' : trend === 'bearish' ? '📉 Bajista' : '➡️ Neutral'}
        </Text>
      </View>
    </View>
  );
};

// Bollinger Bands visual
const BollingerBands = ({ 
  upper, 
  middle, 
  lower, 
  currentPrice,
  position,
  width
}: { 
  upper: number | null;
  middle: number | null;
  lower: number | null;
  currentPrice: number;
  position: string;
  width: number | null;
}) => {
  if (upper === null || lower === null) return <Text style={styles.noData}>Sin datos</Text>;
  
  const range = upper - lower;
  const pricePosition = range > 0 ? ((currentPrice - lower) / range) * 100 : 50;
  
  const positionColor = position === 'above' ? COLORS.red : position === 'below' ? COLORS.green : COLORS.blue;
  const positionText = position === 'above' ? 'Por encima (venta)' : 
                       position === 'below' ? 'Por debajo (compra)' : 'Dentro de bandas';
  
  return (
    <View style={styles.bollingerContainer}>
      <View style={styles.bollingerVisual}>
        <View style={styles.bollingerBand}>
          <View style={[styles.bollingerFill, { height: '100%' }]} />
          <View style={[
            styles.bollingerPrice, 
            { bottom: `${Math.min(100, Math.max(0, pricePosition))}%`, backgroundColor: positionColor }
          ]} />
        </View>
        <View style={styles.bollingerLabels}>
          <View style={styles.bollingerLabelRow}>
            <Text style={styles.bollingerLabelText}>Superior</Text>
            <Text style={styles.bollingerLabelValue}>{upper.toFixed(2)}</Text>
          </View>
          <View style={styles.bollingerLabelRow}>
            <Text style={styles.bollingerLabelText}>Media (SMA20)</Text>
            <Text style={styles.bollingerLabelValue}>{middle?.toFixed(2) || '-'}</Text>
          </View>
          <View style={styles.bollingerLabelRow}>
            <Text style={styles.bollingerLabelText}>Inferior</Text>
            <Text style={styles.bollingerLabelValue}>{lower.toFixed(2)}</Text>
          </View>
          <View style={styles.bollingerLabelRow}>
            <Text style={styles.bollingerLabelText}>Ancho</Text>
            <Text style={styles.bollingerLabelValue}>{width?.toFixed(2)}%</Text>
          </View>
        </View>
      </View>
      <View style={[styles.trendBadge, { backgroundColor: positionColor + '33' }]}>
        <Text style={[styles.trendText, { color: positionColor }]}>{positionText}</Text>
      </View>
    </View>
  );
};

// Soportes y Resistencias
const SupportResistance = ({ 
  sma20, 
  sma50, 
  sma200,
  currentPrice,
  bollingerUpper,
  bollingerLower
}: { 
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  currentPrice: number;
  bollingerUpper: number | null;
  bollingerLower: number | null;
}) => {
  // Calcular niveles de soporte y resistencia basados en las medias móviles
  const levels: { price: number; label: string; type: 'support' | 'resistance' }[] = [];
  
  if (sma20 !== null) {
    levels.push({ 
      price: sma20, 
      label: 'SMA 20', 
      type: sma20 < currentPrice ? 'support' : 'resistance' 
    });
  }
  if (sma50 !== null) {
    levels.push({ 
      price: sma50, 
      label: 'SMA 50', 
      type: sma50 < currentPrice ? 'support' : 'resistance' 
    });
  }
  if (sma200 !== null) {
    levels.push({ 
      price: sma200, 
      label: 'SMA 200', 
      type: sma200 < currentPrice ? 'support' : 'resistance' 
    });
  }
  if (bollingerUpper !== null) {
    levels.push({ 
      price: bollingerUpper, 
      label: 'BB Superior', 
      type: 'resistance' 
    });
  }
  if (bollingerLower !== null) {
    levels.push({ 
      price: bollingerLower, 
      label: 'BB Inferior', 
      type: 'support' 
    });
  }
  
  // Ordenar por precio (de mayor a menor)
  levels.sort((a, b) => b.price - a.price);
  
  const supports = levels.filter(l => l.type === 'support');
  const resistances = levels.filter(l => l.type === 'resistance');
  
  return (
    <View style={styles.srContainer}>
      <View style={styles.srColumn}>
        <Text style={[styles.srTitle, { color: COLORS.red }]}>🔺 Resistencias</Text>
        {resistances.length > 0 ? resistances.map((level, i) => (
          <View key={`r-${i}`} style={styles.srItem}>
            <Text style={styles.srLabel}>{level.label}</Text>
            <Text style={[styles.srPrice, { color: COLORS.red }]}>{level.price.toFixed(2)}</Text>
            <Text style={styles.srDistance}>
              +{((level.price - currentPrice) / currentPrice * 100).toFixed(2)}%
            </Text>
          </View>
        )) : <Text style={styles.noData}>Sin resistencias cercanas</Text>}
      </View>
      <View style={styles.srDivider}>
        <Text style={styles.srCurrentPrice}>💰 {currentPrice.toFixed(2)}</Text>
      </View>
      <View style={styles.srColumn}>
        <Text style={[styles.srTitle, { color: COLORS.green }]}>🔻 Soportes</Text>
        {supports.length > 0 ? supports.map((level, i) => (
          <View key={`s-${i}`} style={styles.srItem}>
            <Text style={styles.srLabel}>{level.label}</Text>
            <Text style={[styles.srPrice, { color: COLORS.green }]}>{level.price.toFixed(2)}</Text>
            <Text style={styles.srDistance}>
              {((level.price - currentPrice) / currentPrice * 100).toFixed(2)}%
            </Text>
          </View>
        )) : <Text style={styles.noData}>Sin soportes cercanos</Text>}
      </View>
    </View>
  );
};

// Score técnico visual
const TechnicalScore = ({ score, trend, summary }: { score: number; trend: string; summary: string }) => {
  const getScoreColor = () => {
    if (score >= 50) return COLORS.green;
    if (score >= 20) return '#84cc16';
    if (score <= -50) return COLORS.red;
    if (score <= -20) return COLORS.orange;
    return COLORS.yellow;
  };
  
  const getScoreEmoji = () => {
    if (score >= 50) return '🚀';
    if (score >= 20) return '📈';
    if (score <= -50) return '💥';
    if (score <= -20) return '📉';
    return '➡️';
  };
  
  return (
    <View style={styles.scoreContainer}>
      <View style={styles.scoreCircle}>
        <Text style={styles.scoreEmoji}>{getScoreEmoji()}</Text>
        <Text style={[styles.scoreValue, { color: getScoreColor() }]}>{score}</Text>
        <Text style={styles.scoreLabel}>de 100</Text>
      </View>
      <View style={styles.scoreInfo}>
        <Text style={[styles.scoreTrend, { color: getScoreColor() }]}>
          {trend.replace('_', ' ').replace('strong', 'Muy').replace('bullish', 'Alcista').replace('bearish', 'Bajista').replace('neutral', 'Neutral')}
        </Text>
        <Text style={styles.scoreSummary}>{summary}</Text>
      </View>
    </View>
  );
};

// ============================================================================
// Componente Principal
// ============================================================================

export function TechnicalIndicators({ symbol, currentPrice }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TechnicalAnalysis | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<'rsi' | 'macd' | 'bollinger' | 'sr' | null>('rsi');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getTechnicalAnalysis(symbol);
      setData(response as TechnicalAnalysis);
    } catch (err: any) {
      setError(err.message || 'Error cargando datos técnicos');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (expanded) {
      loadData();
    }
  }, [expanded, loadData]);

  return (
    <View style={styles.container}>
      {/* Header colapsable */}
      <Pressable style={styles.header} onPress={() => setExpanded(!expanded)}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📊</Text>
          <Text style={styles.headerTitle}>Indicadores Técnicos</Text>
          {data && !loading && (
            <View style={[
              styles.miniScore, 
              { backgroundColor: (data.technicalScore >= 0 ? COLORS.green : COLORS.red) + '33' }
            ]}>
              <Text style={[
                styles.miniScoreText, 
                { color: data.technicalScore >= 0 ? COLORS.green : COLORS.red }
              ]}>
                {data.technicalScore >= 0 ? '+' : ''}{data.technicalScore}
              </Text>
            </View>
          )}
        </View>
        <Ionicons 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={COLORS.textSecondary} 
        />
      </Pressable>

      {/* Contenido expandido */}
      {expanded && (
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={COLORS.blue} />
              <Text style={styles.loadingText}>Cargando indicadores...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>❌ {error}</Text>
              <Pressable style={styles.retryButton} onPress={loadData}>
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : data && data.hasData ? (
            <>
              {/* Score general */}
              <TechnicalScore score={data.technicalScore} trend={data.trend} summary={data.summary} />
              
              {/* Tabs de indicadores */}
              <View style={styles.tabs}>
                {[
                  { id: 'rsi', label: 'RSI', icon: '📈' },
                  { id: 'macd', label: 'MACD', icon: '📊' },
                  { id: 'bollinger', label: 'Bollinger', icon: '📉' },
                  { id: 'sr', label: 'S/R', icon: '🎯' },
                ].map(tab => (
                  <Pressable
                    key={tab.id}
                    style={[styles.tab, activeSection === tab.id && styles.tabActive]}
                    onPress={() => setActiveSection(activeSection === tab.id ? null : tab.id as any)}
                  >
                    <Text style={styles.tabIcon}>{tab.icon}</Text>
                    <Text style={[styles.tabLabel, activeSection === tab.id && styles.tabLabelActive]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Panel del indicador seleccionado */}
              {activeSection === 'rsi' && (
                <View style={styles.indicatorPanel}>
                  <Text style={styles.indicatorTitle}>RSI (14 períodos)</Text>
                  <RSIBar value={data.rsi14} />
                </View>
              )}
              
              {activeSection === 'macd' && (
                <View style={styles.indicatorPanel}>
                  <Text style={styles.indicatorTitle}>MACD (12, 26, 9)</Text>
                  <MACDIndicator 
                    macd={data.macd}
                    signal={data.macdSignal}
                    histogram={data.macdHistogram}
                    trend={data.macdTrend}
                  />
                </View>
              )}
              
              {activeSection === 'bollinger' && (
                <View style={styles.indicatorPanel}>
                  <Text style={styles.indicatorTitle}>Bandas de Bollinger</Text>
                  <BollingerBands 
                    upper={data.bollingerUpper}
                    middle={data.bollingerMiddle}
                    lower={data.bollingerLower}
                    currentPrice={currentPrice}
                    position={data.bollingerPosition}
                    width={data.bollingerWidth}
                  />
                </View>
              )}
              
              {activeSection === 'sr' && (
                <View style={styles.indicatorPanel}>
                  <Text style={styles.indicatorTitle}>Soportes y Resistencias</Text>
                  <SupportResistance 
                    sma20={data.sma20}
                    sma50={data.sma50}
                    sma200={data.sma200}
                    currentPrice={currentPrice}
                    bollingerUpper={data.bollingerUpper}
                    bollingerLower={data.bollingerLower}
                  />
                </View>
              )}

              {/* Señales técnicas */}
              {data.signals.length > 0 && (
                <View style={styles.signalsContainer}>
                  <Text style={styles.signalsTitle}>Señales Activas</Text>
                  <View style={styles.signalsList}>
                    {data.signals.slice(0, 6).map((signal, index) => (
                      <View 
                        key={index} 
                        style={[
                          styles.signalItem,
                          { 
                            backgroundColor: signal.signal === 'bullish' ? COLORS.green + '22' : 
                                           signal.signal === 'bearish' ? COLORS.red + '22' : 
                                           COLORS.yellow + '22'
                          }
                        ]}
                      >
                        <Text style={styles.signalIndicator}>
                          {signal.signal === 'bullish' ? '📈' : signal.signal === 'bearish' ? '📉' : '➡️'} {signal.indicator}
                        </Text>
                        <Text style={styles.signalDesc}>{signal.description}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataEmoji}>📊</Text>
              <Text style={styles.noDataText}>Sin datos técnicos suficientes</Text>
              <Text style={styles.noDataSubtext}>Se necesitan al menos 20 días de histórico</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Estilos
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    overflow: 'hidden',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  miniScore: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  miniScoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  
  // Content
  content: {
    padding: 16,
    paddingTop: 0,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: COLORS.red,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.blue,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  noDataContainer: {
    alignItems: 'center',
    padding: 30,
  },
  noDataEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  noDataText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  noDataSubtext: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  noData: {
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 10,
  },
  
  // Score
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 16,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.border,
  },
  scoreEmoji: {
    fontSize: 20,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  scoreInfo: {
    flex: 1,
  },
  scoreTrend: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  scoreSummary: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  
  // Tabs
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cardLight,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 4,
  },
  tabActive: {
    backgroundColor: COLORS.blue,
  },
  tabIcon: {
    fontSize: 14,
  },
  tabLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  
  // Indicator Panel
  indicatorPanel: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  indicatorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  
  // RSI
  rsiContainer: {},
  rsiBarContainer: {
    height: 24,
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  rsiZone: {
    height: '100%',
  },
  rsiZoneOversold: {
    flex: 30,
    backgroundColor: COLORS.green + '44',
  },
  rsiZoneNeutral: {
    flex: 40,
    backgroundColor: COLORS.yellow + '33',
  },
  rsiZoneOverbought: {
    flex: 30,
    backgroundColor: COLORS.red + '44',
  },
  rsiIndicator: {
    position: 'absolute',
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    borderWidth: 2,
    borderColor: COLORS.text,
  },
  rsiLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  rsiLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  rsiValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  rsiValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  rsiSignal: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  // MACD
  macdContainer: {},
  macdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  macdItem: {
    alignItems: 'center',
  },
  macdLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  macdValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  trendBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  trendText: {
    fontSize: 13,
    fontWeight: '600',
  },
  
  // Bollinger
  bollingerContainer: {},
  bollingerVisual: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 16,
  },
  bollingerBand: {
    width: 40,
    height: 100,
    backgroundColor: COLORS.blue + '33',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.blue,
    overflow: 'hidden',
    position: 'relative',
  },
  bollingerFill: {
    backgroundColor: COLORS.blue + '22',
  },
  bollingerPrice: {
    position: 'absolute',
    left: 5,
    right: 5,
    height: 8,
    borderRadius: 4,
    marginBottom: -4,
  },
  bollingerLabels: {
    flex: 1,
    justifyContent: 'space-between',
  },
  bollingerLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bollingerLabelText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  bollingerLabelValue: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
  },
  
  // Support/Resistance
  srContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  srColumn: {
    flex: 1,
  },
  srTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  srItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  srLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    flex: 1,
  },
  srPrice: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  srDistance: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  srDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  srCurrentPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.yellow,
    backgroundColor: COLORS.card,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    transform: [{ rotate: '-90deg' }],
    width: 80,
    textAlign: 'center',
  },
  
  // Signals
  signalsContainer: {
    marginTop: 8,
  },
  signalsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  signalsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  signalItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  signalIndicator: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  signalDesc: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});

export default TechnicalIndicators;
