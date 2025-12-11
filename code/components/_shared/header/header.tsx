import React from 'react';
import { Text, View } from 'react-native';
import { styles } from './header.styles';

interface HeaderProps {
  title: string;
  emoji?: string;
}

export function Header({ title, emoji = '📈' }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}
