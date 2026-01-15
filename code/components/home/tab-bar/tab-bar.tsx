import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type TabType = 'favorites' | 'predictions';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  predictionsCount: number;
  favoritesCount?: number;
}

export function TabBar({ activeTab, onTabChange, predictionsCount, favoritesCount = 0 }: TabBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'favorites' && styles.activeTab]}
        onPress={() => onTabChange('favorites')}
      >
        <Ionicons
          name={activeTab === 'favorites' ? 'heart' : 'heart-outline'}
          size={18}
          color={activeTab === 'favorites' ? '#ef4444' : '#6b7280'}
        />
        <Text style={[styles.tabText, activeTab === 'favorites' && styles.activeTabTextFav]}>
          Favoritos
        </Text>
        {favoritesCount > 0 && (
          <View style={styles.badgeFav}>
            <Text style={styles.badgeText}>{favoritesCount > 99 ? '99+' : favoritesCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'predictions' && styles.activeTab]}
        onPress={() => onTabChange('predictions')}
      >
        <Ionicons
          name="bulb-outline"
          size={18}
          color={activeTab === 'predictions' ? '#f59e0b' : '#6b7280'}
        />
        <Text style={[styles.tabText, activeTab === 'predictions' && styles.activeTabTextPred]}>
          Predic.
        </Text>
        {predictionsCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{predictionsCount > 99 ? '99+' : predictionsCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
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
    backgroundColor: '#252525',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    marginLeft: 4,
  },
  activeTabText: {
    color: '#6366f1',
    fontWeight: '600',
  },
  activeTabTextFav: {
    color: '#ef4444',
    fontWeight: '600',
  },
  activeTabTextPred: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    paddingHorizontal: 4,
  },
  badgeFav: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
