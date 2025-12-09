import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🤖💰</Text>
      <Text style={styles.title}>Bienvenido a Guess Investor</Text>
      <Text style={styles.text}>
        Soy tu asistente de inversiones con IA.{'\n'}
        Pregúntame sobre cualquier activo:{'\n'}
        acciones, criptomonedas, forex, commodities...
      </Text>
      <View style={styles.tipContainer}>
        <Text style={styles.tipTitle}>💡 Ejemplos de preguntas:</Text>
        <Text style={styles.tipText}>• ¿Qué opinas de Bitcoin para esta semana?</Text>
        <Text style={styles.tipText}>• Analiza las acciones de Apple</Text>
        <Text style={styles.tipText}>• ¿Es buen momento para invertir en oro?</Text>
        <Text style={styles.tipText}>• Compara Tesla vs Nvidia</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  tipContainer: {
    backgroundColor: '#F0F7FF',
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#444',
    marginBottom: 4,
  },
});
