import React from 'react';
import { Text, View } from 'react-native';
import { styles } from './prediction-card-footer.styles';

interface PredictionCardFooterProps {
  createdAt: Date;
}

export const PredictionCardFooter: React.FC<PredictionCardFooterProps> = ({ createdAt }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.timestamp}>
        {createdAt.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
      <Text style={styles.disclaimer}>⚠️ No es consejo financiero</Text>
    </View>
  );
};
