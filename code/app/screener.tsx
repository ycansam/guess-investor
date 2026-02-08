/**
 * Screener Screen
 * 
 * Filtrar predicciones por criterios:
 * - Dirección (alcista/bajista)
 * - Confianza mínima
 * - Timeframe
 * - Tipo de activo
 * - Cambio del día
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { apiClient } from '../services/api-client';
import { trainingCacheService, TrainingPrediction, TrainingTimeframe } from '../services/training-cache-service';

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

// Tipos de filtro
interface ScreenerFilters {
  direction: 'all' | 'up' | 'down';
  minConfidence: number;
  timeframe: TrainingTimeframe | 'all';
  assetType: 'all' | 'stock' | 'crypto' | 'etf' | 'commodity';
  minChange: number | null;
  maxChange: number | null;
  sortBy: 'confidence' | 'change' | 'predicted_change' | 'symbol';
  sortOrder: 'asc' | 'desc';
}

// Presets de filtros
const FILTER_PRESETS = [
  {
    id: 'bullish_high',
    name: '🚀 Alcistas >70%',
    emoji: '🚀',
    filters: { direction: 'up' as const, minConfidence: 70 },
  },
  {
    id: 'bearish_high',
    name: '📉 Bajistas >70%',
    emoji: '📉',
    filters: { direction: 'down' as const, minConfidence: 70 },
  },
  {
    id: 'very_confident',
    name: '💎 Muy confiables >80%',
    emoji: '💎',
    filters: { direction: 'all' as const, minConfidence: 80 },
  },
  {
    id: 'intraday_up',
    name: '⚡ Intraday alcistas',
    emoji: '⚡',
    filters: { direction: 'up' as const, timeframe: 'intraday' as TrainingTimeframe },
  },
  {
    id: 'swing_opportunities',
    name: '🎯 Swing >60%',
    emoji: '🎯',
    filters: { direction: 'all' as const, minConfidence: 60, timeframe: 'swing' as TrainingTimeframe },
  },
  {
    id: 'crypto_bullish',
    name: '₿ Crypto alcistas',
    emoji: '₿',
    filters: { direction: 'up' as const, assetType: 'crypto' as const },
  },
];

// Formato de porcentaje
const formatPercent = (value: number, showSign = true): string => {
  const sign = showSign && value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

// ============================================================================
// COMPONENTE: Selector de Filtro
// ============================================================================

const FilterSelector = <T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <View style={styles.filterGroup}>
    <Text style={styles.filterLabel}>{label}</Text>
    <View style={styles.filterOptions}>
      {options.map((option) => (
        <Pressable
          key={String(option.value)}
          style={[
            styles.filterOption,
            value === option.value && styles.filterOptionActive,
          ]}
          onPress={() => onChange(option.value)}
        >
          <Text
            style={[
              styles.filterOptionText,
              value === option.value && styles.filterOptionTextActive,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
);

// ============================================================================
// COMPONENTE: Tarjeta de Predicción
// ============================================================================

const PredictionCard = ({
  prediction,
  onPress,
}: {
  prediction: TrainingPrediction & { currentPrice?: number; dayChange?: number };
  onPress: () => void;
}) => {
  const isUp = prediction.direction === 'up';
  const directionColor = isUp ? COLORS.green : COLORS.red;

  return (
    <Pressable style={styles.predictionCard} onPress={onPress}>
      <View style={styles.predictionHeader}>
        <View style={styles.predictionLeft}>
          <Text style={styles.predictionSymbol}>{prediction.symbol}</Text>
          <View style={[styles.directionBadge, { backgroundColor: directionColor + '33' }]}>
            <Text style={[styles.directionText, { color: directionColor }]}>
              {isUp ? '📈 ALCISTA' : '📉 BAJISTA'}
            </Text>
          </View>
        </View>
        <View style={styles.predictionRight}>
          <Text style={styles.confidenceValue}>{prediction.confidence.toFixed(0)}%</Text>
          <Text style={styles.confidenceLabel}>confianza</Text>
        </View>
      </View>

      <View style={styles.predictionDetails}>
        <View style={styles.predictionDetail}>
          <Text style={styles.detailLabel}>Predicción</Text>
          <Text style={[styles.detailValue, { color: directionColor }]}>
            {formatPercent(prediction.predictedChange)}
          </Text>
        </View>
        <View style={styles.predictionDetail}>
          <Text style={styles.detailLabel}>Timeframe</Text>
          <Text style={styles.detailValue}>
            {prediction.timeframe === 'intraday' ? '📊 Intraday' : 
             prediction.timeframe === 'swing' ? '📈 Swing' : '🎯 Long Term'}
          </Text>
        </View>
        {prediction.currentPrice && (
          <View style={styles.predictionDetail}>
            <Text style={styles.detailLabel}>Precio</Text>
            <Text style={styles.detailValue}>
              ${prediction.currentPrice.toFixed(2)}
            </Text>
          </View>
        )}
        {prediction.dayChange !== undefined && (
          <View style={styles.predictionDetail}>
            <Text style={styles.detailLabel}>Hoy</Text>
            <Text style={[
              styles.detailValue,
              { color: prediction.dayChange >= 0 ? COLORS.green : COLORS.red }
            ]}>
              {formatPercent(prediction.dayChange)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.predictionFooter}>
        <Text style={styles.targetPrice}>
          🎯 Target: ${prediction.targetPrice.toFixed(2)}
        </Text>
        <Text style={styles.predictionDate}>
          {new Date(prediction.createdAt).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </Pressable>
  );
};

// ============================================================================
// PANTALLA PRINCIPAL
// ============================================================================

export default function ScreenerScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [predictions, setPredictions] = useState<(TrainingPrediction & { currentPrice?: number; dayChange?: number })[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Filtros
  const [filters, setFilters] = useState<ScreenerFilters>({
    direction: 'all',
    minConfidence: 0,
    timeframe: 'all',
    assetType: 'all',
    minChange: null,
    maxChange: null,
    sortBy: 'confidence',
    sortOrder: 'desc',
  });

  // Cargar predicciones
  const loadPredictions = useCallback(async () => {
    try {
      await trainingCacheService.init();
      const activePredictions = await trainingCacheService.getAllActive();

      // Obtener precios actuales para cada predicción
      const predictionsWithPrices = await Promise.all(
        activePredictions.map(async (pred) => {
          try {
            const quote = await apiClient.getQuote(pred.symbol);
            return {
              ...pred,
              currentPrice: quote?.price,
              dayChange: quote?.changePercent,
            };
          } catch {
            return pred;
          }
        })
      );

      setPredictions(predictionsWithPrices);
    } catch (error) {
      console.error('Error loading predictions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPredictions();
  };

  // Aplicar filtros
  const filteredPredictions = useMemo(() => {
    let result = [...predictions];

    // Filtrar por dirección
    if (filters.direction !== 'all') {
      result = result.filter((p) => p.direction === filters.direction);
    }

    // Filtrar por confianza mínima
    if (filters.minConfidence > 0) {
      result = result.filter((p) => p.confidence >= filters.minConfidence);
    }

    // Filtrar por timeframe
    if (filters.timeframe !== 'all') {
      result = result.filter((p) => p.timeframe === filters.timeframe);
    }

    // Filtrar por tipo de activo
    if (filters.assetType !== 'all') {
      result = result.filter((p) => {
        const symbol = p.symbol.toUpperCase();
        switch (filters.assetType) {
          case 'crypto':
            return symbol.includes('-USD') || symbol.includes('-EUR') || symbol.includes('BTC') || symbol.includes('ETH');
          case 'etf':
            return symbol.includes('.') || ['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI'].includes(symbol);
          case 'commodity':
            return symbol.includes('=F') || ['GC=F', 'SI=F', 'CL=F', 'NG=F'].includes(symbol);
          default:
            return true;
        }
      });
    }

    // Filtrar por cambio del día
    if (filters.minChange !== null) {
      result = result.filter((p) => (p.dayChange ?? 0) >= filters.minChange!);
    }
    if (filters.maxChange !== null) {
      result = result.filter((p) => (p.dayChange ?? 0) <= filters.maxChange!);
    }

    // Ordenar
    result.sort((a, b) => {
      let comparison = 0;
      switch (filters.sortBy) {
        case 'confidence':
          comparison = a.confidence - b.confidence;
          break;
        case 'change':
          comparison = (a.dayChange ?? 0) - (b.dayChange ?? 0);
          break;
        case 'predicted_change':
          comparison = Math.abs(a.predictedChange) - Math.abs(b.predictedChange);
          break;
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
      }
      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [predictions, filters]);

  // Aplicar preset
  const applyPreset = (preset: typeof FILTER_PRESETS[0]) => {
    setFilters({
      ...filters,
      direction: preset.filters.direction || 'all',
      minConfidence: preset.filters.minConfidence || 0,
      timeframe: preset.filters.timeframe || 'all',
      assetType: preset.filters.assetType || 'all',
    });
  };

  // Resetear filtros
  const resetFilters = () => {
    setFilters({
      direction: 'all',
      minConfidence: 0,
      timeframe: 'all',
      assetType: 'all',
      minChange: null,
      maxChange: null,
      sortBy: 'confidence',
      sortOrder: 'desc',
    });
  };

  // Estadísticas
  const stats = useMemo(() => {
    const bullish = filteredPredictions.filter((p) => p.direction === 'up').length;
    const bearish = filteredPredictions.filter((p) => p.direction === 'down').length;
    const avgConfidence = filteredPredictions.length > 0
      ? filteredPredictions.reduce((sum, p) => sum + p.confidence, 0) / filteredPredictions.length
      : 0;
    const highConfidence = filteredPredictions.filter((p) => p.confidence >= 70).length;

    return { bullish, bearish, avgConfidence, highConfidence, total: filteredPredictions.length };
  }, [filteredPredictions]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.loadingText}>Cargando predicciones...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle}>🎯 Screener</Text>
          <Pressable
            style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="options" size={20} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Presets rápidos */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.presetsContainer}
          contentContainerStyle={styles.presetsContent}
        >
          {FILTER_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              style={styles.presetButton}
              onPress={() => applyPreset(preset)}
            >
              <Text style={styles.presetText}>{preset.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Panel de filtros */}
        {showFilters && (
          <View style={styles.filtersPanel}>
            <View style={styles.filtersPanelHeader}>
              <Text style={styles.filtersPanelTitle}>⚙️ Filtros</Text>
              <Pressable onPress={resetFilters}>
                <Text style={styles.resetText}>Resetear</Text>
              </Pressable>
            </View>

            <FilterSelector
              label="Dirección"
              options={[
                { value: 'all', label: '📊 Todas' },
                { value: 'up', label: '📈 Alcistas' },
                { value: 'down', label: '📉 Bajistas' },
              ]}
              value={filters.direction}
              onChange={(v) => setFilters({ ...filters, direction: v })}
            />

            <FilterSelector
              label="Confianza mínima"
              options={[
                { value: 0, label: 'Todas' },
                { value: 50, label: '>50%' },
                { value: 60, label: '>60%' },
                { value: 70, label: '>70%' },
                { value: 80, label: '>80%' },
              ]}
              value={filters.minConfidence}
              onChange={(v) => setFilters({ ...filters, minConfidence: v })}
            />

            <FilterSelector
              label="Timeframe"
              options={[
                { value: 'all', label: '📅 Todos' },
                { value: 'intraday', label: '⚡ Intraday' },
                { value: 'swing', label: '📈 Swing' },
                { value: 'longterm', label: '🎯 Long' },
              ]}
              value={filters.timeframe}
              onChange={(v) => setFilters({ ...filters, timeframe: v as TrainingTimeframe | 'all' })}
            />

            <FilterSelector
              label="Tipo de activo"
              options={[
                { value: 'all', label: '📊 Todos' },
                { value: 'stock', label: '📈 Stocks' },
                { value: 'crypto', label: '₿ Crypto' },
                { value: 'etf', label: '📦 ETFs' },
              ]}
              value={filters.assetType}
              onChange={(v) => setFilters({ ...filters, assetType: v })}
            />

            <FilterSelector
              label="Ordenar por"
              options={[
                { value: 'confidence', label: '💎 Confianza' },
                { value: 'predicted_change', label: '📊 Predicción' },
                { value: 'change', label: '📈 Cambio hoy' },
                { value: 'symbol', label: '🔤 Símbolo' },
              ]}
              value={filters.sortBy}
              onChange={(v) => setFilters({ ...filters, sortBy: v })}
            />
          </View>
        )}

        {/* Estadísticas */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.green }]}>{stats.bullish}</Text>
            <Text style={styles.statLabel}>Alcistas</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.red }]}>{stats.bearish}</Text>
            <Text style={styles.statLabel}>Bajistas</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.yellow }]}>{stats.avgConfidence.toFixed(0)}%</Text>
            <Text style={styles.statLabel}>Conf. media</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.purple }]}>{stats.highConfidence}</Text>
            <Text style={styles.statLabel}>{'>'}70%</Text>
          </View>
        </View>

        {/* Lista de predicciones */}
        {filteredPredictions.length > 0 ? (
          filteredPredictions.map((prediction) => (
            <PredictionCard
              key={`${prediction.symbol}-${prediction.timeframe}`}
              prediction={prediction}
              onPress={() => router.push(`/asset/${prediction.symbol}`)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.emptyText}>
              {predictions.length === 0
                ? 'No hay predicciones activas. Genera predicciones desde la pantalla principal.'
                : 'Ninguna predicción coincide con los filtros seleccionados.'}
            </Text>
            {predictions.length > 0 && (
              <Pressable style={styles.emptyButton} onPress={resetFilters}>
                <Text style={styles.emptyButtonText}>Resetear filtros</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
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
    backgroundColor: COLORS.background,
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
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  filterToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterToggleActive: {
    backgroundColor: COLORS.blue,
  },

  // Presets
  presetsContainer: {
    marginBottom: 12,
  },
  presetsContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  presetButton: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  presetText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },

  // Filters Panel
  filtersPanel: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  filtersPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  filtersPanelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  resetText: {
    color: COLORS.blue,
    fontSize: 14,
  },
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    backgroundColor: COLORS.cardLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterOptionActive: {
    backgroundColor: COLORS.blue,
  },
  filterOptionText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  filterOptionTextActive: {
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

  // Prediction Card
  predictionCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  predictionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  predictionRight: {
    alignItems: 'flex-end',
  },
  predictionSymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  directionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  directionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  confidenceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  confidenceLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  predictionDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  predictionDetail: {},
  detailLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  predictionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  targetPrice: {
    fontSize: 13,
    color: COLORS.yellow,
  },
  predictionDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
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
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.blue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 16,
  },
});
