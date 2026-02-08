import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Modal, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { Header } from '../_shared/header';
import { useMenu } from '../_shared/menu-context';
import { TopTrendsTab } from '../top-trends';
import { TrackingStatsCard } from '../TrackingStatsCard';
import { FavoritesList } from './favorites-list';
import { MarketPredictions } from './market-predictions';
import { TabType } from './side-menu';
import { useHome } from './use-home';

export function Home() {
  const router = useRouter();
  const { activeTab, setActiveTab, openMenu, refreshCounts } = useMenu();
  const [showTracking, setShowTracking] = useState(false);
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
        actionIcon="📊"
        onActionPress={() => setShowTracking(true)}
      />

      {/* Modal de Tracking Stats */}
      <Modal
        visible={showTracking}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTracking(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TrackingStatsCard onClose={() => setShowTracking(false)} />
          </View>
        </View>
      </Modal>

      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
