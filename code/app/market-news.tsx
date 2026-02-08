/**
 * Market Impact News Page
 * 
 * Muestra noticias de alto impacto con activos afectados
 * dinámicamente relacionados.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { useMenu } from '../components/_shared/menu-context';
import { AffectedAsset, apiClient, MarketImpactNews, NewsCategory } from '../services/api-client';

// Colores
const COLORS = {
  background: '#0a0a1a',
  card: '#1a1a2e',
  cardLight: '#252547',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  green: '#4CAF50',
  red: '#F44336',
  orange: '#FF9800',
  blue: '#2196F3',
  purple: '#9C27B0',
  yellow: '#FFC107',
  border: '#333355',
};

// Iconos por categoría
const CATEGORY_ICONS: Record<NewsCategory, string> = {
  political: '🏛️',
  economic: '📊',
  trade: '🚢',
  regulation: '⚖️',
  geopolitical: '🌍',
  technology: '💻',
  energy: '⚡',
  healthcare: '💊',
  earnings: '📈',
  commodities: '🛢️',
  crypto: '₿',
};

// Filtros de categoría
const CATEGORY_FILTERS: { value: NewsCategory | 'all'; label: string }[] = [
  { value: 'all', label: '📰 Todas' },
  { value: 'political', label: '🏛️ Política' },
  { value: 'economic', label: '📊 Económicas' },
  { value: 'trade', label: '🚢 Comercio' },
  { value: 'geopolitical', label: '🌍 Geopolítica' },
  { value: 'energy', label: '⚡ Energía' },
];

// ============================================================================
// COMPONENTE: Asset Chip
// ============================================================================

const AssetChip = ({
  asset,
  onPress,
}: {
  asset: AffectedAsset;
  onPress: () => void;
}) => {
  const isBullish = asset.impact === 'bullish';
  const bgColor = isBullish ? COLORS.green + '20' : COLORS.red + '20';
  const textColor = isBullish ? COLORS.green : COLORS.red;
  const arrow = isBullish ? '↑' : '↓';

  return (
    <Pressable style={[styles.assetChip, { backgroundColor: bgColor }]} onPress={onPress}>
      <Text style={[styles.assetChipSymbol, { color: textColor }]}>
        {arrow} {asset.symbol}
      </Text>
      <Text style={styles.assetChipConfidence}>{asset.confidence}%</Text>
    </Pressable>
  );
};

// ============================================================================
// COMPONENTE: News Card
// ============================================================================

const NewsCard = ({
  news,
  onAssetPress,
  expanded,
  onToggleExpand,
}: {
  news: MarketImpactNews;
  onAssetPress: (symbol: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) => {
  const categoryIcon = CATEGORY_ICONS[news.category] || '📰';
  const urgencyColor = news.urgency === 'breaking' ? COLORS.red : 
                       news.urgency === 'important' ? COLORS.orange : COLORS.textSecondary;
  
  const urgencyText = news.urgency === 'breaking' ? '🔴 BREAKING' :
                      news.urgency === 'important' ? '🟠 IMPORTANTE' : '';

  const timeAgo = getTimeAgo(new Date(news.publishedAt));

  return (
    <View style={styles.newsCard}>
      {/* Header */}
      <View style={styles.newsHeader}>
        <View style={styles.newsHeaderLeft}>
          <Text style={styles.categoryIcon}>{categoryIcon}</Text>
          <Text style={styles.newsSource}>{news.source}</Text>
          <Text style={styles.newsTime}>• {timeAgo}</Text>
        </View>
        {urgencyText && (
          <Text style={[styles.urgencyBadge, { color: urgencyColor }]}>
            {urgencyText}
          </Text>
        )}
      </View>

      {/* Headline */}
      <Pressable onPress={onToggleExpand}>
        <Text style={styles.newsHeadline}>{news.headline}</Text>
      </Pressable>

      {/* Keywords */}
      <View style={styles.keywordsRow}>
        {news.detectedKeywords.slice(0, 4).map((kw, i) => (
          <View key={i} style={styles.keywordBadge}>
            <Text style={styles.keywordText}>{kw}</Text>
          </View>
        ))}
      </View>

      {/* Assets affected - siempre visible */}
      <View style={styles.assetsSection}>
        {news.bullishAssets.length > 0 && (
          <View style={styles.assetsGroup}>
            <Text style={styles.assetsGroupTitle}>📈 Beneficiados</Text>
            <View style={styles.assetsChips}>
              {news.bullishAssets.slice(0, expanded ? undefined : 3).map((asset) => (
                <AssetChip
                  key={asset.symbol}
                  asset={asset}
                  onPress={() => onAssetPress(asset.symbol)}
                />
              ))}
              {!expanded && news.bullishAssets.length > 3 && (
                <Text style={styles.moreText}>+{news.bullishAssets.length - 3} más</Text>
              )}
            </View>
          </View>
        )}

        {news.bearishAssets.length > 0 && (
          <View style={styles.assetsGroup}>
            <Text style={styles.assetsGroupTitle}>📉 Perjudicados</Text>
            <View style={styles.assetsChips}>
              {news.bearishAssets.slice(0, expanded ? undefined : 3).map((asset) => (
                <AssetChip
                  key={asset.symbol}
                  asset={asset}
                  onPress={() => onAssetPress(asset.symbol)}
                />
              ))}
              {!expanded && news.bearishAssets.length > 3 && (
                <Text style={styles.moreText}>+{news.bearishAssets.length - 3} más</Text>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expandedSection}>
          {/* Summary */}
          <Text style={styles.newsSummary}>{news.summary}</Text>

          {/* Reasoning */}
          <View style={styles.reasoningBox}>
            <Text style={styles.reasoningTitle}>💡 Por qué afecta:</Text>
            <Text style={styles.reasoningText}>{news.reasoning}</Text>
          </View>

          {/* Sectors */}
          {(news.bullishSectors.length > 0 || news.bearishSectors.length > 0) && (
            <View style={styles.sectorsSection}>
              {news.bullishSectors.length > 0 && (
                <View style={styles.sectorGroup}>
                  <Text style={styles.sectorTitle}>Sectores beneficiados:</Text>
                  <Text style={styles.sectorList}>{news.bullishSectors.join(', ')}</Text>
                </View>
              )}
              {news.bearishSectors.length > 0 && (
                <View style={styles.sectorGroup}>
                  <Text style={styles.sectorTitle}>Sectores afectados:</Text>
                  <Text style={styles.sectorList}>{news.bearishSectors.join(', ')}</Text>
                </View>
              )}
            </View>
          )}

          {/* Asset details */}
          {news.bullishAssets.length > 0 && (
            <View style={styles.assetDetails}>
              <Text style={styles.assetDetailsTitle}>Detalle de activos beneficiados:</Text>
              {news.bullishAssets.map((asset) => (
                <Pressable 
                  key={asset.symbol} 
                  style={styles.assetDetailRow}
                  onPress={() => onAssetPress(asset.symbol)}
                >
                  <View style={styles.assetDetailLeft}>
                    <Text style={[styles.assetDetailSymbol, { color: COLORS.green }]}>
                      ↑ {asset.symbol}
                    </Text>
                    <Text style={styles.assetDetailName}>{asset.name}</Text>
                  </View>
                  <Text style={styles.assetDetailReason}>{asset.reasoning}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {news.bearishAssets.length > 0 && (
            <View style={styles.assetDetails}>
              <Text style={styles.assetDetailsTitle}>Detalle de activos perjudicados:</Text>
              {news.bearishAssets.map((asset) => (
                <Pressable 
                  key={asset.symbol} 
                  style={styles.assetDetailRow}
                  onPress={() => onAssetPress(asset.symbol)}
                >
                  <View style={styles.assetDetailLeft}>
                    <Text style={[styles.assetDetailSymbol, { color: COLORS.red }]}>
                      ↓ {asset.symbol}
                    </Text>
                    <Text style={styles.assetDetailName}>{asset.name}</Text>
                  </View>
                  <Text style={styles.assetDetailReason}>{asset.reasoning}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Expand toggle */}
      <Pressable style={styles.expandToggle} onPress={onToggleExpand}>
        <Text style={styles.expandToggleText}>
          {expanded ? 'Ver menos' : 'Ver más detalles'}
        </Text>
        <Ionicons 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={16} 
          color={COLORS.blue} 
        />
      </Pressable>
    </View>
  );
};

// ============================================================================
// HELPER: Time ago
// ============================================================================

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  return `Hace ${diffDays} días`;
}

// ============================================================================
// PÁGINA PRINCIPAL
// ============================================================================

export default function MarketNewsPage() {
  const router = useRouter();
  const { openMenu } = useMenu();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [news, setNews] = useState<MarketImpactNews[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | 'all'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Cargar noticias
  const loadNews = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getMarketImpactNews();
      setNews(data);
    } catch (err: any) {
      console.error('Error loading news:', err);
      setError(err.message || 'Error cargando noticias');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadNews();
  };

  const handleAssetPress = (symbol: string) => {
    router.push(`/asset/${symbol}`);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Filtrar noticias
  const filteredNews = categoryFilter === 'all' 
    ? news 
    : news.filter((n) => n.category === categoryFilter);

  // Stats
  const stats = {
    total: filteredNews.length,
    breaking: filteredNews.filter((n) => n.urgency === 'breaking').length,
    bullishTotal: filteredNews.reduce((acc, n) => acc + n.bullishAssets.length, 0),
    bearishTotal: filteredNews.reduce((acc, n) => acc + n.bearishAssets.length, 0),
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.blue} />
          <Text style={styles.loadingText}>Analizando noticias de mercado...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.blue}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={openMenu} style={styles.menuButton}>
              <Ionicons name="menu" size={24} color={COLORS.text} />
            </Pressable>
            <Text style={styles.headerTitle}>📰 Noticias Impacto</Text>
          </View>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Descripción */}
        <Text style={styles.description}>
          Noticias que mueven el mercado con activos relacionados dinámicamente
        </Text>

        {/* Filtros de categoría */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
        >
          {CATEGORY_FILTERS.map((filter) => (
            <Pressable
              key={filter.value}
              style={[
                styles.filterButton,
                categoryFilter === filter.value && styles.filterButtonActive,
              ]}
              onPress={() => setCategoryFilter(filter.value)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  categoryFilter === filter.value && styles.filterButtonTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Noticias</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.red }]}>{stats.breaking}</Text>
            <Text style={styles.statLabel}>Breaking</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.green }]}>{stats.bullishTotal}</Text>
            <Text style={styles.statLabel}>Bullish</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.red }]}>{stats.bearishTotal}</Text>
            <Text style={styles.statLabel}>Bearish</Text>
          </View>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <Pressable style={styles.retryButton} onPress={loadNews}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {/* News list */}
        {filteredNews.length > 0 ? (
          filteredNews.map((item) => (
            <NewsCard
              key={item.id}
              news={item}
              onAssetPress={handleAssetPress}
              expanded={expandedIds.has(item.id)}
              onToggleExpand={() => toggleExpanded(item.id)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>Sin noticias</Text>
            <Text style={styles.emptyText}>
              No hay noticias de impacto para la categoría seleccionada
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  // Filters
  filtersContainer: {
    marginBottom: 12,
  },
  filtersContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  filterButton: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  filterButtonActive: {
    backgroundColor: COLORS.blue,
  },
  filterButtonText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  filterButtonTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Error
  errorContainer: {
    backgroundColor: COLORS.red + '20',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.red,
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: COLORS.red,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.text,
    fontWeight: '600',
  },

  // News Card
  newsCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  newsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  newsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryIcon: {
    fontSize: 16,
  },
  newsSource: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  newsTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  urgencyBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  newsHeadline: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 10,
  },
  keywordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  keywordBadge: {
    backgroundColor: COLORS.cardLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  keywordText: {
    fontSize: 11,
    color: COLORS.blue,
  },

  // Assets Section
  assetsSection: {
    gap: 12,
  },
  assetsGroup: {},
  assetsGroupTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  assetsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  assetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  assetChipSymbol: {
    fontSize: 13,
    fontWeight: '600',
  },
  assetChipConfidence: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  moreText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Expanded Section
  expandedSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  newsSummary: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  reasoningBox: {
    backgroundColor: COLORS.cardLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  reasoningTitle: {
    fontSize: 12,
    color: COLORS.yellow,
    fontWeight: '600',
    marginBottom: 6,
  },
  reasoningText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  sectorsSection: {
    marginBottom: 12,
  },
  sectorGroup: {
    marginBottom: 6,
  },
  sectorTitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  sectorList: {
    fontSize: 12,
    color: COLORS.text,
  },
  assetDetails: {
    marginTop: 8,
  },
  assetDetailsTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  assetDetailRow: {
    backgroundColor: COLORS.cardLight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  assetDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  assetDetailSymbol: {
    fontSize: 14,
    fontWeight: '700',
  },
  assetDetailName: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  assetDetailReason: {
    fontSize: 12,
    color: COLORS.text,
  },

  // Expand Toggle
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    gap: 4,
  },
  expandToggleText: {
    fontSize: 13,
    color: COLORS.blue,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
