/**
 * Economic Calendar Page
 * 
 * Calendario económico con eventos que mueven mercados.
 * Muestra eventos de hoy, esta semana y la próxima.
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

import { apiClient, EconomicCalendarData, EconomicEvent } from '../services/api-client';

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
  yellow: '#fbbf24',
  border: '#333355',
};

// ============================================================================
// TIPOS
// ============================================================================

type TabKey = 'today' | 'week' | 'next';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'today', label: 'Hoy', icon: 'today' },
  { key: 'week', label: 'Esta Semana', icon: 'calendar' },
  { key: 'next', label: 'Próxima', icon: 'calendar-outline' },
];

const IMPACT_CONFIG = {
  high: { label: 'ALTO', color: '#ef4444', bg: '#ef444425', icon: '🔴' },
  medium: { label: 'MEDIO', color: '#f59e0b', bg: '#f59e0b25', icon: '🟡' },
  low: { label: 'BAJO', color: '#6b7280', bg: '#6b728025', icon: '⚪' },
};

const CATEGORY_ICONS: Record<string, string> = {
  central_bank: '🏦',
  employment: '👷',
  inflation: '📈',
  gdp: '🏭',
  earnings: '💰',
  trade: '🚢',
  housing: '🏠',
  consumer: '🛒',
  manufacturing: '⚙️',
  other: '📋',
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function EconomicCalendarPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<EconomicCalendarData | null>(null);
  const [filterImpact, setFilterImpact] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await apiClient.getEconomicCalendar();
      setData(result);
    } catch (error) {
      console.error('Error fetching calendar:', error);
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

  const getEventsForTab = (): EconomicEvent[] => {
    if (!data) return [];
    let events: EconomicEvent[] = [];
    switch (activeTab) {
      case 'today': events = data.today; break;
      case 'week': events = data.thisWeek; break;
      case 'next': events = data.nextWeek; break;
    }
    if (filterImpact) {
      events = events.filter(e => e.impact === filterImpact);
    }
    return events;
  };

  const events = getEventsForTab();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  // Group events by date
  const groupedEvents: { date: string; formatted: string; events: EconomicEvent[] }[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const dateKey = event.date.split('T')[0];
    if (!seen.has(dateKey)) {
      seen.add(dateKey);
      groupedEvents.push({
        date: dateKey,
        formatted: formatDate(dateKey),
        events: events.filter(e => e.date.split('T')[0] === dateKey),
      });
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.blue} />
        <Text style={styles.loadingText}>Cargando calendario...</Text>
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
            <Text style={styles.headerTitle}>📅 Calendario Económico</Text>
            <Text style={styles.headerSubtitle}>Eventos que mueven mercados</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.key ? COLORS.blue : COLORS.textMuted}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Impact Filters */}
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, !filterImpact && styles.filterChipActive]}
            onPress={() => setFilterImpact(null)}
          >
            <Text style={[styles.filterChipText, !filterImpact && styles.filterChipTextActive]}>Todos</Text>
          </Pressable>
          {(['high', 'medium', 'low'] as const).map(impact => (
            <Pressable
              key={impact}
              style={[
                styles.filterChip,
                filterImpact === impact && { backgroundColor: IMPACT_CONFIG[impact].bg, borderColor: IMPACT_CONFIG[impact].color },
              ]}
              onPress={() => setFilterImpact(filterImpact === impact ? null : impact)}
            >
              <Text style={styles.filterChipText}>
                {IMPACT_CONFIG[impact].icon} {IMPACT_CONFIG[impact].label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Events List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.blue} />}
      >
        {groupedEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>📅</Text>
            <Text style={styles.emptyText}>No hay eventos programados</Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'today' ? 'No hay eventos económicos para hoy' : 'No hay eventos en este período'}
            </Text>
          </View>
        ) : (
          groupedEvents.map(group => (
            <View key={group.date}>
              {/* Date Header */}
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{group.formatted}</Text>
                <Text style={styles.dateHeaderCount}>{group.events.length} eventos</Text>
              </View>

              {/* Events */}
              {group.events.map((event, idx) => (
                <EventCard key={`${event.id}-${idx}`} event={event} router={router} />
              ))}
            </View>
          ))
        )}

        {/* Stats Summary */}
        {data && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>📊 Resumen</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{data.today.length}</Text>
                <Text style={styles.statLabel}>Hoy</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{data.thisWeek.length}</Text>
                <Text style={styles.statLabel}>Semana</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{data.nextWeek.length}</Text>
                <Text style={styles.statLabel}>Próxima</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.red }]}>
                  {data.thisWeek.filter(e => e.impact === 'high').length}
                </Text>
                <Text style={styles.statLabel}>Alto Impacto</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ============================================================================
// EVENT CARD
// ============================================================================

function EventCard({ event, router }: { event: EconomicEvent; router: any }) {
  const impact = IMPACT_CONFIG[event.impact];
  const categoryIcon = CATEGORY_ICONS[event.category] || '📋';

  return (
    <View style={styles.eventCard}>
      <View style={[styles.eventImpactBar, { backgroundColor: impact.color }]} />
      
      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <View style={styles.eventTitleRow}>
            <Text style={styles.eventEmoji}>{categoryIcon}</Text>
            <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          </View>
          <View style={[styles.impactBadge, { backgroundColor: impact.bg }]}>
            <Text style={[styles.impactBadgeText, { color: impact.color }]}>{impact.label}</Text>
          </View>
        </View>

        <View style={styles.eventMeta}>
          <Text style={styles.eventFlag}>{event.countryFlag} {event.country}</Text>
          {event.time && (
            <Text style={styles.eventTime}>🕐 {event.time} UTC</Text>
          )}
        </View>

        {event.description && (
          <Text style={styles.eventDescription} numberOfLines={2}>{event.description}</Text>
        )}

        {/* Previous / Forecast / Actual */}
        {(event.previous || event.forecast || event.actual) && (
          <View style={styles.eventDataRow}>
            {event.previous && (
              <View style={styles.eventDataItem}>
                <Text style={styles.eventDataLabel}>Anterior</Text>
                <Text style={styles.eventDataValue}>{event.previous}</Text>
              </View>
            )}
            {event.forecast && (
              <View style={styles.eventDataItem}>
                <Text style={styles.eventDataLabel}>Pronóstico</Text>
                <Text style={[styles.eventDataValue, { color: COLORS.blue }]}>{event.forecast}</Text>
              </View>
            )}
            {event.actual && (
              <View style={styles.eventDataItem}>
                <Text style={styles.eventDataLabel}>Actual</Text>
                <Text style={[styles.eventDataValue, { color: COLORS.green }]}>{event.actual}</Text>
              </View>
            )}
          </View>
        )}

        {/* Affected Assets */}
        {event.affectedAssets && event.affectedAssets.length > 0 && (
          <View style={styles.assetsRow}>
            {event.affectedAssets.slice(0, 5).map(symbol => (
              <Pressable
                key={symbol}
                style={styles.assetChip}
                onPress={() => router.push(`/asset/${symbol}`)}
              >
                <Text style={styles.assetChipText}>{symbol}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
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
  header: { backgroundColor: COLORS.card, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // Tabs
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 14, gap: 4 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.blue },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.blue },

  // Filters
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardLight,
  },
  filterChipActive: { backgroundColor: COLORS.blue + '30', borderColor: COLORS.blue },
  filterChipText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.blue },

  // Content
  content: { flex: 1 },
  contentInner: { padding: 12 },

  // Date Header
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  dateHeaderText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  dateHeaderCount: { fontSize: 12, color: COLORS.textMuted },

  // Event Card
  eventCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  eventImpactBar: { width: 4, borderRadius: 2 },
  eventContent: { flex: 1, padding: 14 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  eventEmoji: { fontSize: 18 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  impactBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 8 },
  impactBadgeText: { fontSize: 10, fontWeight: '800' },

  eventMeta: { flexDirection: 'row', gap: 16, marginTop: 6 },
  eventFlag: { fontSize: 12, color: COLORS.textSecondary },
  eventTime: { fontSize: 12, color: COLORS.textMuted },

  eventDescription: { fontSize: 12, color: COLORS.textMuted, marginTop: 6, lineHeight: 16 },

  // Data row
  eventDataRow: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  eventDataItem: { alignItems: 'center' },
  eventDataLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2 },
  eventDataValue: { fontSize: 14, fontWeight: '700', color: COLORS.text },

  // Assets
  assetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  assetChip: { backgroundColor: COLORS.cardLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  assetChipText: { fontSize: 11, fontWeight: '700', color: COLORS.cyan },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 12 },
  emptySubtext: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },

  // Stats
  statsCard: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginTop: 16 },
  statsTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
