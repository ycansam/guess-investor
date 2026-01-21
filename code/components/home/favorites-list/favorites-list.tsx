/**
 * Lista de activos favoritos del usuario
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { currencyService } from '../../../services/currency-service';
import { favoritesService } from '../../../services/favorites-service-v2';
import { ALL_ASSETS, MarketAsset, marketDataService } from '../../../services/market-data-service';
import { TIMEFRAME_INFO, trainingCacheService, TrainingPrediction } from '../../../services/training-cache-service';

const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

const MAX_CONTENT_WIDTH = 800;

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
  const [predictions, setPredictions] = useState<TrainingPrediction[]>([]);
  const [tooltipData, setTooltipData] = useState<{ symbol: string; name: string; predictions: TrainingPrediction[] } | null>(null);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      await favoritesService.init();
      const favoriteSymbols = favoritesService.getAll();
      
      // Obtener predicciones
      await trainingCacheService.init();
      const allPredictions = await trainingCacheService.getAllActive();
      const predSymbols = new Set(allPredictions.map(p => p.symbol));
      console.log('[FavoritesList] Predicciones activas:', allPredictions.length, 'Símbolos:', [...predSymbols]);
      setPredictedSymbols(predSymbols);
      setPredictions(allPredictions);
      
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
                price: data.price,
                change: data.change,
                changePercent: data.changePercent,
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

  // Obtener predicciones para un símbolo
  const getPredictionsForSymbol = useCallback((symbol: string): TrainingPrediction[] => {
    return predictions.filter(p => p.symbol === symbol);
  }, [predictions]);

  const renderAsset = ({ item }: { item: MarketAsset }) => {
    const symbolPredictions = getPredictionsForSymbol(item.symbol);
    const hasPrediction = symbolPredictions.length > 0;
    
    return (
      <TouchableOpacity 
        style={styles.assetRow}
        onPress={() => router.push({ pathname: '/asset/[symbol]', params: { symbol: item.symbol } })}
        activeOpacity={0.7}
      >
        {/* Icono */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{item.icon}</Text>
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

        {/* Cambio diario + Predicción (horizontal) */}
        <View style={styles.actionContainer}>
          {item.loading ? (
            <ActivityIndicator size="small" color="#6b7280" />
          ) : item.error ? (
            <Text style={styles.errorText}>-</Text>
          ) : (
            <View style={styles.actionsRow}>
              {/* Cambio diario */}
              <View style={styles.dailyChangeBox}>
                <Text style={[styles.changeText, { color: getChangeColor(item.changePercent) }]}>
                  {formatChange(item.changePercent)}
                </Text>
                <Text style={styles.dailyLabel}>hoy</Text>
              </View>
              
              {/* Predicciones (badge compacto + tooltip hover) */}
              {hasPrediction && (
                <View 
                  style={styles.predictionsWrapper}
                  // @ts-ignore - Web only props
                  onMouseEnter={() => Platform.OS === 'web' && setHoveredSymbol(item.symbol)}
                  onMouseLeave={() => Platform.OS === 'web' && setHoveredSymbol(null)}
                >
                  <TouchableOpacity 
                    style={styles.predictionsButton}
                    onPress={() => Platform.OS !== 'web' && setTooltipData({ 
                      symbol: item.symbol, 
                      name: item.name, 
                      predictions: symbolPredictions 
                    })}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.predictionBadgeCompact,
                      { backgroundColor: symbolPredictions[0].direction === 'up' ? '#10b98120' : '#ef444420' }
                    ]}>
                      <Text style={styles.predictionIconSmall}>
                        {symbolPredictions[0].direction === 'up' ? '📈' : '📉'}
                      </Text>
                      <Text style={[styles.predictionTextSmall, { color: symbolPredictions[0].direction === 'up' ? '#10b981' : '#ef4444' }]}>
                        {(symbolPredictions[0].predictedChange ?? 0) >= 0 ? '+' : ''}{(symbolPredictions[0].predictedChange ?? 0).toFixed(1)}%
                      </Text>
                      {symbolPredictions.length > 1 && (
                        <View style={styles.moreCountBadge}>
                          <Text style={styles.moreCountText}>+{symbolPredictions.length - 1}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  
                  {/* Hover tooltip (web only) */}
                  {Platform.OS === 'web' && hoveredSymbol === item.symbol && (
                    <View style={styles.hoverTooltip}>
                      <View style={styles.hoverTooltipArrow} />
                      <Text style={styles.hoverTooltipTitle}>🎯 {item.name}</Text>
                      {symbolPredictions.map((pred, idx) => (
                        <View key={idx} style={styles.hoverPredictionRow}>
                          <Text style={[
                            styles.hoverPredictionIcon,
                            { color: pred.direction === 'up' ? '#10b981' : '#ef4444' }
                          ]}>
                            {pred.direction === 'up' ? '📈' : '📉'}
                          </Text>
                          <Text style={[
                            styles.hoverPredictionChange,
                            { color: pred.direction === 'up' ? '#10b981' : '#ef4444' }
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
      {/* Modal Tooltip de Predicciones */}
      <Modal
        visible={tooltipData !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipData(null)}
      >
        <TouchableOpacity 
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setTooltipData(null)}
        >
          <View style={styles.tooltipContainer}>
            <View style={styles.tooltipHeader}>
              <Text style={styles.tooltipTitle}>🎯 Predicciones</Text>
              <Text style={styles.tooltipSymbol}>{tooltipData?.name}</Text>
            </View>
            
            <View style={styles.tooltipContent}>
              {tooltipData?.predictions.map((pred, idx) => (
                <View key={idx} style={styles.tooltipPredictionRow}>
                  <View style={[
                    styles.tooltipPredictionBadge,
                    { backgroundColor: pred.direction === 'up' ? '#10b981' : '#ef4444' }
                  ]}>
                    <Text style={styles.tooltipPredictionIcon}>
                      {pred.direction === 'up' ? '📈' : '📉'}
                    </Text>
                    <Text style={styles.tooltipPredictionChange}>
                      {(pred.predictedChange ?? 0) >= 0 ? '+' : ''}{(pred.predictedChange ?? 0).toFixed(2)}%
                    </Text>
                  </View>
                  
                  <View style={styles.tooltipPredictionInfo}>
                    <Text style={styles.tooltipTimeframe}>
                      {TIMEFRAME_INFO[pred.timeframe]?.label || pred.timeframe}
                    </Text>
                    <Text style={styles.tooltipDuration}>
                      {TIMEFRAME_INFO[pred.timeframe]?.duration || ''}
                    </Text>
                  </View>
                  
                  {pred.confidence !== undefined && (
                    <View style={styles.tooltipConfidence}>
                      <Text style={styles.tooltipConfidenceText}>{pred.confidence}%</Text>
                      <Text style={styles.tooltipConfidenceLabel}>conf</Text>
                    </View>
                  )}
                  
                  {pred.targetPrice !== undefined && (
                    <Text style={styles.tooltipTarget}>
                      → {formatPrice(pred.targetPrice, pred.currency || 'EUR')}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            
            <TouchableOpacity 
              style={styles.tooltipCloseButton}
              onPress={() => setTooltipData(null)}
            >
              <Text style={styles.tooltipCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
  
  // Convertir a EUR usando el servicio de moneda
  const priceInEur = currencyService.convertToEURSync(price, currency || 'EUR');
  
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
  actionContainer: {
    alignItems: 'flex-end',
    minWidth: 100,
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dailyChangeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dailyLabel: {
    fontSize: 9,
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
  predictionIconSmall: {
    fontSize: 11,
  },
  predictionTextSmall: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeframeLabelSmall: {
    fontSize: 9,
    color: '#6b7280',
  },
  // Predictions wrapper y hover tooltip
  predictionsWrapper: {
    position: 'relative',
    marginLeft: 4,
  },
  predictionsButton: {
  },
  predictionBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  moreCountBadge: {
    backgroundColor: '#ffffff20',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 2,
  },
  moreCountText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Hover Tooltip (web only)
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
  // Modal Tooltip (mobile)
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tooltipContainer: {
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 20,
    minWidth: 280,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#333',
  },
  tooltipHeader: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  tooltipSymbol: {
    fontSize: 14,
    color: '#9ca3af',
  },
  tooltipContent: {
    gap: 12,
  },
  tooltipPredictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  tooltipPredictionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  tooltipPredictionIcon: {
    fontSize: 14,
  },
  tooltipPredictionChange: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  tooltipPredictionInfo: {
    flex: 1,
  },
  tooltipTimeframe: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  tooltipDuration: {
    fontSize: 11,
    color: '#6b7280',
  },
  tooltipConfidence: {
    alignItems: 'center',
  },
  tooltipConfidenceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
  },
  tooltipConfidenceLabel: {
    fontSize: 9,
    color: '#6b7280',
  },
  tooltipTarget: {
    fontSize: 12,
    color: '#9ca3af',
  },
  tooltipCloseButton: {
    marginTop: 16,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tooltipCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
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
