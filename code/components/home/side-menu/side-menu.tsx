import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

export type TabType = 'favorites' | 'predictions' | 'trends';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  key: TabType;
  icon: IoniconsName;
  iconOutline: IoniconsName;
  label: string;
  color: string;
  count: number;
}

interface SideMenuProps {
  visible: boolean;
  onClose: () => void;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  predictionsCount: number;
  favoritesCount?: number;
}

const MENU_WIDTH = 280;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function SideMenu({
  visible,
  onClose,
  activeTab,
  onTabChange,
  predictionsCount,
  favoritesCount = 0,
}: SideMenuProps) {
  const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -MENU_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const handleTabSelect = (tab: TabType) => {
    onTabChange(tab);
    onClose();
  };

  const menuItems: MenuItem[] = [
    {
      key: 'favorites',
      icon: 'heart',
      iconOutline: 'heart-outline',
      label: 'Favoritos',
      color: '#ef4444',
      count: favoritesCount,
    },
    {
      key: 'predictions',
      icon: 'bulb',
      iconOutline: 'bulb-outline',
      label: 'Predicciones IA',
      color: '#f59e0b',
      count: predictionsCount,
    },
    {
      key: 'trends',
      icon: 'flame',
      iconOutline: 'flame-outline',
      label: 'Trends',
      color: '#f97316',
      count: 0,
    },
  ];

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Overlay oscuro */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        {/* Menú lateral desde la izquierda */}
        <Animated.View
          style={[
            styles.menu,
            {
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          {/* Header del menú */}
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Navegación</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Items del menú */}
          <View style={styles.menuContent}>
            {menuItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => handleTabSelect(item.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, isActive && { backgroundColor: `${item.color}20` }]}>
                    <Ionicons
                      name={isActive ? item.icon : item.iconOutline}
                      size={22}
                      color={isActive ? item.color : '#6b7280'}
                    />
                  </View>
                  <Text style={[styles.menuItemText, isActive && { color: item.color }]}>
                    {item.label}
                  </Text>
                  {item.count > 0 && (
                    <View style={[styles.badge, { backgroundColor: item.color }]}>
                      <Text style={styles.badgeText}>
                        {item.count > 99 ? '99+' : item.count}
                      </Text>
                    </View>
                  )}
                  {isActive && (
                    <View style={[styles.activeIndicator, { backgroundColor: item.color }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer del menú */}
          <View style={styles.menuFooter}>
            <Text style={styles.footerText}>Guess Investor v1.0</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  menu: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: MENU_WIDTH,
    backgroundColor: '#1a1a1a',
    borderRightWidth: 1,
    borderRightColor: '#2e2e2e',
    ...(Platform.OS === 'web' ? { boxShadow: '4px 0 20px rgba(0, 0, 0, 0.3)' } : {
      shadowColor: '#000',
      shadowOffset: { width: 4, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 20,
    }),
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2e2e2e',
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    padding: 4,
  },
  menuContent: {
    flex: 1,
    paddingVertical: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 12,
    position: 'relative',
  },
  menuItemActive: {
    backgroundColor: '#252525',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#9ca3af',
    flex: 1,
  },
  badge: {
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '25%',
    bottom: '25%',
    width: 3,
    borderRadius: 2,
  },
  menuFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#2e2e2e',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#4b5563',
  },
});
