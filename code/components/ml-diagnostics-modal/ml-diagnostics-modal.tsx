/**
 * Modal de Diagnóstico ML
 * Muestra pesos aprendidos, clasificadores de activos y estado del sistema ML
 */

import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { colors } from '../../config/theme';
import { apiClient, MLModelsStatus, MLWeightsStatus, WeightComparison } from '../../services/api-client';

interface MLDiagnosticsModalProps {
  visible: boolean;
  onClose: () => void;
}

type TabType = 'weights' | 'classifiers' | 'models';
type TimeframeType = 'intraday' | 'swing' | 'long';

export const MLDiagnosticsModal: React.FC<MLDiagnosticsModalProps> = ({
  visible,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weightsData, setWeightsData] = useState<MLWeightsStatus | null>(null);
  const [modelsData, setModelsData] = useState<MLModelsStatus | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('weights');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeType>('intraday');

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [weights, models] = await Promise.all([
        apiClient.getMLWeightsStatus(),
        apiClient.getMLStatus(),
      ]);
      setWeightsData(weights);
      setModelsData(models);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos ML');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getChangeColor = (changePercent: number) => {
    if (changePercent > 10) return colors.success;
    if (changePercent < -10) return colors.danger;
    if (changePercent > 5) return '#22c55e88';
    if (changePercent < -5) return '#ef444488';
    return colors.textSecondary;
  };

  const renderWeightRow = (name: string, comparison: WeightComparison) => (
    <View key={name} style={styles.weightRow}>
      <Text style={styles.weightName}>{name}</Text>
      <Text style={styles.weightValue}>{(comparison.learned * 100).toFixed(1)}%</Text>
      <Text style={[styles.weightChange, { color: getChangeColor(comparison.changePercent) }]}>
        {comparison.change}
      </Text>
      <View style={styles.weightBar}>
        <View 
          style={[
            styles.weightBarFill, 
            { 
              width: `${Math.min(comparison.learned * 400, 100)}%`,
              backgroundColor: getChangeColor(comparison.changePercent),
            }
          ]} 
        />
      </View>
    </View>
  );

  const renderWeightsTab = () => {
    if (!weightsData) return null;
    const comparison = weightsData.comparison[selectedTimeframe];

    return (
      <View style={styles.tabContent}>
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>🕐 Última actualización</Text>
            <Text style={styles.summaryValue}>{formatDate(weightsData.summary.lastUpdated)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>📊 Muestras entrenadas</Text>
            <Text style={styles.summaryValue}>{weightsData.summary.trainingSamples}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>✅ Pesos aprendidos</Text>
            <Text style={[styles.summaryValue, { color: weightsData.summary.hasLearnedWeights ? colors.success : colors.danger }]}>
              {weightsData.summary.hasLearnedWeights ? 'Activos' : 'No disponibles'}
            </Text>
          </View>
        </View>

        {/* Timeframe Selector */}
        <View style={styles.timeframeSelector}>
          {(['intraday', 'swing', 'long'] as TimeframeType[]).map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[styles.timeframeButton, selectedTimeframe === tf && styles.timeframeButtonActive]}
              onPress={() => setSelectedTimeframe(tf)}
            >
              <Text style={[styles.timeframeText, selectedTimeframe === tf && styles.timeframeTextActive]}>
                {tf === 'intraday' ? '📅 Intradía' : tf === 'swing' ? '📆 Swing' : '📈 Largo'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Weights List */}
        <View style={styles.weightsContainer}>
          <View style={styles.weightsHeader}>
            <Text style={styles.weightsHeaderText}>Factor</Text>
            <Text style={styles.weightsHeaderText}>Peso</Text>
            <Text style={styles.weightsHeaderText}>Cambio</Text>
            <Text style={styles.weightsHeaderText}>Visual</Text>
          </View>
          {comparison && Object.entries(comparison)
            .sort((a, b) => b[1].learned - a[1].learned)
            .map(([name, comp]) => renderWeightRow(name, comp))}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>📖 Interpretación:</Text>
          <Text style={styles.legendText}>
            <Text style={{ color: colors.success }}>Verde</Text>: El ML aprendió que es más importante{'\n'}
            <Text style={{ color: colors.danger }}>Rojo</Text>: El ML aprendió que es menos importante{'\n'}
            <Text style={{ color: colors.textSecondary }}>Gris</Text>: Similar al peso base
          </Text>
        </View>
      </View>
    );
  };

  const renderClassifiersTab = () => {
    if (!weightsData) return null;

    const groupDescriptions: Record<string, { emoji: string; description: string }> = {
      large_cap_stock: { emoji: '🏢', description: 'Grandes empresas (Apple, Microsoft, Google)' },
      small_cap_stock: { emoji: '🏪', description: 'Empresas pequeñas con alta volatilidad' },
      crypto_major: { emoji: '₿', description: 'Bitcoin, Ethereum y criptos principales' },
      crypto_alt: { emoji: '🪙', description: 'Altcoins y criptomonedas menores' },
      etf_index: { emoji: '📊', description: 'ETFs e índices bursátiles' },
      commodity: { emoji: '🥇', description: 'Oro, plata, petróleo, gas' },
      reit: { emoji: '🏠', description: 'Fondos inmobiliarios' },
      forex: { emoji: '💱', description: 'Pares de divisas' },
      adr: { emoji: '🌍', description: 'Acciones extranjeras en USA' },
      default: { emoji: '📋', description: 'Clasificación genérica' },
    };

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>🏷️ Clasificadores de Activos</Text>
        <Text style={styles.sectionSubtitle}>
          Cada tipo de activo recibe multiplicadores diferentes para los factores de predicción
        </Text>

        <ScrollView style={styles.classifiersList}>
          {weightsData.availableAssetGroups.map((group) => {
            const info = groupDescriptions[group] || { emoji: '📋', description: group };
            const multipliers = weightsData.assetGroupMultipliers[group] || {};
            const hasMultipliers = Object.keys(multipliers).length > 0;

            return (
              <View key={group} style={styles.classifierCard}>
                <View style={styles.classifierHeader}>
                  <Text style={styles.classifierEmoji}>{info.emoji}</Text>
                  <View style={styles.classifierInfo}>
                    <Text style={styles.classifierName}>{group.replace(/_/g, ' ')}</Text>
                    <Text style={styles.classifierDescription}>{info.description}</Text>
                  </View>
                </View>

                {hasMultipliers && (
                  <View style={styles.multipliersList}>
                    {Object.entries(multipliers).map(([factor, mult]) => {
                      const multNum = mult as number;
                      const isBoost = multNum > 1;
                      const isReduce = multNum < 1;
                      return (
                        <View key={factor} style={styles.multiplierItem}>
                          <Text style={styles.multiplierFactor}>{factor}</Text>
                          <Text style={[
                            styles.multiplierValue,
                            isBoost && styles.multiplierBoost,
                            isReduce && styles.multiplierReduce,
                          ]}>
                            {isBoost ? '↑' : isReduce ? '↓' : '='} {(multNum * 100).toFixed(0)}%
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {!hasMultipliers && (
                  <Text style={styles.noMultipliers}>Sin ajustes especiales (usa pesos base)</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderModelsTab = () => {
    if (!modelsData) return null;

    const modelInfo = [
      { key: 'reinforcementLearning', name: 'Aprendizaje por Refuerzo', emoji: '🎮', 
        detail: `${modelsData.reinforcementLearning.totalEpisodes} episodios` },
      { key: 'probabilisticModel', name: 'Modelo Probabilístico', emoji: '🎲',
        detail: `${modelsData.probabilisticModel.sampleCount} muestras` },
      { key: 'factorCorrelation', name: 'Correlación de Factores', emoji: '🔗', detail: '' },
      { key: 'metaLearning', name: 'Meta-Aprendizaje', emoji: '🧠', detail: '' },
      { key: 'featureEngineering', name: 'Ingeniería de Features', emoji: '⚙️', detail: '' },
      { key: 'temporalCrossValidation', name: 'Validación Temporal', emoji: '📅', detail: '' },
    ];

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>🤖 Modelos ML Activos</Text>
        <Text style={styles.sectionSubtitle}>
          Estado de cada componente del sistema de Machine Learning
        </Text>

        <View style={styles.modelsList}>
          {modelInfo.map((model) => {
            const data = modelsData[model.key as keyof MLModelsStatus] as { status: string };
            const status = data?.status || 'unknown';
            const isActive = status === 'active' || status === 'trained' || status === 'calibrating';

            return (
              <View key={model.key} style={styles.modelCard}>
                <Text style={styles.modelEmoji}>{model.emoji}</Text>
                <View style={styles.modelInfo}>
                  <Text style={styles.modelName}>{model.name}</Text>
                  {model.detail && <Text style={styles.modelDetail}>{model.detail}</Text>}
                </View>
                <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
                  <Text style={styles.statusText}>{status}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Calidad del Sistema */}
        <View style={styles.qualityCard}>
          <Text style={styles.qualityTitle}>📊 Calidad del Sistema</Text>
          <View style={styles.qualityRow}>
            <Text style={styles.qualityLabel}>Predicciones entrenadas</Text>
            <Text style={styles.qualityValue}>{weightsData?.summary.trainingSamples || 0}</Text>
          </View>
          <View style={styles.qualityRow}>
            <Text style={styles.qualityLabel}>Episodios RL</Text>
            <Text style={styles.qualityValue}>{modelsData.reinforcementLearning.totalEpisodes}</Text>
          </View>
          <View style={styles.qualityRow}>
            <Text style={styles.qualityLabel}>Tasa de éxito RL</Text>
            <Text style={[styles.qualityValue, { color: modelsData.reinforcementLearning.successRate > 0.5 ? colors.success : colors.warning }]}>
              {(modelsData.reinforcementLearning.successRate * 100).toFixed(1)}%
            </Text>
          </View>
          <View style={styles.qualityRow}>
            <Text style={styles.qualityLabel}>Muestras calibración</Text>
            <Text style={styles.qualityValue}>{modelsData.probabilisticModel.sampleCount}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Cargando diagnóstico ML...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        {/* Tabs */}
        <View style={styles.tabs}>
          {[
            { key: 'weights', label: '⚖️ Pesos' },
            { key: 'classifiers', label: '🏷️ Clasificadores' },
            { key: 'models', label: '🤖 Modelos' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key as TabType)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.scrollContent}>
          {activeTab === 'weights' && renderWeightsTab()}
          {activeTab === 'classifiers' && renderClassifiersTab()}
          {activeTab === 'models' && renderModelsTab()}
        </ScrollView>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>🧠 Diagnóstico ML</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    color: colors.textSecondary,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: colors.text,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  timeframeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 8,
    alignItems: 'center',
  },
  timeframeButtonActive: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  timeframeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  timeframeTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  weightsContainer: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  weightsHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  weightsHeaderText: {
    flex: 1,
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  weightName: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
  weightValue: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  weightChange: {
    flex: 1,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  weightBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  weightBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  legend: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  legendText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  classifiersList: {
    flex: 1,
  },
  classifierCard: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  classifierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  classifierEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  classifierInfo: {
    flex: 1,
  },
  classifierName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'capitalize',
  },
  classifierDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  multipliersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  multiplierItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  multiplierFactor: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  multiplierValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  multiplierBoost: {
    color: colors.success,
  },
  multiplierReduce: {
    color: colors.danger,
  },
  noMultipliers: {
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  modelsList: {
    marginBottom: 16,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  modelEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  modelDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: colors.successLight,
  },
  statusInactive: {
    backgroundColor: colors.neutralLight,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'capitalize',
  },
  qualityCard: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 16,
  },
  qualityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  qualityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  qualityLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  qualityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
