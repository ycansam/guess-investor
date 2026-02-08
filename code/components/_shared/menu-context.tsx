/**
 * Menu Context
 * Provides global menu state and functions across all pages
 */

import { usePathname, useRouter } from 'expo-router';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { favoritesService } from '../../services/favorites-service-v2';
import { trainingCacheService } from '../../services/training-cache-service';
import { SideMenu, TabType } from '../home/side-menu';

interface MenuContextType {
  showMenu: boolean;
  openMenu: () => void;
  closeMenu: () => void;
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
  const [showMenu, setShowMenu] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>('predictions');

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

  const openMenu = useCallback(() => setShowMenu(true), []);
  const closeMenu = useCallback(() => setShowMenu(false), []);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    closeMenu();
    // Navigate to home if not already there
    if (pathname !== '/') {
      router.push('/');
    }
  }, [pathname, router, closeMenu]);

  return (
    <MenuContext.Provider
      value={{
        showMenu,
        openMenu,
        closeMenu,
        favoritesCount,
        predictionsCount,
        refreshCounts: loadCounts,
        activeTab,
        setActiveTab,
      }}
    >
      {children}
      <SideMenu
        visible={showMenu}
        onClose={closeMenu}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        predictionsCount={predictionsCount}
        favoritesCount={favoritesCount}
      />
    </MenuContext.Provider>
  );
}
