/**
 * Menu Context
 * Provides global sidebar state and functions across all pages.
 * The sidebar is always visible (expanded or collapsed).
 */

import { usePathname, useRouter } from 'expo-router';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { favoritesService } from '../../services/favorites-service-v2';
import { trainingCacheService } from '../../services/training-cache-service';
import {
    PersistentSidebar,
    SIDEBAR_COLLAPSED_WIDTH,
    SIDEBAR_EXPANDED_WIDTH,
    TabType,
} from '../home/side-menu';

interface MenuContextType {
  /** @deprecated Use toggleSidebar instead. Kept for backward compat. */
  showMenu: boolean;
  /** @deprecated No-op. Sidebar is always visible. */
  openMenu: () => void;
  /** @deprecated No-op. Sidebar is always visible. */
  closeMenu: () => void;
  /** Whether the sidebar is collapsed (icon-only mode) */
  sidebarCollapsed: boolean;
  /** Toggle between expanded and collapsed */
  toggleSidebar: () => void;
  /** Current sidebar width in px */
  sidebarWidth: number;
  favoritesCount: number;
  predictionsCount: number;
  refreshCounts: () => Promise<void>;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

const MenuContext = createContext<MenuContextType | null>(null);

export function useMenu() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('useMenu must be used within MenuProvider');
  }
  return context;
}

interface MenuProviderProps {
  children: ReactNode;
}

export function MenuProvider({ children }: MenuProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>('predictions');

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  const loadCounts = useCallback(async () => {
    try {
      await favoritesService.init();
      const favCount = favoritesService.count();
      setFavoritesCount(favCount);

      await trainingCacheService.init();
      const allPredictions = await trainingCacheService.getAllActive();
      setPredictionsCount(allPredictions.length);
    } catch (error) {
      console.error('Error loading counts:', error);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Backward compat stubs
  const openMenu = useCallback(() => {}, []);
  const closeMenu = useCallback(() => {}, []);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    if (pathname !== '/') {
      router.push('/');
    }
  }, [pathname, router]);

  return (
    <MenuContext.Provider
      value={{
        showMenu: !sidebarCollapsed,
        openMenu,
        closeMenu,
        sidebarCollapsed,
        toggleSidebar,
        sidebarWidth,
        favoritesCount,
        predictionsCount,
        refreshCounts: loadCounts,
        activeTab,
        setActiveTab,
      }}
    >
      <View style={styles.root}>
        <PersistentSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          predictionsCount={predictionsCount}
          favoritesCount={favoritesCount}
        />
        <View style={styles.content}>
          {children}
        </View>
      </View>
    </MenuContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
});
