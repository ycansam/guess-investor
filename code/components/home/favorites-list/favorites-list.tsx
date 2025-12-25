/**
 * Lista de activos favoritos del usuario
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { favoritesService } from '../../../services/favorites-service';
import { ALL_ASSETS, MarketAsset, marketDataService } from '../../../services/market-data-service';
import { trainingCacheService } from '../../../services/training-cache-service';

const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

const MAX_CONTENT_WIDTH = 800;
const USD_TO_EUR = 0.92;

interface FavoritesListProps {
  onFavoritesChange?: () => void;
}

export function FavoritesList({ onFavoritesChange }: FavoritesListProps) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isDesktop = Platform.OS === 'web' && width >= BREAKPOINTS.desktop;
  
  const horizontalPadding = useMemo(() => {
    if (!isDesktop) return 0;
    return Math.max(0, (width - MAX_CONTENT_WIDTH) / 2);
  }, [width, isDesktop]);

  const [favorites, setFavorites] = useState<MarketAsset[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [predictedSymbols, setPredictedSymbols] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      await favoritesService.init();
      const favoriteSymbols = favoritesService.getAll();
      
      // Obtener predicciones
      await trainingCacheService.init();
      const predictions = trainingCacheService.getAllActive();
      const predSymbols = new Set(predictions.map(p => p.symbol));
      setPredictedSymbols(predSymbols);
      
      if (favoriteSymbols.length === 0) {
        setFavorites([]);
        setLoading(false);
        return;
      }
      
      // Obtener activos favoritos con precios
      const favoriteAssets = favoriteSymbols
        .map(symbol => ALL_ASSETS.find(a => a.symbol === symbol))
        .filter((a): a is MarketAsset => a !== undefined);
      
      // Ordenar: predicciones primero
      favoriteAssets.sort((a, b) => {
        const aHasPred = predSymbols.has(a.symbol) ? 1 : 0;
        const bHasPred = predSymbols.has(b.symbol) ? 1 : 0;
        return bHasPred - aHasPred;
      });
      
      // Obtener precios
      const assetsWithPrices = await Promise.all(
        favoriteAssets.map(async (asset) => {
          try {
            const data = await marketDataService.getQuoteLite(asset.symbol);
            if (data) {
              return {
                ...asset,
                price: data.regularMarketPrice,
                change: data.priceChange,
                changePercent: data.priceChangePercent,
                currency: data.currency,
              };
            }
          } catch (error) {
            // Silenciar
          }
          return { ...asset, error: true };
        })
      );
      
      setFavorites(assetsWithPrices);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    marketDataService.clearCache();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const removeFavorite = useCallback(async (symbol: string) => {
    await favoritesService.remove(symbol);
    setFavorites(prev => prev.filter(a => a.symbol !== symbol));
    onFavoritesChange?.();
  }, [onFavoritesChange]);

  const renderAsset = ({ item }: { item: MarketAsset }) => {
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

        {/* Eliminar */}
        <TouchableOpacity 
          style={styles.removeButton}
          onPress={() => removeFavorite(item.symbol)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="heart" size={22} color="#ef4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>❤️ Mis Favoritos</Text>
        {lastUpdate && (
          <Text style={styles.lastUpdate}>
            {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
      <Text style={styles.headerSubtitle}>
        {favorites.length} activo{favorites.length !== 1 ? 's' : ''} guardado{favorites.length !== 1 ? 's' : ''}
      </Text>
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.emptyText}>Cargando favoritos...</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>❤️</Text>
        <Text style={styles.emptyText}>No tienes favoritos</Text>
        <Text style={styles.emptySubtext}>
          Explora activos y toca el ❤️ para añadirlos aquí
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, isDesktop && { paddingHorizontal: horizontalPadding }]}>
      <FlatList
        data={favorites}
        renderItem={({ item }) => (
          <View style={isDesktop && styles.assetRowDesktop}>
            {renderAsset({ item } as any)}
          </View>
        )}
        keyExtractor={(item) => item.symbol}
        ListHeaderComponent={favorites.length > 0 ? renderHeader : null}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ef4444"
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#6b7280',
  },
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
  removeButton: {
    padding: 8,
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
