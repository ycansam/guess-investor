import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Header } from '../_shared/header';
import { PredictionsList } from '../predictions-list';
import { ChatView } from './chat-view';
import { TabBar, TabType } from './tab-bar';
import { useHome } from './use-home';

export function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  const {
    messages,
    isLoading,
    predictions,
    handleSendMessage,
    handleClearPredictions,
  } = useHome();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <Header title="Guess Investor" />

      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        predictionsCount={predictions.length}
      />

      {activeTab === 'chat' ? (
        <ChatView
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
        />
      ) : (
        <PredictionsList
          predictions={predictions}
          onClear={predictions.length > 0 ? handleClearPredictions : undefined}
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
});
