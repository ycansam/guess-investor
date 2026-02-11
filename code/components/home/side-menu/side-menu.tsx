import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const APP_LOGO = require('../../../assets/images/logo.png');

export type TabType = 'favorites' | 'predictions' | 'trends';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  key: TabType;
  icon: IoniconsName;
  iconOutline: IoniconsName;
  label: string;
  color: string;
  count: number;
}

export const SIDEBAR_EXPANDED_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

interface PersistentSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  predictionsCount: number;
  favoritesCount?: number;
}

export function PersistentSidebar({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  predictionsCount,
  favoritesCount = 0,
}: PersistentSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const widthAnim = useRef(new Animated.Value(collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH)).current;

  const isOnHome = pathname === '/';
  const isOnPortfolio = pathname === '/portfolio';
  const isOnMLDiagnostics = pathname === '/ml-diagnostics';
  const isOnMLStats = pathname === '/ml-stats';
  const isOnMarketNews = pathname === '/market-news';
  const isOnIPOs = pathname === '/ipos';
  const isOnScreener = pathname === '/screener';
  const isOnCompare = pathname === '/compare';
  const isOnCalendar = pathname === '/economic-calendar';
  const isOnMovers = pathname === '/extended-hours';
  const isOnSectors = pathname === '/sectors';

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [collapsed, widthAnim]);

  const handleTabSelect = (tab: TabType) => {
    onTabChange(tab);
    if (pathname !== '/') {
      router.push('/');
    }
  };

  const handleNavigation = (path: string) => {
    router.push(path as any);
  };

  const menuItems: MenuItem[] = [
    {
      key: 'favorites',
      icon: 'heart',
      iconOutline: 'heart-outline',
      label: 'Favoritos',
      color: '#ef4444',
      count: favoritesCount,
    },
    {
      key: 'predictions',
      icon: 'bulb',
      iconOutline: 'bulb-outline',
      label: 'Predicciones IA',
      color: '#f59e0b',
      count: 0,
    },
    {
      key: 'trends',
      icon: 'flame',
      iconOutline: 'flame-outline',
      label: 'Trends',
      color: '#f97316',
      count: 0,
    },
  ];

  interface PageEntry {
    path: string;
    emoji: string;
    label: string;
    color: string;
    isActive: boolean;
  }

  const pageEntries: PageEntry[] = [
    { path: '/portfolio', emoji: '📝', label: 'Portfolio', color: '#3b82f6', isActive: isOnPortfolio },
    { path: '/screener', emoji: '🎯', label: 'Screener', color: '#06b6d4', isActive: isOnScreener },
    { path: '/compare', emoji: '⚖️', label: 'Comparar', color: '#f97316', isActive: isOnCompare },
    { path: '/economic-calendar', emoji: '📅', label: 'Calendario', color: '#ef4444', isActive: isOnCalendar },
    { path: '/extended-hours', emoji: '⚡', label: 'Pre/After Hours', color: '#f59e0b', isActive: isOnMovers },
    { path: '/sectors', emoji: '🗺️', label: 'Mapa Sectores', color: '#10b981', isActive: isOnSectors },
    { path: '/market-news', emoji: '📰', label: 'Noticias', color: '#f59708', isActive: isOnMarketNews },
    { path: '/ipos', emoji: '🚀', label: 'IPOs & Nuevos', color: '#8b5cf6', isActive: isOnIPOs },
    { path: '/ml-diagnostics', emoji: '🧠', label: 'Diagnóstico ML', color: '#8b5cf6', isActive: isOnMLDiagnostics },
    { path: '/ml-stats', emoji: '📊', label: 'Estadísticas ML', color: '#10b981', isActive: isOnMLStats },
  ];

  return (
    <Animated.View style={[styles.sidebar, { width: widthAnim }]}>
      {/* Header / Toggle */}
      <View style={styles.sidebarHeader}>
        <View style={collapsed ? styles.logoClipCollapsed : styles.logoClip}>
          <Image
            source={APP_LOGO}
            style={collapsed ? styles.logoImageCollapsed : styles.logoImage}
            resizeMode="cover"
          />
        </View>
        {!collapsed && (
          <Text style={styles.logoText}>AlphaVest</Text>
        )}
        <TouchableOpacity onPress={onToggle} style={styles.toggleButton} activeOpacity={0.7}>
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-back'}
            size={18}
            color="#9ca3af"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.sidebarContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sidebarContentInner}
      >
        {/* Section: Home Tabs */}
        {!collapsed && <Text style={styles.sectionLabel}>INICIO</Text>}
        {collapsed && <View style={styles.collapsedSectionDot} />}

        {menuItems.map((item) => {
          const isActive = isOnHome && activeTab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.sidebarItem,
                collapsed && styles.sidebarItemCollapsed,
                isActive && styles.sidebarItemActive,
                isActive && { borderLeftColor: item.color },
              ]}
              onPress={() => handleTabSelect(item.key)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.sidebarIconBox,
                isActive && { backgroundColor: `${item.color}20` },
              ]}>
                <Ionicons
                  name={isActive ? item.icon : item.iconOutline}
                  size={20}
                  color={isActive ? item.color : '#6b7280'}
                />
              </View>
              {!collapsed && (
                <Text
                  style={[styles.sidebarItemLabel, isActive && { color: item.color, fontWeight: '600' }]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              )}
              {!collapsed && item.count > 0 && (
                <View style={[styles.badge, { backgroundColor: item.color }]}>
                  <Text style={styles.badgeText}>
                    {item.count > 99 ? '99+' : item.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Separator */}
        <View style={[styles.separator, collapsed && styles.separatorCollapsed]} />

        {/* Section: Pages */}
        {!collapsed && <Text style={styles.sectionLabel}>PÁGINAS</Text>}
        {collapsed && <View style={styles.collapsedSectionDot} />}

        {pageEntries.map((entry) => (
          <TouchableOpacity
            key={entry.path}
            style={[
              styles.sidebarItem,
              collapsed && styles.sidebarItemCollapsed,
              entry.isActive && styles.sidebarItemActive,
              entry.isActive && { borderLeftColor: entry.color },
            ]}
            onPress={() => handleNavigation(entry.path)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.sidebarIconBox,
              entry.isActive && { backgroundColor: `${entry.color}20` },
            ]}>
              <Text style={{ fontSize: 18 }}>{entry.emoji}</Text>
            </View>
            {!collapsed && (
              <Text
                style={[
                  styles.sidebarItemLabel,
                  entry.isActive && { color: entry.color, fontWeight: '600' },
                ]}
                numberOfLines={1}
              >
                {entry.label}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.sidebarFooter}>
        {!collapsed ? (
          <Text style={styles.footerText}>AlphaVest v1.0</Text>
        ) : (
          <Text style={styles.footerTextCollapsed}>GI</Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    backgroundColor: '#111118',
    borderRightWidth: 1,
    borderRightColor: '#1e1e2e',
    height: '100%',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '2px 0 12px rgba(0, 0, 0, 0.3)' }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 2, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 10,
        }),
  },

  // Header
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
    minHeight: 52,
  },
  logoClip: {
    width: 32,
    height: 32,
    borderRadius: 6,
    overflow: 'hidden',
  },
  logoClipCollapsed: {
    width: 28,
    height: 28,
    borderRadius: 6,
    overflow: 'hidden',
  },
  logoImage: {
    width: 32,
    height: 32,
    transform: [{ scale: 2 }],
  },
  logoImageCollapsed: {
    width: 28,
    height: 28,
    transform: [{ scale: 2 }],
  },
  logoText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
    flex: 1,
    marginLeft: 10,
  },
  toggleButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1a1a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content
  sidebarContent: {
    flex: 1,
  },
  sidebarContentInner: {
    paddingVertical: 8,
  },

  // Section label
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4b5563',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 4,
  },
  collapsedSectionDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginVertical: 8,
  },

  // Sidebar items
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 6,
    marginVertical: 1,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  sidebarItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
    marginHorizontal: 6,
  },
  sidebarItemActive: {
    backgroundColor: '#1a1a2e',
  },
  sidebarIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#1a1a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarItemLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#9ca3af',
    marginLeft: 10,
    flex: 1,
  },

  // Badge
  badge: {
    borderRadius: 8,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Separator
  separator: {
    height: 1,
    backgroundColor: '#1e1e2e',
    marginHorizontal: 16,
    marginVertical: 10,
  },
  separatorCollapsed: {
    marginHorizontal: 10,
  },

  // Footer
  sidebarFooter: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e1e2e',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: '#374151',
  },
  footerTextCollapsed: {
    fontSize: 10,
    fontWeight: '700',
    color: '#374151',
  },
});
