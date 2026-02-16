/**
 * Sector Heat Map Page
 * 
 * Mapa de calor por sector mostrando rendimiento del mercado.
 * Visualización tipo treemap con colores por rendimiento.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';

import { apiClient, HeatMapData } from '../services/api-client';

// ============================================================================
// COLORES
// ============================================================================

const COLORS = {
  background: '#0a0a1a',
  card: '#1a1a2e',
  cardLight: '#252547',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  green: '#10b981',
  red: '#ef4444',
  orange: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  border: '#333355',
};

// ============================================================================
// TIPOS
// ============================================================================

type ViewMode = 'heatmap' | 'table';

const INDEX_LABELS: Record<string, { label: string; emoji: string }> = {
  sp500: { label: 'S&P 500', emoji: '📊' },
  nasdaq: { label: 'NASDAQ', emoji: '💻' },
  dow: { label: 'DOW', emoji: '🏛️' },
  russell: { label: 'Russell 2000', emoji: '📈' },
};

// ============================================================================
// HELPERS
// ============================================================================

function getHeatColor(change: number): string {
  if (change >= 3) return '#00c853';
  if (change >= 2) return '#2e7d32';
  if (change >= 1) return '#388e3c';
  if (change >= 0.5) return '#43a047';
  if (change >= 0.1) return '#66bb6a';
  if (change > -0.1) return '#424242';
  if (change > -0.5) return '#ef5350';
  if (change > -1) return '#e53935';
  if (change > -2) return '#d32f2f';
  if (change > -3) return '#c62828';
  return '#b71c1c';
}

function getTextColorForBg(change: number): string {
  return Math.abs(change) > 0.5 ? '#ffffff' : '#e0e0e0';
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function SectorHeatMapPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<ViewMode>('heatmap');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<HeatMapData | null>(null);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await apiClient.getSectorHeatMap();
      setData(result);
    } catch (error) {
      console.error('Error fetching sectors:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.loadingText}>Cargando mapa de sectores...</Text>
      </View>
    );
  }

  const contentWidth = width - 24; // Padding

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>🗺️ Mapa de Sectores</Text>
            <Text style={styles.headerSubtitle}>Rendimiento por sector en tiempo real</Text>
          </View>
          {/* View Toggle */}
          <View style={styles.viewToggle}>
            <Pressable
              style={[styles.viewToggleBtn, viewMode === 'heatmap' && styles.viewToggleBtnActive]}
              onPress={() => setViewMode('heatmap')}
            >
              <Ionicons name="grid" size={16} color={viewMode === 'heatmap' ? COLORS.blue : COLORS.textMuted} />
            </Pressable>
            <Pressable
              style={[styles.viewToggleBtn, viewMode === 'table' && styles.viewToggleBtnActive]}
              onPress={() => setViewMode('table')}
            >
              <Ionicons name="list" size={16} color={viewMode === 'table' ? COLORS.blue : COLORS.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Market Overview */}
        {data && (
          <View style={styles.marketOverview}>
            {Object.entries(data.marketOverview)
              .filter(([key]) => key !== 'vix')
              .map(([key, value]) => {
                const info = INDEX_LABELS[key] || { label: key, emoji: '📊' };
                const isPositive = value.change >= 0;
                return (
                  <View key={key} style={styles.indexCard}>
                    <Text style={styles.indexEmoji}>{info.emoji}</Text>
                    <Text style={styles.indexLabel}>{info.label}</Text>
                    <Text style={[styles.indexChange, { color: isPositive ? COLORS.green : COLORS.red }]}>
                      {isPositive ? '+' : ''}{value.change.toFixed(2)}%
                    </Text>
                  </View>
                );
              })}
            {/* VIX */}
            <View style={styles.indexCard}>
              <Text style={styles.indexEmoji}>😰</Text>
              <Text style={styles.indexLabel}>VIX</Text>
              <Text style={[styles.indexChange, { color: data.marketOverview.vix.change > 0 ? COLORS.red : COLORS.green }]}>
                {data.marketOverview.vix.value.toFixed(1)}
              </Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.blue} />}
      >
        {/* Market Breadth */}
        {data && (
          <View style={styles.breadthCard}>
            <Text style={styles.breadthTitle}>📊 Amplitud de Mercado</Text>
            <View style={styles.breadthRow}>
              <View style={styles.breadthItem}>
                <Text style={[styles.breadthValue, { color: COLORS.green }]}>{data.breadth.advancers}</Text>
                <Text style={styles.breadthLabel}>Suben</Text>
              </View>
              <View style={styles.breadthBar}>
                <View style={[
                  styles.breadthBarFill,
                  {
                    width: `${(data.breadth.advancers / (data.breadth.advancers + data.breadth.decliners + data.breadth.unchanged || 1)) * 100}%`,
                    backgroundColor: COLORS.green,
                  },
                ]} />
                <View style={[
                  styles.breadthBarFill,
                  {
                    width: `${(data.breadth.decliners / (data.breadth.advancers + data.breadth.decliners + data.breadth.unchanged || 1)) * 100}%`,
                    backgroundColor: COLORS.red,
                  },
                ]} />
              </View>
              <View style={styles.breadthItem}>
                <Text style={[styles.breadthValue, { color: COLORS.red }]}>{data.breadth.decliners}</Text>
                <Text style={styles.breadthLabel}>Bajan</Text>
              </View>
            </View>
          </View>
        )}

        {/* Heat Map / Table View */}
        {data && viewMode === 'heatmap' ? (
          <View style={styles.heatmapGrid}>
            {data.sectors.map((sector, idx) => {
              // Dynamic sizing: larger blocks for sectors with more change
              const absChange = Math.abs(sector.change);
              const isLarge = absChange > 1.5 || idx < 3;
              const cellWidth = isLarge ? contentWidth / 2 - 4 : contentWidth / 3 - 5;
              const cellHeight = isLarge ? 120 : 90;

              return (
                <Pressable
                  key={sector.symbol}
                  style={[
                    styles.heatmapCell,
                    {
                      width: cellWidth,
                      height: cellHeight,
                      backgroundColor: getHeatColor(sector.change),
                    },
                  ]}
                  onPress={() => setExpandedSector(expandedSector === sector.symbol ? null : sector.symbol)}
                >
                  <Text style={[styles.heatmapSectorName, { color: getTextColorForBg(sector.change) }]} numberOfLines={2}>
                    {sector.name}
                  </Text>
                  <Text style={[styles.heatmapSectorSymbol, { color: getTextColorForBg(sector.change) }]}>
                    {sector.symbol}
                  </Text>
                  <Text style={[styles.heatmapChange, { color: getTextColorForBg(sector.change) }]}>
                    {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : data && (
          /* Table View */
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Sector</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Cambio</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Volumen</Text>
            </View>
            
            {data.sectors.map((sector, idx) => {
              const isPositive = sector.change >= 0;
              const isExpanded = expandedSector === sector.symbol;

              return (
                <View key={sector.symbol}>
                  <Pressable
                    style={[styles.tableRow, idx % 2 === 0 && styles.tableRowAlt]}
                    onPress={() => setExpandedSector(isExpanded ? null : sector.symbol)}
                  >
                    <View style={[styles.sectorDot, { backgroundColor: sector.color }]} />
                    <View style={{ flex: 2 }}>
                      <Text style={styles.sectorName}>{sector.name}</Text>
                      <Text style={styles.sectorSymbol}>{sector.symbol}</Text>
                    </View>
                    <View style={[styles.changePill, { backgroundColor: (isPositive ? COLORS.green : COLORS.red) + '20' }]}>
                      <Text style={[styles.changeValue, { color: isPositive ? COLORS.green : COLORS.red }]}>
                        {isPositive ? '+' : ''}{sector.change.toFixed(2)}%
                      </Text>
                    </View>
                    <Text style={[styles.volumeText, { flex: 1, textAlign: 'right' }]}>
                      {sector.volume >= 1e9 ? `${(sector.volume / 1e9).toFixed(1)}B` :
                       sector.volume >= 1e6 ? `${(sector.volume / 1e6).toFixed(0)}M` :
                       sector.volume >= 1e3 ? `${(sector.volume / 1e3).toFixed(0)}K` : sector.volume}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={COLORS.textMuted}
                    />
                  </Pressable>

                  {/* Expanded Industries */}
                  {isExpanded && (
                    <View style={styles.industriesList}>
                      {sector.industries.map(ind => (
                        <View key={ind.name} style={styles.industryRow}>
                          <View style={[styles.industryDot, { backgroundColor: getHeatColor(ind.change) }]} />
                          <Text style={styles.industryName}>{ind.name}</Text>
                          <Text style={[
                            styles.industryChange,
                            { color: ind.change >= 0 ? COLORS.green : COLORS.red },
                          ]}>
                            {ind.change >= 0 ? '+' : ''}{ind.change.toFixed(2)}%
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Leyenda</Text>
          <View style={styles.legendRow}>
            {[
              { label: '>+3%', color: '#00c853' },
              { label: '+1-3%', color: '#388e3c' },
              { label: '0-1%', color: '#66bb6a' },
              { label: '≈0%', color: '#424242' },
              { label: '0 a -1%', color: '#ef5350' },
              { label: '-1 a -3%', color: '#d32f2f' },
              { label: '<-3%', color: '#b71c1c' },
            ].map(item => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={styles.legendLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ============================================================================
// ESTILOS
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: 12 },

  // Header
  header: { backgroundColor: COLORS.card, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // View Toggle
  viewToggle: { flexDirection: 'row', backgroundColor: COLORS.cardLight, borderRadius: 8, overflow: 'hidden' },
  viewToggleBtn: { padding: 8, paddingHorizontal: 12 },
  viewToggleBtnActive: { backgroundColor: COLORS.blue + '25' },

  // Market Overview
  marketOverview: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 14, gap: 6 },
  indexCard: { flex: 1, alignItems: 'center', backgroundColor: COLORS.cardLight, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 4 },
  indexEmoji: { fontSize: 16 },
  indexLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, marginTop: 3 },
  indexChange: { fontSize: 14, fontWeight: '800', marginTop: 2 },

  // Content
  content: { flex: 1 },
  contentInner: { padding: 12 },

  // Breadth
  breadthCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  breadthTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  breadthRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breadthItem: { alignItems: 'center' },
  breadthValue: { fontSize: 18, fontWeight: '800' },
  breadthLabel: { fontSize: 10, color: COLORS.textMuted },
  breadthBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.cardLight, flexDirection: 'row', overflow: 'hidden' },
  breadthBarFill: { height: '100%' },

  // Heat Map
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  heatmapCell: {
    borderRadius: 10,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heatmapSectorName: { fontSize: 13, fontWeight: '800', lineHeight: 16 },
  heatmapSectorSymbol: { fontSize: 10, opacity: 0.8 },
  heatmapChange: { fontSize: 18, fontWeight: '900' },

  // Table
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  tableHeaderText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
  },
  tableRowAlt: { backgroundColor: COLORS.card },
  sectorDot: { width: 4, height: 32, borderRadius: 2 },
  sectorName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  sectorSymbol: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  changePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  changeValue: { fontSize: 13, fontWeight: '800' },
  volumeText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },

  // Industries
  industriesList: { paddingLeft: 28, paddingRight: 12, paddingBottom: 8 },
  industryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  industryDot: { width: 8, height: 8, borderRadius: 4 },
  industryName: { flex: 1, fontSize: 12, color: COLORS.textSecondary },
  industryChange: { fontSize: 12, fontWeight: '700' },

  // Legend
  legend: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginTop: 16 },
  legendTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { fontSize: 10, color: COLORS.textMuted },
});
