/**
 * Página de detalle del activo con gráficos
 * Muestra precio histórico + predicción usando react-native-gifted-charts
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
import { trainingCacheService, TrainingTimeframe } from '../../services/training-cache-service';
import { yahooV8Service } from '../../services/yahoo-v8-service';

// Tipos de timeframe para el gráfico
type ChartTimeframe = 'intraday' | 'swing' | 'longterm';

// Tipo de dato para gifted-charts
interface ChartDataPoint {
  value: number;
  label?: string;
  dataPointText?: string;
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
    historyRange: '3d' as const,
    historyInterval: '15m' as const,
    predictionDays: 1,
    description: '2 días anteriores + predicción 1 día',
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
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [assetData, setAssetData] = useState<AssetData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [predictionData, setPredictionData] = useState<ChartDataPoint[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>('intraday');
  const [longtermHistoryRange, setLongtermHistoryRange] = useState<'1m' | '3m'>('1m');
  const [longtermPredictionDays, setLongtermPredictionDays] = useState<15 | 30 | 90>(15);
  const [prediction, setPrediction] = useState<{ change: number; confidence: number } | null>(null);
  const [predictionFromCache, setPredictionFromCache] = useState(false);
  const [lastPriceForPrediction, setLastPriceForPrediction] = useState<number>(0);
  const [lastTimestamp, setLastTimestamp] = useState<number>(0);

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
    if (!symbol) return;

    setLoading(true);
    try {
      const config = TIMEFRAME_CONFIG[selectedTimeframe];
      let range = config.historyRange;

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
          prices = prices.slice(-104);
        } else if (selectedTimeframe === 'swing') {
          prices = prices.slice(-70);
        }

        // Guardar último precio y timestamp para predicción
        const lastPrice = prices[prices.length - 1];
        setLastPriceForPrediction(lastPrice.close);
        setLastTimestamp(lastPrice.timestamp);

        // Crear datos para gifted-charts - mostrar solo 4 etiquetas bien distribuidas
        const labelInterval = Math.max(1, Math.floor(prices.length / 3));
        let lastLabelDate = '';
        const giftedData: ChartDataPoint[] = prices.map((p, idx) => {
          const date = new Date(p.timestamp);
          const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
          const isLastPoint = idx === prices.length - 1;
          
          // Mostrar etiqueta en: primer punto, intervalos, y último punto (si es fecha diferente)
          let label = '';
          if (idx === 0) {
            label = dateStr;
            lastLabelDate = dateStr;
          } else if ((idx % labelInterval === 0 || isLastPoint) && dateStr !== lastLabelDate) {
            label = dateStr;
            lastLabelDate = dateStr;
          }
          
          return {
            value: p.close,
            label,
          };
        });

        setChartData(giftedData);
      }
    } catch (error) {
      console.error('[AssetDetail] Error loading chart:', error);
    }
    setLoading(false);
  }, [symbol, selectedTimeframe, longtermHistoryRange]);

  // Calcular predicción
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
        setPredictionFromCache(false);

        // Crear puntos de predicción
        const targetPrice = lastPriceForPrediction * (1 + pred.predictedChange / 100);

        // Generar puntos intermedios para la predicción
        const predPoints: ChartDataPoint[] = [];
        const steps = 10;
        const msPerDay = 24 * 60 * 60 * 1000;
        const totalMs = predictionDays * msPerDay;

        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const interpolatedValue = lastPriceForPrediction + (targetPrice - lastPriceForPrediction) * progress;
          const timestamp = lastTimestamp + (totalMs * progress);
          const date = new Date(timestamp);
          const label = i === steps ? `${date.getDate()}/${date.getMonth() + 1}` : '';

          predPoints.push({
            value: interpolatedValue,
            label,
          });
        }

        setPredictionData(predPoints);
      }
    } catch (error) {
      console.error('[AssetDetail] Error calculating prediction:', error);
    }
    setPredicting(false);
  }, [symbol, selectedTimeframe, longtermPredictionDays, lastPriceForPrediction, lastTimestamp]);

  useEffect(() => {
    loadAssetData();
  }, [loadAssetData]);

  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  // Cargar predicción cacheada cuando cambia el timeframe
  useEffect(() => {
    const loadCachedPrediction = async () => {
      if (!symbol || lastPriceForPrediction === 0) return;
      
      await trainingCacheService.init();
      const cached = trainingCacheService.get(symbol, selectedTimeframe as TrainingTimeframe);
      
      if (cached) {
        console.log(`[AssetDetail] Found cached prediction for ${symbol} ${selectedTimeframe}`);
        setPrediction({
          change: cached.predictedChange,
          confidence: cached.confidence,
        });
        setPredictionFromCache(true);
        
        // Crear puntos de predicción desde cache
        const targetPrice = lastPriceForPrediction * (1 + cached.predictedChange / 100);
        const config = TIMEFRAME_CONFIG[selectedTimeframe];
        let predictionDays = config.predictionDays;
        if (selectedTimeframe === 'longterm') {
          predictionDays = longtermPredictionDays;
        }
        
        const predPoints: ChartDataPoint[] = [];
        const steps = 10;
        const msPerDay = 24 * 60 * 60 * 1000;
        const totalMs = predictionDays * msPerDay;
        
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const interpolatedValue = lastPriceForPrediction + (targetPrice - lastPriceForPrediction) * progress;
          const timestamp = lastTimestamp + (totalMs * progress);
          const date = new Date(timestamp);
          const label = i === steps ? `${date.getDate()}/${date.getMonth() + 1}` : '';
          
          predPoints.push({
            value: interpolatedValue,
            label,
          });
        }
        
        setPredictionData(predPoints);
      } else {
        // No hay predicción cacheada, resetear
        setPrediction(null);
        setPredictionFromCache(false);
        setPredictionData([]);
      }
    };
    
    loadCachedPrediction();
  }, [symbol, selectedTimeframe, lastPriceForPrediction, lastTimestamp, longtermPredictionDays]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const chartWidth = width - 64;
  const chartAreaWidth = chartWidth - 70; // Ancho útil del gráfico (menos ejes y padding)

  // Calcular el yAxisOffset para que el gráfico no empiece desde 0
  const yAxisOffset = useMemo(() => {
    const allData = [...chartData, ...predictionData];
    if (allData.length === 0) return 0;
    const minValue = Math.min(...allData.map(d => d.value));
    // Restar un 5% del mínimo para dar espacio
    return Math.max(0, minValue * 0.95);
  }, [chartData, predictionData]);

  // Calcular spacing uniforme para todos los puntos
  const chartSpacing = useMemo(() => {
    if (chartData.length === 0) return 3;
    
    const totalPoints = chartData.length + predictionData.length;
    return chartAreaWidth / Math.max(totalPoints - 1, 1);
  }, [chartData.length, predictionData.length, chartAreaWidth]);

  // Combinar datos históricos y predicción en uno solo
  const combinedChartData = useMemo(() => {
    if (predictionData.length === 0) return chartData;
    return [...chartData, ...predictionData];
  }, [chartData, predictionData]);

  // Segmentos de línea para colorear histórico (verde) y predicción (morado)
  const lineSegments = useMemo(() => {
    if (predictionData.length === 0 || chartData.length === 0) return undefined;
    
    return [
      {
        startIndex: 0,
        endIndex: chartData.length - 1,
        color: '#22c55e',
      },
      {
        startIndex: chartData.length - 1,
        endIndex: chartData.length + predictionData.length - 1,
        color: '#818cf8',
        strokeDashArray: [6, 4],
      },
    ];
  }, [chartData.length, predictionData.length]);

  // Formatear precio para tooltip
  const formatPrice = (value: number): string => {
    if (value >= 1000) {
      return value.toFixed(0);
    } else if (value >= 1) {
      return value.toFixed(2);
    } else {
      return value.toFixed(4);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
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

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
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
          ) : chartData.length > 0 ? (
            <>
              {/* Gráfico con gifted-charts */}
              <View
                style={styles.chartWrapper}
                onTouchStart={() => setScrollEnabled(false)}
                onTouchEnd={() => setScrollEnabled(true)}
                onTouchCancel={() => setScrollEnabled(true)}
              >
                <LineChart
                  data={combinedChartData}
                  width={chartWidth}
                  height={250}
                  spacing={chartSpacing}
                  initialSpacing={0}
                  endSpacing={0}
                  thickness={2}
                  color="#22c55e"
                  lineSegments={lineSegments}
                  hideDataPoints
                  curved
                  areaChart
                  startFillColor="rgba(34, 197, 94, 0.3)"
                  endFillColor="rgba(34, 197, 94, 0.05)"
                  startOpacity={0.8}
                  endOpacity={0.1}
                  yAxisOffset={yAxisOffset}
                  formatYLabel={(label) => formatPrice(parseFloat(label))}
                  yAxisColor="#4b5563"
                  xAxisColor="#4b5563"
                  yAxisTextStyle={{ color: '#9ca3af', fontSize: 11, fontWeight: '500' }}
                  xAxisLabelTextStyle={{ color: '#9ca3af', fontSize: 10, fontWeight: '500' }}
                  yAxisLabelWidth={50}
                  labelsExtraHeight={25}
                  rulesColor="#374151"
                  rulesType="dashed"
                  noOfSections={4}
                  showVerticalLines
                  verticalLinesColor="#37415180"
                  pointerConfig={{
                    pointerStripHeight: 250,
                    pointerStripColor: '#6366f1',
                    pointerStripWidth: 2,
                    pointerColor: '#6366f1',
                    radius: 5,
                    pointerLabelWidth: 120,
                    pointerLabelHeight: 50,
                    activatePointersOnLongPress: false,
                    autoAdjustPointerLabelPosition: true,
                    shiftPointerLabelY: -40,
                    pointerVanishDelay: 500,
                    pointerLabelComponent: (items: any[]) => {
                      const item = items[0];
                      return (
                        <View style={{
                          backgroundColor: '#1e1e2e',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#6366f1',
                        }}>
                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                            {formatPrice(item.value)} {assetData?.currency || ''}
                          </Text>
                        </View>
                      );
                    },
                  }}
                />
              </View>

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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.predictionTitle}>Predicción</Text>
              {predictionFromCache && (
                <Text style={{ fontSize: 11, color: '#6b7280' }}>📌 Guardada</Text>
              )}
            </View>
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
    marginBottom: 20,
    minHeight: 350,
  },
  chartWrapper: {
    marginRight: 16,
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
