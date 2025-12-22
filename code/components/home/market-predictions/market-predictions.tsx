/**
 * Lista de activos del mercado con predicciones de IA para entrenamiento
 * Permite hacer predicciones rápidas en diferentes timeframes
 */

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { assetClassifierService } from '../../../services/asset-classifier-service';
import { MarketAsset, marketDataService, POPULAR_ASSETS } from '../../../services/market-data-service';
import { predictionCalculatorService } from '../../../services/prediction-calculator';
import {
  TIMEFRAME_INFO,
  trainingCacheService,
  TrainingPrediction,
  TrainingTimeframe,
} from '../../../services/training-cache-service';
import { useChatStore } from '../../../store/chat-store';
import { TrainingPredictionAnalysisModal } from '../../training-prediction-analysis-modal/training-prediction-analysis-modal';
import { useHome } from '../use-home';

// Breakpoints para responsive
const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

// Ancho máximo del contenido en desktop
const MAX_CONTENT_WIDTH = 900;

// Tipo de cambio USD/EUR aproximado
const USD_TO_EUR = 0.92;

interface MarketPredictionsProps {
  onPredictionMade?: (prediction: TrainingPrediction) => void;
}

export function MarketPredictions({ onPredictionMade }: MarketPredictionsProps) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isDesktop = Platform.OS === 'web' && width >= BREAKPOINTS.desktop;

  const horizontalPadding = useMemo(() => {
    if (!isDesktop) return 0;
    return Math.max(0, (width - MAX_CONTENT_WIDTH) / 2);
  }, [width, isDesktop]);

  // Helper para mostrar alertas multiplataforma
  const showAlert = useCallback((title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }, []);

  const [assets, setAssets] = useState<MarketAsset[]>(
    POPULAR_ASSETS.map(a => ({ ...a, loading: true }))
  );
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<TrainingTimeframe>('intraday');
  const [predictingSymbol, setPredictingSymbol] = useState<string | null>(null);
  const [cachedPredictions, setCachedPredictions] = useState<TrainingPrediction[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [isPredictingBatch, setIsPredictingBatch] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'predict' | 'delete'>('predict');
  const [sortBy, setSortBy] = useState<'default' | 'pred_desc' | 'pred_asc'>('default');
  const [selectedPrediction, setSelectedPrediction] = useState<TrainingPrediction | null>(null);
  const [recommendedTimeframes, setRecommendedTimeframes] = useState<Map<string, TrainingTimeframe>>(new Map());

  const { sendMessage } = useChatStore();
  const { 
    predictions,
    handleClearPredictions,
    handleRemovePrediction,
  } = useHome();

  // Inicializar cache y cargar datos
  const loadData = useCallback(async () => {
    try {
      // Inicializar cache desde storage
      await trainingCacheService.init();
      
      const data = await marketDataService.getPopularAssets();
      setAssets(data);
      setLastUpdate(new Date());
      
      // Actualizar predicciones cacheadas
      setCachedPredictions(trainingCacheService.getAllActive());
    } catch (error) {
      console.error('[MarketPredictions] Error loading data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
    
    // Refrescar cada 5 minutos (más frecuente que MarketList porque estamos entrenando)
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Cargar recomendaciones de timeframe para los activos visibles
  useEffect(() => {
    const loadRecommendations = async () => {
      const recommendations = new Map<string, TrainingTimeframe>();
      
      for (const asset of assets.slice(0, 20)) { // Solo los primeros 20 para no saturar
        try {
          const recs = await assetClassifierService.getRecommendedTimeframe(asset.symbol);
          if (recs.length > 0) {
            recommendations.set(asset.symbol, recs[0].timeframe);
          }
        } catch (error) {
          console.error(`Error getting recommendation for ${asset.symbol}:`, error);
        }
      }
      
      setRecommendedTimeframes(recommendations);
    };
    
    if (assets.length > 0) {
      loadRecommendations();
    }
  }, [assets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    marketDataService.clearCache();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Obtener predicción cacheada para un símbolo y timeframe
  const getCachedPrediction = useCallback((symbol: string, timeframe: TrainingTimeframe) => {
    return trainingCacheService.get(symbol, timeframe);
  }, []);

  // Hacer predicción para un activo
  const makePrediction = useCallback(async (asset: MarketAsset, timeframe: TrainingTimeframe) => {
    // Verificar si ya hay predicción cacheada
    const cached = getCachedPrediction(asset.symbol, timeframe);
    if (cached) {
      console.log(`Predicción existente para ${asset.symbol}`);
      return;
    }

    if (!asset.price) {
      console.log('No hay precio disponible para este activo');
      return;
    }

    setPredictingSymbol(asset.symbol);

    try {
      // Construir mensaje para el chat que genere una predicción
      const timeframeDesc = TIMEFRAME_INFO[timeframe].description;
      const message = `Analiza ${asset.name} (${asset.symbol}) para ${timeframeDesc.toLowerCase()}. Dame tu predicción con dirección, % de cambio esperado y confianza.`;

      // Enviar mensaje al chat (esto generará una predicción)
      await sendMessage(message);

      // Obtener predicción real del servicio de cálculo
      const timeframeDays = timeframe === 'intraday' ? 1 : timeframe === 'swing' ? 7 : 30;
      const assetType = asset.type === 'crypto' ? 'crypto' : 'stock';
      const calculatedPrediction = await predictionCalculatorService.calculatePrediction(
        asset.symbol,
        assetType,
        timeframeDays
      );

      // Usar datos del calculador si está disponible, o fallback a momentum
      let direction: 'up' | 'down' | 'neutral';
      let confidence: number;
      let predictedChange: number;
      let reasoning: string;

      if (calculatedPrediction) {
        direction = calculatedPrediction.direction;
        confidence = calculatedPrediction.confidence;
        predictedChange = calculatedPrediction.predictedChange;
        reasoning = calculatedPrediction.factorBreakdown?.confidenceExplanation || 'Análisis multi-factor';
      } else {
        // Fallback a momentum si el calculador falla
        const momentum = asset.changePercent ?? 0;
        direction = momentum > 0.5 ? 'up' : momentum < -0.5 ? 'down' : 'neutral';
        confidence = Math.round(Math.min(85, Math.max(45, 60 + Math.abs(momentum) * 2)));
        predictedChange = Math.round((direction === 'up' ? Math.abs(momentum) * 0.5 : direction === 'down' ? -Math.abs(momentum) * 0.5 : 0) * 100) / 100;
        reasoning = `Basado en momentum actual (${momentum.toFixed(2)}%)`;
      }

      const prediction = await trainingCacheService.set(asset.symbol, timeframe, {
        symbol: asset.symbol,
        name: asset.name,
        icon: asset.icon,
        timeframe,
        direction,
        confidence,
        predictedChange,
        currentPrice: asset.price,
        targetPrice: asset.price * (1 + predictedChange / 100),
        reasoning,
        analysisData: calculatedPrediction || undefined, // Guardar análisis completo
        createdAt: new Date(),
      });

      // Actualizar lista de predicciones cacheadas
      setCachedPredictions(trainingCacheService.getAllActive());

      if (onPredictionMade) {
        onPredictionMade(prediction);
      }

      showAlert('✅ Predicción creada', `${asset.name} (${TIMEFRAME_INFO[timeframe].label})\nDirección: ${direction === 'up' ? '📈 Sube' : direction === 'down' ? '📉 Baja' : '➡️ Lateral'}\nVálida hasta: ${prediction.expiresAt.toLocaleTimeString('es-ES')}`);
    } catch (error) {
      console.error('[MarketPredictions] Error making prediction:', error);
      showAlert('Error', 'No se pudo crear la predicción');
    } finally {
      setPredictingSymbol(null);
    }
  }, [getCachedPrediction, sendMessage, onPredictionMade]);



  // Toggle selección de un símbolo
  const toggleSelection = useCallback((symbol: string) => {
    setSelectedSymbols(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  }, []);

  // Seleccionar todos según modo
  const selectAll = useCallback(() => {
    if (selectionMode === 'predict') {
      // Seleccionar activos sin predicción
      const availableSymbols = assets
        .filter(a => !a.loading && a.price !== undefined && !getCachedPrediction(a.symbol, selectedTimeframe))
        .map(a => a.symbol);
      setSelectedSymbols(new Set(availableSymbols));
    } else {
      // Seleccionar predicciones existentes del timeframe actual
      const predictedSymbols = cachedPredictions
        .filter(p => p.timeframe === selectedTimeframe)
        .map(p => p.symbol);
      setSelectedSymbols(new Set(predictedSymbols));
    }
  }, [selectionMode, assets, selectedTimeframe, getCachedPrediction, cachedPredictions]);

  // Deseleccionar todos
  const deselectAll = useCallback(() => {
    setSelectedSymbols(new Set());
  }, []);

  // Obtener activos seleccionables según modo
  const selectableAssets = useMemo(() => {
    if (selectionMode === 'predict') {
      return assets.filter(a => !a.loading && a.price !== undefined && !getCachedPrediction(a.symbol, selectedTimeframe));
    } else {
      return assets.filter(a => getCachedPrediction(a.symbol, selectedTimeframe) !== null);
    }
  }, [selectionMode, assets, selectedTimeframe, getCachedPrediction]);

  // Verificar si todos están seleccionados
  const allSelected = useMemo(() => {
    return selectableAssets.length > 0 && selectableAssets.every(a => selectedSymbols.has(a.symbol));
  }, [selectableAssets, selectedSymbols]);

  // Ordenar activos
  const sortedAssets = useMemo(() => {
    const sorted = [...assets];

    // Obtener predicción para un símbolo
    const getPrediction = (symbol: string) => {
      return trainingCacheService.get(symbol, selectedTimeframe);
    };
    
    switch (sortBy) {
      case 'pred_desc':
        // Mayor predicción primero (más alcista)
        sorted.sort((a, b) => {
          const predA = getPrediction(a.symbol);
          const predB = getPrediction(b.symbol);
          if (!predA && !predB) return 0;
          if (!predA) return 1;
          if (!predB) return -1;
          return (predB.predictedChange ?? 0) - (predA.predictedChange ?? 0);
        });
        break;
      case 'pred_asc':
        // Menor predicción primero (más bajista)
        sorted.sort((a, b) => {
          const predA = getPrediction(a.symbol);
          const predB = getPrediction(b.symbol);
          if (!predA && !predB) return 0;
          if (!predA) return 1;
          if (!predB) return -1;
          return (predA.predictedChange ?? 0) - (predB.predictedChange ?? 0);
        });
        break;
      default:
        // Orden original
        break;
    }
    
    return sorted;
  }, [assets, sortBy, selectedTimeframe, cachedPredictions]);

  // Predecir todos los seleccionados
  const predictSelected = useCallback(async () => {
    const selectedAssets = assets.filter(a => selectedSymbols.has(a.symbol) && a.price !== undefined);
    
    if (selectedAssets.length === 0) {
      console.log('Sin selección: Selecciona al menos un activo');
      return;
    }

    setIsPredictingBatch(true);
    let successCount = 0;
    let errorCount = 0;

    for (const asset of selectedAssets) {
      try {
        // Verificar si ya hay predicción cacheada
        if (getCachedPrediction(asset.symbol, selectedTimeframe)) {
          continue;
        }

        setPredictingSymbol(asset.symbol);

        // Construir mensaje para el chat
        const timeframeDesc = TIMEFRAME_INFO[selectedTimeframe].description;
        const message = `Analiza ${asset.name} (${asset.symbol}) para ${timeframeDesc.toLowerCase()}. Dame tu predicción con dirección, % de cambio esperado y confianza.`;

        await sendMessage(message);

        // Obtener predicción real del servicio de cálculo
        const timeframeDays = selectedTimeframe === 'intraday' ? 1 : selectedTimeframe === 'swing' ? 7 : 30;
        const assetType = asset.type === 'crypto' ? 'crypto' : 'stock';
        const calculatedPrediction = await predictionCalculatorService.calculatePrediction(
          asset.symbol,
          assetType,
          timeframeDays
        );

        // Usar datos del calculador si está disponible, o fallback a momentum
        let direction: 'up' | 'down' | 'neutral';
        let confidence: number;
        let predictedChange: number;
        let reasoning: string;

        if (calculatedPrediction) {
          direction = calculatedPrediction.direction;
          confidence = calculatedPrediction.confidence;
          predictedChange = calculatedPrediction.predictedChange;
          reasoning = `Score: ${calculatedPrediction.factorBreakdown?.confidenceExplanation || 'Basado en análisis de 11 factores'}`;
        } else {
          // Fallback a momentum si el calculador falla
          const momentum = asset.changePercent ?? 0;
          direction = momentum > 0.5 ? 'up' : momentum < -0.5 ? 'down' : 'neutral';
          confidence = Math.round(Math.min(85, Math.max(45, 60 + Math.abs(momentum) * 2)));
          predictedChange = Math.round((direction === 'up' ? Math.abs(momentum) * 0.5 : direction === 'down' ? -Math.abs(momentum) * 0.5 : 0) * 100) / 100;
          reasoning = `Basado en momentum actual (${momentum.toFixed(2)}%)`;
        }

        const prediction = await trainingCacheService.set(asset.symbol, selectedTimeframe, {
          symbol: asset.symbol,
          name: asset.name,
          icon: asset.icon,
          timeframe: selectedTimeframe,
          direction,
          confidence,
          predictedChange,
          currentPrice: asset.price!,
          targetPrice: asset.price! * (1 + predictedChange / 100),
          reasoning,
          analysisData: calculatedPrediction || undefined, // Guardar análisis completo
          createdAt: new Date(),
        });

        if (onPredictionMade) {
          onPredictionMade(prediction);
        }

        successCount++;
      } catch (error) {
        console.error(`[MarketPredictions] Error predicting ${asset.symbol}:`, error);
        errorCount++;
      }
    }

    setPredictingSymbol(null);
    setIsPredictingBatch(false);
    setCachedPredictions(trainingCacheService.getAllActive());
    setSelectedSymbols(new Set());

    console.log(`Predicciones completadas: ${successCount} creadas${errorCount > 0 ? `, ${errorCount} errores` : ''}`);
  }, [assets, selectedSymbols, selectedTimeframe, getCachedPrediction, sendMessage, onPredictionMade]);

  // Eliminar predicciones seleccionadas
  const deleteSelected = useCallback(async () => {
    const toDelete = cachedPredictions.filter(p => selectedSymbols.has(p.symbol) && p.timeframe === selectedTimeframe);
    
    if (toDelete.length === 0) {
      console.log('Sin selección: Selecciona predicciones para eliminar');
      return;
    }

    const items = toDelete.map(p => ({ symbol: p.symbol, timeframe: p.timeframe }));
    const removed = await trainingCacheService.removeMultiple(items);
    
    setCachedPredictions(trainingCacheService.getAllActive());
    setSelectedSymbols(new Set());
    
    console.log(`${removed} predicciones eliminadas`);
  }, [cachedPredictions, selectedSymbols, selectedTimeframe]);

  // Formatear precio a EUR
  const formatPrice = (price?: number, currency?: string): string => {
    if (price === undefined) return '-';
    let priceInEur = price;
    if (currency === 'USD') {
      priceInEur = price * USD_TO_EUR;
    }
    if (priceInEur >= 1000) {
      return `€${priceInEur.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`;
    }
    return `€${priceInEur.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Color según cambio
  const getChangeColor = (change?: number) => {
    if (change === undefined) return '#6b7280';
    if (change > 0) return '#10b981';
    if (change < 0) return '#ef4444';
    return '#6b7280';
  };

  // Renderizar activo con checkbox de selección
  const renderAsset = ({ item }: { item: MarketAsset }) => {
    const cached = getCachedPrediction(item.symbol, selectedTimeframe);
    const isPredicting = predictingSymbol === item.symbol;
    const isSelected = selectedSymbols.has(item.symbol);
    
    // En modo predecir: seleccionar activos sin predicción
    // En modo eliminar: seleccionar activos con predicción
    const canSelect = !item.loading && item.price !== undefined && 
      (selectionMode === 'predict' ? !cached : !!cached);

    return (
      <TouchableOpacity 
        style={[
          styles.assetRow, 
          isDesktop && styles.assetRowDesktop,
          selectionMode === 'delete' && cached && styles.assetRowDeleteMode,
        ]}
        onPress={() => canSelect && toggleSelection(item.symbol)}
        disabled={!canSelect}
        activeOpacity={canSelect ? 0.7 : 1}
      >
        {/* Checkbox */}
        <View style={styles.checkboxContainer}>
          {selectionMode === 'delete' && cached ? (
            // En modo eliminar, mostrar checkbox para predicciones
            <View style={[
              styles.checkbox,
              isSelected && styles.checkboxDeleteSelected,
            ]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          ) : cached ? (
            // Mostrar predicción existente en lugar de checkbox
            <View style={[styles.predictionBadgeSmall, { backgroundColor: cached.direction === 'up' ? '#10b981' : cached.direction === 'down' ? '#ef4444' : '#6b7280' }]}>
              <Text style={styles.predictionIconSmall}>
                {cached.direction === 'up' ? '📈' : cached.direction === 'down' ? '📉' : '➡️'}
              </Text>
            </View>
          ) : isPredicting ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <View style={[
              styles.checkbox,
              isSelected && styles.checkboxSelected,
              !canSelect && styles.checkboxDisabled,
            ]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
        </View>

        {/* Icono */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{item.icon}</Text>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.name} numberOfLines={1} selectable={true}>{item.name}</Text>
            {/* Badge de timeframe recomendado */}
            {recommendedTimeframes.has(item.symbol) && recommendedTimeframes.get(item.symbol) === selectedTimeframe && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedBadgeText}>⭐</Text>
              </View>
            )}
          </View>
          <View style={styles.subInfo}>
            <Text style={styles.symbol} selectable={true}>{item.symbol}</Text>
            {!item.loading && item.price !== undefined && (
              <Text style={styles.priceInline} selectable={true}>
                {formatPrice(item.price, item.currency)}
              </Text>
            )}
          </View>
        </View>

        {/* Estado: Predicción con precio objetivo o cambio actual */}
        <View style={styles.actionContainer}>
          {item.loading ? (
            <ActivityIndicator size="small" color="#6b7280" />
          ) : cached ? (
            <View style={styles.predictionInfo}>
              <View style={[styles.predictionBadge, { backgroundColor: cached.direction === 'up' ? '#10b981' : cached.direction === 'down' ? '#ef4444' : '#6b7280' }]}>
                <Text style={styles.predictionIcon} selectable={true}>
                  {cached.direction === 'up' ? '📈' : cached.direction === 'down' ? '📉' : '➡️'}
                </Text>
                <Text style={styles.predictionText} selectable={true}>
                  {(cached.predictedChange ?? 0) >= 0 ? '+' : ''}{(cached.predictedChange ?? 0).toFixed(2)}%
                </Text>
                <Text style={styles.confidenceText} selectable={true}>
                  ({cached.confidence ?? 0}%)
                </Text>
              </View>
              <Text style={styles.targetPrice} selectable={true}>
                → {formatPrice(cached.targetPrice ?? 0, item.currency)}
              </Text>
              <TouchableOpacity
                style={styles.chartButton}
                onPress={() => router.push({ pathname: '/asset/[symbol]', params: { symbol: item.symbol } })}
              >
                <Text style={styles.chartButtonText}>📊</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.predictionAnalysisButton}
                onPress={() => setSelectedPrediction(cached)}
              >
                <Text style={styles.predictionAnalysisButtonText}>🔍</Text>
              </TouchableOpacity>
            </View>
          ) : isPredicting ? (
            <Text style={styles.predictingText} selectable={true}>Analizando...</Text>
          ) : (
            <View style={styles.noPredictonActions}>
              <Text style={[styles.changeText, { color: getChangeColor(item.changePercent) }]} selectable={true}>
                {item.changePercent !== undefined ? `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%` : '-'}
              </Text>
              <TouchableOpacity
                style={styles.chartButton}
                onPress={() => router.push({ pathname: '/asset/[symbol]', params: { symbol: item.symbol } })}
              >
                <Text style={styles.chartButtonText}>📊</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Header con selector de timeframe
  const renderHeader = () => (
    <View>
      {/* Título y hora con botón de análisis */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🧠 Predicciones IA</Text>
        <View style={styles.headerActions}>
          {lastUpdate && (
            <Text style={styles.lastUpdate}>
              {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
      </View>

      {/* Descripción */}
      <Text style={styles.description}>
        Entrena la IA haciendo predicciones. Las predicciones se cachean durante su período de validez.
      </Text>

      {/* Selector de timeframe */}
      <View style={styles.timeframeContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeframeContent}>
          {(Object.keys(TIMEFRAME_INFO) as TrainingTimeframe[]).map((tf) => {
            const info = TIMEFRAME_INFO[tf];
            const count = cachedPredictions.filter(p => p.timeframe === tf).length;
            
            return (
              <TouchableOpacity
                key={tf}
                style={[
                  styles.timeframeChip,
                  selectedTimeframe === tf && styles.timeframeChipActive,
                ]}
                onPress={() => setSelectedTimeframe(tf)}
              >
                <Text style={[
                  styles.timeframeLabel,
                  selectedTimeframe === tf && styles.timeframeLabelActive,
                ]}>
                  {info.label}
                </Text>
                <Text style={[
                  styles.timeframeDuration,
                  selectedTimeframe === tf && styles.timeframeDurationActive,
                ]}>
                  {info.duration}
                </Text>
                {count > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Info del timeframe seleccionado */}
      <View style={styles.timeframeInfo}>
        <Text style={styles.timeframeInfoText}>
          📍 {TIMEFRAME_INFO[selectedTimeframe].description}
        </Text>
      </View>

      {/* Ordenar por */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Ordenar:</Text>
        <View style={styles.sortOptions}>
          {[
            { key: 'default', label: 'Original' },
            { key: 'pred_desc', label: '📈 Mayor' },
            { key: 'pred_asc', label: '📉 Menor' },
          ].map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.sortChip,
                sortBy === option.key && styles.sortChipActive,
              ]}
              onPress={() => setSortBy(option.key as typeof sortBy)}
            >
              <Text style={[
                styles.sortChipText,
                sortBy === option.key && styles.sortChipTextActive,
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Estadísticas */}
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          {cachedPredictions.length} predicciones activas
        </Text>
        {cachedPredictions.length > 0 && (
          <TouchableOpacity onPress={async () => {
            await trainingCacheService.clear();
            setCachedPredictions([]);
          }}>
            <Text style={styles.clearText}>Limpiar todo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Selector de modo */}
      <View style={styles.modeSelector}>
        <TouchableOpacity
          style={[styles.modeButton, selectionMode === 'predict' && styles.modeButtonActive]}
          onPress={() => { setSelectionMode('predict'); setSelectedSymbols(new Set()); }}
        >
          <Text style={[styles.modeButtonText, selectionMode === 'predict' && styles.modeButtonTextActive]}>
            🔮 Predecir
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, selectionMode === 'delete' && styles.modeButtonDeleteActive]}
          onPress={() => { setSelectionMode('delete'); setSelectedSymbols(new Set()); }}
        >
          <Text style={[styles.modeButtonText, selectionMode === 'delete' && styles.modeButtonTextActive]}>
            🗑️ Eliminar
          </Text>
        </TouchableOpacity>
      </View>

      {/* Barra de acciones */}
      <View style={styles.actionsBar}>
        <TouchableOpacity
          style={styles.selectAllButton}
          onPress={allSelected ? deselectAll : selectAll}
        >
          <View style={[styles.checkbox, allSelected && styles.checkboxSelected]}>
            {allSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.selectAllText}>
            {allSelected ? 'Deseleccionar' : 'Seleccionar'}
          </Text>
          <Text style={styles.selectableCount}>
            ({selectableAssets.length})
          </Text>
        </TouchableOpacity>

        {selectionMode === 'predict' ? (
          <TouchableOpacity
            style={[
              styles.predictAllButton,
              (selectedSymbols.size === 0 || isPredictingBatch) && styles.predictAllButtonDisabled,
            ]}
            onPress={predictSelected}
            disabled={selectedSymbols.size === 0 || isPredictingBatch}
          >
            {isPredictingBatch ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.predictAllText}>Analizando...</Text>
              </>
            ) : (
              <>
                <Text style={styles.predictAllIcon}>🔮</Text>
                <Text style={styles.predictAllText}>
                  Predecir {selectedSymbols.size > 0 ? `(${selectedSymbols.size})` : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.deleteAllButton,
              selectedSymbols.size === 0 && styles.deleteAllButtonDisabled,
            ]}
            onPress={deleteSelected}
            disabled={selectedSymbols.size === 0}
          >
            <Text style={styles.deleteAllIcon}>🗑️</Text>
            <Text style={styles.deleteAllText}>
              Eliminar {selectedSymbols.size > 0 ? `(${selectedSymbols.size})` : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, isDesktop && { paddingHorizontal: horizontalPadding }]}>
      {/* Modal de Análisis de Predicción */}
      <TrainingPredictionAnalysisModal
        prediction={selectedPrediction}
        onClose={() => setSelectedPrediction(null)}
      />

      <FlatList
        data={sortedAssets}
        extraData={sortBy}
        renderItem={renderAsset}
        keyExtractor={(item, index) => `${sortBy}-${index}-${item.symbol}`}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
          />
        }
        contentContainerStyle={[
          styles.listContent,
          isDesktop && styles.listContentDesktop,
        ]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  listContent: {
    paddingBottom: 20,
  },
  listContentDesktop: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#6b7280',
  },
  description: {
    fontSize: 13,
    color: '#a0a0a0',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  // Timeframe selector
  timeframeContainer: {
    marginBottom: 8,
  },
  timeframeContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  timeframeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    marginRight: 8,
  },
  timeframeChipActive: {
    backgroundColor: '#6366f1',
  },
  timeframeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a0a0a0',
    marginRight: 6,
  },
  timeframeLabelActive: {
    color: '#ffffff',
  },
  timeframeDuration: {
    fontSize: 12,
    color: '#6b7280',
  },
  timeframeDurationActive: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  countBadge: {
    marginLeft: 6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  timeframeInfo: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  timeframeInfoText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  sortLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginRight: 4,
  },
  sortOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  sortContent: {
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  sortChipActive: {
    backgroundColor: '#6366f1',
  },
  sortChipText: {
    fontSize: 11,
    color: '#a0a0a0',
    fontWeight: '500',
  },
  sortChipTextActive: {
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  statsText: {
    fontSize: 13,
    color: '#6b7280',
  },
  clearText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
  },
  // Asset row
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  assetRowDesktop: {
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#252525',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 22,
  },
  infoContainer: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  symbol: {
    fontSize: 12,
    color: '#6b7280',
  },
  priceInline: {
    fontSize: 12,
    color: '#a0a0a0',
    fontWeight: '500',
  },
  // Action container
  actionContainer: {
    minWidth: 100,
    alignItems: 'flex-end',
  },
  predictButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  predictButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  predictionInfo: {
    alignItems: 'flex-end',
  },
  predictionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  predictionIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  predictionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  confidenceText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  targetPrice: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  predictingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  predictingText: {
    fontSize: 11,
    color: '#6366f1',
    marginLeft: 6,
  },
  // Checkbox styles
  checkboxContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4b5563',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  checkboxDisabled: {
    opacity: 0.4,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  predictionBadgeSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  predictionIconSmall: {
    fontSize: 12,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Actions bar
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectAllText: {
    fontSize: 14,
    color: '#a0a0a0',
    marginLeft: 8,
  },
  selectableCount: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 4,
  },
  predictAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  predictAllButtonDisabled: {
    backgroundColor: '#4b5563',
  },
  predictAllIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  predictAllText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Mode selector
  modeSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
  },
  modeButtonActive: {
    backgroundColor: '#6366f1',
  },
  modeButtonDeleteActive: {
    backgroundColor: '#ef4444',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a0a0a0',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  // Delete button
  deleteAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  deleteAllButtonDisabled: {
    backgroundColor: '#fca5a5',
  },
  deleteAllIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  deleteAllText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Asset row delete mode
  assetRowDeleteMode: {
    backgroundColor: '#2d1515',
  },
  checkboxDeleteSelected: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  // Header actions
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Analysis modal
  analysisModalContent: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    marginTop: 50,
  },
  analysisModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0f0f0f',
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  analysisModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
  },
  analysisModalClose: {
    padding: 8,
  },
  analysisModalCloseText: {
    fontSize: 20,
    color: '#6b7280',
    fontWeight: '600',
  },
  analysisModalBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  analysisSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  analysisSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366f1',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
  },
  analysisLabel: {
    fontSize: 14,
    color: '#a0a0a0',
    fontWeight: '500',
  },
  analysisValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  analysisDisclaimer: {
    fontSize: 12,
    color: '#ef4444',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  analysisModalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0f0f0f',
    borderTopWidth: 1,
    borderTopColor: '#2e2e2e',
  },
  analysisModalCloseButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  analysisModalCloseButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Reasoning box
  reasoningBox: {
    backgroundColor: '#0f0f0f',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  reasoningText: {
    fontSize: 13,
    color: '#e5e7eb',
    lineHeight: 20,
    fontWeight: '400',
  },
  // Chart button
  chartButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
    backgroundColor: '#1e3a5f20',
    borderRadius: 6,
  },
  chartButtonText: {
    fontSize: 14,
  },
  noPredictonActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Prediction analysis button
  predictionAnalysisButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  predictionAnalysisButtonText: {
    fontSize: 14,
  },
  recommendedBadge: {
    backgroundColor: '#fbbf2420',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  recommendedBadgeText: {
    fontSize: 10,
  },
});
