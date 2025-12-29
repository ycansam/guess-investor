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
import { PredictionCardAnalysis } from '../../components/prediction-card/prediction-card-analysis/prediction-card-analysis';
import { apiClient, CalculatedPrediction } from '../../services/api-client';
import { currencyService } from '../../services/currency-service';
import { predictionTrackingService } from '../../services/prediction-tracking-service';
import { trainingCacheService, TrainingPrediction, TrainingTimeframe } from '../../services/training-cache-service';
import { AssetType, InvestmentPrediction } from '../../types';

// Tipos de timeframe para el gráfico
type ChartTimeframe = 'intraday' | 'swing' | 'longterm';

// Tipo de dato para gifted-charts
interface ChartDataPoint {
  value: number;
  label?: string;
  dataPointText?: string;
  timestamp?: number; // Unix timestamp para el tooltip
  isPrediction?: boolean; // Para diferenciar datos históricos de predicción
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
        seasonality: calc.seasonality,
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
        seasonality: ad.seasonality,
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
  const [fullPrediction, setFullPrediction] = useState<InvestmentPrediction | null>(null);
  const [predictionFromCache, setPredictionFromCache] = useState(false);
  const [lastPriceForPrediction, setLastPriceForPrediction] = useState<number>(0);
  const [lastTimestamp, setLastTimestamp] = useState<number>(0);
  const [priceInEur, setPriceInEur] = useState<number | null>(null);

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
          prices = prices.slice(-104);
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

        // Guardar en cache para que persista al cambiar timeframes
        const targetPrice = lastPriceForPrediction * (1 + pred.predictedChange / 100);
        await trainingCacheService.set(symbol, selectedTimeframe as TrainingTimeframe, {
          symbol,
          timeframe: selectedTimeframe as TrainingTimeframe,
          name: assetData?.name || symbol,
          icon: assetType === 'crypto' ? '₿' : '📈',
          direction: pred.direction,
          confidence: pred.confidence,
          predictedChange: pred.predictedChange,
          currentPrice: lastPriceForPrediction,
          targetPrice,
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
            direction: pred.direction,
            predictedChange: pred.predictedChange,
            confidence: pred.confidence,
            currentPrice: lastPriceForPrediction,
            timeframe: selectedTimeframe,
            timeframeDays: predictionDays,
            volatility: pred.historical?.volatility,
          });
        } catch (trackError) {
          console.warn('[AssetDetail] Error tracking prediction:', trackError);
        }

        // Crear puntos de predicción
        // La predicción comienza desde el momento actual
        const predPoints: ChartDataPoint[] = [];
        const steps = 10;
        const msPerDay = 24 * 60 * 60 * 1000;
        const totalMs = predictionDays * msPerDay;
        const now = Date.now();

        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const interpolatedValue = lastPriceForPrediction + (targetPrice - lastPriceForPrediction) * progress;
          const timestamp = now + (totalMs * progress);
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
        console.log(`[AssetDetail] Found cached prediction for ${symbol} ${selectedTimeframe}:`, {
          change: cached.predictedChange,
          confidence: cached.confidence,
          targetPrice: cached.targetPrice
        });
        
        setPrediction({
          change: cached.predictedChange,
          confidence: cached.confidence,
        });
        setPredictionFromCache(true);
        
        // Guardar predicción completa para el análisis
        const investmentPred = toInvestmentPrediction(null, cached, symbol, selectedTimeframe);
        setFullPrediction(investmentPred);
        
        // Crear puntos de predicción desde cache
        const targetPrice = lastPriceForPrediction * (1 + cached.predictedChange / 100);
        const config = TIMEFRAME_CONFIG[selectedTimeframe];
        let predictionDays = config.predictionDays;
        if (selectedTimeframe === 'longterm') {
          predictionDays = longtermPredictionDays;
        }
        
        // Asegurar que la predicción cacheada está trackeada en el backend
        // El backend detectará duplicados y no guardará dos veces
        const assetType = symbol.includes('-USD') || symbol.includes('-EUR') ? 'crypto' : 'stock';
        try {
          await predictionTrackingService.trackPrediction({
            symbol,
            asset: cached.name || symbol,
            assetType,
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
        
        const predPoints: ChartDataPoint[] = [];
        const steps = 10;
        const msPerDay = 24 * 60 * 60 * 1000;
        const totalMs = predictionDays * msPerDay;
        const now = Date.now();
        
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const interpolatedValue = lastPriceForPrediction + (targetPrice - lastPriceForPrediction) * progress;
          const timestamp = now + (totalMs * progress);
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

  // Calcular el yAxisOffset para que el gráfico no empiece desde 0
  const yAxisOffset = useMemo(() => {
    const allData = [...chartData, ...predictionData];
    if (allData.length === 0) return 0;
    // Filtrar valores inválidos antes de calcular el mínimo
    const validValues = allData.map(d => d.value).filter(v => v !== undefined && v !== null && !isNaN(v) && isFinite(v) && v > 0);
    if (validValues.length === 0) return 0;
    const minValue = Math.min(...validValues);
    const maxValue = Math.max(...validValues);
    // Si min y max son iguales, no usar offset
    if (minValue === maxValue) return 0;
    // Restar un 2% del mínimo para dar espacio (menos agresivo)
    const offset = minValue * 0.98;
    return isNaN(offset) || !isFinite(offset) ? 0 : Math.floor(offset);
  }, [chartData, predictionData]);

  // Calcular spacing uniforme para todos los puntos
  const chartSpacing = useMemo(() => {
    if (chartData.length === 0) return 3;
    
    const totalPoints = chartData.length + predictionData.length;
    const spacing = chartAreaWidth / Math.max(totalPoints - 1, 1);
    return isNaN(spacing) || !isFinite(spacing) ? 3 : spacing;
  }, [chartData.length, predictionData.length, chartAreaWidth]);

  // Combinar datos históricos y predicción en uno solo, filtrando valores inválidos
  const combinedChartData = useMemo(() => {
    const allData = predictionData.length === 0 ? chartData : [...chartData, ...predictionData];
    // Filtrar cualquier punto con value inválido
    return allData.filter(d => 
      d.value !== undefined && 
      d.value !== null && 
      !isNaN(d.value) && 
      isFinite(d.value)
    );
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
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
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
              <View style={[styles.assetTypeBadge, assetTypeInfo.style]}>
                <Ionicons name={assetTypeInfo.icon} size={10} color="#fff" />
                <Text style={styles.assetTypeBadgeText}>{assetTypeInfo.label}</Text>
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
                      
                      // gifted-charts pasa las propiedades custom directamente en el item
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
                      
                      return (
                        <View style={{
                          backgroundColor: '#1e1e2e',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isPred ? '#818cf8' : '#6366f1',
                          minWidth: 100,
                          alignItems: 'center',
                        }}>
                          {dateStr ? (
                            <Text style={{ color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>
                              {dateStr} {timeStr}{isPred ? ' (Pred)' : ''}
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
                {prediction && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: '#818cf8' }]} />
                    <Text style={styles.legendText}>Predicción</Text>
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
                  {(prediction.change ?? 0) >= 0 ? '+' : ''}{(prediction.change ?? 0).toFixed(2)}%
                </Text>
              </View>
              <View style={styles.predictionItem}>
                <Text style={styles.predictionLabel}>Confianza</Text>
                <Text style={styles.predictionValue}>{prediction.confidence ?? 0}%</Text>
              </View>
              <View style={styles.predictionItem}>
                <Text style={styles.predictionLabel}>Precio objetivo</Text>
                <Text style={styles.predictionValue}>
                  {((assetData?.price || 0) * (1 + (prediction.change ?? 0) / 100)).toFixed(2)} €
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Análisis detallado de la predicción */}
        {fullPrediction && fullPrediction.analysisData && (
          <View style={styles.analysisContainer}>
            <PredictionCardAnalysis prediction={fullPrediction} />
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
  assetTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
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
  assetTypeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
});
