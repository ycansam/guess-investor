/**
 * Lista de activos del mercado con predicciones de IA para entrenamiento
 * Permite hacer predicciones rápidas en diferentes timeframes
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    PanResponder,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
import { apiClient } from '../../../services/api-client';
import { favoritesService } from '../../../services/favorites-service-v2';
import { MarketAsset, marketDataService } from '../../../services/market-data-service';
import { getPredictionExpiration } from '../../../services/market-hours-service';
import { predictionTrackingService } from '../../../services/prediction-tracking-service';
import {
    TIMEFRAME_INFO,
    trainingCacheService,
    TrainingPrediction,
    TrainingTimeframe,
} from '../../../services/training-cache-service';
import { TrainingPredictionAnalysisModal } from '../../training-prediction-analysis-modal/training-prediction-analysis-modal';
import { useHome } from '../use-home';

// Breakpoints para responsive
const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

// Ancho máximo del contenido en desktop
const MAX_CONTENT_WIDTH = 1800;

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

  // Estado para favoritos
  const [favoriteSymbols, setFavoriteSymbols] = useState<Set<string>>(new Set());

  // Estado para activos con paginación dinámica
  const [allAssets, setAllAssets] = useState<MarketAsset[]>([]);
  const [displayedAssets, setDisplayedAssets] = useState<MarketAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<TrainingTimeframe>('intraday');
  const [predictingSymbol, setPredictingSymbol] = useState<string | null>(null);
  const [cachedPredictions, setCachedPredictions] = useState<TrainingPrediction[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [isPredictingBatch, setIsPredictingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number; total: number}>({current: 0, total: 0});
  const [sortBy, setSortBy] = useState<'default' | 'pred_desc' | 'pred_asc'>('default');
  const [selectedPrediction, setSelectedPrediction] = useState<TrainingPrediction | null>(null);
  const [recommendedTimeframes, setRecommendedTimeframes] = useState<Map<string, TrainingTimeframe>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);
  
  // Filtros (movidos desde MarketList/Explorar)
  type ExploreSortType = 'predicted' | 'gainers' | 'losers' | 'popular' | 'bullish';
  const [exploreSortBy, setExploreSortBy] = useState<ExploreSortType>('popular');

  // Scrollbar personalizada
  const scrollY = useRef(new Animated.Value(0)).current;
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const [scrollbarVisible, setScrollbarVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isDraggingScrollbar = useRef(false);
  const lastScrollY = useRef(0);
  
  // Ref para acceder a displayedAssets sin causar re-renders del callback
  const displayedAssetsRef = useRef<MarketAsset[]>([]);
  useEffect(() => {
    displayedAssetsRef.current = displayedAssets;
  }, [displayedAssets]);
  
  // Refs para loadMore sin stale closures
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // PanResponder para arrastrar la scrollbar
  const scrollbarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDraggingScrollbar.current = true;
        // Guardar posición actual del scroll
        scrollY.stopAnimation((value) => {
          lastScrollY.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        if (!isDraggingScrollbar.current) return;
        
        const trackHeight = scrollViewHeightRef.current - 16;
        const scrollableHeight = contentHeightRef.current - scrollViewHeightRef.current;
        const thumbHeight = Math.max((scrollViewHeightRef.current / contentHeightRef.current) * scrollViewHeightRef.current, 40);
        
        // Convertir movimiento del dedo a scroll
        const scrollRatio = scrollableHeight / (trackHeight - thumbHeight);
        const newScrollY = lastScrollY.current + (gestureState.dy * scrollRatio);
        const clampedScrollY = Math.max(0, Math.min(newScrollY, scrollableHeight));
        
        flatListRef.current?.scrollToOffset({ 
          offset: clampedScrollY,
          animated: false 
        });
      },
      onPanResponderRelease: () => {
        isDraggingScrollbar.current = false;
      },
      onPanResponderTerminate: () => {
        isDraggingScrollbar.current = false;
      },
    })
  ).current;

  const { 
    predictions,
    handleClearPredictions,
    handleRemovePrediction,
  } = useHome();

  // Cargar favoritos y predicciones
  const loadFavoritesAndPredictions = useCallback(async () => {
    try {
      await trainingCacheService.init();
      await favoritesService.init();
      setFavoriteSymbols(new Set(favoritesService.getAll()));
      
      const activePredictions = await trainingCacheService.getAllActive();
      setCachedPredictions(activePredictions);
    } catch (error) {
      console.error('[MarketPredictions] Error loading favorites/predictions:', error);
    }
  }, []);

  // Función para aplicar ordenamiento (favoritos siempre primero, luego predicciones)
  const applySorting = useCallback((assets: MarketAsset[], sortType: ExploreSortType, predSymbols: Set<string>, favs: Set<string>) => {
    let sorted = [...assets];
    
    switch (sortType) {
      case 'predicted':
        sorted.sort((a, b) => {
          const aFav = favs.has(a.symbol) ? 1 : 0;
          const bFav = favs.has(b.symbol) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          const aHasPred = predSymbols.has(a.symbol) ? 1 : 0;
          const bHasPred = predSymbols.has(b.symbol) ? 1 : 0;
          if (aHasPred !== bHasPred) return bHasPred - aHasPred;
          return (b.changePercent ?? -999) - (a.changePercent ?? -999);
        });
        break;
      case 'gainers':
        sorted.sort((a, b) => {
          const aFav = favs.has(a.symbol) ? 1 : 0;
          const bFav = favs.has(b.symbol) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          return (b.changePercent ?? -999) - (a.changePercent ?? -999);
        });
        break;
      case 'losers':
        sorted.sort((a, b) => {
          const aFav = favs.has(a.symbol) ? 1 : 0;
          const bFav = favs.has(b.symbol) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          return (a.changePercent ?? 999) - (b.changePercent ?? 999);
        });
        break;
      case 'popular':
        sorted.sort((a, b) => {
          const aFav = favs.has(a.symbol) ? 1 : 0;
          const bFav = favs.has(b.symbol) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          if (a.price && !b.price) return -1;
          if (!a.price && b.price) return 1;
          return 0;
        });
        break;
      case 'bullish':
        sorted = sorted.filter(a => (a.changePercent ?? 0) > 0);
        sorted.sort((a, b) => {
          const aFav = favs.has(a.symbol) ? 1 : 0;
          const bFav = favs.has(b.symbol) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          return (b.changePercent ?? 0) - (a.changePercent ?? 0);
        });
        break;
    }
    
    return sorted;
  }, []);

  // Cargar datos inicial con paginación (favoritos y predicciones primero, excepto en búsqueda)
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        marketDataService.clearCache();
        setPage(1);
      }
      
      const isSearching = debouncedSearchQuery.trim().length > 0;
      console.log('[MarketPredictions] loadData called - searching:', isSearching, 'query:', debouncedSearchQuery);
      
      // 1. Obtener los símbolos favoritos
      const favSymbols = Array.from(favoriteSymbols);
      
      // 2. Obtener símbolos con predicciones activas para el timeframe seleccionado
      const predictionSymbols = cachedPredictions
        .filter(p => p.timeframe === selectedTimeframe)
        .map(p => p.symbol);
      
      // 3. Combinar símbolos prioritarios (favoritos + predicciones) - SOLO si no hay búsqueda
      const prioritySymbols = isSearching ? [] : [...new Set([...favSymbols, ...predictionSymbols])];
      
      // 4. Obtener precios de símbolos prioritarios en paralelo con los activos paginados
      const [priorityAssets, result] = await Promise.all([
        // Obtener datos de favoritos y predicciones (solo si no hay búsqueda)
        !isSearching && prioritySymbols.length > 0 
          ? marketDataService.getAssetsBySymbols(prioritySymbols)
          : Promise.resolve([]),
        // Obtener activos paginados normal
        marketDataService.getAssetsPaginated(
          1,
          undefined,
          debouncedSearchQuery
        )
      ]);
      
      let combined: MarketAsset[];
      const predSymbols = new Set(cachedPredictions.filter(p => p.timeframe === selectedTimeframe).map(p => p.symbol));
      
      if (isSearching) {
        // Si hay búsqueda, solo ordenar por el criterio seleccionado sin priorizar
        combined = applySorting(result.assets, exploreSortBy, predSymbols, new Set());
        console.log(`[MarketPredictions] Search results: ${combined.length} assets for "${debouncedSearchQuery}"`);
      } else {
        // 5. Combinar: prioritarios primero, luego el resto sin duplicados
        const prioritySymbolSet = new Set(prioritySymbols.map(s => s.toUpperCase()));
        const nonPriorityAssets = result.assets.filter(
          a => !prioritySymbolSet.has(a.symbol.toUpperCase())
        );
        
        // 6. Ordenar prioritarios: predicciones primero, luego favoritos
        const sortedPriority = [...priorityAssets].sort((a, b) => {
          const aHasPred = predSymbols.has(a.symbol) ? 1 : 0;
          const bHasPred = predSymbols.has(b.symbol) ? 1 : 0;
          if (aHasPred !== bHasPred) return bHasPred - aHasPred;
          const aFav = favoriteSymbols.has(a.symbol) ? 1 : 0;
          const bFav = favoriteSymbols.has(b.symbol) ? 1 : 0;
          if (aFav !== bFav) return bFav - aFav;
          return (b.changePercent ?? -999) - (a.changePercent ?? -999);
        });
        
        // 7. Aplicar ordenamiento al resto según el tipo seleccionado
        const sortedRest = applySorting(nonPriorityAssets, exploreSortBy, predSymbols, new Set());
        
        // 8. Combinar: prioritarios primero, luego el resto
        combined = [...sortedPriority, ...sortedRest];
        console.log(`[MarketPredictions] Loaded ${priorityAssets.length} priority (${predictionSymbols.length} predictions + ${favSymbols.length} favorites) + ${nonPriorityAssets.length} others`);
      }
      
      setAllAssets(combined);
      setDisplayedAssets(combined);
      setHasMore(result.hasMore);
      setLastUpdate(new Date());
      setPage(1);
    } catch (error) {
      console.error('[MarketPredictions] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery, favoriteSymbols, exploreSortBy, cachedPredictions, applySorting, selectedTimeframe]);

  // Cargar más datos (infinite scroll)
  const loadMore = useCallback(async () => {
    console.log('[MarketPredictions] loadMore called - loadingMore:', loadingMore, 'hasMore:', hasMore);
    if (loadingMore || !hasMore) {
      console.log('[MarketPredictions] loadMore skipped');
      return;
    }
    
    console.log('[MarketPredictions] loadMore starting...');
    setLoadingMore(true);
    try {
      let currentPage = page;
      let newAssets: MarketAsset[] = [];
      let moreAvailable = true;
      
      // Usar ref para evitar dependencia en el callback
      const existingSymbols = new Set(displayedAssetsRef.current.map(a => a.symbol.toUpperCase()));
      
      // Buscar páginas hasta encontrar al menos 5 activos nuevos o no haya más
      while (newAssets.length < 5 && moreAvailable) {
        currentPage++;
        const result = await marketDataService.getAssetsPaginated(
          currentPage,
          undefined,
          debouncedSearchQuery
        );
        
        // Filtrar assets que ya tenemos
        const pageNewAssets = result.assets.filter(a => !existingSymbols.has(a.symbol.toUpperCase()));
        
        // Añadir los nuevos a nuestra lista
        pageNewAssets.forEach(a => {
          existingSymbols.add(a.symbol.toUpperCase());
          newAssets.push(a);
        });
        
        moreAvailable = result.hasMore;
        
        // Límite de seguridad - no buscar más de 5 páginas a la vez
        if (currentPage - page >= 5) break;
      }
      
      console.log('[MarketPredictions] Loaded', newAssets.length, 'new assets from pages', page + 1, 'to', currentPage);
      
      if (newAssets.length > 0) {
        const predSymbols = new Set(cachedPredictions.map(p => p.symbol));
        const sortedNew = applySorting(newAssets, exploreSortBy, predSymbols, favoriteSymbols);
        setDisplayedAssets(prev => [...prev, ...sortedNew]);
      }
      
      setHasMore(moreAvailable);
      setPage(currentPage);
    } catch (error) {
      console.error('[MarketPredictions] Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, debouncedSearchQuery, exploreSortBy, cachedPredictions, applySorting, favoriteSymbols]);

  // Estado para saber si favoritos están cargados
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  // Cargar favoritos primero
  useEffect(() => {
    const init = async () => {
      await loadFavoritesAndPredictions();
      setFavoritesLoaded(true);
    };
    init();
  }, [loadFavoritesAndPredictions]);

  // Cargar datos cuando favoritos están listos o cambian filtros
  useEffect(() => {
    if (favoritesLoaded) {
      loadData();
    }
  }, [favoritesLoaded, debouncedSearchQuery, loadData]);

  // Reordenar cuando cambia exploreSortBy (sin recargar datos)
  useEffect(() => {
    if (displayedAssets.length > 0 && favoritesLoaded) {
      const predSymbols = new Set(cachedPredictions.map(p => p.symbol));
      const sorted = applySorting(displayedAssets, exploreSortBy, predSymbols, favoriteSymbols);
      setDisplayedAssets(sorted);
    }
  }, [exploreSortBy]);

  // Cargar recomendaciones de timeframe solo cuando el usuario interactúa
  // NO se cargan automáticamente al montar para evitar peticiones innecesarias
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  
  // Las recomendaciones se cargarán bajo demanda cuando se seleccione un activo
  // No hacer carga inicial automática de todos los activos

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFavoritesAndPredictions();
    await loadData(true);
    setRefreshing(false);
  }, [loadData, loadFavoritesAndPredictions]);

  // Obtener predicción cacheada para un símbolo y timeframe (desde el estado local)
  const getCachedPrediction = useCallback((symbol: string, timeframe: TrainingTimeframe): TrainingPrediction | null => {
    return cachedPredictions.find(p => p.symbol === symbol && p.timeframe === timeframe) || null;
  }, [cachedPredictions]);

  // Obtener TODAS las predicciones de un símbolo
  const getAllPredictionsForSymbol = useCallback((symbol: string): TrainingPrediction[] => {
    return cachedPredictions.filter(p => p.symbol === symbol);
  }, [cachedPredictions]);

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
      // Obtener predicción real del backend
      const timeframeDays = timeframe === 'intraday' ? 1 : timeframe === 'swing' ? 7 : 30;
      const calculatedPrediction = await apiClient.calculatePrediction(
        asset.symbol,
        timeframeDays
      );

      // Usar datos del calculador si está disponible, o fallback a momentum
      let direction: 'up' | 'down' | 'neutral';
      let confidence: number;
      let predictedChange: number;
      let reasoning: string;

      // Variables para precio base y objetivo - usar backend cuando esté disponible
      let basePrice: number;
      let targetPrice: number;

      if (calculatedPrediction) {
        direction = calculatedPrediction.direction;
        confidence = calculatedPrediction.confidence;
        predictedChange = calculatedPrediction.predictedChange;
        reasoning = calculatedPrediction.factorBreakdown?.confidenceExplanation || 'Análisis multi-factor';
        // IMPORTANTE: Usar precio del backend (previousClose) para consistencia
        basePrice = calculatedPrediction.currentPrice;
        targetPrice = (calculatedPrediction.predictedPriceMin + calculatedPrediction.predictedPriceMax) / 2;
      } else {
        // Fallback a momentum si el calculador falla
        const momentum = asset.changePercent ?? 0;
        direction = momentum > 0.2 ? 'up' : momentum < -0.2 ? 'down' : 'neutral';
        confidence = Math.round(Math.min(85, Math.max(45, 60 + Math.abs(momentum) * 2)));
        predictedChange = Math.round((direction === 'up' ? Math.abs(momentum) * 0.5 : direction === 'down' ? -Math.abs(momentum) * 0.5 : 0) * 100) / 100;
        reasoning = `Basado en momentum actual (${momentum.toFixed(2)}%)`;
        basePrice = asset.price;
        targetPrice = asset.price * (1 + predictedChange / 100);
      }

      // Calcular expiración según estado del mercado para predicciones intradía
      let customExpiresAt: Date | undefined;
      let expirationDescription = TIMEFRAME_INFO[timeframe].label;
      
      if (timeframe === 'intraday') {
        const expInfo = getPredictionExpiration(asset.symbol, asset.name);
        customExpiresAt = expInfo.expiresAt;
        expirationDescription = expInfo.description;
      }

      const prediction = await trainingCacheService.set(asset.symbol, timeframe, {
        symbol: asset.symbol,
        name: asset.name,
        icon: asset.icon,
        timeframe,
        direction,
        confidence,
        predictedChange,
        currentPrice: basePrice,
        targetPrice: targetPrice,
        currency: calculatedPrediction?.currency, // IMPORTANTE: Guardar la moneda real del activo
        reasoning,
        analysisData: calculatedPrediction || undefined, // Guardar análisis completo
        createdAt: new Date(),
      }, customExpiresAt);

      // Actualizar lista de predicciones cacheadas
      const updatedPredictions = await trainingCacheService.getAllActive();
      setCachedPredictions(updatedPredictions);

      if (onPredictionMade) {
        onPredictionMade(prediction);
      }

      // Mostrar mensaje con la expiración correcta
      const expiresAtStr = timeframe === 'intraday' 
        ? prediction.expiresAt.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : prediction.expiresAt.toLocaleDateString('es-ES');
      
      showAlert('✅ Predicción creada', `${asset.name} (${expirationDescription})\nDirección: ${direction === 'up' ? '📈 Sube' : direction === 'down' ? '📉 Baja' : '🔇 Sin señal clara'}\nVálida hasta: ${expiresAtStr}`);
    } catch (error) {
      console.error('[MarketPredictions] Error making prediction:', error);
      showAlert('Error', 'No se pudo crear la predicción');
    } finally {
      setPredictingSymbol(null);
    }
  }, [getCachedPrediction, onPredictionMade]);



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

  // Seleccionar todos los activos disponibles
  const selectAll = useCallback(() => {
    const availableSymbols = displayedAssets
      .filter(a => !a.loading && a.price !== undefined)
      .map(a => a.symbol);
    setSelectedSymbols(new Set(availableSymbols));
  }, [displayedAssets]);

  // Deseleccionar todos
  const deselectAll = useCallback(() => {
    setSelectedSymbols(new Set());
  }, []);

  // Obtener todos los activos seleccionables
  const selectableAssets = useMemo(() => {
    return displayedAssets.filter(a => !a.loading && a.price !== undefined);
  }, [displayedAssets]);

  // Contar seleccionados para predecir (sin predicción) y eliminar (con predicción)
  const selectedToPredictCount = useMemo(() => {
    return Array.from(selectedSymbols).filter(s => !getCachedPrediction(s, selectedTimeframe)).length;
  }, [selectedSymbols, selectedTimeframe, getCachedPrediction]);

  const selectedToDeleteCount = useMemo(() => {
    return Array.from(selectedSymbols).filter(s => getCachedPrediction(s, selectedTimeframe) !== null).length;
  }, [selectedSymbols, selectedTimeframe, getCachedPrediction]);

  // Debounce para la búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Verificar si todos están seleccionados
  const allSelected = useMemo(() => {
    return selectableAssets.length > 0 && selectableAssets.every(a => selectedSymbols.has(a.symbol));
  }, [selectableAssets, selectedSymbols]);

  // Ordenar activos - CON PREDICCIÓN primero, luego Favoritas, luego resto
  const sortedAssets = useMemo(() => {
    // Deduplicar por símbolo (mantener primera ocurrencia)
    const seen = new Set<string>();
    const deduplicated = displayedAssets.filter(a => {
      if (seen.has(a.symbol)) return false;
      seen.add(a.symbol);
      return true;
    });

    // Filtrar activos sin datos válidos (sin precio o en loading)
    const withValidData = deduplicated.filter(a => 
      !a.loading && a.price !== undefined && a.price > 0
    );

    // Obtener predicción para un símbolo desde cachedPredictions
    const getPrediction = (symbol: string) => {
      return cachedPredictions.find(p => p.symbol === symbol && p.timeframe === selectedTimeframe) || null;
    };

    // Separar en 3 grupos: con predicción, favoritos sin predicción, resto
    const withPrediction = withValidData.filter(a => getPrediction(a.symbol) !== null);
    const favoritesWithoutPrediction = withValidData.filter(a => 
      getPrediction(a.symbol) === null && favoriteSymbols.has(a.symbol)
    );
    const rest = withValidData.filter(a => 
      getPrediction(a.symbol) === null && !favoriteSymbols.has(a.symbol)
    );
    
    // Aplicar ordenamiento a cada grupo
    const applySorting = (assets: MarketAsset[]) => {
      const sorted = [...assets];
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
    };

    // Ordenar: primero con predicción, luego favoritos, luego resto
    return [...applySorting(withPrediction), ...applySorting(favoritesWithoutPrediction), ...applySorting(rest)];
  }, [displayedAssets, sortBy, selectedTimeframe, cachedPredictions, favoriteSymbols]);

  // Predecir todos los seleccionados (usando batch API)
  const predictSelected = useCallback(async () => {
    const selectedAssetsList = displayedAssets.filter(a => selectedSymbols.has(a.symbol) && a.price !== undefined);
    
    if (selectedAssetsList.length === 0) {
      console.log('Sin selección: Selecciona al menos un activo');
      return;
    }

    setIsPredictingBatch(true);
    setBatchProgress({current: 0, total: 0});
    
    // Filtrar activos que ya tienen predicción cacheada
    const assetsNeedingPrediction = selectedAssetsList.filter(
      asset => !getCachedPrediction(asset.symbol, selectedTimeframe)
    );
    
    if (assetsNeedingPrediction.length === 0) {
      console.log('Todas las predicciones seleccionadas ya están cacheadas');
      setIsPredictingBatch(false);
      return;
    }

    const timeframeDays = selectedTimeframe === 'intraday' ? 1 : selectedTimeframe === 'swing' ? 7 : 30;
    let successCount = 0;
    let errorCount = 0;

    try {
      // BATCH API: Dividir en chunks de 20 máximo
      const symbolsToPredict = assetsNeedingPrediction.map(a => a.symbol);
      const BATCH_SIZE = 20;
      const chunks: string[][] = [];
      for (let i = 0; i < symbolsToPredict.length; i += BATCH_SIZE) {
        chunks.push(symbolsToPredict.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`[DEBUG] Batch request for ${symbolsToPredict.length} symbols in ${chunks.length} chunks`);
      
      // Hacer todas las peticiones batch y combinar resultados
      const allResults: Record<string, any> = {};
      for (const chunk of chunks) {
        const batchResult = await apiClient.calculatePredictionBatch(chunk, timeframeDays);
        Object.assign(allResults, batchResult.results);
      }
      console.log(`[DEBUG] Combined batch results for ${Object.keys(allResults).length} symbols`);
      
      // Procesar cada resultado
      const totalToProcess = assetsNeedingPrediction.length;
      let processed = 0;
      setBatchProgress({current: 0, total: totalToProcess});
      
      for (const asset of assetsNeedingPrediction) {
        setPredictingSymbol(asset.symbol);
        
        const result = allResults[asset.symbol];
        const calculatedPrediction = result?.success ? result.data : null;
        
        try {
          // Usar datos del calculador si está disponible, o fallback a momentum
          let direction: 'up' | 'down' | 'neutral';
          let confidence: number;
          let predictedChange: number;
          let reasoning: string;
          let basePrice: number = asset.price!;
          let targetPriceCalc: number;

          if (calculatedPrediction) {
            direction = calculatedPrediction.direction;
            confidence = calculatedPrediction.confidence;
            predictedChange = calculatedPrediction.predictedChange;
            reasoning = `Score: ${calculatedPrediction.factorBreakdown?.confidenceExplanation || 'Basado en análisis de 11 factores'}`;
            basePrice = calculatedPrediction.currentPrice;
            targetPriceCalc = (calculatedPrediction.predictedPriceMin + calculatedPrediction.predictedPriceMax) / 2;
          } else {
            // Fallback a momentum si el calculador falla
            const momentum = asset.changePercent ?? 0;
            direction = momentum > 0.2 ? 'up' : momentum < -0.2 ? 'down' : 'neutral';
            confidence = Math.round(Math.min(85, Math.max(45, 60 + Math.abs(momentum) * 2)));
            predictedChange = Math.round((direction === 'up' ? Math.abs(momentum) * 0.5 : direction === 'down' ? -Math.abs(momentum) * 0.5 : 0) * 100) / 100;
            reasoning = `Basado en momentum actual (${momentum.toFixed(2)}%)`;
            targetPriceCalc = basePrice * (1 + predictedChange / 100);
          }

          const prediction = await trainingCacheService.set(asset.symbol, selectedTimeframe, {
            symbol: asset.symbol,
            name: asset.name,
            icon: asset.icon,
            timeframe: selectedTimeframe,
            direction,
            confidence,
            predictedChange,
            currentPrice: basePrice,
            targetPrice: targetPriceCalc,
            currency: calculatedPrediction?.currency,
            reasoning,
            analysisData: calculatedPrediction || undefined,
            createdAt: new Date(),
          });
          console.log(`[DEBUG] Saved prediction for ${asset.symbol}:`, prediction?.id, prediction?.timeframe);

          // Registrar predicción para tracking de estadísticas ML
          const predMinPrice = calculatedPrediction?.predictedPriceMin ?? basePrice * (1 + (predictedChange - 2) / 100);
          const predMaxPrice = calculatedPrediction?.predictedPriceMax ?? basePrice * (1 + (predictedChange + 2) / 100);
          
          try {
            await predictionTrackingService.trackPrediction({
              symbol: asset.symbol,
              asset: asset.name,
              assetType: 'stock',
              currency: calculatedPrediction?.currency,
              direction,
              predictedChange,
              predictedPriceMin: predMinPrice,
              predictedPriceMax: predMaxPrice,
              confidence,
              currentPrice: basePrice,
              timeframe: selectedTimeframe,
              timeframeDays,
              volatility: calculatedPrediction?.historical?.volatility,
              factorBreakdown: calculatedPrediction?.factorBreakdown,
            });
          } catch (trackError) {
            console.error(`[MarketPredictions] Error en tracking de ${asset.symbol}:`, trackError);
          }

          if (onPredictionMade) {
            onPredictionMade(prediction);
          }

          successCount++;
        } catch (assetError) {
          console.error(`[MarketPredictions] Error processing ${asset.symbol}:`, assetError);
          errorCount++;
        }
        processed++;
        setBatchProgress({current: processed, total: totalToProcess});
      }
    } catch (batchError) {
      console.error('[MarketPredictions] Error en batch prediction:', batchError);
      errorCount = assetsNeedingPrediction.length;
    }

    setPredictingSymbol(null);
    setIsPredictingBatch(false);
    console.log(`[DEBUG] Fetching all active predictions...`);
    const batchUpdatedPredictions = await trainingCacheService.getAllActive();
    console.log(`[DEBUG] getAllActive returned ${batchUpdatedPredictions.length} predictions:`, batchUpdatedPredictions.map(p => `${p.symbol}:${p.timeframe}`));
    setCachedPredictions(batchUpdatedPredictions);
    setSelectedSymbols(new Set());

    console.log(`Predicciones completadas: ${successCount} creadas${errorCount > 0 ? `, ${errorCount} errores` : ''}`);
  }, [displayedAssets, selectedSymbols, selectedTimeframe, getCachedPrediction, onPredictionMade]);

  // Eliminar predicciones seleccionadas
  const deleteSelected = useCallback(async () => {
    const toDelete = cachedPredictions.filter(p => selectedSymbols.has(p.symbol) && p.timeframe === selectedTimeframe);
    
    if (toDelete.length === 0) {
      console.log('Sin selección: Selecciona predicciones para eliminar');
      return;
    }

    // Eliminar del training cache (esto es lo único necesario para la UI)
    const items = toDelete.map(p => ({ symbol: p.symbol, timeframe: p.timeframe }));
    const removed = await trainingCacheService.removeMultiple(items);
    
    // Nota: NO eliminamos de la tabla Prediction porque esa contiene
    // datos históricos necesarios para el entrenamiento ML.
    // Solo eliminamos del TrainingCache que es la vista de la UI.
    
    const deletedUpdatedPredictions = await trainingCacheService.getAllActive();
    setCachedPredictions(deletedUpdatedPredictions);
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
    const allPredictions = getAllPredictionsForSymbol(item.symbol);
    const hasPredictions = allPredictions.length > 0;
    const isPredicting = predictingSymbol === item.symbol;
    const isSelected = selectedSymbols.has(item.symbol);
    
    // Siempre se puede seleccionar si tiene precio
    const canSelect = !item.loading && item.price !== undefined;

    return (
      <TouchableOpacity 
        style={[
          styles.assetRow, 
          isDesktop && styles.assetRowDesktop,
          isSelected && cached && styles.assetRowDeleteMode,
        ]}
        onPress={() => canSelect && toggleSelection(item.symbol)}
        disabled={!canSelect}
        activeOpacity={canSelect ? 0.7 : 1}
      >
        {/* Checkbox */}
        <View style={styles.checkboxContainer}>
          {isPredicting ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <View style={[
              styles.checkbox,
              isSelected && (cached ? styles.checkboxDeleteSelected : styles.checkboxSelected),
              !canSelect && styles.checkboxDisabled,
            ]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
              {!isSelected && cached && (
                <Text style={styles.predictionIndicator}>
                  {cached.direction === 'up' ? '↑' : cached.direction === 'down' ? '↓' : '→'}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Icono */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{item.icon}</Text>
          {favoriteSymbols.has(item.symbol) && (
            <View style={styles.favoriteBadge}>
              <Text style={styles.favoriteBadgeIcon}>❤️</Text>
            </View>
          )}
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

        {/* Estado: Cambio diario + Predicción (horizontal) */}
        <View style={styles.actionContainer}>
          {item.loading ? (
            <ActivityIndicator size="small" color="#6b7280" />
          ) : isPredicting ? (
            <Text style={styles.predictingText} selectable={true}>Analizando...</Text>
          ) : (
            <View style={styles.actionsRow}>
              {/* Cambio diario */}
              <View style={styles.dailyChangeBox}>
                <Text style={[styles.changeText, { color: getChangeColor(item.changePercent) }]} selectable={true}>
                  {item.changePercent !== undefined ? `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%` : '-'}
                </Text>
                <Text style={styles.dailyLabel}>hoy</Text>
              </View>
              
              {/* Predicción con hover tooltip */}
              {hasPredictions && (
                <View 
                  style={styles.predictionsWrapper}
                  // @ts-ignore - Web only props
                  onMouseEnter={() => Platform.OS === 'web' && setHoveredSymbol(item.symbol)}
                  onMouseLeave={() => Platform.OS === 'web' && setHoveredSymbol(null)}
                >
                  <View style={[
                    styles.predictionBadgeCompact,
                    { backgroundColor: allPredictions[0].direction === 'up' ? '#10b98120' : allPredictions[0].direction === 'down' ? '#ef444420' : '#6b728020' }
                  ]}>
                    <Text style={styles.predictionIconInline} selectable={true}>
                      {allPredictions[0].direction === 'up' ? '📈' : allPredictions[0].direction === 'down' ? '📉' : '➡️'}
                    </Text>
                    <Text style={[styles.predictionTextInline, { color: allPredictions[0].direction === 'up' ? '#10b981' : allPredictions[0].direction === 'down' ? '#ef4444' : '#6b7280' }]} selectable={true}>
                      {(allPredictions[0].predictedChange ?? 0) >= 0 ? '+' : ''}{(allPredictions[0].predictedChange ?? 0).toFixed(1)}%
                    </Text>
                    {allPredictions.length > 1 && (
                      <View style={styles.moreCountBadge}>
                        <Text style={styles.moreCountText}>+{allPredictions.length - 1}</Text>
                      </View>
                    )}
                  </View>
                  
                  {/* Hover tooltip (web only) */}
                  {Platform.OS === 'web' && hoveredSymbol === item.symbol && (
                    <View style={styles.hoverTooltip}>
                      <View style={styles.hoverTooltipArrow} />
                      <Text style={styles.hoverTooltipTitle}>🎯 {item.name}</Text>
                      {allPredictions.map((pred, idx) => (
                        <View key={idx} style={styles.hoverPredictionRow}>
                          <Text style={[
                            styles.hoverPredictionIcon,
                            { color: pred.direction === 'up' ? '#10b981' : pred.direction === 'down' ? '#ef4444' : '#6b7280' }
                          ]}>
                            {pred.direction === 'up' ? '📈' : pred.direction === 'down' ? '📉' : '➡️'}
                          </Text>
                          <Text style={[
                            styles.hoverPredictionChange,
                            { color: pred.direction === 'up' ? '#10b981' : pred.direction === 'down' ? '#ef4444' : '#6b7280' }
                          ]}>
                            {(pred.predictedChange ?? 0) >= 0 ? '+' : ''}{(pred.predictedChange ?? 0).toFixed(1)}%
                          </Text>
                          <Text style={styles.hoverTimeframe}>
                            {TIMEFRAME_INFO[pred.timeframe]?.label || pred.timeframe}
                          </Text>
                          {pred.confidence !== undefined && (
                            <Text style={styles.hoverConfidence}>({pred.confidence}%)</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
              
              {/* Botón gráfico */}
              <TouchableOpacity
                style={styles.chartButton}
                onPress={() => router.push({ pathname: '/asset/[symbol]', params: { symbol: item.symbol } })}
              >
                <Text style={styles.chartButtonText}>📊</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Botón Favorito */}
        <TouchableOpacity 
          style={styles.favoriteButton}
          onPress={() => toggleFavorite(item.symbol, item.name)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons 
            name={favoriteSymbols.has(item.symbol) ? 'heart' : 'heart-outline'} 
            size={20} 
            color={favoriteSymbols.has(item.symbol) ? '#ef4444' : '#6b7280'} 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Toggle favorito
  const toggleFavorite = useCallback(async (symbol: string, name?: string) => {
    await favoritesService.toggle(symbol, name);
    setFavoriteSymbols(new Set(favoritesService.getAll()));
  }, []);

  // Opciones de ordenamiento (movidas desde MarketList/Explorar)
  const EXPLORE_SORT_OPTIONS: { key: ExploreSortType; label: string; icon: string }[] = [
    { key: 'predicted', label: 'Con predicción', icon: '🎯' },
    { key: 'gainers', label: 'Subidas', icon: '📈' },
    { key: 'losers', label: 'Bajadas', icon: '📉' },
    { key: 'popular', label: 'Popular', icon: '🔥' },
    { key: 'bullish', label: 'Alcistas', icon: '🐂' },
  ];

  return (
    <View style={[styles.container, isDesktop && { paddingHorizontal: horizontalPadding }]}>
      {/* Modal de Análisis de Predicción */}
      <TrainingPredictionAnalysisModal
        prediction={selectedPrediction}
        onClose={() => setSelectedPrediction(null)}
      />

      {/* Header fijo con título y búsqueda */}
      <View style={styles.fixedHeader}>
        {/* Título y hora */}
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

        {/* Búsqueda + Estadísticas en una línea */}
        <View style={styles.searchStatsRow}>
          <View style={styles.searchContainerCompact}>
            <Ionicons name="search" size={18} color="#6b7280" />
            <TextInput
              style={styles.searchInputCompact}
              placeholder="Buscar..."
              placeholderTextColor="#6b7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.statsTextCompact}>
            {cachedPredictions.length} activas
          </Text>
        </View>

        {/* Filtros de activos */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.exploreSortContainer}
          contentContainerStyle={styles.exploreSortContent}
        >
          {EXPLORE_SORT_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.key}
              style={[styles.exploreSortChip, exploreSortBy === option.key && styles.exploreSortChipActive]}
              onPress={() => setExploreSortBy(option.key)}
            >
              <Text style={styles.exploreSortIcon}>{option.icon}</Text>
              <Text style={[styles.exploreSortLabel, exploreSortBy === option.key && styles.exploreSortLabelActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Timeframes + Acciones en una línea */}
        <View style={styles.timeframeActionsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeframeScrollCompact}>
            {(Object.keys(TIMEFRAME_INFO) as TrainingTimeframe[]).map((tf) => {
              const info = TIMEFRAME_INFO[tf];
              const count = cachedPredictions.filter(p => p.timeframe === tf).length;
              
              return (
                <TouchableOpacity
                  key={tf}
                  style={[
                    styles.timeframeChipCompact,
                    selectedTimeframe === tf && styles.timeframeChipActive,
                  ]}
                  onPress={() => setSelectedTimeframe(tf)}
                >
                  <Text style={[
                    styles.timeframeLabelCompact,
                    selectedTimeframe === tf && styles.timeframeLabelActive,
                  ]}>
                    {info.label}
                  </Text>
                  {count > 0 && (
                    <View style={styles.countBadgeCompact}>
                      <Text style={styles.countTextCompact}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Acciones */}
          <View style={styles.actionsCompact}>
            <TouchableOpacity
              style={styles.selectAllCompact}
              onPress={allSelected ? deselectAll : selectAll}
            >
              <View style={[styles.checkboxSmall, allSelected && styles.checkboxSelected]}>
                {allSelected && <Text style={styles.checkmarkSmall}>✓</Text>}
              </View>
              <Text style={styles.selectCountText}>({selectableAssets.length})</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtnCompact,
                styles.predictBtn,
                (selectedToPredictCount === 0 || isPredictingBatch) && styles.actionBtnDisabled,
              ]}
              onPress={predictSelected}
              disabled={selectedToPredictCount === 0 || isPredictingBatch}
            >
              {isPredictingBatch ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  {batchProgress.total > 0 && (
                    <Text style={styles.actionBtnText}>{batchProgress.current}/{batchProgress.total}</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.actionBtnIcon}>🔮</Text>
                  {selectedToPredictCount > 0 && <Text style={styles.actionBtnText}>{selectedToPredictCount}</Text>}
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtnCompact,
                styles.deleteBtn,
                selectedToDeleteCount === 0 && styles.actionBtnDisabled,
              ]}
              onPress={deleteSelected}
              disabled={selectedToDeleteCount === 0}
            >
              <Text style={styles.actionBtnIcon}>🗑️</Text>
              {selectedToDeleteCount > 0 && <Text style={styles.actionBtnText}>{selectedToDeleteCount}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          key={isDesktop ? 'grid-3col' : 'list-1col'}
          ref={flatListRef}
          data={sortedAssets}
          extraData={sortBy}
          renderItem={renderAsset}
          keyExtractor={(item, index) => `${item.symbol}-${index}`}
          numColumns={isDesktop ? 3 : 1}
          contentContainerStyle={isDesktop ? styles.gridContainer : undefined}
          columnWrapperStyle={isDesktop ? styles.columnWrapper : undefined}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.loadingText}>Cargando más activos...</Text>
              </View>
            ) : hasMore ? (
              <View style={styles.loadingFooter}>
                <Text style={styles.loadMoreHint}>↓ Desliza para cargar más</Text>
              </View>
            ) : sortedAssets.length > 0 ? (
              <View style={styles.loadingFooter}>
                <Text style={styles.endOfListText}>— Fin de la lista ({sortedAssets.length} activos) —</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Cargando activos...</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No se encontraron activos</Text>
                <Text style={styles.emptyText}>
                  Prueba con otro término de búsqueda
                </Text>
              </View>
            )
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={false}
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
            sortedAssets.length === 0 && styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            // Update animated value
            scrollY.setValue(event.nativeEvent.contentOffset.y);
            
            // Manual check for end of list usando refs para evitar stale closures
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            const paddingToBottom = 300;
            const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
            
            if (isCloseToBottom && hasMoreRef.current && !loadingMoreRef.current) {
              console.log('[MarketPredictions] Near bottom, triggering loadMore');
              loadMore();
            }
          }}
          onContentSizeChange={(w, h) => {
            contentHeightRef.current = h;
            setScrollbarVisible(h > scrollViewHeightRef.current);
          }}
          onLayout={(e) => {
            scrollViewHeightRef.current = e.nativeEvent.layout.height;
            setScrollbarVisible(contentHeightRef.current > e.nativeEvent.layout.height);
          }}
          scrollEventThrottle={16}
        />
        
        {/* Scrollbar personalizada arrastrable */}
        {scrollbarVisible && (
          <View
            style={styles.scrollbarTrack}
            {...scrollbarPanResponder.panHandlers}
          >
            <Animated.View 
              style={[
                styles.scrollbarThumb,
                {
                  height: Math.max((scrollViewHeightRef.current / contentHeightRef.current) * scrollViewHeightRef.current, 40),
                  transform: [{
                    translateY: scrollY.interpolate({
                      inputRange: [0, Math.max(contentHeightRef.current - scrollViewHeightRef.current, 1)],
                      outputRange: [0, scrollViewHeightRef.current - 16 - Math.max((scrollViewHeightRef.current / contentHeightRef.current) * scrollViewHeightRef.current, 40)],
                      extrapolate: 'clamp',
                    })
                  }]
                }
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  scrollbarTrack: {
    position: 'absolute',
    right: 4,
    top: 8,
    bottom: 8,
    width: 30,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  scrollbarThumb: {
    width: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
    minHeight: 50,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
  fixedHeader: {
    backgroundColor: '#0f0f0f',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  listContent: {
    paddingBottom: 20,
  },
  listContentDesktop: {
    paddingTop: 8,
    paddingBottom: 40,
    width: '80%',
    alignSelf: 'center',
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
    paddingBottom: 8,
  },
  // Búsqueda + Stats compacto
  searchStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  searchContainerCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  searchInputCompact: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    padding: 0,
  },
  statsTextCompact: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  // Búsqueda (legacy)
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e2e',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    padding: 0,
  },
  // Ordenación de activos
  exploreSortContainer: {
    marginBottom: 4,
  },
  exploreSortContent: {
    paddingHorizontal: 12,
  },
  exploreSortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    marginRight: 8,
  },
  exploreSortChipActive: {
    backgroundColor: '#6366f1',
  },
  exploreSortIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  exploreSortLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#a0a0a0',
  },
  exploreSortLabelActive: {
    color: '#ffffff',
  },
  // Timeframe + Actions row
  timeframeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  timeframeScrollCompact: {
    flex: 1,
  },
  timeframeChipCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginRight: 8,
  },
  timeframeLabelCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a0a0a0',
  },
  countBadgeCompact: {
    marginLeft: 6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countTextCompact: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  actionsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  selectAllCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkboxSmall: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4b5563',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkSmall: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  selectCountText: {
    fontSize: 13,
    color: '#6b7280',
  },
  actionBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 4,
  },
  predictBtn: {
    backgroundColor: '#6366f1',
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
  },
  actionBtnDisabled: {
    backgroundColor: '#4b5563',
  },
  actionBtnIcon: {
    fontSize: 16,
  },
  actionBtnText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  // Timeframe selector (legacy)
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
    flex: 1,
    maxWidth: '33%',
    marginHorizontal: 2,
    marginVertical: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#1a1a1a',
  },
  columnWrapper: {
    width: '100%',
  },
  gridContainer: {
    paddingHorizontal: 0,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#252525',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    position: 'relative',
  },
  icon: {
    fontSize: 18,
  },
  favoriteBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteBadgeIcon: {
    fontSize: 8,
  },
  infoContainer: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 1,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  symbol: {
    fontSize: 11,
    color: '#6b7280',
  },
  priceInline: {
    fontSize: 11,
    color: '#a0a0a0',
    fontWeight: '500',
  },
  // Action container
  actionContainer: {
    minWidth: 80,
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
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
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
    fontSize: 12,
    fontWeight: 'bold',
  },
  predictionIndicator: {
    color: '#9ca3af',
    fontSize: 10,
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
  favoriteButton: {
    padding: 8,
    marginLeft: 8,
  },
  changeText: {
    fontSize: 12,
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
  actionButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  predictAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 50,
    justifyContent: 'center',
  },
  predictAllButtonDisabled: {
    backgroundColor: '#4b5563',
  },
  predictAllIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  predictAllText: {
    color: '#ffffff',
    fontSize: 13,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 50,
    justifyContent: 'center',
  },
  deleteAllButtonDisabled: {
    backgroundColor: '#6b7280',
  },
  deleteAllIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  deleteAllText: {
    color: '#ffffff',
    fontSize: 13,
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
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 4,
    backgroundColor: '#1e3a5f20',
    borderRadius: 6,
  },
  chartButtonText: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dailyChangeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dailyLabel: {
    fontSize: 8,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  predictionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  predictionIconInline: {
    fontSize: 10,
  },
  predictionTextInline: {
    fontSize: 10,
    fontWeight: '600',
  },
  confidenceTextInline: {
    fontSize: 9,
    color: '#6b7280',
  },
  // Predictions wrapper y hover tooltip
  predictionsWrapper: {
    position: 'relative',
  },
  predictionBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  moreCountBadge: {
    backgroundColor: '#ffffff20',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginLeft: 1,
  },
  moreCountText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#ffffff',
  },
  hoverTooltip: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    padding: 12,
    minWidth: 200,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
  },
  hoverTooltipArrow: {
    position: 'absolute',
    bottom: -6,
    right: 20,
    width: 12,
    height: 12,
    backgroundColor: '#1e1e1e',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#333',
    transform: [{ rotate: '45deg' }],
  },
  hoverTooltipTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  hoverPredictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  hoverPredictionIcon: {
    fontSize: 12,
  },
  hoverPredictionChange: {
    fontSize: 13,
    fontWeight: '700',
  },
  hoverTimeframe: {
    fontSize: 11,
    color: '#6b7280',
    flex: 1,
  },
  hoverConfidence: {
    fontSize: 10,
    color: '#f59e0b',
    fontWeight: '600',
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
  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  loadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 8,
  },
  loadMoreHint: {
    color: '#4b5563',
    fontSize: 12,
    textAlign: 'center',
  },
  endOfListText: {
    color: '#374151',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
