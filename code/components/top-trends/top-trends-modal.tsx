import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import theme from '../../config/theme';
import { apiClient, TrendCategory, TrendRanking } from '../../services/api-client';

interface TopTrendsModalProps {
  visible: boolean;
  onClose: () => void;
}

const CATEGORIES: { key: TrendCategory; label: string; icon: string }[] = [
  { key: 'gainers', label: '🚀 Subiendo', icon: 'trending-up' },
  { key: 'losers', label: '📉 Bajando', icon: 'trending-down' },
  { key: 'streaks', label: '🔥 Rachas', icon: 'flame' },
  { key: 'momentum', label: '⚡ Momentum', icon: 'flash' },
  { key: 'all', label: '🌐 Todos', icon: 'globe' },
];

export function TopTrendsModal({ visible, onClose }: TopTrendsModalProps) {
  const router = useRouter();
  const [category, setCategory] = useState<TrendCategory>('gainers');
  const [trends, setTrends] = useState<TrendRanking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrends = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await apiClient.getTopTrends(category, 25);
      setTrends(response.trends);
    } catch (err) {
      console.error('[TopTrends] Error:', err);
      setError('No se pudieron cargar las tendencias');
    }

    setLoading(false);
    setRefreshing(false);
  }, [category]);

  useEffect(() => {
    if (visible) {
      loadTrends();
    }
  }, [visible, category, loadTrends]);

  const handleAssetPress = (symbol: string) => {
    onClose();
    router.push(`/asset/${encodeURIComponent(symbol)}`);
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up':
        return { name: 'arrow-up' as const, color: theme.colors.success };
      case 'down':
        return { name: 'arrow-down' as const, color: theme.colors.danger };
      default:
        return { name: 'remove' as const, color: theme.colors.textSecondary };
    }
  };

  const getMomentumColor = (signal: string) => {
    switch (signal) {
      case 'bullish':
        return theme.colors.success;
      case 'bearish':
        return theme.colors.danger;
      default:
        return theme.colors.textSecondary;
    }
  };

  const formatChange = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const renderTrendCard = (trend: TrendRanking, index: number) => {
    const dirIcon = getDirectionIcon(trend.streak.direction);
    const isPositive = trend.trendScore > 0;

    return (
      <TouchableOpacity
        key={trend.symbol}
        style={styles.trendCard}
        onPress={() => handleAssetPress(trend.symbol)}
        activeOpacity={0.7}
      >
        {/* Ranking number */}
        <View style={[styles.rankBadge, isPositive ? styles.rankBadgeUp : styles.rankBadgeDown]}>
          <Text style={styles.rankNumber}>#{index + 1}</Text>
        </View>

        {/* Main info */}
        <View style={styles.trendInfo}>
          <View style={styles.trendHeader}>
            <Text style={styles.trendSymbol}>{trend.symbol}</Text>
            <View style={styles.streakBadge}>
              <Ionicons name={dirIcon.name} size={12} color={dirIcon.color} />
              <Text style={[styles.streakText, { color: dirIcon.color }]}>
                {trend.streak.days}d
              </Text>
            </View>
          </View>
          <Text style={styles.trendName} numberOfLines={1}>
            {trend.name}
          </Text>
          <View style={styles.trendMeta}>
            <Text style={[styles.momentum, { color: getMomentumColor(trend.momentum.signal) }]}>
              {trend.momentum.signal === 'bullish' ? '↑ Alcista' : 
               trend.momentum.signal === 'bearish' ? '↓ Bajista' : '→ Neutral'}
            </Text>
            {trend.trendPrediction !== 'uncertain' && (
              <Text style={styles.prediction}>
                {trend.trendPrediction === 'continue' ? '→ Continúa' : '↺ Cambio'}
              </Text>
            )}
          </View>
        </View>

        {/* Changes */}
        <View style={styles.changesColumn}>
          <View style={styles.changeRow}>
            <Text style={styles.changeLabel}>24h</Text>
            <Text style={[
              styles.changeValue,
              { color: trend.change24h >= 0 ? theme.colors.success : theme.colors.danger }
            ]}>
              {formatChange(trend.change24h)}
            </Text>
          </View>
          <View style={styles.changeRow}>
            <Text style={styles.changeLabel}>7d</Text>
            <Text style={[
              styles.changeValue,
              { color: trend.change7d >= 0 ? theme.colors.success : theme.colors.danger }
            ]}>
              {formatChange(trend.change7d)}
            </Text>
          </View>
          <View style={styles.changeRow}>
            <Text style={styles.changeLabel}>30d</Text>
            <Text style={[
              styles.changeValue,
              { color: trend.change30d >= 0 ? theme.colors.success : theme.colors.danger }
            ]}>
              {formatChange(trend.change30d)}
            </Text>
          </View>
        </View>

        {/* Arrow */}
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>🔥 Top Tendencias</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryContainer}
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryButton,
                  category === cat.key && styles.categoryButtonActive,
                ]}
                onPress={() => setCategory(cat.key)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === cat.key && styles.categoryTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Escaneando mercados...</Text>
              <Text style={styles.loadingSubtext}>Esto puede tardar unos segundos</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color={theme.colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadTrends()}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => loadTrends(true)}
                  tintColor={theme.colors.primary}
                />
              }
            >
              <Text style={styles.subtitle}>
                {category === 'gainers' && 'Activos con mejor tendencia alcista'}
                {category === 'losers' && 'Activos con tendencia bajista'}
                {category === 'streaks' && 'Activos con las rachas más largas'}
                {category === 'momentum' && 'Activos con mayor momentum'}
                {category === 'all' && 'Todos los activos ordenados por fuerza de tendencia'}
              </Text>

              {trends.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search" size={48} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyText}>No hay activos en esta categoría</Text>
                </View>
              ) : (
                trends.map((trend, index) => renderTrendCard(trend, index))
              )}

              <View style={styles.bottomSpacer} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    marginTop: 50,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  closeButton: {
    padding: 4,
  },
  categoryScroll: {
    maxHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  categoryTextActive: {
    color: theme.colors.text,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.text,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.danger,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
  },
  retryText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  trendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankBadgeUp: {
    backgroundColor: theme.colors.successLight,
  },
  rankBadgeDown: {
    backgroundColor: theme.colors.dangerLight,
  },
  rankNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  trendInfo: {
    flex: 1,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trendSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '600',
  },
  trendName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
    maxWidth: 140,
  },
  trendMeta: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  momentum: {
    fontSize: 11,
    fontWeight: '600',
  },
  prediction: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  changesColumn: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
  changeValue: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 52,
    textAlign: 'right',
  },
  bottomSpacer: {
    height: 40,
  },
});
