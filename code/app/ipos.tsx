/**
 * IPO & New Listings Page
 * 
 * Página dinámica para ver:
 * - 🔥 IPOs más populares / trending
 * - 🆕 Últimos activos entrados en bolsa
 * - 📅 Próximos IPOs
 * - 📋 IPOs filed (registrados)
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
    View
} from 'react-native';

import { apiClient, IPOData, IPOListing } from '../services/api-client';

// ============================================================================
// COLORES
// ============================================================================

const COLORS = {
  background: '#0a0a1a',
  card: '#1a1a2e',
  cardLight: '#252547',
  cardDark: '#12122a',
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
  pink: '#ec4899',
  cyan: '#06b6d4',
  yellow: '#fbbf24',
  border: '#333355',
  borderLight: '#404070',
  accentGradientStart: '#6366f1',
  accentGradientEnd: '#8b5cf6',
};

// ============================================================================
// TIPOS
// ============================================================================

type TabKey = 'hot' | 'recent' | 'upcoming';

interface TabInfo {
  key: TabKey;
  label: string;
  icon: string;
  color: string;
}

const TABS: TabInfo[] = [
  { key: 'hot', label: '🔥 Trending', icon: 'flame', color: COLORS.orange },
  { key: 'recent', label: '🆕 Recientes', icon: 'time', color: COLORS.green },
  { key: 'upcoming', label: '📅 Próximas', icon: 'calendar', color: COLORS.blue },
];

// ============================================================================
// HELPERS
// ============================================================================

function getStatusBadge(status: string): { text: string; color: string; bg: string } {
  switch (status) {
    case 'today':
      return { text: '🔴 HOY', color: COLORS.red, bg: COLORS.red + '25' };
    case 'recent':
      return { text: '✅ COTIZA', color: COLORS.green, bg: COLORS.green + '20' };
    case 'upcoming':
      return { text: '📅 PRÓXIMA', color: COLORS.blue, bg: COLORS.blue + '20' };
    case 'filed':
      return { text: '📋 REGISTRADA', color: COLORS.purple, bg: COLORS.purple + '20' };
    default:
      return { text: status, color: COLORS.textSecondary, bg: '#ffffff10' };
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === 'TBD') return 'Por definir';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Mañana';
    if (diffDays === -1) return 'Ayer';
    if (diffDays > 0 && diffDays <= 7) return `En ${diffDays} días`;
    if (diffDays < 0 && diffDays >= -7) return `Hace ${Math.abs(diffDays)} días`;
    if (diffDays < 0 && diffDays >= -30) return `Hace ${Math.abs(Math.floor(diffDays / 7))} semanas`;
    
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getPopularityEmoji(popularity: number): string {
  if (popularity >= 90) return '🔥🔥🔥';
  if (popularity >= 75) return '🔥🔥';
  if (popularity >= 50) return '🔥';
  if (popularity >= 30) return '⭐';
  return '📊';
}

function getSectorEmoji(sector?: string): string {
  if (!sector) return '🏢';
  const s = sector.toLowerCase();
  if (s.includes('tech')) return '💻';
  if (s.includes('health')) return '💊';
  if (s.includes('financ')) return '💰';
  if (s.includes('energy')) return '⚡';
  if (s.includes('consumer')) return '🛒';
  if (s.includes('industrial')) return '🏭';
  if (s.includes('real estate')) return '🏠';
  if (s.includes('communication')) return '📡';
  if (s.includes('material')) return '⛏️';
  if (s.includes('utilities')) return '💡';
  return '🏢';
}

function getCountryFlag(country?: string): string {
  if (!country) return '🌍';
  const flags: Record<string, string> = {
    'US': '🇺🇸', 'CN': '🇨🇳', 'UK': '🇬🇧', 'GB': '🇬🇧', 'JP': '🇯🇵',
    'DE': '🇩🇪', 'FR': '🇫🇷', 'KR': '🇰🇷', 'IN': '🇮🇳', 'BR': '🇧🇷',
    'CA': '🇨🇦', 'AU': '🇦🇺', 'SE': '🇸🇪', 'IL': '🇮🇱', 'SG': '🇸🇬',
    'HK': '🇭🇰', 'TW': '🇹🇼', 'NL': '🇳🇱', 'CH': '🇨🇭', 'IE': '🇮🇪',
  };
  return flags[country] || '🌍';
}

// ============================================================================
// COMPONENTE: Hot IPO Card (Card grande para trending)
// ============================================================================

const HotIPOCard = ({ ipo, index, onPress }: { ipo: IPOListing; index: number; onPress: () => void }) => {
  const statusBadge = getStatusBadge(ipo.status);
  const popularityEmoji = getPopularityEmoji(ipo.popularity || 50);
  const sectorEmoji = getSectorEmoji(ipo.sector);
  const flag = getCountryFlag(ipo.country);
  
  const rankColors = ['#fbbf24', '#c0c0c0', '#cd7f32', COLORS.blue, COLORS.purple];
  const rankColor = rankColors[index] || COLORS.textSecondary;

  return (
    <Pressable style={styles.hotCard} onPress={onPress}>
      {/* Rank Badge */}
      <View style={[styles.rankBadge, { backgroundColor: rankColor + '30', borderColor: rankColor }]}>
        <Text style={[styles.rankText, { color: rankColor }]}>#{index + 1}</Text>
      </View>

      {/* Header */}
      <View style={styles.hotCardHeader}>
        <View style={styles.hotCardTitleRow}>
          <Text style={styles.hotCardSymbol}>{ipo.symbol}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>{statusBadge.text}</Text>
          </View>
        </View>
        <Text style={styles.hotCardName} numberOfLines={1}>{ipo.name}</Text>
      </View>

      {/* Info Grid */}
      <View style={styles.hotCardInfo}>
        <View style={styles.hotCardInfoRow}>
          <Text style={styles.hotCardInfoLabel}>{flag} Exchange</Text>
          <Text style={styles.hotCardInfoValue}>{ipo.exchange}</Text>
        </View>

        {ipo.priceRange && (
          <View style={styles.hotCardInfoRow}>
            <Text style={styles.hotCardInfoLabel}>💵 Precio</Text>
            <Text style={styles.hotCardInfoValue}>{ipo.priceRange}</Text>
          </View>
        )}

        {ipo.sector && (
          <View style={styles.hotCardInfoRow}>
            <Text style={styles.hotCardInfoLabel}>{sectorEmoji} Sector</Text>
            <Text style={styles.hotCardInfoValue}>{ipo.sector}</Text>
          </View>
        )}

        <View style={styles.hotCardInfoRow}>
          <Text style={styles.hotCardInfoLabel}>📆 Fecha</Text>
          <Text style={styles.hotCardInfoValue}>{formatDate(ipo.ipoDate)}</Text>
        </View>

        {typeof ipo.changeFromIPO === 'number' && (
          <View style={styles.hotCardInfoRow}>
            <Text style={styles.hotCardInfoLabel}>📈 Desde IPO</Text>
            <Text style={[
              styles.hotCardInfoValue,
              { color: ipo.changeFromIPO >= 0 ? COLORS.green : COLORS.red }
            ]}>
              {ipo.changeFromIPO >= 0 ? '+' : ''}{ipo.changeFromIPO.toFixed(1)}%
            </Text>
          </View>
        )}

        {ipo.marketCap && (
          <View style={styles.hotCardInfoRow}>
            <Text style={styles.hotCardInfoLabel}>🏦 Market Cap</Text>
            <Text style={styles.hotCardInfoValue}>{ipo.marketCap}</Text>
          </View>
        )}
      </View>

      {/* Description */}
      {ipo.description && (
        <Text style={styles.hotCardDescription} numberOfLines={2}>
          {ipo.description}
        </Text>
      )}

      {/* Popularity bar */}
      <View style={styles.popularitySection}>
        <Text style={styles.popularityLabel}>{popularityEmoji} Popularidad</Text>
        <View style={styles.popularityBarBg}>
          <View style={[
            styles.popularityBarFill,
            {
              width: `${ipo.popularity || 50}%`,
              backgroundColor: (ipo.popularity || 50) >= 80 ? COLORS.orange :
                              (ipo.popularity || 50) >= 50 ? COLORS.blue : COLORS.textSecondary,
            }
          ]} />
        </View>
        <Text style={styles.popularityValue}>{ipo.popularity || 50}%</Text>
      </View>
    </Pressable>
  );
};

// ============================================================================
// COMPONENTE: IPO List Card (Card para listas)
// ============================================================================

const IPOListCard = ({ ipo, onPress }: { ipo: IPOListing; onPress: () => void }) => {
  const statusBadge = getStatusBadge(ipo.status);
  const sectorEmoji = getSectorEmoji(ipo.sector);
  const flag = getCountryFlag(ipo.country);

  return (
    <Pressable style={styles.listCard} onPress={onPress}>
      <View style={styles.listCardLeft}>
        <View style={styles.listCardIcon}>
          <Text style={{ fontSize: 24 }}>{sectorEmoji}</Text>
        </View>
        <View style={styles.listCardDetails}>
          <View style={styles.listCardTitleRow}>
            <Text style={styles.listCardSymbol}>{ipo.symbol}</Text>
            <Text style={styles.listCardExchange}>{flag} {ipo.exchange}</Text>
          </View>
          <Text style={styles.listCardName} numberOfLines={1}>{ipo.name}</Text>
          {ipo.industry && (
            <Text style={styles.listCardIndustry} numberOfLines={1}>{ipo.industry}</Text>
          )}
        </View>
      </View>

      <View style={styles.listCardRight}>
        <View style={[styles.statusBadgeSmall, { backgroundColor: statusBadge.bg }]}>
          <Text style={[styles.statusBadgeTextSmall, { color: statusBadge.color }]}>{statusBadge.text}</Text>
        </View>
        {ipo.priceRange && (
          <Text style={styles.listCardPrice}>{ipo.priceRange}</Text>
        )}
        <Text style={styles.listCardDate}>{formatDate(ipo.ipoDate)}</Text>
        {typeof ipo.changeFromIPO === 'number' && (
          <Text style={[
            styles.listCardChange,
            { color: ipo.changeFromIPO >= 0 ? COLORS.green : COLORS.red }
          ]}>
            {ipo.changeFromIPO >= 0 ? '▲' : '▼'} {Math.abs(ipo.changeFromIPO).toFixed(1)}%
          </Text>
        )}
      </View>
    </Pressable>
  );
};

// ============================================================================
// COMPONENTE: Stats Bar
// ============================================================================

const StatsBar = ({ data }: { data: IPOData }) => {
  return (
    <View style={styles.statsBar}>
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{data.hot.length}</Text>
        <Text style={styles.statLabel}>🔥 Trending</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{data.recent.length}</Text>
        <Text style={styles.statLabel}>🆕 Recientes</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{data.upcoming.length}</Text>
        <Text style={styles.statLabel}>📅 Próximas</Text>
      </View>
      {data.today.length > 0 && (
        <>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.red }]}>{data.today.length}</Text>
            <Text style={styles.statLabel}>🔴 Hoy</Text>
          </View>
        </>
      )}
    </View>
  );
};

// ============================================================================
// COMPONENTE: Empty State
// ============================================================================

const EmptyState = ({ tab }: { tab: TabKey }) => {
  const messages: Record<TabKey, { icon: string; title: string; subtitle: string }> = {
    hot: {
      icon: '🔥',
      title: 'No hay IPOs trending',
      subtitle: 'Las IPOs más populares aparecerán aquí',
    },
    recent: {
      icon: '🆕',
      title: 'No hay IPOs recientes',
      subtitle: 'Los últimos activos en entrar a bolsa aparecerán aquí',
    },
    upcoming: {
      icon: '📅',
      title: 'No hay próximas IPOs',
      subtitle: 'Las IPOs pendientes aparecerán aquí',
    },
  };

  const msg = messages[tab];

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>{msg.icon}</Text>
      <Text style={styles.emptyStateTitle}>{msg.title}</Text>
      <Text style={styles.emptyStateSubtitle}>{msg.subtitle}</Text>
    </View>
  );
};

// ============================================================================
// PÁGINA PRINCIPAL
// ============================================================================

export default function IPOPage() {
  const router = useRouter();
  // Sidebar is always visible via layout
  const [ipoData, setIpoData] = useState<IPOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('hot');
  const [error, setError] = useState<string | null>(null);

  // Fetch IPO data
  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const data = await apiClient.getIPOData();
      setIpoData(data);
    } catch (err) {
      console.error('[IPO Page] Error fetching:', err);
      setError('Error cargando datos de IPOs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  const navigateToAsset = (symbol: string) => {
    if (symbol && symbol !== 'TBD' && symbol !== 'N/A') {
      router.push(`/asset/${symbol}` as any);
    }
  };

  // Get current tab data
  const getTabData = (): IPOListing[] => {
    if (!ipoData) return [];
    switch (activeTab) {
      case 'hot': return ipoData.hot;
      case 'recent': return [...(ipoData.today || []), ...ipoData.recent];
      case 'upcoming': return ipoData.upcoming;
      default: return [];
    }
  };

  const tabData = getTabData();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerTitle}>IPOs & Nuevos Activos</Text>
            <Text style={styles.headerSubtitle}>
              Descubre los próximos unicornios 🦄
            </Text>
          </View>
        </View>
        <Pressable onPress={handleRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={20} color={COLORS.textSecondary} />
        </Pressable>
      </View>

      {/* Loading */}
      {loading && !ipoData && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={styles.loadingText}>Cargando IPOs...</Text>
        </View>
      )}

      {/* Error */}
      {error && !ipoData && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => fetchData()}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {ipoData && (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.purple}
              colors={[COLORS.purple]}
            />
          }
        >
          {/* Stats Bar */}
          <StatsBar data={ipoData} />

          {/* Today Banner */}
          {ipoData.today.length > 0 && (
            <View style={styles.todayBanner}>
              <View style={styles.todayBannerContent}>
                <Text style={styles.todayBannerIcon}>🔴</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayBannerTitle}>
                    {ipoData.today.length} IPO{ipoData.today.length > 1 ? 's' : ''} HOY
                  </Text>
                  <Text style={styles.todayBannerSubtitle}>
                    {ipoData.today.map(i => i.symbol).join(', ')}
                  </Text>
                </View>
                <Pressable
                  style={styles.todayBannerButton}
                  onPress={() => setActiveTab('recent')}
                >
                  <Text style={styles.todayBannerButtonText}>Ver</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabsContainer}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tab, isActive && { backgroundColor: tab.color + '25', borderColor: tab.color }]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[
                    styles.tabText,
                    isActive && { color: tab.color, fontWeight: '700' }
                  ]}>
                    {tab.label}
                  </Text>
                  {isActive && <View style={[styles.tabIndicator, { backgroundColor: tab.color }]} />}
                </Pressable>
              );
            })}
          </View>

          {/* Tab Content */}
          {tabData.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : activeTab === 'hot' ? (
            // Hot/Trending uses big cards
            <View style={styles.hotCardsContainer}>
              {tabData.map((ipo, index) => (
                <HotIPOCard
                  key={`${ipo.symbol}-${index}`}
                  ipo={ipo}
                  index={index}
                  onPress={() => navigateToAsset(ipo.symbol)}
                />
              ))}
            </View>
          ) : (
            // Recent & Upcoming use list cards
            <View style={styles.listContainer}>
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {activeTab === 'recent' ? '🆕 Últimas incorporaciones' : '📅 En camino al mercado'}
                </Text>
                <Text style={styles.sectionCount}>
                  {tabData.length} activo{tabData.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {tabData.map((ipo, index) => (
                <IPOListCard
                  key={`${ipo.symbol}-${index}`}
                  ipo={ipo}
                  onPress={() => navigateToAsset(ipo.symbol)}
                />
              ))}
            </View>
          )}

          {/* Last Updated */}
          <View style={styles.lastUpdated}>
            <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.lastUpdatedText}>
              Actualizado: {new Date(ipoData.lastUpdated).toLocaleTimeString('es-ES')}
            </Text>
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              ⚠️ La información de IPOs es orientativa. Las fechas y precios pueden cambiar.
              Consulta fuentes oficiales antes de invertir.
            </Text>
          </View>

          {/* Bottom spacer */}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ============================================================================
// ESTILOS
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  refreshButton: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.cardLight,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 48,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: COLORS.purple,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },

  scrollView: {
    flex: 1,
  },

  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },

  // Today Banner
  todayBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.red + '15',
    borderWidth: 1,
    borderColor: COLORS.red + '40',
  },
  todayBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  todayBannerIcon: {
    fontSize: 28,
  },
  todayBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.red,
  },
  todayBannerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  todayBannerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.red,
    borderRadius: 8,
  },
  todayBannerButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 3,
    borderRadius: 2,
  },

  // Hot Cards Container
  hotCardsContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },

  // Hot Card
  hotCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    overflow: 'hidden',
  },
  rankBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  rankText: {
    fontSize: 13,
    fontWeight: '800',
  },
  hotCardHeader: {
    marginBottom: 14,
    paddingRight: 50,
  },
  hotCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hotCardSymbol: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1,
  },
  hotCardName: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Status Badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    alignSelf: 'flex-end',
  },
  statusBadgeTextSmall: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Hot Card Info
  hotCardInfo: {
    backgroundColor: COLORS.cardDark,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  hotCardInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hotCardInfoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  hotCardInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Hot Card Description
  hotCardDescription: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },

  // Popularity
  popularitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  popularityLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    width: 90,
  },
  popularityBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.cardDark,
    borderRadius: 3,
    overflow: 'hidden',
  },
  popularityBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  popularityValue: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    width: 30,
    textAlign: 'right',
  },

  // List Container
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sectionCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  // List Card
  listCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  listCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCardDetails: {
    flex: 1,
  },
  listCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listCardSymbol: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  listCardExchange: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  listCardName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  listCardIndustry: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  listCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  listCardPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  listCardDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  listCardChange: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateIcon: {
    fontSize: 48,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // Last Updated
  lastUpdated: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  lastUpdatedText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // Disclaimer
  disclaimer: {
    marginHorizontal: 16,
    padding: 14,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.orange + '30',
  },
  disclaimerText: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
