import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { styles } from './quick-actions.styles';

interface QuickAction {
  label: string;
  emoji: string;
  prompt?: string;
  route?: string;
  action?: string; // Para acciones especiales como abrir modal
}

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  onSpecialAction?: (action: string) => void;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Alertas',
    emoji: '🔔',
    action: 'alerts',
  },
  {
    label: 'Comparar',
    emoji: '📊',
    route: '/compare',
  },
  {
    label: 'Bitcoin',
    emoji: '🪙',
    prompt: '¿Cuál es tu predicción para Bitcoin esta semana?',
  },
  {
    label: 'S&P 500',
    emoji: '📈',
    prompt: 'Analiza el índice S&P 500 y dame tu predicción',
  },
  {
    label: 'Oro',
    emoji: '🥇',
    prompt: '¿Cómo ves el precio del oro para el próximo mes?',
  },
  {
    label: 'EUR/USD',
    emoji: '💱',
    prompt: 'Dame un análisis del par EUR/USD',
  },
  {
    label: 'Tesla',
    emoji: '🚗',
    prompt: '¿Qué opinas de las acciones de Tesla ahora?',
  },
  {
    label: 'Ethereum',
    emoji: '💎',
    prompt: 'Analiza Ethereum y su potencial',
  },
];

export const QuickActions: React.FC<QuickActionsProps> = ({ onAction, onSpecialAction }) => {
  const router = useRouter();

  const handleAction = (action: QuickAction) => {
    if (action.route) {
      router.push(action.route as any);
    } else if (action.action && onSpecialAction) {
      onSpecialAction(action.action);
    } else if (action.prompt) {
      onAction(action.prompt);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚡ Acciones Rápidas</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {QUICK_ACTIONS.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.actionButton,
              action.route && { backgroundColor: '#1a1a3e', borderColor: '#6366f1', borderWidth: 1 },
              action.action && { backgroundColor: '#2d1f0f', borderColor: '#FF9800', borderWidth: 1 }
            ]}
            onPress={() => handleAction(action)}
          >
            <Text style={styles.actionEmoji}>{action.emoji}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
