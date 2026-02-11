/**
 * Pre-Market & After-Hours Movers Page
 * 
 * Muestra los activos con mayor movimiento en horario extendido.
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
    View,
} from 'react-native';

import { apiClient, ExtendedHoursData, ExtendedHoursMover } from '../services/api-client';

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
  greenLight: '#34d399',
  red: '#ef4444',
  redLight: '#f87171',
  orange: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  yellow: '#fbbf24',
  border: '#333355',
};

// ============================================================================
// TIPOS
// ============================================================================

type SessionTab = 'pre' | 'after';
type CategoryTab = 'gainers' | 'losers' | 'active';

const SESSION_TABS: { key: SessionTab; label: string; icon: string; color: string }[] = [
  { key: 'pre', label: 'Pre-Market', icon: 'sunny-outline', color: COLORS.orange },
  { key: 'after', label: 'After-Hours', icon: 'moon-outline', color: COLORS.purple },
];

const CATEGORY_TABS: { key: CategoryTab; label: string; icon: string }[] = [
  { key: 'gainers', label: '🟢 Ganadores', icon: 'trending-up' },
  { key: 'losers', label: '🔴 Perdedores', icon: 'trending-down' },
  { key: 'active', label: '🔥 Más Activos', icon: 'flash' },
];

const MARKET_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  'pre-market': { label: 'PRE-MARKET', color: COLORS.orange, icon: '🌅' },
  'regular': { label: 'MERCADO ABIERTO', color: COLORS.green, icon: '📊' },
  'after-hours': { label: 'AFTER-HOURS', color: COLORS.purple, icon: '🌙' },
  'closed': { label: 'CERRADO', color: COLORS.red, icon: '🔒' },
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function ExtendedHoursPage() {
  const router = useRouter();
  const [sessionTab, setSessionTab] = useState<SessionTab>('pre');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('gainers');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<ExtendedHoursData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await apiClient.getExtendedHoursMovers();
      setData(result);
    } catch (error) {
      console.error('Error fetching movers:', error);
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

  const getMovers = (): ExtendedHoursMover[] => {
    if (!data) return [];
    const session = sessionTab === 'pre' ? data.preMarket : data.afterHours;
    switch (categoryTab) {
      case 'gainers': return session.gainers;
      case 'losers': return session.losers;
      case 'active': return session.mostActive;
    }
  };

  const movers = getMovers();
  const status = data ? MARKET_STATUS_CONFIG[data.marketStatus] : null;

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.loadingText}>Cargando movers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>⚡ Pre & After Hours</Text>
            <Text style={styles.headerSubtitle}>Movimientos en horario extendido</Text>
          </View>
          {status && (
            <View style={[styles.statusBadge, { backgroundColor: status.color + '25' }]}>
              <Text style={styles.statusIcon}>{status.icon}</Text>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          )}
        </View>

        {/* Session Tabs */}
        <View style={styles.sessionTabs}>
          {SESSION_TABS.map(tab => (
            <Pressable
              key={tab.key}
              style={[
                styles.sessionTab,
                sessionTab === tab.key && { backgroundColor: tab.color + '20', borderColor: tab.color },
              ]}
              onPress={() => setSessionTab(tab.key)}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={sessionTab === tab.key ? tab.color : COLORS.textMuted}
              />
              <Text style={[
                styles.sessionTabText,
                sessionTab === tab.key && { color: tab.color },
              ]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Category Tabs */}
        <View style={styles.categoryTabs}>
          {CATEGORY_TABS.map(tab => (
            <Pressable
              key={tab.key}
              style={[styles.categoryTab, categoryTab === tab.key && styles.categoryTabActive]}
              onPress={() => setCategoryTab(tab.key)}
            >
              <Text style={[styles.categoryTabText, categoryTab === tab.key && styles.categoryTabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Movers List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.blue} />}
      >
        {movers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>📊</Text>
            <Text style={styles.emptyText}>Sin datos disponibles</Text>
            <Text style={styles.emptySubtext}>Los datos se actualizan durante horario de mercado</Text>
          </View>
        ) : (
          <>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 2 }]}>Activo</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Precio</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Cambio</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Vol.</Text>
            </View>

            {movers.map((mover, idx) => (
              <MoverRow key={`${mover.symbol}-${idx}`} mover={mover} index={idx} router={router} />
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ============================================================================
// MOVER ROW
// ============================================================================

function MoverRow({ mover, index, router }: { mover: ExtendedHoursMover; index: number; router: any }) {
  const isPositive = mover.changePercent >= 0;
  const changeColor = isPositive ? COLORS.green : COLORS.red;

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(0)}K`;
    return vol.toString();
  };

  return (
    <Pressable
      style={[styles.moverRow, index % 2 === 0 && styles.moverRowAlt]}
      onPress={() => router.push(`/asset/${mover.symbol}`)}
    >
      {/* Rank */}
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{index + 1}</Text>
      </View>

      {/* Symbol & Name */}
      <View style={{ flex: 2 }}>
        <Text style={styles.moverSymbol}>{mover.symbol}</Text>
        <Text style={styles.moverName} numberOfLines={1}>{mover.name}</Text>
        {mover.sector && <Text style={styles.moverSector}>{mover.sector}</Text>}
      </View>

      {/* Price */}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={styles.moverPrice}>${mover.price.toFixed(2)}</Text>
        {mover.marketCap && <Text style={styles.moverMarketCap}>{mover.marketCap}</Text>}
      </View>

      {/* Change */}
      <View style={[styles.changeBadge, { backgroundColor: changeColor + '20' }]}>
        <Ionicons
          name={isPositive ? 'caret-up' : 'caret-down'}
          size={10}
          color={changeColor}
        />
        <Text style={[styles.changeText, { color: changeColor }]}>
          {isPositive ? '+' : ''}{mover.changePercent.toFixed(2)}%
        </Text>
      </View>

      {/* Volume */}
      <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
        <Text style={styles.moverVolume}>{formatVolume(mover.volume)}</Text>
      </View>
    </Pressable>
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
  header: { backgroundColor: COLORS.card, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // Status badge
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusIcon: { fontSize: 12 },
  statusText: { fontSize: 10, fontWeight: '800' },

  // Session Tabs
  sessionTabs: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 14, gap: 8 },
  sessionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardLight,
  },
  sessionTabText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },

  // Category Tabs
  categoryTabs: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  categoryTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.cardLight },
  categoryTabActive: { backgroundColor: COLORS.blue + '20' },
  categoryTabText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  categoryTabTextActive: { color: COLORS.blue },

  // Content
  content: { flex: 1 },
  contentInner: { padding: 12 },

  // Table
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  tableHeaderText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },

  // Mover Row
  moverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
  },
  moverRowAlt: { backgroundColor: COLORS.card },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: COLORS.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted },
  moverSymbol: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  moverName: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  moverSector: { fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  moverPrice: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  moverMarketCap: { fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  changeText: { fontSize: 12, fontWeight: '700' },
  moverVolume: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 12 },
  emptySubtext: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
});
