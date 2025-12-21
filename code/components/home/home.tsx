import React, { useState } from 'react';
import { Modal, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { Header } from '../_shared/header';
import { TrackingStatsCard } from '../TrackingStatsCard';
import { MarketList } from './market-list';
import { MarketPredictions } from './market-predictions';
import { TabBar, TabType } from './tab-bar';
import { useHome } from './use-home';
export function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('market');
  const [showTracking, setShowTracking] = useState(false);

  const {
    messages,
    isLoading,
    predictions,
    handleSendMessage,
    handleClearPredictions,
    handleRemovePrediction,
  } = useHome();

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
        onTabChange={setActiveTab}
        predictionsCount={0}
      />

      {activeTab === 'market' ? (
        <MarketList />
      ) : (
        <MarketPredictions />
      )}
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
