import React, { useState } from 'react';
import { Modal, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { Header } from '../_shared/header';
import { PredictionsList } from '../predictions-list';
import { TrackingStatsCard } from '../TrackingStatsCard';
import { ChatView } from './chat-view';
import { MarketList } from './market-list';
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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

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
        predictionsCount={predictions.length}
      />

      {activeTab === 'market' ? (
        <MarketList />
      ) : activeTab === 'chat' ? (
        <ChatView
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
        />
      ) : (
        <PredictionsList
          predictions={predictions}
          onClear={predictions.length > 0 ? handleClearPredictions : undefined}
          onRemove={handleRemovePrediction}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
});
