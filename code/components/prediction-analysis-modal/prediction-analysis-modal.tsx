import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { InvestmentPrediction } from '../../types';
import { styles } from './prediction-analysis-modal.styles';

interface PredictionAnalysisModalProps {
  prediction: InvestmentPrediction;
  onClose: () => void;
}

export const PredictionAnalysisModal: React.FC<PredictionAnalysisModalProps> = ({
  prediction,
  onClose,
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{prediction.asset}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Contenido */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Información básica */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📋 Información Básica</Text>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Símbolo</Text>
                <Text style={styles.value}>{prediction.symbol}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Creada</Text>
                <Text style={styles.value}>{formatDate(prediction.createdAt)}</Text>
              </View>
            </View>

            {/* Predicción */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Predicción</Text>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Dirección</Text>
                <Text style={[styles.value, { fontSize: 18 }]}>
                  {prediction.direction === 'up' ? '📈 Alcista' : prediction.direction === 'down' ? '📉 Bajista' : '➡️ Neutral'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Confianza</Text>
                <Text style={styles.value}>{prediction.confidence}%</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Cambio esperado</Text>
                <Text style={[styles.value, { color: prediction.predictedChange >= 0 ? '#10b981' : '#ef4444' }]}>
                  {prediction.predictedChange >= 0 ? '+' : ''}{prediction.predictedChange.toFixed(2)}%
                </Text>
              </View>
            </View>

            {/* Precios */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💰 Precios</Text>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Precio actual</Text>
                <Text style={styles.value}>{formatPrice(prediction.currentPrice)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Precio objetivo mín.</Text>
                <Text style={styles.value}>{formatPrice(prediction.predictedPriceMin)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Precio objetivo máx.</Text>
                <Text style={styles.value}>{formatPrice(prediction.predictedPriceMax)}</Text>
              </View>
            </View>

            {/* Disclaimer */}
            <View style={styles.section}>
              <Text style={styles.disclaimer}>
                ⚠️ Esta es una predicción basada en análisis técnico y fundamental. No constituye consejo financiero.
              </Text>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeFooterButton} onPress={onClose}>
              <Text style={styles.closeFooterButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
