import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { dataMigrationService } from '../../services/data-migration-service';
import { favoritesService } from '../../services/favorites-service-v2';
import { trainingCacheService } from '../../services/training-cache-service';
import { Header } from '../_shared/header';
import { TrackingStatsCard } from '../TrackingStatsCard';
import { FavoritesList } from './favorites-list';
import { MarketList } from './market-list';
import { MarketPredictions } from './market-predictions';
import { TabBar, TabType } from './tab-bar';
import { useHome } from './use-home';

// Exponer el servicio de migración en window para debug
if (typeof window !== 'undefined') {
  (window as any).dataMigrationService = dataMigrationService;
}

export function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('explore');
  const [showTracking, setShowTracking] = useState(false);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [migrationChecked, setMigrationChecked] = useState(false);

  const {
    predictions,
    isAnalyzing,
    error,
    handleAnalyzeAsset,
    handleClearPredictions,
    handleRemovePrediction,
  } = useHome();

  // Verificar y migrar datos legacy al inicio
  useEffect(() => {
    const checkAndMigrate = async () => {
      if (migrationChecked) return;
      
      try {
        // Intentar migración si no se ha hecho
        const result = await dataMigrationService.runMigrationIfNeeded();
        
        if (result && result.total > 0) {
          // Mostrar resumen de lo migrado
          const parts = [];
          if (result.predictionTracking.migrated > 0) {
            parts.push(`${result.predictionTracking.migrated} predicciones`);
          }
          if (result.trainingCache.migrated > 0) {
            parts.push(`${result.trainingCache.migrated} cache de training`);
          }
          if (result.learnedWeights.migrated) {
            parts.push('pesos ML');
          }
          
          Alert.alert(
            '✅ Datos migrados',
            `Se migraron: ${parts.join(', ')} al backend.`,
            [{ text: 'OK', onPress: () => setRefreshKey(k => k + 1) }]
          );
        }
      } catch (error) {
        console.error('[Home] Error en migración:', error);
      } finally {
        setMigrationChecked(true);
      }
    };

    checkAndMigrate();
  }, [migrationChecked]);

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
      case 'explore':
        return <MarketList onFavoritesChange={handleFavoritesChange} />;
      case 'predictions':
        return <MarketPredictions />;
      default:
        return <MarketList onFavoritesChange={handleFavoritesChange} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f0f" />

      <Header 
        title="Guess Investor" 
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
