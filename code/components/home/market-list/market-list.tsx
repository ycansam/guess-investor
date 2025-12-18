/**
 * Lista de activos del mercado con precios en tiempo real
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { MarketAsset, marketDataService, POPULAR_ASSETS } from '../../../services/market-data-service';

type SortType = 'gainers' | 'losers' | 'popular' | 'bullish';
type FilterType = 'all' | 'intraday' | 'swing' | 'longterm';

const SORT_OPTIONS: { key: SortType; label: string; icon: string }[] = [
  { key: 'gainers', label: 'Subidas', icon: '📈' },
  { key: 'losers', label: 'Bajadas', icon: '📉' },
  { key: 'popular', label: 'Popular', icon: '🔥' },
  { key: 'bullish', label: 'Alcistas', icon: '🐂' },
];

const FILTER_OPTIONS: { key: FilterType; label: string; description: string }[] = [
  { key: 'all', label: 'Todos', description: 'Todos los activos' },
  { key: 'intraday', label: 'Intradía', description: 'Alta volatilidad' },
  { key: 'swing', label: 'Swing', description: '2-7 días' },
  { key: 'longterm', label: 'L/P', description: 'Largo plazo' },
];

// Breakpoints para responsive
const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

// Ancho máximo del contenido en desktop
const MAX_CONTENT_WIDTH = 800;

export function MarketList() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= BREAKPOINTS.desktop;
  const isWide = Platform.OS === 'web' && width >= BREAKPOINTS.wide;
  
  // Calcular padding horizontal dinámico para centrar contenido en desktop
  const horizontalPadding = useMemo(() => {
    if (!isDesktop) return 0;
    const extraPadding = Math.max(0, (width - MAX_CONTENT_WIDTH) / 2);
    return extraPadding; // Sin límite máximo para pantallas muy anchas
  }, [width, isDesktop]);

  const [assets, setAssets] = useState<MarketAsset[]>(
    POPULAR_ASSETS.map(a => ({ ...a, loading: true }))
  );
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<SortType>('gainers');
  const [filterBy, setFilterBy] = useState<FilterType>('all');

  const loadData = useCallback(async () => {
    try {
      const data = await marketDataService.getPopularAssets();
      setAssets(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('[MarketList] Error loading data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
    
    // Refrescar cada 15 minutos
    const interval = setInterval(loadData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    marketDataService.clearCache();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Filtrar y ordenar activos
  const sortedAndFilteredAssets = useMemo(() => {
    let filtered = [...assets];
    
    // Aplicar filtro
    switch (filterBy) {
      case 'intraday':
        // Activos con alta volatilidad (crypto y tech volátiles)
        filtered = filtered.filter(a => 
          a.type === 'crypto' || 
          ['TSLA', 'NVDA', 'AMD', 'META'].includes(a.symbol)
        );
        break;
      case 'swing':
        // Buenos para swing trading (tech y ETFs)
        filtered = filtered.filter(a => 
          a.type === 'stock' || a.type === 'etf'
        );
        break;
      case 'longterm':
        // Largo plazo (grandes empresas estables y ETFs)
        filtered = filtered.filter(a => 
          a.type === 'etf' || 
          ['AAPL', 'MSFT', 'GOOGL', 'AMZN'].includes(a.symbol) ||
          a.symbol.endsWith('.MC')
        );
        break;
    }
    
    // Aplicar ordenación
    switch (sortBy) {
      case 'gainers':
        filtered.sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
        break;
      case 'losers':
        filtered.sort((a, b) => (a.changePercent ?? 999) - (b.changePercent ?? 999));
        break;
      case 'popular':
        // Ordenar por "popularidad" (orden original que es por relevancia)
        // Mantener orden pero priorizar los que tienen datos
        filtered.sort((a, b) => {
          if (a.price && !b.price) return -1;
          if (!a.price && b.price) return 1;
          return 0;
        });
        break;
      case 'bullish':
        // Tendencia alcista: mayor % subida con datos disponibles
        filtered = filtered.filter(a => (a.changePercent ?? 0) > 0);
        filtered.sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
        break;
    }
    
    return filtered;
  }, [assets, sortBy, filterBy]);

  const renderAsset = ({ item }: { item: MarketAsset }) => (
    <View style={styles.assetRow}>
      {/* Icono */}
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{item.icon}</Text>
      </View>

      {/* Nombre, símbolo y precio */}
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

      {/* Cambio porcentual */}
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
            <Text style={[
              styles.changeText,
              { color: getChangeColor(item.changePercent) }
            ]}>
              {formatChange(item.changePercent)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderHeader = () => (
    <View>
      {/* Título y hora */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Mercado</Text>
        {lastUpdate && (
          <Text style={styles.lastUpdate}>
            {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
      
      {/* Selector de ordenación */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.sortContainer}
        contentContainerStyle={styles.sortContent}
      >
        {SORT_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.sortChip,
              sortBy === option.key && styles.sortChipActive
            ]}
            onPress={() => setSortBy(option.key)}
          >
            <Text style={styles.sortIcon}>{option.icon}</Text>
            <Text style={[
              styles.sortLabel,
              sortBy === option.key && styles.sortLabelActive
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {/* Filtros de timeframe */}
      <View style={styles.filterContainer}>
        {FILTER_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.filterChip,
              filterBy === option.key && styles.filterChipActive
            ]}
            onPress={() => setFilterBy(option.key)}
          >
            <Text style={[
              styles.filterLabel,
              filterBy === option.key && styles.filterLabelActive
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Contador de resultados */}
      <Text style={styles.resultCount}>
        {sortedAndFilteredAssets.length} activos
      </Text>
    </View>
  );

  return (
    <View style={[
      styles.container,
      isDesktop && { paddingHorizontal: horizontalPadding }
    ]}>
      <FlatList
        data={sortedAndFilteredAssets}
        renderItem={({ item }) => (
          <View style={isDesktop && styles.assetRowDesktop}>
            {renderAsset({ item } as any)}
          </View>
        )}
        keyExtractor={(item) => item.symbol}
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
          isDesktop && styles.listContentDesktop
        ]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// Helpers
// Tipo de cambio USD/EUR aproximado (se podría obtener dinámicamente)
const USD_TO_EUR = 0.92;

function formatPrice(price?: number, currency?: string): string {
  if (price === undefined) return '-';
  
  // Convertir a EUR si es USD
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
    backgroundColor: '#ffffff',
  },
  listContent: {
    paddingBottom: 20,
  },
  listContentDesktop: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  assetRowDesktop: {
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    // En web desktop se aplicará padding extra desde el container
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  // Selector de ordenación
  sortContainer: {
    marginBottom: 8,
  },
  sortContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    marginRight: 8,
  },
  sortChipActive: {
    backgroundColor: '#3b82f6',
  },
  sortIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  sortLabelActive: {
    color: '#ffffff',
  },
  // Filtros de timeframe
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  filterLabelActive: {
    color: '#ffffff',
  },
  resultCount: {
    fontSize: 12,
    color: '#9ca3af',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  symbol: {
    fontSize: 13,
    color: '#6b7280',
  },
  priceInline: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  priceContainer: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
  },
});
