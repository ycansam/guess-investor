import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from './predictions-list-empty.styles';

interface PredictionsListEmptyProps {
  onClose?: () => void;
}

export const PredictionsListEmpty: React.FC<PredictionsListEmptyProps> = ({ onClose }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📊</Text>
      <Text style={styles.title}>Sin predicciones aún</Text>
      <Text style={styles.text}>
        Pregunta al asistente sobre cualquier activo para obtener predicciones
      </Text>
      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Cerrar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
