import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Header } from '../_shared/header';
import { useMenu } from '../_shared/menu-context';
import { TopTrendsTab } from '../top-trends';
import { FavoritesList } from './favorites-list';
import { MarketPredictions } from './market-predictions';
import { TabType } from './side-menu';
import { useHome } from './use-home';

export function Home() {
  const router = useRouter();
  const { activeTab, setActiveTab, openMenu, refreshCounts } = useMenu();
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    predictions,
    isAnalyzing,
    error,
    handleAnalyzeAsset,
    handleClearPredictions,
    handleRemovePrediction,
  } = useHome();

  // Refrescar conteos cuando cambia la pestaña
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    refreshCounts();
  }, [setActiveTab, refreshCounts]);

  // Callback para refrescar cuando se cambian favoritos
  const handleFavoritesChange = useCallback(() => {
    setRefreshKey(k => k + 1);
    refreshCounts();
  }, [refreshCounts]);

  const renderContent = () => {
    switch (activeTab) {
      case 'favorites':
        return <FavoritesList onFavoritesChange={handleFavoritesChange} />;
      case 'predictions':
        return <MarketPredictions />;
      case 'trends':
        return <TopTrendsTab />;
      default:
        return <MarketPredictions />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f0f" />

      <Header 
        title="Guess Investor"
        onMenuPress={openMenu}
        actions={[
          { icon: '🎯', onPress: () => router.push('/screener') },
        ]}
      />

      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
});
