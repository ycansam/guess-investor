import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type TabType = 'market' | 'chat' | 'predictions';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  predictionsCount: number;
}

export function TabBar({ activeTab, onTabChange, predictionsCount }: TabBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'market' && styles.activeTab]}
        onPress={() => onTabChange('market')}
      >
        <Ionicons
          name="trending-up-outline"
          size={20}
          color={activeTab === 'market' ? '#007AFF' : '#666'}
        />
        <Text style={[styles.tabText, activeTab === 'market' && styles.activeTabText]}>
          Mercado
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
        onPress={() => onTabChange('chat')}
      >
        <Ionicons
          name="chatbubbles-outline"
          size={20}
          color={activeTab === 'chat' ? '#007AFF' : '#666'}
        />
        <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>
          Chat
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.tab, activeTab === 'predictions' && styles.activeTab]}
        onPress={() => onTabChange('predictions')}
      >
        <Ionicons
          name="analytics-outline"
          size={20}
          color={activeTab === 'predictions' ? '#007AFF' : '#666'}
        />
        <Text style={[styles.tabText, activeTab === 'predictions' && styles.activeTabText]}>
          {predictionsCount > 0 ? `(${predictionsCount})` : 'Pred.'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginLeft: 6,
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
