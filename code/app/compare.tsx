import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useMenu } from '../components/_shared/menu-context';
import { apiClient, CalculatedPrediction } from '../services/api-client';

const DARK = {
  bg: '#0a0a0a',
  bgCard: '#111111',
  bgSecondary: '#1a1a1a',
  border: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  accent: '#6366f1',
  green: '#4CAF50',
  red: '#F44336',
  orange: '#FF9800',
};

interface CompareData {
  symbol: string;
  prediction: CalculatedPrediction | null;
  loading: boolean;
  error?: string;
}

export default function CompareScreen() {
  const router = useRouter();
  const { openMenu } = useMenu();
  const params = useLocalSearchParams();
  const initialSymbols = params.symbols 
    ? (Array.isArray(params.symbols) ? params.symbols : [params.symbols])
    : [];

  const [symbols, setSymbols] = useState<string[]>(initialSymbols.length > 0 ? initialSymbols : ['', '', '']);
  const [compareData, setCompareData] = useState<CompareData[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  // Cargar datos iniciales si vienen símbolos en la URL
  useEffect(() => {
    if (initialSymbols.length > 0) {
      handleCompare();
    }
  }, []);

  const handleCompare = async () => {
    const validSymbols = symbols.filter(s => s.trim().length > 0);
    if (validSymbols.length < 2) {
      return;
    }

    setIsComparing(true);
    const newData: CompareData[] = validSymbols.map(s => ({
      symbol: s.toUpperCase(),
      prediction: null,
      loading: true,
    }));
    setCompareData(newData);

    try {
      // Usar batch para cargar todas las predicciones en una sola petición
      const batchResult = await apiClient.calculatePredictionBatch(
        validSymbols.map(s => s.toUpperCase()),
        1
      );

      // Mapear resultados
      const results: CompareData[] = validSymbols.map(symbol => {
        const normalizedSymbol = symbol.toUpperCase();
        const result = batchResult.results[normalizedSymbol];
        
        if (result?.success && result.data) {
          return { symbol: normalizedSymbol, prediction: result.data, loading: false };
        } else {
          return { 
            symbol: normalizedSymbol, 
            prediction: null, 
            loading: false, 
            error: result?.error || 'Error al calcular predicción' 
          };
        }
      });

      setCompareData(results);
    } catch (error: any) {
      // Fallback: si falla el batch, marcar todos como error
      setCompareData(validSymbols.map(symbol => ({
        symbol: symbol.toUpperCase(),
        prediction: null,
        loading: false,
        error: error.message || 'Error de conexión',
      })));
    }
    
    setIsComparing(false);
  };

  const updateSymbol = (index: number, value: string) => {
    const newSymbols = [...symbols];
    newSymbols[index] = value.toUpperCase();
    setSymbols(newSymbols);
  };

  const renderMetricRow = (label: string, values: (string | number | undefined)[], colors?: string[]) => (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValues}>
        {values.map((value, idx) => (
          <Text 
            key={idx} 
            style={[styles.metricValue, colors?.[idx] ? { color: colors[idx] } : null]}
          >
            {value ?? '-'}
          </Text>
        ))}
      </View>
    </View>
  );

  const getDirectionColor = (direction?: string) => {
    if (direction === 'up') return DARK.green;
    if (direction === 'down') return DARK.red;
    return DARK.textSecondary;
  };

  const getDirectionEmoji = (direction?: string) => {
    if (direction === 'up') return '📈';
    if (direction === 'down') return '📉';
    return '➡️';
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={openMenu} style={styles.menuButton}>
            <Ionicons name="menu" size={24} color={DARK.text} />
          </Pressable>
        </View>
        <Text style={styles.title}>📊 Comparador de Activos</Text>
        <Text style={styles.subtitle}>Compara hasta 3 activos lado a lado</Text>
      </View>

      {/* Inputs de símbolos */}
      <View style={styles.inputsContainer}>
        {symbols.map((symbol, idx) => (
          <View key={idx} style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Activo {idx + 1}</Text>
            <TextInput
              style={styles.input}
              value={symbol}
              onChangeText={(text) => updateSymbol(idx, text)}
              placeholder="Ej: AAPL"
              placeholderTextColor={DARK.textMuted}
              autoCapitalize="characters"
            />
          </View>
        ))}
      </View>

      <Pressable 
        style={[styles.compareButton, isComparing && styles.compareButtonDisabled]}
        onPress={handleCompare}
        disabled={isComparing}
      >
        {isComparing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.compareButtonText}>🔍 Comparar</Text>
        )}
      </Pressable>

      {/* Resultados */}
      {compareData.length > 0 && (
        <View style={styles.resultsContainer}>
          {/* Header con nombres */}
          <View style={styles.compareHeader}>
            <View style={styles.metricLabelSpace} />
            {compareData.map((data, idx) => (
              <View key={idx} style={styles.assetHeader}>
                <Text style={styles.assetSymbol}>{data.symbol}</Text>
                {data.prediction && (
                  <Text style={styles.assetName} numberOfLines={1}>
                    {data.prediction.asset}
                  </Text>
                )}
                {data.loading && <ActivityIndicator size="small" color={DARK.accent} />}
                {data.error && <Text style={styles.errorText}>Error</Text>}
              </View>
            ))}
          </View>

          {/* Métricas */}
          {compareData.every(d => d.prediction) && (
            <>
              {/* Precio actual */}
              {renderMetricRow(
                '💰 Precio',
                compareData.map(d => d.prediction ? 
                  `${d.prediction.currentPrice?.toFixed(2)} ${d.prediction.currency || ''}` : '-')
              )}

              {/* Dirección */}
              {renderMetricRow(
                '🎯 Predicción',
                compareData.map(d => d.prediction ? 
                  `${getDirectionEmoji(d.prediction.direction)} ${d.prediction.predictedChange?.toFixed(2)}%` : '-'),
                compareData.map(d => getDirectionColor(d.prediction?.direction))
              )}

              {/* Confianza */}
              {renderMetricRow(
                '📊 Confianza',
                compareData.map(d => d.prediction ? `${d.prediction.confidence}%` : '-'),
                compareData.map(d => {
                  const conf = d.prediction?.confidence || 0;
                  return conf >= 70 ? DARK.green : conf >= 50 ? DARK.orange : DARK.red;
                })
              )}

              {/* Precio objetivo (promedio min/max) */}
              {renderMetricRow(
                '🎯 Objetivo',
                compareData.map(d => {
                  if (d.prediction?.predictedPriceMin && d.prediction?.predictedPriceMax) {
                    const avg = (d.prediction.predictedPriceMin + d.prediction.predictedPriceMax) / 2;
                    return `${avg.toFixed(2)} ${d.prediction.currency || ''}`;
                  }
                  return '-';
                })
              )}

              {/* Tendencia 30d */}
              {renderMetricRow(
                '📈 30 días',
                compareData.map(d => d.prediction?.historical?.change30d != null ? 
                  `${d.prediction.historical.change30d > 0 ? '+' : ''}${d.prediction.historical.change30d.toFixed(1)}%` : '-'),
                compareData.map(d => {
                  const change = d.prediction?.historical?.change30d;
                  return change != null ? (change >= 0 ? DARK.green : DARK.red) : DARK.textSecondary;
                })
              )}

              {/* Tendencia 90d */}
              {renderMetricRow(
                '📊 90 días',
                compareData.map(d => d.prediction?.historical?.change90d != null ? 
                  `${d.prediction.historical.change90d > 0 ? '+' : ''}${d.prediction.historical.change90d.toFixed(1)}%` : '-'),
                compareData.map(d => {
                  const change = d.prediction?.historical?.change90d;
                  return change != null ? (change >= 0 ? DARK.green : DARK.red) : DARK.textSecondary;
                })
              )}

              {/* Volatilidad */}
              {renderMetricRow(
                '📉 Volatilidad',
                compareData.map(d => d.prediction?.historical?.volatility != null ? 
                  `${d.prediction.historical.volatility.toFixed(1)}%` : '-'),
                compareData.map(d => {
                  const vol = d.prediction?.historical?.volatility;
                  return vol != null ? (vol > 40 ? DARK.red : vol > 20 ? DARK.orange : DARK.green) : DARK.textSecondary;
                })
              )}

              {/* Señales */}
              {renderMetricRow(
                '🚦 Señales',
                compareData.map(d => {
                  const signal = d.prediction?.factorBreakdown?.signalSummary;
                  if (signal === 'coherent_bullish') return '🟢 Alcistas';
                  if (signal === 'coherent_bearish') return '🔴 Bajistas';
                  if (signal === 'mixed') return '🟠 Mixtas';
                  return '⚪ Neutral';
                })
              )}

              {/* Dividendo - usando el campo events */}
              {renderMetricRow(
                '💵 Dividendo',
                compareData.map(d => {
                  const div = d.prediction?.events?.dividend;
                  if (div?.yield) return `${(div.yield * 100).toFixed(2)}%`;
                  return '-';
                }),
                compareData.map(d => d.prediction?.events?.dividend?.yield ? DARK.green : DARK.textSecondary)
              )}

              {/* Earnings */}
              {renderMetricRow(
                '📅 Earnings',
                compareData.map(d => {
                  const earnings = d.prediction?.events?.nextEarnings;
                  if (earnings) return `${earnings.daysUntil}d`;
                  return '-';
                }),
                compareData.map(d => {
                  const days = d.prediction?.events?.nextEarnings?.daysUntil;
                  return days != null ? (days <= 7 ? DARK.orange : DARK.textSecondary) : DARK.textSecondary;
                })
              )}
            </>
          )}
        </View>
      )}

      {/* Tips */}
      <View style={styles.tipsContainer}>
        <Text style={styles.tipsTitle}>💡 Consejos</Text>
        <Text style={styles.tipText}>• Compara activos del mismo sector para mejor contexto</Text>
        <Text style={styles.tipText}>• Revisa la volatilidad antes de invertir</Text>
        <Text style={styles.tipText}>• Ten en cuenta las fechas de earnings</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK.bg,
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  headerTop: {
    marginBottom: 16,
  },
  menuButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: DARK.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: DARK.textSecondary,
  },
  inputsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: DARK.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: DARK.bgSecondary,
    borderRadius: 8,
    padding: 12,
    color: DARK.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  compareButton: {
    backgroundColor: DARK.accent,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  compareButtonDisabled: {
    opacity: 0.6,
  },
  compareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    margin: 20,
    backgroundColor: DARK.bgCard,
    borderRadius: 12,
    padding: 16,
  },
  compareHeader: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: DARK.border,
  },
  metricLabelSpace: {
    width: 100,
  },
  assetHeader: {
    flex: 1,
    alignItems: 'center',
  },
  assetSymbol: {
    fontSize: 16,
    fontWeight: '700',
    color: DARK.text,
  },
  assetName: {
    fontSize: 11,
    color: DARK.textSecondary,
    marginTop: 2,
  },
  errorText: {
    fontSize: 11,
    color: DARK.red,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DARK.border,
  },
  metricLabel: {
    width: 100,
    fontSize: 12,
    color: DARK.textSecondary,
  },
  metricValues: {
    flex: 1,
    flexDirection: 'row',
  },
  metricValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: DARK.text,
    fontWeight: '500',
  },
  tipsContainer: {
    margin: 20,
    backgroundColor: DARK.bgSecondary,
    borderRadius: 12,
    padding: 16,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: DARK.text,
    marginBottom: 10,
  },
  tipText: {
    fontSize: 12,
    color: DARK.textSecondary,
    marginBottom: 6,
  },
});
