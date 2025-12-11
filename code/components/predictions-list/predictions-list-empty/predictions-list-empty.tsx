import React from 'react';
import { Text, View } from 'react-native';
import { styles } from './predictions-list-empty.styles';

export const PredictionsListEmpty: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📊</Text>
      <Text style={styles.title}>Sin predicciones aún</Text>
      <Text style={styles.text}>
        Pregunta al asistente sobre cualquier activo para obtener predicciones
      </Text>
    </View>
  );
};
