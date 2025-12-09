import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { styles } from './quick-actions.styles';

interface QuickAction {
  label: string;
  emoji: string;
  prompt: string;
}

interface QuickActionsProps {
  onAction: (prompt: string) => void;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Bitcoin',
    emoji: '🪙',
    prompt: '¿Cuál es tu predicción para Bitcoin esta semana?',
  },
  {
    label: 'S&P 500',
    emoji: '📊',
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

export const QuickActions: React.FC<QuickActionsProps> = ({ onAction }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚡ Análisis Rápido</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {QUICK_ACTIONS.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={styles.actionButton}
            onPress={() => onAction(action.prompt)}
          >
            <Text style={styles.actionEmoji}>{action.emoji}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
