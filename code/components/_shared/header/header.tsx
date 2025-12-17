import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from './header.styles';

interface HeaderProps {
  title: string;
  emoji?: string;
  actionIcon?: string;
  onActionPress?: () => void;
}

export function Header({ title, emoji = '📈', actionIcon, onActionPress }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {actionIcon && onActionPress && (
        <TouchableOpacity onPress={onActionPress} style={styles.actionButton}>
          <Text style={styles.actionIcon}>{actionIcon}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
