import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from './header.styles';

interface HeaderAction {
  icon: string;
  onPress: () => void;
}

interface HeaderProps {
  title: string;
  emoji?: string;
  actionIcon?: string;
  onActionPress?: () => void;
  actions?: HeaderAction[];
}

export function Header({ title, emoji = '📈', actionIcon, onActionPress, actions }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.actionsContainer}>
        {actions?.map((action, index) => (
          <TouchableOpacity key={index} onPress={action.onPress} style={styles.actionButton}>
            <Text style={styles.actionIcon}>{action.icon}</Text>
          </TouchableOpacity>
        ))}
        {actionIcon && onActionPress && (
          <TouchableOpacity onPress={onActionPress} style={styles.actionButton}>
            <Text style={styles.actionIcon}>{actionIcon}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
