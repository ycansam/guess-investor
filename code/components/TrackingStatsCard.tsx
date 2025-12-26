/**
 * Componente para mostrar estadísticas de tracking de predicciones
 * TODO: Migrar a usar backend API
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface TrackingStatsCardProps {
  onClose?: () => void;
}

export const TrackingStatsCard: React.FC<TrackingStatsCardProps> = ({ onClose }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 Estadísticas</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.message}>
          Las estadísticas de tracking serán migradas al backend próximamente.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 20,
    color: '#666',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  message: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});