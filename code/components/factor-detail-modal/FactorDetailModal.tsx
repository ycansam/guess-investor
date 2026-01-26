/**
 * FactorDetailModal
 * 
 * Modal que muestra detalles de cada factor de análisis:
 * - Técnico: RSI, MACD, Bollinger, S/R
 * - Macro: Indicadores económicos
 * - Sentiment: VIX, Put/Call, Fear & Greed
 * - News: Noticias recientes
 * - etc.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { apiClient } from '../../services/api-client';

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

// Tipos de factor
export type FactorType = 'technical' | 'macro' | 'sentiment' | 'news' | 'trend' | 
                         'competitors' | 'forex' | 'institutional' | 'seasonality' | 
                         'financials' | 'expectations';

interface Props {
  visible: boolean;
  onClose: () => void;
  factorType: FactorType;
  symbol: string;
  score?: number;
}

// Configuración de cada factor
const FACTOR_CONFIG: Record<FactorType, { title: string; icon: string; description: string }> = {
  technical: {
    title: 'Análisis Técnico',
    icon: '📊',
    description: 'RSI, MACD, Bollinger Bands, medias móviles y soportes/resistencias',
  },
  macro: {
    title: 'Indicadores Macro',
    icon: '🌍',
    description: 'Inflación, tipos de interés, PIB, desempleo y otros indicadores económicos',
  },
  sentiment: {
    title: 'Sentimiento',
    icon: '💬',
    description: 'VIX, Put/Call ratio, Fear & Greed index y sentimiento del mercado',
  },
  news: {
    title: 'Noticias',
    icon: '📰',
    description: 'Noticias recientes y su impacto en el activo',
  },
  trend: {
    title: 'Tendencia',
    icon: '📈',
    description: 'Tendencia de precio a 30 y 90 días',
  },
  competitors: {
    title: 'Competidores',
    icon: '🏭',
    description: 'Rendimiento comparativo con empresas del sector',
  },
  forex: {
    title: 'Divisas (Forex)',
    icon: '💱',
    description: 'Impacto del tipo de cambio en el activo',
  },
  institutional: {
    title: 'Institucionales',
    icon: '🏛️',
    description: 'Movimientos de fondos institucionales y grandes inversores',
  },
  seasonality: {
    title: 'Estacionalidad',
    icon: '📅',
    description: 'Patrones estacionales históricos del activo',
  },
  financials: {
    title: 'Financieros',
    icon: '💰',
    description: 'Métricas financieras: P/E, márgenes, deuda, target de analistas',
  },
  expectations: {
    title: 'Expectativas',
    icon: '🎯',
    description: 'Estimaciones de analistas y expectativas del mercado',
  },
};

// ============================================================================
// Sub-componentes de detalle por tipo
// ============================================================================

// RSI Bar visual
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
        <View style={[styles.rsiZone, styles.rsiZoneOversold]} />
        <View style={[styles.rsiZone, styles.rsiZoneNeutral]} />
        <View style={[styles.rsiZone, styles.rsiZoneOverbought]} />
        <View style={[styles.rsiIndicator, { left: `${value}%`, backgroundColor: getZoneColor() }]} />
      </View>
      <View style={styles.rsiLabels}>
        <Text style={styles.rsiLabel}>0</Text>
        <Text style={styles.rsiLabel}>30</Text>
        <Text style={styles.rsiLabel}>70</Text>
        <Text style={styles.rsiLabel}>100</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.bigValue, { color: getZoneColor() }]}>{value.toFixed(1)}</Text>
        <Text style={[styles.valueLabel, { color: getZoneColor() }]}>{getZoneText()}</Text>
      </View>
    </View>
  );
};

// Technical Detail
const TechnicalDetail = ({ data }: { data: any }) => {
  if (!data || !data.hasData) {
    return <Text style={styles.noData}>Sin datos técnicos disponibles</Text>;
  }

  return (
    <View style={styles.detailContent}>
      {/* Score general */}
      <View style={styles.scoreCard}>
        <Text style={styles.scoreEmoji}>
          {data.technicalScore >= 50 ? '🚀' : data.technicalScore >= 20 ? '📈' : 
           data.technicalScore <= -50 ? '💥' : data.technicalScore <= -20 ? '📉' : '➡️'}
        </Text>
        <Text style={[styles.scoreValue, { 
          color: data.technicalScore >= 20 ? COLORS.green : 
                 data.technicalScore <= -20 ? COLORS.red : COLORS.yellow 
        }]}>
          {data.technicalScore}
        </Text>
        <Text style={styles.scoreLabel}>Score Técnico</Text>
      </View>

      {/* RSI */}
      <View style={styles.indicatorSection}>
        <Text style={styles.indicatorTitle}>📈 RSI (14 períodos)</Text>
        <RSIBar value={data.rsi14} />
      </View>

      {/* MACD */}
      <View style={styles.indicatorSection}>
        <Text style={styles.indicatorTitle}>📊 MACD</Text>
        <View style={styles.macdRow}>
          <View style={styles.macdItem}>
            <Text style={styles.macdLabel}>MACD</Text>
            <Text style={styles.macdValue}>{data.macd?.toFixed(4) || '-'}</Text>
          </View>
          <View style={styles.macdItem}>
            <Text style={styles.macdLabel}>Señal</Text>
            <Text style={styles.macdValue}>{data.macdSignal?.toFixed(4) || '-'}</Text>
          </View>
          <View style={styles.macdItem}>
            <Text style={styles.macdLabel}>Histograma</Text>
            <Text style={[styles.macdValue, { 
              color: (data.macdHistogram || 0) >= 0 ? COLORS.green : COLORS.red 
            }]}>
              {data.macdHistogram !== null ? 
                ((data.macdHistogram >= 0 ? '+' : '') + data.macdHistogram.toFixed(4)) : '-'}
            </Text>
          </View>
        </View>
        <View style={[styles.trendBadge, { 
          backgroundColor: data.macdTrend === 'bullish' ? COLORS.green + '33' : 
                          data.macdTrend === 'bearish' ? COLORS.red + '33' : COLORS.yellow + '33' 
        }]}>
          <Text style={[styles.trendText, { 
            color: data.macdTrend === 'bullish' ? COLORS.green : 
                   data.macdTrend === 'bearish' ? COLORS.red : COLORS.yellow 
          }]}>
            {data.macdTrend === 'bullish' ? '📈 Alcista' : 
             data.macdTrend === 'bearish' ? '📉 Bajista' : '➡️ Neutral'}
          </Text>
        </View>
      </View>

      {/* Bollinger Bands */}
      <View style={styles.indicatorSection}>
        <Text style={styles.indicatorTitle}>📉 Bandas de Bollinger</Text>
        <View style={styles.bollingerGrid}>
          <View style={styles.bollingerItem}>
            <Text style={styles.bollingerLabel}>Superior</Text>
            <Text style={[styles.bollingerValue, { color: COLORS.red }]}>
              {data.bollingerUpper?.toFixed(2) || '-'}
            </Text>
          </View>
          <View style={styles.bollingerItem}>
            <Text style={styles.bollingerLabel}>Media (SMA20)</Text>
            <Text style={styles.bollingerValue}>{data.bollingerMiddle?.toFixed(2) || '-'}</Text>
          </View>
          <View style={styles.bollingerItem}>
            <Text style={styles.bollingerLabel}>Inferior</Text>
            <Text style={[styles.bollingerValue, { color: COLORS.green }]}>
              {data.bollingerLower?.toFixed(2) || '-'}
            </Text>
          </View>
          <View style={styles.bollingerItem}>
            <Text style={styles.bollingerLabel}>Ancho</Text>
            <Text style={styles.bollingerValue}>{data.bollingerWidth?.toFixed(2)}%</Text>
          </View>
        </View>
        <View style={[styles.trendBadge, { 
          backgroundColor: data.bollingerPosition === 'above' ? COLORS.red + '33' : 
                          data.bollingerPosition === 'below' ? COLORS.green + '33' : COLORS.blue + '33' 
        }]}>
          <Text style={[styles.trendText, { 
            color: data.bollingerPosition === 'above' ? COLORS.red : 
                   data.bollingerPosition === 'below' ? COLORS.green : COLORS.blue 
          }]}>
            {data.bollingerPosition === 'above' ? '⬆️ Por encima (venta)' : 
             data.bollingerPosition === 'below' ? '⬇️ Por debajo (compra)' : '↔️ Dentro de bandas'}
          </Text>
        </View>
      </View>

      {/* Medias Móviles */}
      <View style={styles.indicatorSection}>
        <Text style={styles.indicatorTitle}>📈 Medias Móviles</Text>
        <View style={styles.smaGrid}>
          {[
            { label: 'SMA 20', value: data.sma20, above: data.priceAboveSMA20 },
            { label: 'SMA 50', value: data.sma50, above: data.priceAboveSMA50 },
            { label: 'SMA 200', value: data.sma200, above: data.priceAboveSMA200 },
          ].map((sma, i) => (
            <View key={i} style={styles.smaItem}>
              <Text style={styles.smaLabel}>{sma.label}</Text>
              <Text style={styles.smaValue}>{sma.value?.toFixed(2) || '-'}</Text>
              {sma.value && (
                <View style={[styles.smaBadge, { backgroundColor: sma.above ? COLORS.green + '33' : COLORS.red + '33' }]}>
                  <Text style={{ fontSize: 10, color: sma.above ? COLORS.green : COLORS.red }}>
                    {sma.above ? '📈 Encima' : '📉 Debajo'}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
        {data.goldenCross && (
          <View style={[styles.alertBadge, { backgroundColor: COLORS.green + '33' }]}>
            <Text style={{ color: COLORS.green, fontWeight: '600' }}>✨ Golden Cross detectado (muy alcista)</Text>
          </View>
        )}
        {data.deathCross && (
          <View style={[styles.alertBadge, { backgroundColor: COLORS.red + '33' }]}>
            <Text style={{ color: COLORS.red, fontWeight: '600' }}>💀 Death Cross detectado (muy bajista)</Text>
          </View>
        )}
      </View>

      {/* Señales */}
      {data.signals && data.signals.length > 0 && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>⚡ Señales Activas</Text>
          <View style={styles.signalsList}>
            {data.signals.map((signal: any, i: number) => (
              <View key={i} style={[styles.signalItem, { 
                backgroundColor: signal.signal === 'bullish' ? COLORS.green + '22' : 
                                signal.signal === 'bearish' ? COLORS.red + '22' : COLORS.yellow + '22' 
              }]}>
                <Text style={styles.signalIndicator}>
                  {signal.signal === 'bullish' ? '📈' : signal.signal === 'bearish' ? '📉' : '➡️'} {signal.indicator}
                </Text>
                <Text style={styles.signalDesc}>{signal.description}</Text>
                <Text style={styles.signalWeight}>Peso: {signal.weight}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

// Macro Detail
const MacroDetail = ({ data }: { data: any }) => {
  if (!data || !data.hasData) {
    return <Text style={styles.noData}>Sin datos macroeconómicos disponibles</Text>;
  }

  return (
    <View style={styles.detailContent}>
      <View style={styles.scoreCard}>
        <Text style={styles.scoreEmoji}>
          {data.macroScore >= 20 ? '📈' : data.macroScore <= -20 ? '📉' : '➡️'}
        </Text>
        <Text style={[styles.scoreValue, { 
          color: data.macroScore >= 20 ? COLORS.green : 
                 data.macroScore <= -20 ? COLORS.red : COLORS.yellow 
        }]}>
          {data.macroScore}
        </Text>
        <Text style={styles.scoreLabel}>Score Macro</Text>
      </View>

      {/* Indicadores principales */}
      <View style={styles.indicatorSection}>
        <Text style={styles.indicatorTitle}>🏛️ Política Monetaria</Text>
        <View style={styles.macroGrid}>
          {data.fedRate !== undefined && (
            <View style={styles.macroItem}>
              <Text style={styles.macroLabel}>Tasa FED</Text>
              <Text style={styles.macroValue}>{data.fedRate.toFixed(2)}%</Text>
            </View>
          )}
          {data.inflation !== undefined && (
            <View style={styles.macroItem}>
              <Text style={styles.macroLabel}>Inflación</Text>
              <Text style={[styles.macroValue, { 
                color: data.inflation > 3 ? COLORS.red : COLORS.green 
              }]}>{data.inflation.toFixed(1)}%</Text>
            </View>
          )}
          {data.unemploymentRate !== undefined && (
            <View style={styles.macroItem}>
              <Text style={styles.macroLabel}>Desempleo</Text>
              <Text style={styles.macroValue}>{data.unemploymentRate.toFixed(1)}%</Text>
            </View>
          )}
        </View>
      </View>

      {data.summary && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{data.summary}</Text>
        </View>
      )}
    </View>
  );
};

// Sentiment Detail
const SentimentDetail = ({ data }: { data: any }) => {
  if (!data || !data.hasData) {
    return <Text style={styles.noData}>Sin datos de sentimiento disponibles</Text>;
  }

  const sentimentColor = data.sentiment === 'bullish' ? COLORS.green : 
                         data.sentiment === 'bearish' ? COLORS.red : COLORS.yellow;

  return (
    <View style={styles.detailContent}>
      <View style={styles.scoreCard}>
        <Text style={styles.scoreEmoji}>
          {data.sentiment === 'bullish' ? '🐂' : data.sentiment === 'bearish' ? '🐻' : '😐'}
        </Text>
        <Text style={[styles.scoreValue, { color: sentimentColor }]}>
          {data.overallScore}
        </Text>
        <Text style={styles.scoreLabel}>Score Sentimiento</Text>
      </View>

      {/* VIX */}
      {data.vix && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>📊 VIX (Índice del Miedo)</Text>
          <View style={styles.vixContainer}>
            <Text style={[styles.bigValue, { 
              color: data.vix.value < 18 ? COLORS.green : 
                     data.vix.value > 25 ? COLORS.red : COLORS.yellow 
            }]}>
              {data.vix.value?.toFixed(1)}
            </Text>
            <Text style={styles.vixSignal}>
              {data.vix.value < 18 ? '😊 Complacencia (riesgo)' : 
               data.vix.value > 25 ? '😰 Miedo (oportunidad)' : '😐 Normal'}
            </Text>
          </View>
        </View>
      )}

      {/* Put/Call Ratio */}
      {data.putCallRatio && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>📈 Put/Call Ratio</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.bigValue, { 
              color: data.putCallRatio.value < 0.7 ? COLORS.red : 
                     data.putCallRatio.value > 1.0 ? COLORS.green : COLORS.yellow 
            }]}>
              {data.putCallRatio.value?.toFixed(2)}
            </Text>
            <Text style={styles.valueLabel}>
              {data.putCallRatio.value < 0.7 ? 'Optimismo excesivo' : 
               data.putCallRatio.value > 1.0 ? 'Miedo (contrarian alcista)' : 'Normal'}
            </Text>
          </View>
        </View>
      )}

      {/* Fear & Greed */}
      {data.fearGreed && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>😱 Fear & Greed Index</Text>
          <View style={styles.fearGreedContainer}>
            <View style={styles.fearGreedBar}>
              <View style={[styles.fearGreedFill, { 
                width: `${data.fearGreed.value}%`,
                backgroundColor: data.fearGreed.value < 30 ? COLORS.red : 
                                data.fearGreed.value > 70 ? COLORS.green : COLORS.yellow
              }]} />
              <View style={[styles.fearGreedIndicator, { left: `${data.fearGreed.value}%` }]} />
            </View>
            <View style={styles.fearGreedLabels}>
              <Text style={{ fontSize: 10, color: COLORS.red }}>Miedo Extremo</Text>
              <Text style={{ fontSize: 10, color: COLORS.green }}>Codicia Extrema</Text>
            </View>
            <Text style={styles.fearGreedValue}>{data.fearGreed.value} - {data.fearGreed.label}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

// News Detail
const NewsDetail = ({ data }: { data: any }) => {
  if (!data || !data.hasData) {
    return <Text style={styles.noData}>Sin noticias recientes</Text>;
  }

  return (
    <View style={styles.detailContent}>
      <View style={styles.scoreCard}>
        <Text style={styles.scoreEmoji}>
          {data.sentimentScore >= 20 ? '📈' : data.sentimentScore <= -20 ? '📉' : '📰'}
        </Text>
        <Text style={[styles.scoreValue, { 
          color: data.sentimentScore >= 20 ? COLORS.green : 
                 data.sentimentScore <= -20 ? COLORS.red : COLORS.yellow 
        }]}>
          {data.sentimentScore}
        </Text>
        <Text style={styles.scoreLabel}>Score Noticias</Text>
      </View>

      {data.summary && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{data.summary}</Text>
        </View>
      )}

      {data.articles && data.articles.length > 0 && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>📰 Noticias Recientes</Text>
          {data.articles.slice(0, 5).map((article: any, i: number) => (
            <View key={i} style={styles.newsItem}>
              <Text style={styles.newsTitle}>{article.title}</Text>
              <View style={styles.newsFooter}>
                <Text style={styles.newsSource}>{article.source}</Text>
                <Text style={[styles.newsSentiment, { 
                  color: article.sentiment === 'positive' ? COLORS.green : 
                         article.sentiment === 'negative' ? COLORS.red : COLORS.yellow 
                }]}>
                  {article.sentiment === 'positive' ? '📈' : 
                   article.sentiment === 'negative' ? '📉' : '➡️'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// Trend Detail - Usa la estructura de TrendAnalysis del API
const TrendDetail = ({ data }: { data: any }) => {
  if (!data) {
    return <Text style={styles.noData}>Sin datos de tendencia disponibles</Text>;
  }

  // Helper para formatear números de forma segura
  const safeToFixed = (value: any, decimals: number = 2): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${safeToFixed(value)}%`;
  };

  // Determinar dirección de la racha
  const streakDirection = data.currentStreak?.direction;
  const streakColor = streakDirection === 'up' ? COLORS.green : 
                      streakDirection === 'down' ? COLORS.red : COLORS.yellow;
  const streakEmoji = streakDirection === 'up' ? '📈' : 
                      streakDirection === 'down' ? '📉' : '➡️';

  // Momentum info
  const momentumSignal = data.momentum?.signal;
  const momentumColor = momentumSignal === 'bullish' ? COLORS.green : 
                        momentumSignal === 'bearish' ? COLORS.red : COLORS.yellow;

  return (
    <View style={styles.detailContent}>
      {/* Racha Actual */}
      {data.currentStreak && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>📊 Racha Actual</Text>
          <View style={styles.streakCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 32 }}>{streakEmoji}</Text>
              <View style={{ marginLeft: 12 }}>
                <Text style={[styles.bigValue, { color: streakColor, fontSize: 24 }]}>
                  {data.currentStreak.days} días {
                    streakDirection === 'up' ? 'subiendo' : 
                    streakDirection === 'down' ? 'bajando' : 'lateral'
                  }
                </Text>
                {typeof data.currentStreak.totalChange === 'number' && (
                  <Text style={[styles.streakChange, { color: streakColor }]}>
                    {formatPercent(data.currentStreak.totalChange)} total
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.trendGrid}>
              {typeof data.currentStreak.avgDailyChange === 'number' && (
                <View style={styles.trendItem}>
                  <Text style={styles.trendLabel}>Media diaria</Text>
                  <Text style={[styles.trendValue, { color: streakColor }]}>
                    {formatPercent(data.currentStreak.avgDailyChange)}
                  </Text>
                </View>
              )}
              {data.currentStreak.startDate && (
                <View style={styles.trendItem}>
                  <Text style={styles.trendLabel}>Desde</Text>
                  <Text style={styles.trendValue}>{data.currentStreak.startDate}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Momentum */}
      {data.momentum && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>🚀 Momentum</Text>
          <View style={{ marginBottom: 12 }}>
            <Text style={[{ fontSize: 18, fontWeight: '700' }, { color: momentumColor }]}>
              {momentumSignal === 'bullish' ? '📈 Alcista' : 
               momentumSignal === 'bearish' ? '📉 Bajista' : '➡️ Neutral'}
              {data.momentum.strength && ` (${
                data.momentum.strength === 'strong' ? 'Fuerte' :
                data.momentum.strength === 'moderate' ? 'Moderado' : 'Débil'
              })`}
            </Text>
          </View>
          <View style={styles.momentumGrid}>
            {typeof data.momentum.short === 'number' && (
              <View style={styles.momentumGridItem}>
                <Text style={styles.momentumGridLabel}>Corto</Text>
                <View style={styles.momentumBarSmall}>
                  <View style={[styles.momentumFill, { 
                    width: `${Math.min(Math.abs(data.momentum.short) * 10, 100)}%`,
                    backgroundColor: data.momentum.short >= 0 ? COLORS.green : COLORS.red
                  }]} />
                </View>
                <Text style={[styles.momentumGridValue, { 
                  color: data.momentum.short >= 0 ? COLORS.green : COLORS.red 
                }]}>
                  {safeToFixed(data.momentum.short, 1)}
                </Text>
              </View>
            )}
            {typeof data.momentum.medium === 'number' && (
              <View style={styles.momentumGridItem}>
                <Text style={styles.momentumGridLabel}>Medio</Text>
                <View style={styles.momentumBarSmall}>
                  <View style={[styles.momentumFill, { 
                    width: `${Math.min(Math.abs(data.momentum.medium) * 10, 100)}%`,
                    backgroundColor: data.momentum.medium >= 0 ? COLORS.green : COLORS.red
                  }]} />
                </View>
                <Text style={[styles.momentumGridValue, { 
                  color: data.momentum.medium >= 0 ? COLORS.green : COLORS.red 
                }]}>
                  {safeToFixed(data.momentum.medium, 1)}
                </Text>
              </View>
            )}
            {typeof data.momentum.long === 'number' && (
              <View style={styles.momentumGridItem}>
                <Text style={styles.momentumGridLabel}>Largo</Text>
                <View style={styles.momentumBarSmall}>
                  <View style={[styles.momentumFill, { 
                    width: `${Math.min(Math.abs(data.momentum.long) * 10, 100)}%`,
                    backgroundColor: data.momentum.long >= 0 ? COLORS.green : COLORS.red
                  }]} />
                </View>
                <Text style={[styles.momentumGridValue, { 
                  color: data.momentum.long >= 0 ? COLORS.green : COLORS.red 
                }]}>
                  {safeToFixed(data.momentum.long, 1)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Soportes y Resistencias */}
      {(data.supports?.length > 0 || data.resistances?.length > 0) && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>📍 Niveles Clave</Text>
          
          {/* Resistencias */}
          {data.resistances?.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.srSubtitle, { color: COLORS.red }]}>🔺 Resistencias (arriba)</Text>
              {data.resistances.slice(0, 2).map((r: any, i: number) => (
                <View key={i} style={styles.srItem}>
                  <Text style={styles.srValue}>${safeToFixed(r.price)}</Text>
                  {typeof r.distance === 'number' && (
                    <Text style={[styles.srDistance, { color: COLORS.red }]}>
                      +{safeToFixed(Math.abs(r.distance))}%
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Precio actual */}
          {typeof data.currentPrice === 'number' && (
            <View style={[styles.srItem, { backgroundColor: COLORS.blue + '33', marginVertical: 8 }]}>
              <Text style={[styles.srLabel, { color: COLORS.blue }]}>📍 Precio actual</Text>
              <Text style={[styles.srValue, { color: COLORS.blue }]}>${safeToFixed(data.currentPrice)}</Text>
            </View>
          )}

          {/* Soportes */}
          {data.supports?.length > 0 && (
            <View>
              <Text style={[styles.srSubtitle, { color: COLORS.green }]}>🔻 Soportes (abajo)</Text>
              {data.supports.slice(0, 2).map((s: any, i: number) => (
                <View key={i} style={styles.srItem}>
                  <Text style={styles.srValue}>${safeToFixed(s.price)}</Text>
                  {typeof s.distance === 'number' && (
                    <Text style={[styles.srDistance, { color: COLORS.green }]}>
                      -{safeToFixed(Math.abs(s.distance))}%
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Estadísticas últimos 30 días */}
      {data.stats && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>📈 Últimos 30 días</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.green }]}>
                {data.stats.up_days_30d || 0}
              </Text>
              <Text style={styles.statLabel}>Días verdes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.red }]}>
                {data.stats.down_days_30d || 0}
              </Text>
              <Text style={styles.statLabel}>Días rojos</Text>
            </View>
            {typeof data.stats.avg_up_move === 'number' && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.green }]}>
                  +{safeToFixed(data.stats.avg_up_move)}%
                </Text>
                <Text style={styles.statLabel}>Media subida</Text>
              </View>
            )}
            {typeof data.stats.avg_down_move === 'number' && (
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.red }]}>
                  {safeToFixed(data.stats.avg_down_move)}%
                </Text>
                <Text style={styles.statLabel}>Media bajada</Text>
              </View>
            )}
          </View>
          
          {/* Mejor y peor día */}
          <View style={styles.bestWorstContainer}>
            {data.stats.best_day_30d && (
              <View style={[styles.bestWorstItem, { backgroundColor: COLORS.green + '22' }]}>
                <Text style={styles.bestWorstEmoji}>🎉</Text>
                <Text style={styles.bestWorstLabel}>Mejor día</Text>
                <Text style={[styles.bestWorstValue, { color: COLORS.green }]}>
                  +{safeToFixed(data.stats.best_day_30d.change)}%
                </Text>
                <Text style={styles.bestWorstDate}>{data.stats.best_day_30d.date}</Text>
              </View>
            )}
            {data.stats.worst_day_30d && (
              <View style={[styles.bestWorstItem, { backgroundColor: COLORS.red + '22' }]}>
                <Text style={styles.bestWorstEmoji}>😓</Text>
                <Text style={styles.bestWorstLabel}>Peor día</Text>
                <Text style={[styles.bestWorstValue, { color: COLORS.red }]}>
                  {safeToFixed(data.stats.worst_day_30d.change)}%
                </Text>
                <Text style={styles.bestWorstDate}>{data.stats.worst_day_30d.date}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Predicción de tendencia */}
      {data.trendPrediction && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>🔮 Predicción de Tendencia</Text>
          <View style={[styles.predictionCard, { 
            backgroundColor: data.trendPrediction.direction === 'continue' ? COLORS.green + '22' : 
                            data.trendPrediction.direction === 'reverse' ? COLORS.orange + '22' : COLORS.yellow + '22'
          }]}>
            <Text style={[styles.predictionDirection, { 
              color: data.trendPrediction.direction === 'continue' ? COLORS.green : 
                     data.trendPrediction.direction === 'reverse' ? COLORS.orange : COLORS.yellow 
            }]}>
              {data.trendPrediction.direction === 'continue' ? '📈 Continuará' : 
               data.trendPrediction.direction === 'reverse' ? '🔄 Revertirá' : '❓ Incierto'}
            </Text>
            {typeof data.trendPrediction.probability === 'number' && (
              <Text style={styles.predictionProb}>
                {safeToFixed(data.trendPrediction.probability * 100, 0)}% probabilidad
              </Text>
            )}
            {data.trendPrediction.reasoning && (
              <Text style={styles.predictionReason}>{data.trendPrediction.reasoning}</Text>
            )}
          </View>
        </View>
      )}

      {/* Volatilidad */}
      {data.volatility && (
        <View style={styles.indicatorSection}>
          <Text style={styles.indicatorTitle}>⚡ Volatilidad</Text>
          <View style={styles.volatilityGrid}>
            {typeof data.volatility.current === 'number' && (
              <View style={styles.volatilityItem}>
                <Text style={styles.volatilityLabel}>Actual</Text>
                <Text style={styles.volatilityValue}>{safeToFixed(data.volatility.current)}%</Text>
              </View>
            )}
            {typeof data.volatility.average === 'number' && (
              <View style={styles.volatilityItem}>
                <Text style={styles.volatilityLabel}>Media</Text>
                <Text style={styles.volatilityValue}>{safeToFixed(data.volatility.average)}%</Text>
              </View>
            )}
            {data.volatility.trend && (
              <View style={styles.volatilityItem}>
                <Text style={styles.volatilityLabel}>Tendencia</Text>
                <Text style={[styles.volatilityValue, { 
                  color: data.volatility.trend === 'increasing' ? COLORS.red : 
                         data.volatility.trend === 'decreasing' ? COLORS.green : COLORS.yellow 
                }]}>
                  {data.volatility.trend === 'increasing' ? '↑ Aumentando' : 
                   data.volatility.trend === 'decreasing' ? '↓ Disminuyendo' : '→ Estable'}
                </Text>
              </View>
            )}
            {typeof data.volatility.percentile === 'number' && (
              <View style={styles.volatilityItem}>
                <Text style={styles.volatilityLabel}>Percentil</Text>
                <Text style={styles.volatilityValue}>{safeToFixed(data.volatility.percentile, 0)}%</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

// Generic Detail (para otros factores)
const GenericDetail = ({ data, factorType }: { data: any; factorType: FactorType }) => {
  const config = FACTOR_CONFIG[factorType];
  
  if (!data || !data.hasData) {
    return (
      <View style={styles.detailContent}>
        <Text style={styles.noData}>Sin datos de {config.title.toLowerCase()} disponibles</Text>
        <Text style={styles.noDataSubtext}>{config.description}</Text>
      </View>
    );
  }

  // Score genérico
  const scoreKey = Object.keys(data).find(k => k.toLowerCase().includes('score'));
  const score = scoreKey ? data[scoreKey] : null;

  return (
    <View style={styles.detailContent}>
      {score !== null && (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreEmoji}>{config.icon}</Text>
          <Text style={[styles.scoreValue, { 
            color: score >= 20 ? COLORS.green : score <= -20 ? COLORS.red : COLORS.yellow 
          }]}>
            {score}
          </Text>
          <Text style={styles.scoreLabel}>Score {config.title}</Text>
        </View>
      )}

      {data.summary && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{data.summary}</Text>
        </View>
      )}

      {/* Mostrar otros datos disponibles */}
      <View style={styles.dataGrid}>
        {Object.entries(data).map(([key, value]) => {
          if (['hasData', 'summary'].includes(key) || key.includes('score') || typeof value === 'object') {
            return null;
          }
          return (
            <View key={key} style={styles.dataItem}>
              <Text style={styles.dataLabel}>{key}</Text>
              <Text style={styles.dataValue}>
                {typeof value === 'number' ? value.toFixed(2) : String(value)}
              </Text>
            </View>
          );
        }).filter(Boolean)}
      </View>
    </View>
  );
};

// ============================================================================
// Componente Principal
// ============================================================================

export function FactorDetailModal({ visible, onClose, factorType, symbol, score }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const config = FACTOR_CONFIG[factorType];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      const assetType = symbol.includes('-USD') || symbol.includes('-EUR') ? 'crypto' : 'stock';
      
      switch (factorType) {
        case 'technical':
          response = await apiClient.getTechnicalAnalysis(symbol);
          break;
        case 'macro':
          response = await apiClient.getMacroIndicators(symbol, assetType);
          break;
        case 'sentiment':
          response = await apiClient.getSentiment(symbol, assetType);
          break;
        case 'news':
          response = await apiClient.getNews(symbol, assetType);
          break;
        case 'trend':
          response = await apiClient.getTrends(symbol);
          break;
        default:
          // Para otros factores, obtener análisis completo
          const full = await apiClient.getFullAnalysis(symbol, assetType);
          response = full[factorType as keyof typeof full] || { hasData: false };
      }
      
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [factorType, symbol]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.blue} />
          <Text style={styles.loadingText}>Cargando {config.title.toLowerCase()}...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
          <Pressable style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }

    switch (factorType) {
      case 'technical':
        return <TechnicalDetail data={data} />;
      case 'macro':
        return <MacroDetail data={data} />;
      case 'sentiment':
        return <SentimentDetail data={data} />;
      case 'news':
        return <NewsDetail data={data} />;
      case 'trend':
        return <TrendDetail data={data} />;
      default:
        return <GenericDetail data={data} factorType={factorType} />;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitle}>
              <Text style={styles.headerIcon}>{config.icon}</Text>
              <View>
                <Text style={styles.headerText}>{config.title}</Text>
                <Text style={styles.headerSymbol}>{symbol}</Text>
              </View>
            </View>
            {score !== undefined && (
              <View style={[styles.scoreBadge, { 
                backgroundColor: score >= 15 ? COLORS.green + '33' : 
                                score <= -15 ? COLORS.red + '33' : COLORS.yellow + '33' 
              }]}>
                <Text style={[styles.scoreBadgeText, { 
                  color: score >= 15 ? COLORS.green : score <= -15 ? COLORS.red : COLORS.yellow 
                }]}>
                  {score >= 0 ? '+' : ''}{score}
                </Text>
              </View>
            )}
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </Pressable>
          </View>

          {/* Description */}
          <Text style={styles.description}>{config.description}</Text>

          {/* Content */}
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {renderContent()}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Estilos
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSymbol: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
  },
  scoreBadgeText: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  description: {
    fontSize: 13,
    color: COLORS.textSecondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    lineHeight: 18,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  detailContent: {},
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.red,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: COLORS.blue,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.text,
    fontWeight: '600',
  },
  noData: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 20,
    fontSize: 15,
  },
  noDataSubtext: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    paddingHorizontal: 20,
  },

  // Score Card
  scoreCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Indicator Section
  indicatorSection: {
    backgroundColor: COLORS.card,
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
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  bigValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  valueLabel: {
    fontSize: 14,
    fontWeight: '600',
  },

  // MACD
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
  bollingerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  bollingerItem: {
    width: '45%',
  },
  bollingerLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  bollingerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },

  // SMA
  smaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  smaItem: {
    alignItems: 'center',
  },
  smaLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  smaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  smaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  alertBadge: {
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },

  // Signals
  signalsList: {
    gap: 8,
  },
  signalItem: {
    padding: 10,
    borderRadius: 8,
  },
  signalIndicator: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  signalDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  signalWeight: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Macro
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Summary
  summaryBox: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },

  // VIX
  vixContainer: {
    alignItems: 'center',
  },
  vixSignal: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 8,
  },

  // Fear & Greed
  fearGreedContainer: {},
  fearGreedBar: {
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.cardLight,
    position: 'relative',
    overflow: 'hidden',
  },
  fearGreedFill: {
    height: '100%',
    borderRadius: 8,
  },
  fearGreedIndicator: {
    position: 'absolute',
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.text,
    marginLeft: -10,
  },
  fearGreedLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  fearGreedValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 12,
  },

  // News
  newsItem: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  newsTitle: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
    marginBottom: 6,
  },
  newsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsSource: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  newsSentiment: {
    fontSize: 14,
  },

  // Trend
  trendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  trendItem: {
    width: '48%',
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  trendLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  trendValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  streakContainer: {
    alignItems: 'center',
    padding: 12,
  },
  streakDirection: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  streakChange: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  momentumBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.cardLight,
    overflow: 'hidden',
    marginBottom: 8,
  },
  momentumFill: {
    height: '100%',
    borderRadius: 6,
  },
  momentumValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  srGrid: {
    gap: 8,
  },
  srItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 12,
  },
  srLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  srValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  srSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  srDistance: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Streak Card
  streakCard: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 12,
    padding: 16,
  },

  // Momentum Grid
  momentumGrid: {
    gap: 12,
  },
  momentumGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  momentumGridLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    width: 50,
  },
  momentumBarSmall: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.cardLight,
    overflow: 'hidden',
  },
  momentumGridValue: {
    fontSize: 14,
    fontWeight: '700',
    width: 50,
    textAlign: 'right',
  },

  // Stats Grid (30 day stats)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statItem: {
    width: '48%',
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Best/Worst day
  bestWorstContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  bestWorstItem: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  bestWorstEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  bestWorstLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  bestWorstValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  bestWorstDate: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Prediction Card
  predictionCard: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  predictionDirection: {
    fontSize: 18,
    fontWeight: '700',
  },
  predictionProb: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  predictionReason: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },

  // Volatility Grid
  volatilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  volatilityItem: {
    width: '48%',
    backgroundColor: COLORS.cardLight,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  volatilityLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  volatilityValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Generic Data
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dataItem: {
    width: '45%',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 12,
  },
  dataLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
});

export default FactorDetailModal;
