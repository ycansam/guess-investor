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
import { useMenu } from '../../components/_shared/menu-context';
import { InvestorInfoCard } from '../../components/investor-info-card';
import { PredictionCardAnalysis } from '../../components/prediction-card/prediction-card-analysis/prediction-card-analysis';
import { PredictionHistoryCard } from '../../components/prediction-history';
import { TraderAnalysisCard } from '../../components/TraderAnalysisCard';
import { apiClient, CalculatedPrediction } from '../../services/api-client';
import { currencyService } from '../../services/currency-service';
import { getMarketHours } from '../../services/market-hours-service';
import { predictionTrackingService } from '../../services/prediction-tracking-service';
import { trainingCacheService, TrainingPrediction, TrainingTimeframe } from '../../services/training-cache-service';
import { AssetType, InvestmentPrediction, InvestorInfo } from '../../types';

// Tipos de timeframe para el gráfico
type ChartTimeframe = 'intraday' | 'swing' | 'longterm';

// Tipo de dato para gifted-charts
interface ChartDataPoint {
  value: number;
  label?: string;
  dataPointText?: string;
  timestamp?: number; // Unix timestamp para el tooltip
  isPrediction?: boolean; // Para diferenciar datos históricos de predicción
  isOpenNextDay?: boolean; // Para diferenciar predicción de cierre vs apertura
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
    historyRange: '3d' as const, // API no soporta 2d, usamos 3d y filtramos
    historyInterval: '15m' as const,
    predictionDays: 1,
    description: 'Ayer + hoy + predicción 1 día',
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

// Descripciones de grupos de activos
const ASSET_GROUP_DESCRIPTIONS: Record<string, { emoji: string; name: string }> = {
  large_cap_stock: { emoji: '🏢', name: 'Acción Gran Cap.' },
  small_cap_stock: { emoji: '🏪', name: 'Acción Pequeña Cap.' },
  crypto_major: { emoji: '₿', name: 'Cripto Principal' },
  crypto_alt: { emoji: '🪙', name: 'Altcoin' },
  etf_index: { emoji: '📊', name: 'ETF / Índice' },
  commodity: { emoji: '🥇', name: 'Materia Prima' },
  reit: { emoji: '🏠', name: 'Inmobiliario (REIT)' },
  forex: { emoji: '💱', name: 'Divisa (Forex)' },
  adr: { emoji: '🌍', name: 'ADR' },
  default: { emoji: '📋', name: 'General' },
};

// Componente desplegable para mostrar pesos y clasificador
interface WeightsDropdownProps {
  factorBreakdown: {
    assetGroup: string;
    assetGroupDescription?: string;
    weightsUsed: Record<string, number>;
    usingLearnedWeights: boolean;
  };
}

function WeightsDropdown({ factorBreakdown }: WeightsDropdownProps) {
  const [expanded, setExpanded] = useState(false);
  
  const groupInfo = ASSET_GROUP_DESCRIPTIONS[factorBreakdown.assetGroup] || ASSET_GROUP_DESCRIPTIONS.default;
  
  // Ordenar pesos de mayor a menor
  const sortedWeights = Object.entries(factorBreakdown.weightsUsed || {})
    .sort((a, b) => b[1] - a[1]);

  return (
    <View style={weightsDropdownStyles.container}>
      <TouchableOpacity 
        style={weightsDropdownStyles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={weightsDropdownStyles.headerLeft}>
          <Text style={weightsDropdownStyles.headerIcon}>⚙️</Text>
          <Text style={weightsDropdownStyles.headerTitle}>Configuración ML</Text>
          {factorBreakdown.usingLearnedWeights && (
            <View style={weightsDropdownStyles.learnedBadge}>
              <Text style={weightsDropdownStyles.learnedBadgeText}>Aprendido</Text>
            </View>
          )}
        </View>
        <Ionicons 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={18} 
          color="#9ca3af" 
        />
      </TouchableOpacity>

      {expanded && (
        <View style={weightsDropdownStyles.content}>
          {/* Clasificador */}
          <View style={weightsDropdownStyles.classifierSection}>
            <Text style={weightsDropdownStyles.sectionTitle}>Clasificador</Text>
            <View style={weightsDropdownStyles.classifierInfo}>
              <Text style={weightsDropdownStyles.classifierEmoji}>{groupInfo.emoji}</Text>
              <View>
                <Text style={weightsDropdownStyles.classifierName}>{groupInfo.name}</Text>
                <Text style={weightsDropdownStyles.classifierCode}>{factorBreakdown.assetGroup}</Text>
              </View>
            </View>
          </View>

          {/* Pesos utilizados */}
          <View style={weightsDropdownStyles.weightsSection}>
            <Text style={weightsDropdownStyles.sectionTitle}>Pesos Utilizados</Text>
            <View style={weightsDropdownStyles.weightsGrid}>
              {sortedWeights.map(([factor, weight]) => (
                <View key={factor} style={weightsDropdownStyles.weightItem}>
                  <Text style={weightsDropdownStyles.weightName}>{factor}</Text>
                  <View style={weightsDropdownStyles.weightBarContainer}>
                    <View 
                      style={[
                        weightsDropdownStyles.weightBar, 
                        { width: `${Math.min(weight * 400, 100)}%` }
                      ]} 
                    />
                  </View>
                  <Text style={weightsDropdownStyles.weightValue}>{(weight * 100).toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const weightsDropdownStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#1a1a2e',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  learnedBadge: {
    backgroundColor: '#22c55e20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  learnedBadgeText: {
    fontSize: 10,
    color: '#22c55e',
    fontWeight: '600',
  },
  content: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#2d2d44',
  },
  classifierSection: {
    marginBottom: 12,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  classifierInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#252540',
    padding: 10,
    borderRadius: 8,
  },
  classifierEmoji: {
    fontSize: 24,
  },
  classifierName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  classifierCode: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  weightsSection: {
    marginTop: 4,
  },
  weightsGrid: {
    gap: 6,
  },
  weightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weightName: {
    width: 80,
    fontSize: 11,
    color: '#9ca3af',
  },
  weightBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: '#2d2d44',
    borderRadius: 3,
    overflow: 'hidden',
  },
  weightBar: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 3,
  },
  weightValue: {
    width: 45,
    fontSize: 11,
    color: '#e5e5e5',
    textAlign: 'right',
    fontWeight: '500',
  },
});

// Helper para obtener el timeframe efectivo (incluyendo días para longterm)
function getEffectiveTimeframe(timeframe: ChartTimeframe, longtermDays?: number): TrainingTimeframe {
  if (timeframe === 'longterm' && longtermDays) {
    // Para largo plazo, usamos el timeframe base pero lo diferenciaremos en el cache
    // mediante el campo predictionDays en el objeto cacheado
    return 'longterm';
  }
  return timeframe as TrainingTimeframe;
}

// Helper para convertir CalculatedPrediction o TrainingPrediction a InvestmentPrediction
function toInvestmentPrediction(
  calc: CalculatedPrediction | null,
  training: TrainingPrediction | null,
  symbol: string,
  timeframe: string
): InvestmentPrediction | null {
  if (calc) {
    // Generar un reasoning a partir de los factores
    const factorSummary = calc.factorBreakdown?.signalSummary || 'neutral';
    const reasoningText = factorSummary === 'coherent_bullish' ? 'Señales alcistas coherentes'
      : factorSummary === 'coherent_bearish' ? 'Señales bajistas coherentes'
      : factorSummary === 'mixed' ? 'Señales mixtas'
      : 'Señales neutrales';
    
    return {
      id: `${symbol}-${Date.now()}`,
      asset: calc.asset,
      symbol: calc.symbol,
      assetType: calc.assetType as AssetType,
      currency: calc.currency, // IMPORTANTE: Pasar la moneda real del activo
      currentPrice: calc.currentPrice,
      predictedPrice: calc.predictedPriceMax,
      predictedPriceMin: calc.predictedPriceMin,
      predictedPriceMax: calc.predictedPriceMax,
      predictedChange: calc.predictedChange,
      confidence: calc.confidence,
      timeframe,
      direction: calc.direction,
      reasoning: reasoningText,
      createdAt: new Date(),
      analysisData: {
        sentiment: calc.sentiment,
        historical: calc.historical,
        financials: calc.financials,
        news: calc.news,
        macro: calc.macro,
        competitors: calc.competitors,
        forex: calc.forex,
        institutional: calc.institutional,
        technicalAnalysis: calc.technicalAnalysis,
        factorBreakdown: calc.factorBreakdown,
        audit: calc.audit,
        uncertainty: calc.uncertaintyScore !== undefined ? {
          score: calc.uncertaintyScore,
          shouldPredict: calc.shouldPredict ?? true,
          warning: calc.uncertaintyWarning,
          reasons: calc.uncertaintyReasons,
        } : undefined,
      },
    };
  }
  
  if (training?.analysisData) {
    const ad = training.analysisData;
    return {
      id: `${symbol}-${Date.now()}`,
      asset: ad.asset,
      symbol: ad.symbol,
      assetType: ad.assetType as AssetType,
      currency: ad.currency || training.currency, // IMPORTANTE: Pasar la moneda real del activo (fallback a training.currency)
      currentPrice: ad.currentPrice,
      predictedPrice: ad.predictedPriceMax,
      predictedPriceMin: ad.predictedPriceMin,
      predictedPriceMax: ad.predictedPriceMax,
      predictedChange: ad.predictedChange,
      confidence: ad.confidence,
      timeframe,
      direction: ad.direction,
      reasoning: training.reasoning,
      createdAt: training.createdAt,
      analysisData: {
        sentiment: ad.sentiment,
        historical: ad.historical,
        financials: ad.financials,
        news: ad.news,
        macro: ad.macro,
        competitors: ad.competitors,
        forex: ad.forex,
        institutional: ad.institutional,
        technicalAnalysis: ad.technicalAnalysis,
        factorBreakdown: ad.factorBreakdown,
        audit: ad.audit,
        uncertainty: ad.uncertaintyScore !== undefined ? {
          score: ad.uncertaintyScore,
          shouldPredict: ad.shouldPredict ?? true,
          warning: ad.uncertaintyWarning,
          reasons: ad.uncertaintyReasons,
        } : undefined,
      },
    };
  }
  
  return null;
}

// Cache local para datos del gráfico (evita peticiones repetidas)
const chartDataCache = new Map<string, { data: any[]; timestamp: number; eurRate: number }>();
const CHART_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export default function AssetDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const { openMenu } = useMenu();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [assetData, setAssetData] = useState<AssetData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [predictionData, setPredictionData] = useState<ChartDataPoint[]>([]);
  // predictionMeta ahora solo guarda timestamps - los precios se calculan dinámicamente
  // Incluye tanto el cierre del día como la apertura del día siguiente
  const [predictionMeta, setPredictionMeta] = useState<{
    startTimestamp: number;
    endTimestamp: number;         // Cierre del día actual
    openNextDayTimestamp: number; // Apertura del día siguiente
  } | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>('intraday');
  const [longtermHistoryRange, setLongtermHistoryRange] = useState<'1m' | '3m'>('1m');
  const [longtermPredictionDays, setLongtermPredictionDays] = useState<15 | 30 | 90>(15);
  const [prediction, setPrediction] = useState<{ change: number; confidence: number } | null>(null);
  const [fullPrediction, setFullPrediction] = useState<InvestmentPrediction | null>(null);
  const [predictionFromCache, setPredictionFromCache] = useState(false);
  const [lastPriceForPrediction, setLastPriceForPrediction] = useState<number>(0);
  const [lastTimestamp, setLastTimestamp] = useState<number>(0);
  const [priceInEur, setPriceInEur] = useState<number | null>(null);
  // Modo de vista: 'chart' (con predicción), 'history' (solo histórico), 'table'
  const [viewMode, setViewMode] = useState<'chart' | 'history' | 'table'>('chart');
  
  // Estado para información de inversores
  const [investorInfo, setInvestorInfo] = useState<InvestorInfo | null>(null);
  const [investorInfoLoading, setInvestorInfoLoading] = useState(false);
  
  // Estado para la clasificación del activo (ML)
  const [assetClassification, setAssetClassification] = useState<{
    assetGroup: string;
    assetGroupDescription: string;
  } | null>(null);

  // Ref para trackear los días de longterm anteriores
  const prevLongtermDaysRef = React.useRef<number>(longtermPredictionDays);

  // Cargar datos del activo
  const loadAssetData = useCallback(async () => {
    if (!symbol) return;

    setLoading(true);
    try {
      const quote = await apiClient.getQuote(symbol);
      if (quote) {
        setAssetData({
          symbol: quote.symbol,
          name: quote.name || symbol,
          price: quote.price,
          currency: quote.currency,
          change: quote.change,
          changePercent: quote.changePercent,
        });
        
        // Convertir a EUR
        if (quote.currency && quote.currency !== 'EUR') {
          const eurPrice = await currencyService.convertToEUR(quote.price, quote.currency);
          setPriceInEur(eurPrice);
        } else {
          setPriceInEur(quote.price);
        }
      }
      
      // Cargar clasificación del activo desde el sistema ML
      try {
        const weightsResponse = await apiClient.getWeightsComparison(symbol);
        if (weightsResponse?.assetGroup) {
          setAssetClassification({
            assetGroup: weightsResponse.assetGroup,
            assetGroupDescription: weightsResponse.assetGroupDescription || weightsResponse.assetGroup,
          });
        }
      } catch (classError) {
        __DEV__ && console.log('[AssetDetail] Could not load asset classification:', classError);
        // No es crítico, seguimos sin la clasificación
      }
    } catch (error) {
      console.error('[AssetDetail] Error loading asset:', error);
    }
    setLoading(false);
  }, [symbol]);

  // Estado para la tasa de cambio a EUR
  const [eurExchangeRate, setEurExchangeRate] = useState<number>(1);

  // Cargar datos del gráfico según timeframe
  const loadChartData = useCallback(async () => {
    if (!symbol) return;

    const config = TIMEFRAME_CONFIG[selectedTimeframe];
    let range = config.historyRange;
    let interval = config.historyInterval;

    // Ajustar para largo plazo
    if (selectedTimeframe === 'longterm') {
      range = longtermHistoryRange === '1m' ? '1mo' : '3mo';
    }

    // Generar key de cache
    const cacheKey = `${symbol}:${selectedTimeframe}:${range}:${interval}`;
    const cached = chartDataCache.get(cacheKey);
    const now = Date.now();

    // Si hay cache válido, usarlo inmediatamente
    if (cached && (now - cached.timestamp) < CHART_CACHE_DURATION) {
      const { data: prices, eurRate: rate } = cached;
      setEurExchangeRate(rate);
      
      const lastPrice = prices[prices.length - 1];
      const safeRate = (rate && !isNaN(rate)) ? rate : 1;
      setLastPriceForPrediction(lastPrice.close * safeRate);
      setLastTimestamp(lastPrice.timestamp);
      
      // Crear datos para el gráfico desde cache
      let lastShownDate = '';
      const giftedData: ChartDataPoint[] = prices.map((p: any, idx: number) => {
        const date = new Date(p.timestamp);
        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
        const isLastPoint = idx === prices.length - 1;
        
        let label = '';
        if (dateStr !== lastShownDate) {
          label = dateStr;
          lastShownDate = dateStr;
        } else if (isLastPoint && label === '') {
          label = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        
        const value = p.close * safeRate;
        return {
          value: isNaN(value) ? 0 : value,
          label,
          timestamp: p.timestamp,
          isPrediction: false,
        };
      });
      
      setChartData(giftedData);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Obtener datos históricos con el intervalo correcto
      const historical = await apiClient.getHistory(symbol, range, interval);

      if (historical && historical.length > 0) {
        // Obtener la tasa de cambio a EUR
        const currency = assetData?.currency || 'USD';
        let rate = 1;
        if (currency !== 'EUR') {
          rate = await currencyService.getExchangeRateToEUR(currency);
        }
        setEurExchangeRate(rate);

        // Filtrar datos inválidos (null, undefined, NaN) y formatear
        let prices = historical.filter(p => 
          p.close !== null && 
          p.close !== undefined && 
          !isNaN(p.close) &&
          p.timestamp !== null &&
          p.timestamp !== undefined
        );

        // Limitar puntos según timeframe
        if (selectedTimeframe === 'intraday') {
          // Para intradía queremos solo los últimos 2 días de trading
          // Primero obtenemos los días únicos de trading
          const uniqueTradingDays = [...new Set(prices.map(p => new Date(p.timestamp).toDateString()))];
          
          // Tomamos solo los últimos 2 días de trading
          const last2Days = uniqueTradingDays.slice(-2);
          
          // Filtramos los precios para solo incluir esos 2 días
          prices = prices.filter(p => {
            const dayStr = new Date(p.timestamp).toDateString();
            return last2Days.includes(dayStr);
          });
          
          // DEBUG: Log de datos intraday (solo en desarrollo)
          if (__DEV__) {
            console.log('[Chart DEBUG] Intraday data:', {
              totalPrices: prices.length,
              firstTimestamp: prices[0]?.timestamp ? new Date(prices[0].timestamp).toISOString() : null,
              lastTimestamp: prices[prices.length - 1]?.timestamp ? new Date(prices[prices.length - 1].timestamp).toISOString() : null,
              uniqueDays: [...new Set(prices.map(p => new Date(p.timestamp).toDateString()))],
              allTradingDays: uniqueTradingDays,
              selectedDays: last2Days,
            });
          }
        } else if (selectedTimeframe === 'swing') {
          prices = prices.slice(-70);
        }

        if (prices.length === 0) {
          setChartData([]);
          setLoading(false);
          return;
        }

        // Guardar en cache
        chartDataCache.set(cacheKey, { data: prices, timestamp: now, eurRate: rate });

        // Guardar último precio y timestamp para predicción (en EUR)
        const lastPrice = prices[prices.length - 1];
        const safeRate = (rate && !isNaN(rate)) ? rate : 1;
        setLastPriceForPrediction(lastPrice.close * safeRate);
        setLastTimestamp(lastPrice.timestamp);

        // Crear datos para gifted-charts
        // Para las etiquetas: mostrar fecha al inicio de cada día + último punto
        let lastShownDate = '';
        
        const giftedData: ChartDataPoint[] = prices.map((p, idx) => {
          const date = new Date(p.timestamp);
          const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
          const isLastPoint = idx === prices.length - 1;
          
          let label = '';
          
          // Mostrar etiqueta cuando cambia de día o es el último punto
          if (dateStr !== lastShownDate) {
            label = dateStr;
            lastShownDate = dateStr;
          } else if (isLastPoint && label === '') {
            // Si es el último punto y no tiene etiqueta, agregar hora
            label = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
          }
          
          const value = p.close * safeRate;
          return {
            value: isNaN(value) ? 0 : value, // Asegurar que nunca sea NaN
            label,
            timestamp: p.timestamp, // Guardar timestamp para tooltip
            isPrediction: false,
          };
        });
        
        setChartData(giftedData);
      }
    } catch (error) {
      console.error('[AssetDetail] Error loading chart:', error);
    }
    setLoading(false);
  }, [symbol, selectedTimeframe, longtermHistoryRange, assetData?.currency]);

  // Calcular predicción
  const handlePredict = useCallback(async () => {
    if (!symbol || lastPriceForPrediction === 0 || predicting) return;

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

      const pred = await apiClient.calculatePrediction(
        symbol,
        predictionDays
      );

      if (pred) {
        setPrediction({
          change: pred.predictedChange,
          confidence: pred.confidence,
        });
        setPredictionFromCache(false);
        
        // Guardar predicción completa para el análisis
        const investmentPred = toInvestmentPrediction(pred, null, symbol, selectedTimeframe);
        setFullPrediction(investmentPred);

        // IMPORTANTE: Usar precios del backend para consistencia
        // pred.currentPrice = previousClose usado en el cálculo
        // Usamos lastPriceForPrediction para el GRÁFICO (conexión visual)
        // pero guardamos pred.currentPrice para el HISTORIAL (valor real del cálculo)
        const backendBasePrice = pred.currentPrice;
        const backendTargetPrice = (pred.predictedPriceMin + pred.predictedPriceMax) / 2;
        
        // Para el gráfico, calcular el targetPrice desde el último punto visible
        const chartTargetPrice = lastPriceForPrediction * (1 + pred.predictedChange / 100);
        
        await trainingCacheService.set(symbol, selectedTimeframe as TrainingTimeframe, {
          symbol,
          timeframe: selectedTimeframe as TrainingTimeframe,
          name: assetData?.name || symbol,
          icon: assetType === 'crypto' ? '₿' : '📈',
          direction: pred.direction,
          confidence: pred.confidence,
          predictedChange: pred.predictedChange,
          // Guardar precio del backend para historial consistente
          currentPrice: backendBasePrice,
          targetPrice: backendTargetPrice,
          currency: pred.currency, // IMPORTANTE: Guardar la moneda real del activo
          reasoning: investmentPred?.reasoning || '',
          analysisData: pred,
          createdAt: new Date(),
        });

        // Registrar predicción en el backend para estadísticas ML
        try {
          await predictionTrackingService.trackPrediction({
            symbol,
            asset: assetData?.name || symbol,
            assetType,
            currency: pred.currency, // IMPORTANTE: Guardar la moneda real del activo
            direction: pred.direction,
            predictedChange: pred.predictedChange,
            confidence: pred.confidence,
            currentPrice: backendBasePrice,
            predictedPriceMin: pred.predictedPriceMin,
            predictedPriceMax: pred.predictedPriceMax,
            targetPrice: backendTargetPrice,
            timeframe: selectedTimeframe,
            timeframeDays: predictionDays,
            volatility: pred.historical?.volatility,
          });
        } catch (trackError) {
          console.warn('[AssetDetail] Error tracking prediction:', trackError);
        }

        // Crear puntos de predicción como línea superpuesta
        // La predicción comienza desde el último dato histórico hasta el cierre del mercado del día de vencimiento
        const predPoints: ChartDataPoint[] = [];
        const steps = 10;
        
        // IMPORTANTE: Usar el último timestamp del histórico, NO Date.now()
        // Esto es crucial cuando hay gaps (fines de semana, festivos)
        const startTime = lastTimestamp || Date.now();
        
        // Obtener el horario de cierre correcto para este activo
        // ETCs de commodities (EGLN.L, PHAG.MI, etc.) cierran ~22:00-23:00
        // Acciones europeas cierran ~17:30, US ~21:00 UTC, etc.
        const marketHours = getMarketHours(symbol, assetData?.name);
        
        // Para mercados con horario extendido (commodities, forex), no ajustar fines de semana igual
        const isExtendedHours = marketHours.hasExtendedHours && 
          (marketHours.regularHours.includes('24') || marketHours.regularHours.includes('Casi'));
        
        // Parsear el horario de cierre del mercado (hora local España)
        // regularHours puede ser "9:00 - 17:30" o "Casi 24h · Cierra Vie ~23:00 🇪🇸"
        let closeHour = 17;
        let closeMinute = 30;
        
        if (isExtendedHours) {
          // Para commodities/forex, usar 23:00 hora España (que es lo que muestra el UI)
          closeHour = 23;
          closeMinute = 0;
        } else if (marketHours.regularHours.includes(' - ')) {
          // Formato "HH:MM - HH:MM" → extraer la hora de cierre
          const closeMatch = marketHours.regularHours.match(/- (\d+):(\d+)/);
          if (closeMatch) {
            closeHour = parseInt(closeMatch[1], 10);
            closeMinute = parseInt(closeMatch[2], 10);
          }
        }
        
        // Calcular el endTime usando el horario de cierre específico del mercado
        // Para intradía: si no ha pasado el cierre de HOY, usar HOY; si ya pasó, usar MAÑANA
        const now = new Date();
        let endDate: Date;
        
        if (predictionDays === 1) {
          // Intradía: calcular si expira hoy o mañana basándose en la hora actual
          endDate = new Date(now);
          endDate.setHours(closeHour, closeMinute, 0, 0);
          
          // Si ya pasó el cierre de hoy, expira mañana
          if (now.getTime() >= endDate.getTime()) {
            endDate.setDate(endDate.getDate() + 1);
          }
          
          // Ajustar fines de semana para stocks regulares
          if (!isExtendedHours) {
            const dayOfWeek = endDate.getDay();
            if (dayOfWeek === 0) endDate.setDate(endDate.getDate() + 1); // Domingo → Lunes
            if (dayOfWeek === 6) endDate.setDate(endDate.getDate() + 2); // Sábado → Lunes
          }
        } else {
          // Multi-día: sumar días desde el inicio
          const msPerDay = 24 * 60 * 60 * 1000;
          endDate = new Date(startTime + predictionDays * msPerDay);
          endDate.setHours(closeHour, closeMinute, 0, 0);
          
          // Ajustar fines de semana para stocks regulares
          if (!isExtendedHours) {
            const dayOfWeek = endDate.getDay();
            if (dayOfWeek === 0) endDate.setDate(endDate.getDate() + 1);
            if (dayOfWeek === 6) endDate.setDate(endDate.getDate() + 2);
          }
        }
        
        // DEBUG: Log para verificar el cálculo (solo en desarrollo)
        if (__DEV__) {
          console.log('[Prediction] Market hours calculation:', {
            symbol,
            marketHours: marketHours.regularHours,
            isExtendedHours,
            closeHour,
            closeMinute,
            predictionDays,
            endDate: endDate.toLocaleString(),
          });
        }
        const endTime = endDate.getTime();
        const totalMs = endTime - startTime;

        // Calcular la hora de apertura del día siguiente
        // Para stocks: 9:00 (España) / 15:30 (US)
        // Para commodities/forex: ~00:00 del día siguiente (casi 24h)
        let openNextDayDate = new Date(endDate);
        openNextDayDate.setDate(openNextDayDate.getDate() + 1); // Día siguiente
        
        // Parsear hora de apertura
        let openHour = 7;
        let openMinute = 30;
        
        if (isExtendedHours) {
          // Trade Republic: ETCs/Commodities abren a las 7:30 hora España
          openHour = 7;
          openMinute = 30;
        } else if (marketHours.regularHours.includes(' - ')) {
          // Formato "HH:MM - HH:MM" → extraer la hora de apertura
          // Pero para Trade Republic, siempre es 7:30
          openHour = 7;
          openMinute = 30;
        }
        
        openNextDayDate.setHours(openHour, openMinute, 0, 0);
        
        // Ajustar fines de semana para la apertura
        if (!isExtendedHours) {
          const dayOfWeek = openNextDayDate.getDay();
          if (dayOfWeek === 0) openNextDayDate.setDate(openNextDayDate.getDate() + 1); // Domingo → Lunes
          if (dayOfWeek === 6) openNextDayDate.setDate(openNextDayDate.getDate() + 2); // Sábado → Lunes
        }
        
        const openNextDayTime = openNextDayDate.getTime();
        
        __DEV__ && console.log('[Prediction] Open next day calculation:', {
          endDate: endDate.toLocaleString(),
          openNextDayDate: openNextDayDate.toLocaleString(),
          openHour,
          openMinute,
        });

        // Guardar metadata de la predicción - timestamps para cierre y apertura
        // Los precios se calculan dinámicamente en los useMemo
        setPredictionMeta({
          startTimestamp: startTime,
          endTimestamp: endTime,
          openNextDayTimestamp: openNextDayTime,
        });

        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const interpolatedValue = lastPriceForPrediction + (chartTargetPrice - lastPriceForPrediction) * progress;
          const timestamp = startTime + (totalMs * progress);
          const date = new Date(timestamp);
          // Solo mostrar etiqueta en el último punto (fecha objetivo)
          const label = i === steps ? `${date.getDate()}/${date.getMonth() + 1}` : '';

          predPoints.push({
            value: interpolatedValue,
            label,
            timestamp,
            isPrediction: true,
          });
        }

        setPredictionData(predPoints);
      }
    } catch (error) {
      console.error('[AssetDetail] Error calculating prediction:', error);
    }
    setPredicting(false);
  }, [symbol, selectedTimeframe, longtermPredictionDays, lastPriceForPrediction, assetData?.name, predicting]);

  useEffect(() => {
    loadAssetData();
  }, [loadAssetData]);

  // Cargar información para inversores (earnings, dividendos, valoración)
  useEffect(() => {
    const loadInvestorInfo = async () => {
      if (!symbol) return;
      
      // No cargar para cryptos
      if (symbol.includes('-USD') || symbol.includes('-EUR')) {
        setInvestorInfo(null);
        return;
      }

      setInvestorInfoLoading(true);
      try {
        const info = await apiClient.getInvestorInfo(symbol);
        setInvestorInfo(info);
      } catch (error) {
        __DEV__ && console.log('[AssetDetail] Investor info not available:', error);
        setInvestorInfo(null);
      }
      setInvestorInfoLoading(false);
    };

    loadInvestorInfo();
  }, [symbol]);

  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  // Cargar predicción cacheada cuando cambia el timeframe
  useEffect(() => {
    const loadCachedPrediction = async () => {
      if (!symbol || lastPriceForPrediction === 0 || predicting) return;
      
      // Detectar si cambió longtermPredictionDays (solo para longterm)
      const longtermDaysChanged = selectedTimeframe === 'longterm' && 
        prevLongtermDaysRef.current !== longtermPredictionDays;
      prevLongtermDaysRef.current = longtermPredictionDays;
      
      // Si cambió los días de predicción en longterm, recalcular directamente
      if (longtermDaysChanged) {
        setPrediction(null);
        setFullPrediction(null);
        setPredictionFromCache(false);
        setPredictionData([]);
        handlePredict();
        return;
      }
      
      await trainingCacheService.init();
      const cached = await trainingCacheService.get(symbol, selectedTimeframe as TrainingTimeframe);
      
      if (cached) {
        // Verificar si el precio actual difiere mucho del precio cuando se hizo la predicción
        // Si cambió más del 3%, la predicción ya no es válida
        const cachedPrice = cached.currentPrice || 0;
        const priceChangePct = cachedPrice > 0 
          ? Math.abs((lastPriceForPrediction - cachedPrice) / cachedPrice) * 100 
          : 0;
        
        if (priceChangePct > 3) {
          __DEV__ && console.log(`[AssetDetail] Cache invalidated for ${symbol}: price changed ${priceChangePct.toFixed(2)}% (${cachedPrice.toFixed(2)} → ${lastPriceForPrediction.toFixed(2)})`);
          // Invalidar cache y recalcular
          await trainingCacheService.remove(symbol, selectedTimeframe as TrainingTimeframe);
          setPrediction(null);
          setFullPrediction(null);
          setPredictionFromCache(false);
          setPredictionData([]);
          setPredictionMeta(null);
          handlePredict();
          return;
        }
        
        __DEV__ && console.log(`[AssetDetail] Found cached prediction for ${symbol} ${selectedTimeframe}:`, {
          change: cached.predictedChange,
          confidence: cached.confidence,
          targetPrice: cached.targetPrice,
          cachedPrice,
          currentPrice: lastPriceForPrediction,
          priceChangePct: priceChangePct.toFixed(2) + '%'
        });
        
        setPrediction({
          change: cached.predictedChange,
          confidence: cached.confidence,
        });
        setPredictionFromCache(true);
        
        // Guardar predicción completa para el análisis
        const investmentPred = toInvestmentPrediction(null, cached, symbol, selectedTimeframe);
        setFullPrediction(investmentPred);
        
        // IMPORTANTE: Para el gráfico, usamos el precio actual y recalculamos el objetivo
        // con el mismo % de cambio predicho. Esto evita inconsistencias visuales.
        // El % de cambio original (cached.predictedChange) se mantiene intacto.
        const predictionStartPrice = lastPriceForPrediction;
        const targetPrice = lastPriceForPrediction * (1 + cached.predictedChange / 100);
        const config = TIMEFRAME_CONFIG[selectedTimeframe];
        let predictionDays = config.predictionDays;
        if (selectedTimeframe === 'longterm') {
          predictionDays = longtermPredictionDays;
        }
        
        // Calcular timestamps de inicio y fin de la predicción
        // IMPORTANTE: Usar lastTimestamp del histórico para que el gráfico conecte bien,
        // pero mantener la fecha de expiración basada en cuando se creó la predicción
        const createdAtTime = cached.createdAt ? new Date(cached.createdAt).getTime() : Date.now();
        const graphStartTime = lastTimestamp || createdAtTime; // Usar timestamp del último dato histórico
        const msPerDay = 24 * 60 * 60 * 1000;
        
        // Obtener el horario de cierre correcto para este activo
        const marketHours = getMarketHours(symbol, assetData?.name);
        const isExtendedHours = marketHours.hasExtendedHours && 
          (marketHours.regularHours.includes('24') || marketHours.regularHours.includes('Casi'));
        
        // Parsear el horario de cierre del mercado (hora local España)
        let closeHour = 17;
        let closeMinute = 30;
        
        if (isExtendedHours) {
          // Para commodities/forex, usar 23:00 hora España
          closeHour = 23;
          closeMinute = 0;
        } else if (marketHours.regularHours.includes(' - ')) {
          const closeMatch = marketHours.regularHours.match(/- (\d+):(\d+)/);
          if (closeMatch) {
            closeHour = parseInt(closeMatch[1], 10);
            closeMinute = parseInt(closeMatch[2], 10);
          }
        }
        
        // Calcular el endTime usando el horario de cierre específico del mercado
        // Para intradía: si no ha pasado el cierre de HOY, usar HOY; si ya pasó, usar MAÑANA
        const now = new Date();
        let endDate: Date;
        
        if (predictionDays === 1) {
          // Intradía: calcular si expira hoy o mañana basándose en la hora actual
          endDate = new Date(now);
          endDate.setHours(closeHour, closeMinute, 0, 0);
          
          // Si ya pasó el cierre de hoy, expira mañana
          if (now.getTime() >= endDate.getTime()) {
            endDate.setDate(endDate.getDate() + 1);
          }
          
          // Ajustar fines de semana para stocks regulares
          if (!isExtendedHours) {
            const dayOfWeek = endDate.getDay();
            if (dayOfWeek === 0) endDate.setDate(endDate.getDate() + 1); // Domingo → Lunes
            if (dayOfWeek === 6) endDate.setDate(endDate.getDate() + 2); // Sábado → Lunes
          }
        } else {
          // Multi-día: sumar días desde la creación
          endDate = new Date(createdAtTime + predictionDays * msPerDay);
          endDate.setHours(closeHour, closeMinute, 0, 0);
        }
        
        // DEBUG: Log para verificar el cálculo (solo en desarrollo)
        if (__DEV__) {
          console.log('[Prediction Cached] Market hours calculation:', {
            symbol,
            marketHours: marketHours.regularHours,
            isExtendedHours,
            closeHour,
            closeMinute,
            endDate: endDate.toLocaleString(),
          });
        }
        
        const predictionEndTime = endDate.getTime();
        
        // Guardar metadata de la predicción - SOLO timestamps, los precios se calculan dinámicamente
        setPredictionMeta({
          startTimestamp: graphStartTime,
          endTimestamp: predictionEndTime,
        });
        
        // Asegurar que la predicción cacheada está trackeada en el backend
        // El backend detectará duplicados y no guardará dos veces
        const assetType = symbol.includes('-USD') || symbol.includes('-EUR') ? 'crypto' : 'stock';
        try {
          await predictionTrackingService.trackPrediction({
            symbol,
            asset: cached.name || symbol,
            assetType,
            currency: cached.analysisData?.currency, // IMPORTANTE: Guardar la moneda real del activo
            direction: cached.direction,
            predictedChange: cached.predictedChange,
            confidence: cached.confidence,
            currentPrice: cached.currentPrice,
            timeframe: selectedTimeframe,
            timeframeDays: predictionDays,
            volatility: cached.analysisData?.historical?.volatility,
          });
        } catch (trackError) {
          console.warn('[AssetDetail] Error tracking cached prediction:', trackError);
        }
        
        // Crear puntos de predicción desde el último dato histórico hasta el final
        const predPoints: ChartDataPoint[] = [];
        const steps = 10;
        const totalMs = predictionEndTime - graphStartTime;
        
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const interpolatedValue = predictionStartPrice + (targetPrice - predictionStartPrice) * progress;
          const timestamp = graphStartTime + (totalMs * progress);
          const date = new Date(timestamp);
          const label = i === steps ? `${date.getDate()}/${date.getMonth() + 1}` : '';
          
          predPoints.push({
            value: interpolatedValue,
            label,
            timestamp,
            isPrediction: true,
          });
        }
        
        setPredictionData(predPoints);
      } else {
        // No hay predicción cacheada, calcular automáticamente
        setPrediction(null);
        setFullPrediction(null);
        setPredictionFromCache(false);
        setPredictionData([]);
        setPredictionMeta(null);
        
        // Llamar handlePredict automáticamente
        handlePredict();
      }
    };
    
    loadCachedPrediction();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, selectedTimeframe, lastPriceForPrediction, longtermPredictionDays]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const chartWidth = width - 64;
  const chartAreaWidth = chartWidth - 70; // Ancho útil del gráfico (menos ejes y padding)

  // Calcular el yAxisOffset para que el gráfico tenga un rango ajustado
  // 0.5% arriba del máximo y 0.5% abajo del mínimo
  const yAxisOffset = useMemo(() => {
    const allData = [...chartData, ...predictionData];
    if (allData.length === 0) return 0;
    // Filtrar valores inválidos
    const validValues = allData.map(d => d.value).filter(v => v !== undefined && v !== null && !isNaN(v) && isFinite(v) && v > 0);
    if (validValues.length === 0) return 0;
    const minValue = Math.min(...validValues);
    const maxValue = Math.max(...validValues);
    // Si min y max son iguales, no usar offset
    if (minValue === maxValue) return 0;
    // Calcular offset para que el mínimo quede 0.5% por debajo del fondo
    const offset = minValue * 0.995; // 0.5% debajo del mínimo
    return isNaN(offset) || !isFinite(offset) ? 0 : Math.floor(offset);
  }, [chartData, predictionData]);

  // Calcular el valor máximo del eje Y (0.5% arriba del máximo)
  const yAxisMax = useMemo(() => {
    const allData = [...chartData, ...predictionData];
    if (allData.length === 0) return undefined;
    const validValues = allData.map(d => d.value).filter(v => v !== undefined && v !== null && !isNaN(v) && isFinite(v) && v > 0);
    if (validValues.length === 0) return undefined;
    const maxValue = Math.max(...validValues);
    // 0.5% arriba del máximo, ajustado por el offset
    return (maxValue * 1.005) - yAxisOffset;
  }, [chartData, predictionData, yAxisOffset]);

  // Cálculos específicos para modo histórico (sin predicción)
  const historyYAxisOffset = useMemo(() => {
    if (chartData.length === 0) return 0;
    const validValues = chartData.map(d => d.value).filter(v => v !== undefined && v !== null && !isNaN(v) && isFinite(v) && v > 0);
    if (validValues.length === 0) return 0;
    const minValue = Math.min(...validValues);
    const maxValue = Math.max(...validValues);
    if (minValue === maxValue) return 0;
    const offset = minValue * 0.995;
    return isNaN(offset) || !isFinite(offset) ? 0 : Math.floor(offset);
  }, [chartData]);

  const historyYAxisMax = useMemo(() => {
    if (chartData.length === 0) return undefined;
    const validValues = chartData.map(d => d.value).filter(v => v !== undefined && v !== null && !isNaN(v) && isFinite(v) && v > 0);
    if (validValues.length === 0) return undefined;
    const maxValue = Math.max(...validValues);
    return (maxValue * 1.005) - historyYAxisOffset;
  }, [chartData, historyYAxisOffset]);

  // Calcular spacing uniforme - se recalculará después de conocer el total de puntos
  const baseChartSpacing = useMemo(() => {
    if (chartData.length === 0) return 3;
    const spacing = chartAreaWidth / Math.max(chartData.length - 1, 1);
    return isNaN(spacing) || !isFinite(spacing) ? 3 : spacing;
  }, [chartData.length, chartAreaWidth]);

  // Solo datos históricos para la línea principal (filtrados)
  // Extender hasta la hora actual si el mercado está abierto y no tenemos datos recientes
  const mainChartData = useMemo(() => {
    const filtered = chartData.filter(d => 
      d.value !== undefined && 
      d.value !== null && 
      !isNaN(d.value) && 
      isFinite(d.value)
    );
    
    if (filtered.length === 0 || selectedTimeframe !== 'intraday') {
      return filtered;
    }
    
    // Obtener hora de cierre según el tipo de activo
    const marketHours = getMarketHours(symbol);
    const now = new Date();
    const lastDataPoint = filtered[filtered.length - 1];
    const lastDataTime = new Date(lastDataPoint.timestamp);
    
    // Calcular la hora de cierre de hoy
    const closeHour = marketHours.extendedHours ? 23 : 17;
    const closeMinute = marketHours.extendedHours ? 0 : 30;
    const marketCloseToday = new Date(now);
    marketCloseToday.setHours(closeHour, closeMinute, 0, 0);
    
    // Si el último dato es de hoy y hay un gap hasta la hora actual (o cierre),
    // extender la línea histórica con el último precio conocido
    const isToday = lastDataTime.toDateString() === now.toDateString();
    const timeSinceLastData = now.getTime() - lastDataTime.getTime();
    const minGapMs = 30 * 60 * 1000; // 30 minutos mínimo de gap
    
    // Determinar hasta dónde extender: la hora actual o el cierre del mercado (lo que sea menor)
    const extendUntil = now < marketCloseToday ? now : marketCloseToday;
    
    if (isToday && timeSinceLastData > minGapMs && extendUntil > lastDataTime) {
      // Calcular intervalo promedio entre puntos
      const prevPoint = filtered.length > 1 ? filtered[filtered.length - 2] : null;
      const intervalMs = prevPoint ? (lastDataTime.getTime() - prevPoint.timestamp) : (5 * 60 * 1000);
      
      // Calcular cuántos puntos de extensión necesitamos
      const gapMs = extendUntil.getTime() - lastDataTime.getTime();
      const extensionPoints = Math.ceil(gapMs / intervalMs);
      
      // Crear puntos de extensión
      const extended = [...filtered];
      const lastHistoricValue = lastDataPoint.value;
      
      // Usar el precio actual en tiempo real para el último punto (si está disponible)
      // currentPrice ya está en EUR (convertido por eurExchangeRate)
      const currentPrice = assetData?.price 
        ? assetData.price * (eurExchangeRate || 1) 
        : lastHistoricValue;
      
      for (let i = 1; i <= Math.min(extensionPoints, 50); i++) {
        const pointTime = new Date(lastDataTime.getTime() + (intervalMs * i));
        
        // No extender más allá del cierre del mercado
        if (pointTime > marketCloseToday) break;
        
        const isLastExtensionPoint = i === Math.min(extensionPoints, 50) || pointTime >= extendUntil;
        
        // Interpolar entre el último valor histórico y el precio actual
        const progress = i / Math.min(extensionPoints, 50);
        const interpolatedValue = lastHistoricValue + (currentPrice - lastHistoricValue) * progress;
        
        // Añadir label solo en el último punto de extensión
        let label = '';
        if (isLastExtensionPoint) {
          label = `${pointTime.getHours()}:${pointTime.getMinutes().toString().padStart(2, '0')}`;
        }
        
        extended.push({
          value: isLastExtensionPoint ? currentPrice : interpolatedValue,
          label,
          timestamp: pointTime.getTime(),
          isPrediction: false,
        });
      }
      
      __DEV__ && console.log('[Chart DEBUG] Extended mainChartData with real-time price:', {
        originalPoints: filtered.length,
        extendedPoints: extended.length,
        lastHistoricValue,
        currentPrice,
        lastOriginal: lastDataTime.toLocaleString(),
        lastExtended: new Date(extended[extended.length - 1]?.timestamp).toLocaleString(),
        marketClose: `${closeHour}:${closeMinute.toString().padStart(2, '0')}`,
      });
      
      return extended;
    }
    
    // DEBUG: Log de mainChartData (solo en desarrollo)
    if (__DEV__ && filtered.length > 0) {
      console.log('[Chart DEBUG] mainChartData:', {
        points: filtered.length,
        firstDate: new Date(filtered[0]?.timestamp).toLocaleString(),
        lastDate: new Date(filtered[filtered.length - 1]?.timestamp).toLocaleString(),
        uniqueDays: [...new Set(filtered.map(p => new Date(p.timestamp).toDateString()))],
      });
    }
    
    return filtered;
  }, [chartData, selectedTimeframe, symbol, assetData?.price, eurExchangeRate]);

  // Calcular posición X y datos para la línea de predicción superpuesta
  const predictionOverlay = useMemo(() => {
    if (!predictionMeta || mainChartData.length === 0 || !prediction) return null;
    
    // Calcular precios dinámicamente desde el último precio del histórico y el % de cambio
    const lastPoint = mainChartData[mainChartData.length - 1];
    const startPrice = lastPoint?.value || lastPriceForPrediction;
    const targetPrice = startPrice * (1 + prediction.change / 100);
    
    // Encontrar el rango de timestamps del histórico
    const firstTimestamp = mainChartData[0]?.timestamp || 0;
    const lastTimestamp = lastPoint?.timestamp || 0;
    const timeRange = lastTimestamp - firstTimestamp;
    
    if (timeRange <= 0) return null;
    
    // Calcular posición X de inicio de la predicción (como porcentaje del ancho)
    const predStartRelative = (predictionMeta.startTimestamp - firstTimestamp) / timeRange;
    const predEndRelative = (predictionMeta.endTimestamp - firstTimestamp) / timeRange;
    
    // Limitar al rango visible (0 a 1) pero permitir que se extienda un poco
    const startX = Math.max(0, predStartRelative);
    const endX = Math.max(startX + 0.1, predEndRelative); // Mínimo 10% de ancho
    
    // Calcular posiciones en píxeles
    const yAxisWidth = 50; // Ancho del eje Y
    const startPx = yAxisWidth + (startX * chartAreaWidth);
    const widthPx = (endX - startX) * chartAreaWidth;
    
    // Calcular rango de valores para el eje Y (igual que el gráfico)
    const allValues = mainChartData.map(d => d.value);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    
    // Incluir precios de predicción en el rango
    const minWithPred = Math.min(minVal, startPrice, targetPrice);
    const maxWithPred = Math.max(maxVal, startPrice, targetPrice);
    
    return {
      startX: startPx,
      width: Math.max(widthPx, 60), // Mínimo 60px de ancho
      startPrice,
      targetPrice,
      startTimestamp: predictionMeta.startTimestamp,
      endTimestamp: predictionMeta.endTimestamp,
      // Pasar el rango para calcular Y correctamente
      minValue: minWithPred,
      maxValue: maxWithPred,
      yAxisOffset: yAxisOffset,
    };
  }, [predictionMeta, mainChartData, chartAreaWidth, yAxisOffset, prediction, lastPriceForPrediction]);

  // Timestamps importantes
  const { endOfToday, predictionEndTime } = useMemo(() => {
    const now = new Date();
    
    // 23:59 de hoy (para extender el gráfico)
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Usar directamente predictionMeta.endTimestamp que ya tiene la hora de cierre correcta
    // (23:00 para commodities, 17:30 para stocks regulares, etc.)
    if (predictionMeta) {
      __DEV__ && console.log('[Chart] predictionEndTime from predictionMeta:', {
        endTimestamp: predictionMeta.endTimestamp,
        endTimestampDate: new Date(predictionMeta.endTimestamp).toLocaleString(),
        startTimestamp: predictionMeta.startTimestamp,
        startTimestampDate: new Date(predictionMeta.startTimestamp).toLocaleString(),
      });
      return {
        endOfToday: endOfDay.getTime(),
        predictionEndTime: predictionMeta.endTimestamp,
      };
    }
    
    // Fallback si no hay datos
    return {
      endOfToday: endOfDay.getTime(),
      predictionEndTime: endOfDay.getTime(),
    };
  }, [predictionMeta]);

  // Calcular puntos extra para predicción hasta la APERTURA del día siguiente
  const predictionPoints = useMemo(() => {
    if (mainChartData.length < 2) return 0;
    
    // Calcular el intervalo de tiempo entre puntos del histórico
    const lastTimestamp = mainChartData[mainChartData.length - 1]?.timestamp || 0;
    const prevTimestamp = mainChartData[mainChartData.length - 2]?.timestamp || 0;
    const intervalMs = lastTimestamp - prevTimestamp;
    
    if (intervalMs <= 0) return 0;
    
    // SOLO predicción hasta la APERTURA del día siguiente (no cierre)
    if (!predictionMeta) {
      return 0;
    }
    
    // Calcular puntos desde ahora hasta la apertura del día siguiente
    const msToOpenNextDay = predictionMeta.openNextDayTimestamp - lastTimestamp;
    
    if (msToOpenNextDay <= 0) {
      return 0;
    }
    
    // 10 puntos para la línea hasta apertura del día siguiente
    return 10;
  }, [predictionMeta, mainChartData]);

  // Datos del gráfico: histórico + predicción (null) + extensión (null)
  const chartDataWithExtra = useMemo(() => {
    if (mainChartData.length === 0) return mainChartData;
    
    const lastPoint = mainChartData[mainChartData.length - 1];
    const lastTimestamp = lastPoint?.timestamp || Date.now();
    // Usar el último valor del histórico para que conecte visualmente
    const startPrice = lastPoint?.value || lastPriceForPrediction || 0;
    
    // IMPORTANTE: Recalcular targetPrice basándose en el startPrice actual + % cambio
    // Esto asegura que el gráfico siempre conecte correctamente
    const predictedChange = prediction?.change || 0;
    const targetPrice = startPrice * (1 + predictedChange / 100);
    
    let result = [...mainChartData];
    
    // Añadir puntos para la predicción hasta la APERTURA del día siguiente
    if (predictionMeta && predictionPoints > 0) {
      // Duración desde ahora hasta la apertura del día siguiente
      const predDuration = predictionMeta.openNextDayTimestamp - lastTimestamp;
      
      // Empezamos desde i=0 para que conecte con el histórico (primer punto = startPrice)
      for (let i = 0; i <= predictionPoints; i++) {
        const progress = i / predictionPoints;
        const interpolatedValue = startPrice + (targetPrice - startPrice) * progress;
        const pointTimestamp = lastTimestamp + (predDuration * progress);
        
        // Solo label en el último punto (apertura del día siguiente)
        let label = '';
        if (i === predictionPoints) {
          const pointDate = new Date(pointTimestamp);
          label = `${pointDate.getDate()}/${pointDate.getMonth() + 1} ${pointDate.getHours()}:${pointDate.getMinutes().toString().padStart(2, '0')}`;
        }
        
        result.push({
          value: interpolatedValue,
          label,
          timestamp: pointTimestamp,
          isPrediction: true,
        });
      }
    }
    
    // DEBUG: Log de chartDataWithExtra (solo en desarrollo)
    if (__DEV__ && selectedTimeframe === 'intraday' && result.length > 0) {
      const historicPoints = result.filter(p => !p.isPrediction);
      const predictionPts = result.filter(p => p.isPrediction);
      console.log('[Chart DEBUG] chartDataWithExtra:', {
        totalPoints: result.length,
        historicPoints: historicPoints.length,
        predictionPointsCount: predictionPts.length,
        lastHistoric: historicPoints.length > 0 ? new Date(historicPoints[historicPoints.length - 1]?.timestamp).toLocaleString() : null,
        firstPrediction: predictionPts.length > 0 ? new Date(predictionPts[0]?.timestamp).toLocaleString() : null,
        lastPrediction: predictionPts.length > 0 ? new Date(predictionPts[predictionPts.length - 1]?.timestamp).toLocaleString() : null,
        openNextDayTime: predictionMeta ? new Date(predictionMeta.openNextDayTimestamp).toLocaleString() : null,
      });
    }
    
    return result;
  }, [mainChartData, predictionMeta, predictionPoints, prediction, lastPriceForPrediction]);

  // Calcular spacing basado en el total de puntos para que quepa en pantalla
  const chartSpacing = useMemo(() => {
    const totalPoints = chartDataWithExtra.length;
    if (totalPoints <= 1) return 3;
    const spacing = chartAreaWidth / Math.max(totalPoints - 1, 1);
    return isNaN(spacing) || !isFinite(spacing) ? 3 : spacing;
  }, [chartDataWithExtra.length, chartAreaWidth]);

  // Datos para data2: histórico copiado + predicción hasta apertura del día siguiente
  const predictionLineData = useMemo(() => {
    if (!predictionMeta || mainChartData.length === 0 || !prediction) return null;
    
    const lastValue = mainChartData[mainChartData.length - 1]?.value;
    // Usar el último valor del histórico como punto de inicio de la predicción
    // para que la línea conecte visualmente con el gráfico
    const startPrice = lastValue || lastPriceForPrediction;
    // Calcular targetPrice dinámicamente desde el % de cambio
    const targetPrice = startPrice * (1 + prediction.change / 100);
    
    // Copiar todos los puntos históricos reales (superpuestos a la línea verde)
    const data2: any[] = mainChartData.map((point) => ({
      value: point.value,
    }));
    
    // Añadir puntos interpolados para la predicción hasta APERTURA del día siguiente
    for (let i = 0; i <= predictionPoints; i++) {
      const progress = i / predictionPoints;
      const interpolatedValue = startPrice + (targetPrice - startPrice) * progress;
      data2.push({ value: interpolatedValue });
    }
    
    return data2;
  }, [predictionMeta, mainChartData, predictionPoints, prediction, lastPriceForPrediction]);

  // Segmentos de color para data2: transparente histórico, naranja predicción apertura
  const predictionLineSegments = useMemo(() => {
    if (!mainChartData.length || !predictionMeta) return undefined;
    
    const lastHistoricIndex = mainChartData.length - 1;
    const lastPredictionIndex = lastHistoricIndex + predictionPoints + 1;
    
    return [
      // Histórico: transparente (se superpone con la línea verde)
      { startIndex: 0, endIndex: lastHistoricIndex, color: 'transparent' },
      // Predicción apertura: naranja (desde ahora hasta apertura del día siguiente)
      { startIndex: lastHistoricIndex, endIndex: lastPredictionIndex, color: '#f97316' },
    ];
  }, [mainChartData.length, predictionPoints, predictionMeta]);

  // Segmentos para la línea principal: verde solo hasta el histórico, luego transparente
  const mainLineSegments = useMemo(() => {
    const lastHistoricIndex = mainChartData.length - 1;
    const totalPoints = mainChartData.length + predictionPoints + 1;
    
    if (lastHistoricIndex < 0) return undefined;
    
    return [
      // Histórico: verde
      { startIndex: 0, endIndex: lastHistoricIndex, color: '#22c55e' },
      // Resto: transparente
      { startIndex: lastHistoricIndex, endIndex: totalPoints - 1, color: 'transparent' },
    ];
  }, [mainChartData.length, predictionPoints]);

  // Formatear precio para tooltip
  const formatPrice = (value: number | undefined): string => {
    if (value === undefined || value === null || isNaN(value) || !isFinite(value)) return '0.00';
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
        <TouchableOpacity onPress={openMenu} style={styles.menuButton}>
          <Ionicons name="menu" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.symbol}>{symbol}</Text>
          {assetData && (
            <Text style={styles.name} numberOfLines={1}>{assetData.name}</Text>
          )}
          {/* Badge de tipo de activo */}
          {(() => {
            const isCrypto = symbol?.includes('-USD') || symbol?.includes('-EUR');
            const isForex = symbol?.includes('=X');
            const assetTypeInfo = isCrypto 
              ? { label: 'Crypto', icon: 'logo-bitcoin' as const, style: styles.assetTypeBadgeCrypto }
              : isForex
              ? { label: 'Forex', icon: 'swap-horizontal' as const, style: styles.assetTypeBadgeForex }
              : { label: 'Acción', icon: 'business' as const, style: styles.assetTypeBadgeStock };
            return (
              <View style={styles.badgesRow}>
                <View style={[styles.assetTypeBadge, assetTypeInfo.style]}>
                  <Ionicons name={assetTypeInfo.icon} size={10} color="#fff" />
                  <Text style={styles.assetTypeBadgeText}>{assetTypeInfo.label}</Text>
                </View>
                {assetClassification && (
                  <View style={[styles.assetTypeBadge, styles.classifierBadge]}>
                    <Ionicons name="analytics" size={10} color="#fff" />
                    <Text style={styles.assetTypeBadgeText}>{assetClassification.assetGroupDescription}</Text>
                  </View>
                )}
              </View>
            );
          })()}
        </View>
        {assetData && (
          <View style={styles.priceContainer}>
            <Text style={styles.price}>
              {priceInEur !== null ? priceInEur.toFixed(2) : (assetData.price ?? 0).toFixed(2)} €
            </Text>
            <Text style={[styles.change, { color: (assetData.changePercent ?? 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
              {(assetData.changePercent ?? 0) >= 0 ? '+' : ''}{(assetData.changePercent ?? 0).toFixed(2)}%
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

        {/* Toggle Gráfico/Histórico/Tabla */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleButton, viewMode === 'chart' && styles.viewToggleButtonActive]}
            onPress={() => setViewMode('chart')}
          >
            <Ionicons name="analytics" size={16} color={viewMode === 'chart' ? '#fff' : '#9ca3af'} />
            <Text style={[styles.viewToggleText, viewMode === 'chart' && styles.viewToggleTextActive]}>Predicción</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleButton, viewMode === 'history' && styles.viewToggleButtonActive]}
            onPress={() => setViewMode('history')}
          >
            <Ionicons name="trending-up" size={16} color={viewMode === 'history' ? '#fff' : '#9ca3af'} />
            <Text style={[styles.viewToggleText, viewMode === 'history' && styles.viewToggleTextActive]}>Histórico</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleButton, viewMode === 'table' && styles.viewToggleButtonActive]}
            onPress={() => setViewMode('table')}
          >
            <Ionicons name="list" size={16} color={viewMode === 'table' ? '#fff' : '#9ca3af'} />
            <Text style={[styles.viewToggleText, viewMode === 'table' && styles.viewToggleTextActive]}>Tabla</Text>
          </TouchableOpacity>
        </View>

        {/* Gráfico, Histórico o Tabla */}
        <View style={styles.chartContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.loadingText}>Cargando datos...</Text>
            </View>
          ) : viewMode === 'table' ? (
            /* Vista de Tabla */
            <View style={styles.tableContainer}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Fecha/Hora</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Precio</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Tipo</Text>
              </View>
              <ScrollView style={styles.tableBody} nestedScrollEnabled>
                {/* Datos históricos */}
                {mainChartData.slice(-20).map((point, index) => {
                  const date = new Date(point.timestamp || 0);
                  return (
                    <View key={`hist-${index}`} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 1.5 }]}>
                        {date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} {date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[styles.tableCell, { flex: 1 }]}>{formatPrice(point.value)} €</Text>
                      <Text style={[styles.tableCell, styles.tableCellHistoric, { flex: 1 }]}>Histórico</Text>
                    </View>
                  );
                })}
                {/* Datos de predicción - usar chartDataWithExtra para consistencia */}
                {chartDataWithExtra.filter(p => p.isPrediction).map((point, index) => {
                  const date = new Date(point.timestamp || 0);
                  return (
                    <View key={`pred-${index}`} style={[styles.tableRow, styles.tableRowPrediction]}>
                      <Text style={[styles.tableCell, { flex: 1.5 }]}>
                        {date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} {date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[styles.tableCell, { flex: 1 }]}>{formatPrice(point.value)} €</Text>
                      <Text style={[styles.tableCell, styles.tableCellPrediction, { flex: 1 }]}>Predicción</Text>
                    </View>
                  );
                })}
              </ScrollView>
              <Text style={styles.tableFooter}>
                Mostrando últimos 20 puntos históricos + predicción
              </Text>
            </View>
          ) : viewMode === 'history' && chartData.length > 0 ? (
            /* Vista de solo Histórico (sin predicción) */
            <>
              <View
                style={styles.chartWrapper}
                onTouchStart={() => setScrollEnabled(false)}
                onTouchEnd={() => setScrollEnabled(true)}
                onTouchCancel={() => setScrollEnabled(true)}
              >
                <LineChart
                  data={mainChartData}
                  width={chartWidth}
                  height={250}
                  spacing={baseChartSpacing}
                  initialSpacing={0}
                  endSpacing={0}
                  thickness={2}
                  color="#22c55e"
                  hideDataPoints
                  curved
                  yAxisOffset={historyYAxisOffset}
                  maxValue={historyYAxisMax}
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
                    pointerStripWidth: 2,
                    pointerStripColor: '#22c55e',
                    pointerColor: '#22c55e',
                    radius: 5,
                    pointerLabelWidth: 140,
                    pointerLabelHeight: 70,
                    activatePointersOnLongPress: false,
                    autoAdjustPointerLabelPosition: true,
                    shiftPointerLabelY: -50,
                    pointerVanishDelay: 500,
                    pointerLabelComponent: (items: any[]) => {
                      const item = items[0];
                      
                      let dateStr = '';
                      let timeStr = '';
                      
                      const timestamp = item?.timestamp;
                      
                      if (timestamp) {
                        const date = new Date(timestamp);
                        const day = date.getDate().toString().padStart(2, '0');
                        const month = (date.getMonth() + 1).toString().padStart(2, '0');
                        const hours = date.getHours().toString().padStart(2, '0');
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        dateStr = `${day}/${month}`;
                        timeStr = `${hours}:${minutes}`;
                      }
                      
                      return (
                        <View style={{
                          backgroundColor: '#1e1e2e',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#22c55e',
                          minWidth: 100,
                          alignItems: 'center',
                        }}>
                          {dateStr ? (
                            <Text style={{ color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>
                              {dateStr} {timeStr}
                            </Text>
                          ) : null}
                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                            {formatPrice(item.value)} €
                          </Text>
                        </View>
                      );
                    },
                  }}
                />
              </View>

              {/* Leyenda solo histórico con rango de fechas */}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: '#22c55e' }]} />
                  <Text style={styles.legendText}>
                    Histórico ({mainChartData.length > 0 ? (() => {
                      const first = mainChartData[0]?.timestamp;
                      const last = mainChartData[mainChartData.length - 1]?.timestamp;
                      if (!first || !last) return '';
                      const startDate = new Date(first).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                      const endDate = new Date(last).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                      return `${startDate} → ${endDate}`;
                    })() : ''})
                  </Text>
                </View>
              </View>
            </>
          ) : chartData.length > 0 ? (
            <>
              {/* Gráfico con 2 líneas: histórico + predicción */}
              <View
                style={styles.chartWrapper}
                onTouchStart={() => setScrollEnabled(false)}
                onTouchEnd={() => setScrollEnabled(true)}
                onTouchCancel={() => setScrollEnabled(true)}
              >
                <LineChart
                  data={chartDataWithExtra}
                  data2={predictionLineData || undefined}
                  lineSegments={mainLineSegments}
                  lineSegments2={predictionLineSegments}
                  width={chartWidth}
                  height={250}
                  spacing={chartSpacing}
                  initialSpacing={0}
                  endSpacing={0}
                  thickness={2}
                  color="#22c55e"
                  color2="transparent"
                  thickness2={3}
                  hideDataPoints
                  hideDataPoints2
                  curved
                  yAxisOffset={yAxisOffset}
                  maxValue={yAxisMax}
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
                    pointerStripWidth: 2,
                    pointerStripColor: '#6366f1',
                    pointerColor: '#6366f1',
                    radius: 5,
                    pointerLabelWidth: 140,
                    pointerLabelHeight: 70,
                    activatePointersOnLongPress: false,
                    autoAdjustPointerLabelPosition: true,
                    shiftPointerLabelY: -50,
                    pointerVanishDelay: 500,
                    pointerLabelComponent: (items: any[]) => {
                      const item = items[0];
                      
                      let dateStr = '';
                      let timeStr = '';
                      let isPred = false;
                      
                      const timestamp = item?.timestamp;
                      isPred = item?.isPrediction || false;
                      
                      if (timestamp) {
                        const date = new Date(timestamp);
                        const day = date.getDate().toString().padStart(2, '0');
                        const month = (date.getMonth() + 1).toString().padStart(2, '0');
                        const hours = date.getHours().toString().padStart(2, '0');
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        dateStr = `${day}/${month}`;
                        timeStr = `${hours}:${minutes}`;
                      }
                      
                      // Determinar el label según el tipo de punto
                      const predLabel = isPred ? ' (Apertura)' : '';
                      
                      return (
                        <View style={{
                          backgroundColor: '#1e1e2e',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isPred ? '#f97316' : '#6366f1',
                          minWidth: 100,
                          alignItems: 'center',
                        }}>
                          {dateStr ? (
                            <Text style={{ color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>
                              {dateStr} {timeStr}{predLabel}
                            </Text>
                          ) : null}
                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                            {formatPrice(item.value)} €
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
                {predictionMeta && mainChartData.length > 0 && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: '#f97316' }]} />
                    <Text style={styles.legendText}>
                      Apertura ({(() => {
                        const openDate = new Date(predictionMeta.openNextDayTimestamp);
                        return `${openDate.getDate()}/${openDate.getMonth() + 1} ${openDate.getHours()}:${openDate.getMinutes().toString().padStart(2, '0')}`;
                      })()})
                    </Text>
                  </View>
                )}
              </View>

              {/* Indicador de carga de predicción */}
              {predicting && !prediction && (
                <View style={styles.predictingIndicator}>
                  <ActivityIndicator size="small" color="#818cf8" />
                  <Text style={styles.predictingText}>Calculando predicción...</Text>
                </View>
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
                    { color: (prediction.change ?? 0) >= 0 ? '#22c55e' : '#ef4444' },
                  ]}
                >
                  {/* Mostrar el cambio predicho original - es el valor calculado por el modelo */}
                  {`${(prediction.change ?? 0) >= 0 ? '+' : ''}${(prediction.change ?? 0).toFixed(2)}%`}
                </Text>
              </View>
              <View style={styles.predictionItem}>
                <Text style={styles.predictionLabel}>Confianza</Text>
                <Text style={styles.predictionValue}>{prediction.confidence ?? 0}%</Text>
              </View>
              <View style={styles.predictionItem}>
                <Text style={styles.predictionLabel}>Precio objetivo</Text>
                <Text style={styles.predictionValue}>
                  {/* Siempre calcular dinámicamente desde lastPriceForPrediction para evitar inconsistencias */}
                  {(lastPriceForPrediction * (1 + (prediction.change ?? 0) / 100)).toFixed(2)} €
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Desplegable de Pesos ML y Clasificador */}
        {fullPrediction?.analysisData?.factorBreakdown && (
          <WeightsDropdown factorBreakdown={fullPrediction.analysisData.factorBreakdown} />
        )}

        {/* Análisis Trader Pro (Divergencias, R/R, Options Flow) */}
        {symbol && (
          <View style={styles.traderAnalysisContainer}>
            <TraderAnalysisCard symbol={symbol} />
          </View>
        )}

        {/* Información para Inversores (earnings, dividendos, valoración) */}
        {investorInfoLoading ? (
          <View style={styles.investorInfoLoading}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.investorInfoLoadingText}>Cargando info inversor...</Text>
          </View>
        ) : investorInfo ? (
          <View style={styles.investorInfoContainer}>
            <Text style={styles.investorInfoTitle}>📊 Información para Inversores</Text>
            <InvestorInfoCard info={investorInfo} currency="EUR" />
          </View>
        ) : null}

        {/* Análisis detallado de la predicción */}
        {fullPrediction && fullPrediction.analysisData && (
          <View style={styles.analysisContainer}>
            <PredictionCardAnalysis prediction={fullPrediction} />
          </View>
        )}

        {/* Historial de predicciones anteriores */}
        {symbol && (
          <View style={styles.historyContainer}>
            <PredictionHistoryCard symbol={symbol} maxItems={15} />
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
  menuButton: {
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
  predictingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 20,
  },
  predictingText: {
    fontSize: 14,
    color: '#818cf8',
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
  analysisContainer: {
    marginTop: 16,
  },
  traderAnalysisContainer: {
    marginTop: 16,
  },
  investorInfoContainer: {
    marginTop: 16,
  },
  investorInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  investorInfoLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  investorInfoLoadingText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  historyContainer: {
    marginTop: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  assetTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  assetTypeBadgeCrypto: {
    backgroundColor: '#f59e0b', // naranja/dorado para crypto
  },
  assetTypeBadgeStock: {
    backgroundColor: '#3b82f6', // azul para acciones
  },
  assetTypeBadgeForex: {
    backgroundColor: '#10b981', // verde para forex
  },
  classifierBadge: {
    backgroundColor: '#8b5cf6', // púrpura para clasificador ML
  },
  assetTypeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  // Estilos para toggle gráfico/tabla
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 4,
    marginBottom: 12,
  },
  viewToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
  },
  viewToggleButtonActive: {
    backgroundColor: '#6366f1',
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
  viewToggleTextActive: {
    color: '#fff',
  },
  // Estilos para la tabla
  tableContainer: {
    backgroundColor: '#111111',
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: 350,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  tableBody: {
    maxHeight: 280,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f2e',
  },
  tableRowPrediction: {
    backgroundColor: '#1a1a3e',
  },
  tableCell: {
    fontSize: 12,
    color: '#e5e7eb',
  },
  tableCellHistoric: {
    color: '#22c55e',
    fontWeight: '600',
  },
  tableCellPrediction: {
    color: '#818cf8',
    fontWeight: '600',
  },
  tableFooter: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 8,
    backgroundColor: '#0a0a0f',
  },
});
