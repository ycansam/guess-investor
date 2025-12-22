/**
 * Página de detalle del activo con gráficos
 * Muestra precio histórico + predicción
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { predictionCalculatorService } from '../../services/prediction-calculator';
import { yahooV8Service } from '../../services/yahoo-v8-service';

// Tipos de timeframe para el gráfico
type ChartTimeframe = 'intraday' | 'swing' | 'longterm';

interface ChartDataPoint {
  value: number;
  label?: string;
  dataPointColor?: string;
  dataPointRadius?: number;
  showDataPoint?: boolean;
  labelTextStyle?: object;
  customDataPoint?: () => React.ReactNode;
}

interface AssetData {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
}

// Configuración de cada timeframe
const TIMEFRAME_CONFIG = {
  intraday: {
    label: 'Intradía',
    historyRange: '5d' as const,
    historyInterval: '15m' as const,
    predictionDays: 1,
    description: '4 días anteriores + predicción 1 día',
  },
  swing: {
    label: 'Swing',
    historyRange: '1mo' as const,
    historyInterval: '1h' as const,
    predictionDays: 4,
    description: '1.5 semanas + predicción 4 días',
  },
  longterm: {
    label: 'Largo Plazo',
    historyRange: '3mo' as const,
    historyInterval: '1d' as const,
    predictionDays: 30,
    description: '1-3 meses + predicción 15d-3m',
  },
};

// Subintérvalos para largo plazo
const LONGTERM_RANGES = ['1m', '3m'] as const;
const LONGTERM_PREDICTIONS = [15, 30, 90] as const;

export default function AssetDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [assetData, setAssetData] = useState<AssetData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [predictionData, setPredictionData] = useState<ChartDataPoint[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>('intraday');
  const [longtermHistoryRange, setLongtermHistoryRange] = useState<'1m' | '3m'>('1m');
  const [longtermPredictionDays, setLongtermPredictionDays] = useState<15 | 30 | 90>(15);
  const [prediction, setPrediction] = useState<{ change: number; confidence: number } | null>(null);
  const [lastPriceForPrediction, setLastPriceForPrediction] = useState<number>(0);

  // Cargar datos del activo
  const loadAssetData = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    try {
      const v8Data = await yahooV8Service.getQuote(symbol);
      if (v8Data) {
        setAssetData({
          symbol: v8Data.symbol,
          name: v8Data.longName || v8Data.shortName || symbol,
          price: v8Data.regularMarketPrice,
          currency: v8Data.currency,
          change: v8Data.priceChange,
          changePercent: v8Data.priceChangePercent,
        });
      }
    } catch (error) {
      console.error('[AssetDetail] Error loading asset:', error);
    }
    setLoading(false);
  }, [symbol]);

  // Cargar datos del gráfico según timeframe
  const loadChartData = useCallback(async () => {
    if (!symbol || !assetData) return;

    setLoading(true);
    try {
      const config = TIMEFRAME_CONFIG[selectedTimeframe];
      let range = config.historyRange;
      let predictionDays = config.predictionDays;

      // Ajustar para largo plazo
      if (selectedTimeframe === 'longterm') {
        range = longtermHistoryRange === '1m' ? '1mo' : '3mo';
      }

      // Limpiar predicción anterior al cambiar timeframe
      setPrediction(null);
      setPredictionData([]);

      // Obtener datos históricos
      const historical = await yahooV8Service.getHistorical(symbol, range as any, config.historyInterval);

      if (historical?.historicalPrices && historical.historicalPrices.length > 0) {
        // Filtrar y formatear datos
        let prices = historical.historicalPrices;

        // Limitar puntos según timeframe
        if (selectedTimeframe === 'intraday') {
          // Últimos 4 días (aprox 4*26 puntos de 15min)
          prices = prices.slice(-104);
        } else if (selectedTimeframe === 'swing') {
          // 1.5 semanas (aprox 10 días * 7 puntos de 1h)
          prices = prices.slice(-70);
        }

        // Guardar último precio para predicción
        setLastPriceForPrediction(prices[prices.length - 1].close);

        // Crear datos del gráfico
        const chartPoints: ChartDataPoint[] = prices.map((p, index) => {
          const date = new Date(p.timestamp);
          const isLastOfDay = index === prices.length - 1 ||
            new Date(prices[index + 1]?.timestamp).getDate() !== date.getDate();

          // Mostrar etiqueta cada ciertos puntos
          const showLabel = selectedTimeframe === 'intraday'
            ? isLastOfDay
            : selectedTimeframe === 'swing'
              ? index % 7 === 0
              : index % 5 === 0;

          return {
            value: p.close,
            label: showLabel ? formatLabel(date, selectedTimeframe) : '',
            labelTextStyle: { color: '#6b7280', fontSize: 10 },
          };
        });

        setChartData(chartPoints);
      }
    } catch (error) {
      console.error('[AssetDetail] Error loading chart:', error);
    }
    setLoading(false);
  }, [symbol, assetData, selectedTimeframe, longtermHistoryRange]);

  // Calcular predicción (separado de la carga de datos)
  const handlePredict = useCallback(async () => {
    if (!symbol || lastPriceForPrediction === 0) return;

    setPredicting(true);
    try {
      const config = TIMEFRAME_CONFIG[selectedTimeframe];
      let predictionDays = config.predictionDays;

      if (selectedTimeframe === 'longterm') {
        predictionDays = longtermPredictionDays;
      }

      const assetType = symbol.includes('-USD') || symbol.includes('-EUR')
        ? 'crypto'
        : 'stock';

      const pred = await predictionCalculatorService.calculatePrediction(
        symbol,
        assetType,
        predictionDays
      );

      if (pred) {
        setPrediction({
          change: pred.predictedChange,
          confidence: pred.confidence,
        });

        // Crear puntos de predicción
        const targetPrice = lastPriceForPrediction * (1 + pred.predictedChange / 100);

        // Generar puntos intermedios para la predicción
        const predPoints: ChartDataPoint[] = [];
        const steps = Math.min(predictionDays, 10); // Máximo 10 puntos

        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const interpolatedValue = lastPriceForPrediction + (targetPrice - lastPriceForPrediction) * progress;

          predPoints.push({
            value: interpolatedValue,
            label: i === steps ? `+${predictionDays}d` : '',
            labelTextStyle: { color: '#818cf8', fontSize: 10 },
            dataPointColor: '#818cf8',
            showDataPoint: i === steps,
            dataPointRadius: 6,
          });
        }

        setPredictionData(predPoints);
      }
    } catch (error) {
      console.error('[AssetDetail] Error calculating prediction:', error);
    }
    setPredicting(false);
  }, [symbol, selectedTimeframe, longtermPredictionDays, lastPriceForPrediction]);

  // Formatear etiqueta según timeframe
  const formatLabel = (date: Date, timeframe: ChartTimeframe): string => {
    if (timeframe === 'intraday') {
      return `${date.getDate()}/${date.getMonth() + 1}`;
    } else if (timeframe === 'swing') {
      return `${date.getDate()}/${date.getMonth() + 1}`;
    } else {
      return `${date.getDate()}/${date.getMonth() + 1}`;
    }
  };

  // Combinar datos históricos + predicción
  const combinedData = useMemo(() => {
    if (predictionData.length === 0) return chartData;

    // Conectar el último punto histórico con el primero de predicción
    const connection: ChartDataPoint = {
      value: chartData[chartData.length - 1]?.value || 0,
      dataPointColor: '#818cf8',
    };

    return [...chartData, ...predictionData];
  }, [chartData, predictionData]);

  // Calcular min/max para el gráfico con zoom apropiado
  const { minValue, maxValue, yAxisOffset } = useMemo(() => {
    const allValues = combinedData.map(d => d.value).filter(v => v > 0);
    if (allValues.length === 0) return { minValue: 0, maxValue: 100, yAxisOffset: 0 };

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;
    
    // Añadir padding del 10% arriba y abajo
    const padding = range * 0.1;
    const adjustedMin = min - padding;
    const adjustedMax = max + padding;
    
    // El yAxisOffset desplaza el origen del gráfico
    // maxValue es relativo al offset
    return {
      minValue: adjustedMin,
      maxValue: adjustedMax - adjustedMin, // Rango total desde el offset
      yAxisOffset: adjustedMin,
    };
  }, [combinedData]);

  useEffect(() => {
    loadAssetData();
  }, [loadAssetData]);

  useEffect(() => {
    if (assetData) {
      loadChartData();
    }
  }, [assetData, loadChartData]);

  const chartWidth = width - 60;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.symbol}>{symbol}</Text>
          {assetData && (
            <Text style={styles.name} numberOfLines={1}>{assetData.name}</Text>
          )}
        </View>
        {assetData && (
          <View style={styles.priceContainer}>
            <Text style={styles.price}>
              {assetData.price.toFixed(2)} {assetData.currency}
            </Text>
            <Text style={[styles.change, { color: assetData.changePercent >= 0 ? '#22c55e' : '#ef4444' }]}>
              {assetData.changePercent >= 0 ? '+' : ''}{assetData.changePercent.toFixed(2)}%
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Selector de Timeframe */}
        <View style={styles.timeframeSelector}>
          {(Object.keys(TIMEFRAME_CONFIG) as ChartTimeframe[]).map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[
                styles.timeframeButton,
                selectedTimeframe === tf && styles.timeframeButtonActive,
              ]}
              onPress={() => setSelectedTimeframe(tf)}
            >
              <Text
                style={[
                  styles.timeframeButtonText,
                  selectedTimeframe === tf && styles.timeframeButtonTextActive,
                ]}
              >
                {TIMEFRAME_CONFIG[tf].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sub-selector para largo plazo */}
        {selectedTimeframe === 'longterm' && (
          <View style={styles.longtermSelectors}>
            {/* Selector de rango histórico */}
            <View style={styles.subSelectorGroup}>
              <Text style={styles.subSelectorLabel}>Histórico:</Text>
              <View style={styles.subSelectorButtons}>
                {LONGTERM_RANGES.map((range) => (
                  <TouchableOpacity
                    key={range}
                    style={[
                      styles.subSelectorButton,
                      longtermHistoryRange === range && styles.subSelectorButtonActive,
                    ]}
                    onPress={() => setLongtermHistoryRange(range)}
                  >
                    <Text
                      style={[
                        styles.subSelectorButtonText,
                        longtermHistoryRange === range && styles.subSelectorButtonTextActive,
                      ]}
                    >
                      {range === '1m' ? '1 Mes' : '3 Meses'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Selector de predicción */}
            <View style={styles.subSelectorGroup}>
              <Text style={styles.subSelectorLabel}>Predicción:</Text>
              <View style={styles.subSelectorButtons}>
                {LONGTERM_PREDICTIONS.map((days) => (
                  <TouchableOpacity
                    key={days}
                    style={[
                      styles.subSelectorButton,
                      longtermPredictionDays === days && styles.subSelectorButtonActive,
                    ]}
                    onPress={() => setLongtermPredictionDays(days)}
                  >
                    <Text
                      style={[
                        styles.subSelectorButtonText,
                        longtermPredictionDays === days && styles.subSelectorButtonTextActive,
                      ]}
                    >
                      {days}d
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Descripción del timeframe */}
        <Text style={styles.timeframeDescription}>
          {selectedTimeframe === 'longterm'
            ? `${longtermHistoryRange === '1m' ? '1 mes' : '3 meses'} histórico + predicción ${longtermPredictionDays} días`
            : TIMEFRAME_CONFIG[selectedTimeframe].description}
        </Text>

        {/* Gráfico */}
        <View style={styles.chartContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.loadingText}>Cargando gráfico...</Text>
            </View>
          ) : combinedData.length > 0 ? (
            <>
              <LineChart
                data={chartData}
                data2={predictionData.length > 0 ? [chartData[chartData.length - 1], ...predictionData] : undefined}
                width={chartWidth}
                height={250}
                spacing={chartWidth / Math.max(combinedData.length, 20)}
                initialSpacing={0}
                endSpacing={0}
                thickness={2}
                thickness2={2}
                color="#22c55e"
                color2="#818cf8"
                hideDataPoints
                showDataPointOnFocus
                dataPointsColor="#22c55e"
                dataPointsColor2="#818cf8"
                dataPointsRadius={4}
                startFillColor="rgba(34, 197, 94, 0.3)"
                endFillColor="rgba(34, 197, 94, 0.05)"
                startFillColor2="rgba(129, 140, 248, 0.3)"
                endFillColor2="rgba(129, 140, 248, 0.05)"
                areaChart
                curved
                yAxisColor="#3f3f46"
                xAxisColor="#3f3f46"
                yAxisTextStyle={{ color: '#9ca3af', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#9ca3af', fontSize: 9 }}
                rulesColor="#27272a"
                rulesType="dashed"
                yAxisThickness={1}
                xAxisThickness={1}
                hideRules={false}
                noOfSections={5}
                maxValue={maxValue}
                yAxisOffset={yAxisOffset}
                yAxisLabelWidth={60}
                yAxisLabelSuffix=""
                formatYLabel={(value) => {
                  const actualValue = Number(value) + yAxisOffset;
                  if (actualValue >= 10000) {
                    return actualValue.toFixed(0);
                  } else if (actualValue >= 100) {
                    return actualValue.toFixed(1);
                  } else if (actualValue >= 1) {
                    return actualValue.toFixed(2);
                  } else {
                    return actualValue.toFixed(4);
                  }
                }}
                pointerConfig={{
                  pointerStripColor: '#6366f1',
                  pointerStripWidth: 1,
                  pointerStripHeight: 250,
                  pointerColor: '#6366f1',
                  radius: 5,
                  pointerLabelWidth: 120,
                  pointerLabelHeight: 50,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  shiftPointerLabelX: 0,
                  shiftPointerLabelY: -30,
                  pointerLabelComponent: (items: any) => {
                    // El valor viene relativo al yAxisOffset, sumar para obtener precio real
                    const realValue = (items[0]?.value || 0) + yAxisOffset;
                    return (
                      <View style={styles.pointerLabel}>
                        <Text style={styles.pointerLabelText}>
                          {realValue >= 1000 
                            ? realValue.toFixed(0) 
                            : realValue >= 1 
                              ? realValue.toFixed(2) 
                              : realValue.toFixed(4)
                          } {assetData?.currency}
                        </Text>
                      </View>
                    );
                  },
                }}
              />

              {/* Leyenda */}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#22c55e' }]} />
                  <Text style={styles.legendText}>Histórico</Text>
                </View>
                {prediction && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: '#818cf8' }]} />
                    <Text style={styles.legendText}>Predicción</Text>
                  </View>
                )}
              </View>

              {/* Botón Predecir */}
              {!prediction && (
                <TouchableOpacity
                  style={styles.predictButton}
                  onPress={handlePredict}
                  disabled={predicting}
                >
                  {predicting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={20} color="#fff" />
                      <Text style={styles.predictButtonText}>Predecir</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.noDataContainer}>
              <Ionicons name="analytics-outline" size={48} color="#6b7280" />
              <Text style={styles.noDataText}>No hay datos disponibles</Text>
            </View>
          )}
        </View>

        {/* Info de predicción */}
        {prediction && (
          <View style={styles.predictionInfo}>
            <Text style={styles.predictionTitle}>Predicción</Text>
            <View style={styles.predictionDetails}>
              <View style={styles.predictionItem}>
                <Text style={styles.predictionLabel}>Cambio esperado</Text>
                <Text
                  style={[
                    styles.predictionValue,
                    { color: prediction.change >= 0 ? '#22c55e' : '#ef4444' },
                  ]}
                >
                  {prediction.change >= 0 ? '+' : ''}{prediction.change.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.predictionItem}>
                <Text style={styles.predictionLabel}>Confianza</Text>
                <Text style={styles.predictionValue}>{prediction.confidence}%</Text>
              </View>
              <View style={styles.predictionItem}>
                <Text style={styles.predictionLabel}>Precio objetivo</Text>
                <Text style={styles.predictionValue}>
                  {((assetData?.price || 0) * (1 + prediction.change / 100)).toFixed(2)} {assetData?.currency}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Espaciado inferior */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
  },
  symbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  change: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  timeframeSelector: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  timeframeButtonActive: {
    backgroundColor: '#6366f1',
  },
  timeframeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
  },
  timeframeButtonTextActive: {
    color: '#fff',
  },
  longtermSelectors: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  subSelectorGroup: {
    flex: 1,
  },
  subSelectorLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  subSelectorButtons: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 3,
  },
  subSelectorButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  subSelectorButtonActive: {
    backgroundColor: '#4f46e5',
  },
  subSelectorButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9ca3af',
  },
  subSelectorButtonTextActive: {
    color: '#fff',
  },
  timeframeDescription: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  chartContainer: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    minHeight: 320,
  },
  loadingContainer: {
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  noDataContainer: {
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  predictButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 20,
  },
  predictButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  pointerLabel: {
    backgroundColor: '#1f1f1f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  pointerLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  predictionInfo: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#818cf820',
  },
  predictionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#818cf8',
    marginBottom: 12,
  },
  predictionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  predictionItem: {
    alignItems: 'center',
  },
  predictionLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  predictionValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
