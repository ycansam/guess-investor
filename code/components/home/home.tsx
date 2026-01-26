import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { favoritesService } from '../../services/favorites-service-v2';
import { trainingCacheService } from '../../services/training-cache-service';
import { Header } from '../_shared/header';
import { AlertsModal } from '../alerts-modal';
import { MLDiagnosticsModal } from '../ml-diagnostics-modal';
import { TopTrendsTab } from '../top-trends';
import { TrackingStatsCard } from '../TrackingStatsCard';
import { FavoritesList } from './favorites-list';
import { MarketPredictions } from './market-predictions';
import { TabBar, TabType } from './tab-bar';
import { useHome } from './use-home';

export function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('predictions');
  const [showTracking, setShowTracking] = useState(false);
  const [showMLDiagnostics, setShowMLDiagnostics] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    predictions,
    isAnalyzing,
    error,
    handleAnalyzeAsset,
    handleClearPredictions,
    handleRemovePrediction,
  } = useHome();

  // Cargar conteos
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
  }, [loadCounts, refreshKey]);

  // Refrescar conteos cuando cambia la pestaña
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    loadCounts();
  }, [loadCounts]);

  // Callback para refrescar cuando se cambian favoritos
  const handleFavoritesChange = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

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
        actions={[
          { icon: '🎯', onPress: () => router.push('/screener') },
          { icon: '💼', onPress: () => router.push('/portfolio') },
          { icon: '🔔', onPress: () => setShowAlerts(true) },
          { icon: '🧠', onPress: () => setShowMLDiagnostics(true) },
        ]}
        actionIcon="📊"
        onActionPress={() => setShowTracking(true)}
      />

      {/* Modal de Alertas */}
      <AlertsModal
        visible={showAlerts}
        onClose={() => setShowAlerts(false)}
      />

      {/* Modal de Diagnóstico ML */}
      <MLDiagnosticsModal
        visible={showMLDiagnostics}
        onClose={() => setShowMLDiagnostics(false)}
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

      <TabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        predictionsCount={predictionsCount}
        favoritesCount={favoritesCount}
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
