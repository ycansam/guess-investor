/**
 * Lista de activos del mercado con precios en tiempo real
 * Con búsqueda, favoritos, paginación infinita y categorías
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { favoritesService } from '../../../services/favorites-service';
import { AssetCategory, MarketAsset, marketDataService } from '../../../services/market-data-service';
import { trainingCacheService } from '../../../services/training-cache-service';

type SortType = 'predicted' | 'gainers' | 'losers' | 'popular' | 'bullish';

const SORT_OPTIONS: { key: SortType; label: string; icon: string }[] = [
  { key: 'predicted', label: 'Con predicción', icon: '🎯' },
  { key: 'gainers', label: 'Subidas', icon: '📈' },
  { key: 'losers', label: 'Bajadas', icon: '📉' },
  { key: 'popular', label: 'Popular', icon: '🔥' },
  { key: 'bullish', label: 'Alcistas', icon: '🐂' },
];

// Breakpoints para responsive
const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

const MAX_CONTENT_WIDTH = 800;
const BATCH_SIZE = 10;

interface MarketListProps {
  onFavoritesChange?: () => void;
}

export function MarketList({ onFavoritesChange }: MarketListProps) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isDesktop = Platform.OS === 'web' && width >= BREAKPOINTS.desktop;
  
  const horizontalPadding = useMemo(() => {
    if (!isDesktop) return 0;
    const extraPadding = Math.max(0, (width - MAX_CONTENT_WIDTH) / 2);
    return extraPadding;
  }, [width, isDesktop]);

  // Estado
  const [allAssets, setAllAssets] = useState<MarketAsset[]>([]);
  const [displayedAssets, setDisplayedAssets] = useState<MarketAsset[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('predicted');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | null>(null);
  const searchInputRef = useRef<any>(null);
  
  // Favoritos y predicciones
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [predictedSymbols, setPredictedSymbols] = useState<Set<string>>(new Set());

  // Cargar favoritos y predicciones
  const loadFavoritesAndPredictions = useCallback(async () => {
    try {
      await favoritesService.init();
      setFavorites(new Set(favoritesService.getAll()));
      
      await trainingCacheService.init();
      const predictions = trainingCacheService.getAllActive();
      const symbols = new Set(predictions.map(p => p.symbol));
      setPredictedSymbols(symbols);
    } catch (error) {
      console.error('Error loading favorites/predictions:', error);
    }
  }, []);

  // Cargar datos inicial
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        marketDataService.clearCache();
        setPage(1);
      }
      
      const result = await marketDataService.getAssetsPaginated(
        1,
        selectedCategory || undefined,
        debouncedSearchQuery
      );
      
      setAllAssets(result.assets);
      setDisplayedAssets(result.assets);
      setHasMore(result.hasMore);
      setLastUpdate(new Date());
      setPage(1);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, debouncedSearchQuery]);

  // Cargar más datos (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await marketDataService.getAssetsPaginated(
        nextPage,
        selectedCategory || undefined,
        debouncedSearchQuery
      );
      
      setDisplayedAssets(prev => [...prev, ...result.assets]);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, selectedCategory, debouncedSearchQuery]);

  useEffect(() => {
    loadFavoritesAndPredictions();
    loadData();
  }, []);

  // Debounce para la búsqueda (evita perder foco)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Recargar cuando cambian filtros (usa debouncedSearchQuery)
  useEffect(() => {
    // No mostrar loading al buscar para evitar perder foco
    loadData();
  }, [selectedCategory, debouncedSearchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFavoritesAndPredictions();
    await loadData(true);
    setRefreshing(false);
  }, [loadData, loadFavoritesAndPredictions]);

  // Toggle favorito
  const toggleFavorite = useCallback(async (symbol: string) => {
    await favoritesService.toggle(symbol);
    setFavorites(new Set(favoritesService.getAll()));
    onFavoritesChange?.();
  }, [onFavoritesChange]);

  // Filtrar y ordenar activos
  const sortedAssets = useMemo(() => {
    let sorted = [...displayedAssets];
    
    switch (sortBy) {
      case 'predicted':
        // Predicciones primero
        sorted.sort((a, b) => {
          const aHasPred = predictedSymbols.has(a.symbol) ? 1 : 0;
          const bHasPred = predictedSymbols.has(b.symbol) ? 1 : 0;
          if (aHasPred !== bHasPred) return bHasPred - aHasPred;
          return (b.changePercent ?? -999) - (a.changePercent ?? -999);
        });
        break;
      case 'gainers':
        sorted.sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
        break;
      case 'losers':
        sorted.sort((a, b) => (a.changePercent ?? 999) - (b.changePercent ?? 999));
        break;
      case 'popular':
        sorted.sort((a, b) => {
          if (a.price && !b.price) return -1;
          if (!a.price && b.price) return 1;
          return 0;
        });
        break;
      case 'bullish':
        sorted = sorted.filter(a => (a.changePercent ?? 0) > 0);
        sorted.sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
        break;
    }
    
    return sorted;
  }, [displayedAssets, sortBy, predictedSymbols]);

  // Categorías disponibles
  const categories = useMemo(() => marketDataService.getCategories(), []);

  const renderAsset = ({ item }: { item: MarketAsset }) => {
    const isFavorite = favorites.has(item.symbol);
    const hasPrediction = predictedSymbols.has(item.symbol);
    
    return (
      <TouchableOpacity 
        style={styles.assetRow}
        onPress={() => router.push({ pathname: '/asset/[symbol]', params: { symbol: item.symbol } })}
        activeOpacity={0.7}
      >
        {/* Icono */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{item.icon}</Text>
          {hasPrediction && (
            <View style={styles.predictionBadge}>
              <Text style={styles.predictionBadgeText}>🎯</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <View style={styles.subInfo}>
            <Text style={styles.symbol}>{item.symbol}</Text>
            {!item.loading && !item.error && item.price !== undefined && (
              <Text style={styles.priceInline}>
                {formatPrice(item.price, item.currency)}
              </Text>
            )}
          </View>
        </View>

        {/* Cambio % */}
        <View style={styles.priceContainer}>
          {item.loading ? (
            <ActivityIndicator size="small" color="#6b7280" />
          ) : item.error ? (
            <Text style={styles.errorText}>-</Text>
          ) : (
            <View style={[
              styles.changeBadge,
              { backgroundColor: getChangeColor(item.changePercent) + '20' }
            ]}>
              <Text style={[styles.changeText, { color: getChangeColor(item.changePercent) }]}>
                {formatChange(item.changePercent)}
              </Text>
            </View>
          )}
        </View>

        {/* Favorito */}
        <TouchableOpacity 
          style={styles.favoriteButton}
          onPress={() => toggleFavorite(item.symbol)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons 
            name={isFavorite ? 'heart' : 'heart-outline'} 
            size={22} 
            color={isFavorite ? '#ef4444' : '#6b7280'} 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      {/* Categorías horizontales */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={styles.categoryIcon}>🌐</Text>
          <Text style={[styles.categoryLabel, !selectedCategory && styles.categoryLabelActive]}>
            Todos
          </Text>
        </TouchableOpacity>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.category}
            style={[styles.categoryChip, selectedCategory === cat.category && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(cat.category)}
          >
            <Text style={styles.categoryIcon}>{cat.icon}</Text>
            <Text style={[
              styles.categoryLabel, 
              selectedCategory === cat.category && styles.categoryLabelActive
            ]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Ordenación */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.sortContainer}
        contentContainerStyle={styles.sortContent}
      >
        {SORT_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[styles.sortChip, sortBy === option.key && styles.sortChipActive]}
            onPress={() => setSortBy(option.key)}
          >
            <Text style={styles.sortIcon}>{option.icon}</Text>
            <Text style={[styles.sortLabel, sortBy === option.key && styles.sortLabelActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {/* Info */}
      <View style={styles.infoBar}>
        <Text style={styles.resultCount}>
          {sortedAssets.length} activos
        </Text>
        {lastUpdate && (
          <Text style={styles.lastUpdate}>
            {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color="#6366f1" />
        <Text style={styles.loadingText}>Cargando más...</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.emptyText}>Cargando activos...</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔍</Text>
        <Text style={styles.emptyText}>No se encontraron activos</Text>
        <Text style={styles.emptySubtext}>Prueba con otro término de búsqueda</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDesktop && { paddingHorizontal: horizontalPadding }]}>
      {/* Barra de búsqueda FUERA del FlatList para mantener foco */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar activo..."
          placeholderTextColor="#6b7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={sortedAssets}
        renderItem={({ item }) => (
          <View style={isDesktop && styles.assetRowDesktop}>
            {renderAsset({ item } as any)}
          </View>
        )}
        keyExtractor={(item) => item.symbol}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
          />
        }
        contentContainerStyle={[
          styles.listContent,
          isDesktop && styles.listContentDesktop
        ]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// Helpers
const USD_TO_EUR = 0.92;

function formatPrice(price?: number, currency?: string): string {
  if (price === undefined) return '-';
  
  let priceInEur = price;
  if (currency === 'USD') {
    priceInEur = price * USD_TO_EUR;
  }
  
  if (priceInEur >= 1000) {
    return `€${priceInEur.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (priceInEur >= 1) {
    return `€${priceInEur.toFixed(2)}`;
  } else {
    return `€${priceInEur.toFixed(4)}`;
  }
}

function formatChange(change?: number): string {
  if (change === undefined) return '-';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

function getChangeColor(change?: number): string {
  if (change === undefined) return '#6b7280';
  if (change > 0) return '#10b981';
  if (change < 0) return '#ef4444';
  return '#6b7280';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  listContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  listContentDesktop: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  assetRowDesktop: {
    paddingHorizontal: 24,
  },
  // Búsqueda
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
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
  // Categorías
  categoriesContainer: {
    marginBottom: 8,
  },
  categoriesContent: {
    paddingHorizontal: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2e2e2e',
  },
  categoryChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  categoryIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#a0a0a0',
  },
  categoryLabelActive: {
    color: '#ffffff',
  },
  // Ordenación
  sortContainer: {
    marginBottom: 8,
  },
  sortContent: {
    paddingHorizontal: 12,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginRight: 8,
  },
  sortChipActive: {
    backgroundColor: '#6366f1',
  },
  sortIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#a0a0a0',
  },
  sortLabelActive: {
    color: '#ffffff',
  },
  // Info bar
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  resultCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#6b7280',
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
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#252525',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  icon: {
    fontSize: 22,
  },
  predictionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  predictionBadgeText: {
    fontSize: 10,
  },
  infoContainer: {
    flex: 1,
    marginRight: 8,
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
  priceContainer: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
  },
  favoriteButton: {
    padding: 8,
    marginLeft: 4,
  },
  // Loading & Empty states
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
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    color: '#6b7280',
    fontSize: 13,
  },
});
