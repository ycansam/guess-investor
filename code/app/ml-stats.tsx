/**
 * ML Stats Dashboard
 * Dashboard completo de métricas del sistema de machine learning
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { apiClient, MLModelsStatus, MLWeightsStatus } from '../services/api-client';
import { TrackingStats } from '../services/prediction-tracking-service';

type TabType = 'overview' | 'weights' | 'models';
type TimeframeType = 'intraday' | 'swing' | 'long';

// Multiplicadores base estáticos (v1.6.0 - 14 factores)
const BASE_STATIC_MULTIPLIERS: Record<string, Record<string, number>> = {
  large_cap_stock: { financials: 1.5, institutional: 1.4, optionsFlow: 1.3, news: 1.2 },
  small_cap_stock: { technical: 1.4, intradayTrend: 1.4, trend: 1.3, divergences: 1.3 },
  crypto_major: { sentiment: 1.5, intradayTrend: 1.5, technical: 1.4, volumeProfile: 1.3 },
  crypto_alt: { sentiment: 1.8, intradayTrend: 1.8, technical: 1.6, divergences: 1.6 },
  etf_index: { macro: 1.5, marketBreadth: 1.5, institutional: 1.3, optionsFlow: 1.2 },
  commodity: { macro: 1.8, forex: 1.6, volatilityIV: 1.4, volumeProfile: 1.3 },
  reit: { financials: 1.8, macro: 1.6, marketBreadth: 1.1 },
  forex: { macro: 1.8, intradayTrend: 1.6, technical: 1.4, volumeProfile: 1.4 },
  adr: { forex: 1.6, financials: 1.4 },
  default: {},
};

// Descripciones de grupos de activos
const GROUP_DESCRIPTIONS: Record<string, { emoji: string; description: string }> = {
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

// 14 factores: 8 tradicionales + 6 intradía
const ALL_FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro', 'forex', 'institutional', 'financials',
  'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'volatilityIV', 'marketBreadth'
];

export default function MLStatsPage() {
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [weightsStatus, setWeightsStatus] = useState<MLWeightsStatus | null>(null);
  const [mlModels, setMlModels] = useState<MLModelsStatus | null>(null);
  


  // Selectores
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeType>('intraday');
  const [selectedAssetGroup, setSelectedAssetGroup] = useState<string>('large_cap_stock');

  // Action button states
  const [isRelearning, setIsRelearning] = useState(false);
  const [relearnResult, setRelearnResult] = useState<string | null>(null);
  const [isResettingModels, setIsResettingModels] = useState(false);
  const [resetModelsResult, setResetModelsResult] = useState<string | null>(null);
  const [isRetrainingClassifiers, setIsRetrainingClassifiers] = useState(false);
  const [retrainClassifiersResult, setRetrainClassifiersResult] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyProgress, setVerifyProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [statsData, weightsData, modelsData] = await Promise.all([
        apiClient.getPredictionStats(),
        apiClient.getMLWeightsStatus().catch(() => null),
        apiClient.getMLStatus().catch(() => null),
      ]);
      
      setStats(statsData);
      setWeightsStatus(weightsData);
      setMlModels(modelsData);
    } catch (error) {
      console.error('Error loading ML stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Action handlers
  const handleForceRelearn = async () => {
    setIsRelearning(true);
    setRelearnResult(null);
    try {
      const result = await apiClient.forceRelearn();
      setRelearnResult(result.message);
      await loadAllData();
    } catch (err) {
      setRelearnResult(`❌ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsRelearning(false);
    }
  };

  const handleResetModels = async () => {
    setIsResettingModels(true);
    setResetModelsResult(null);
    try {
      const result = await apiClient.resetAllML();
      setResetModelsResult(`✅ Reset completado: ${result.predictions} predicciones, ${result.cache} cache, pesos: ${result.weights ? 'sí' : 'no'}, Python: ${result.pythonReset ? 'sí' : 'no'}`);
      await loadAllData();
    } catch (err) {
      setResetModelsResult(`❌ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsResettingModels(false);
    }
  };

  const handleRetrainClassifiers = async () => {
    setIsRetrainingClassifiers(true);
    setRetrainClassifiersResult(null);
    try {
      const result = await apiClient.forceRelearn();
      setRetrainClassifiersResult(`✅ Clasificadores actualizados: ${result.classifiersLearned} grupos de ${result.withFactorData} predicciones`);
      await loadAllData();
    } catch (err) {
      setRetrainClassifiersResult(`❌ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsRetrainingClassifiers(false);
    }
  };

  const handleVerifyPending = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    const total = stats?.pending || 0;
    setVerifyProgress({ done: 0, total });
    try {
      const result = await apiClient.verifyAllPending((done, totalPending) => {
        setVerifyProgress({ done, total: totalPending });
      });
      setVerifyProgress({ done: result.verified, total });
      setVerifyResult(`✅ Verificadas ${result.verified}/${total} predicciones`);
      await loadAllData();
    } catch (err) {
      setVerifyResult(`❌ Error: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsVerifying(false);
      setVerifyProgress(null);
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
    if (changePercent > 10) return '#10b981';
    if (changePercent < -10) return '#ef4444';
    if (changePercent > 5) return '#22c55e88';
    if (changePercent < -5) return '#ef444488';
    return '#94a3b8';
  };

  const getMultiplierColor = (mult: number) => {
    if (mult > 1.3) return '#10b981';
    if (mult < 0.7) return '#ef4444';
    if (mult > 1.1) return '#22c55e88';
    if (mult < 0.9) return '#ef444488';
    return '#94a3b8';
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.title}>🧠 Dashboard ML</Text>
      </View>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Atrás</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabs}>
      {[
        { id: 'overview' as TabType, label: '📊 Overview', icon: 'stats-chart' },
        { id: 'weights' as TabType, label: '⚖️ Pesos', icon: 'scale' },
        { id: 'models' as TabType, label: '🤖 Modelos', icon: 'hardware-chip' },
      ].map(tab => (
        <TouchableOpacity
          key={tab.id}
          style={[styles.tab, activeTab === tab.id && styles.activeTab]}
          onPress={() => setActiveTab(tab.id)}
        >
          <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderOverview = () => (
    <View style={styles.section}>
      {/* Resumen principal */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📈 Resumen del Sistema</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.total || 0}</Text>
            <Text style={styles.statLabel}>Total Predicciones</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats?.verified || 0}</Text>
            <Text style={styles.statLabel}>Verificadas</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: (stats?.directionAccuracy || 0) >= 55 ? '#10b981' : '#ef4444' }]}>
              {stats?.directionAccuracy?.toFixed(1) || 0}%
            </Text>
            <Text style={styles.statLabel}>Precisión Dirección</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: (stats?.avgAccuracyScore || 0) >= 60 ? '#10b981' : '#f59e0b' }]}>
              {stats?.avgAccuracyScore?.toFixed(0) || 0}
            </Text>
            <Text style={styles.statLabel}>Score Promedio</Text>
          </View>
        </View>
      </View>

      {/* Calidad */}
      {stats && stats.verified > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⭐ Distribución de Calidad</Text>
          <View style={styles.qualityGrid}>
            <View style={[styles.qualityBox, { backgroundColor: '#10b98120' }]}>
              <Text style={styles.qualityEmoji}>🎯</Text>
              <Text style={[styles.qualityValue, { color: '#10b981' }]}>{stats.byQuality.excellent}</Text>
              <Text style={styles.qualityLabel}>Excelente</Text>
            </View>
            <View style={[styles.qualityBox, { backgroundColor: '#3b82f620' }]}>
              <Text style={styles.qualityEmoji}>👍</Text>
              <Text style={[styles.qualityValue, { color: '#3b82f6' }]}>{stats.byQuality.good}</Text>
              <Text style={styles.qualityLabel}>Buena</Text>
            </View>
            <View style={[styles.qualityBox, { backgroundColor: '#f59e0b20' }]}>
              <Text style={styles.qualityEmoji}>⚠️</Text>
              <Text style={[styles.qualityValue, { color: '#f59e0b' }]}>{stats.byQuality.poor || 0}</Text>
              <Text style={styles.qualityLabel}>Pobre</Text>
            </View>
            <View style={[styles.qualityBox, { backgroundColor: '#ef444420' }]}>
              <Text style={styles.qualityEmoji}>❌</Text>
              <Text style={[styles.qualityValue, { color: '#ef4444' }]}>{stats.byQuality.failed}</Text>
              <Text style={styles.qualityLabel}>Fallida</Text>
            </View>
          </View>
        </View>
      )}

      {/* Precisión por Dirección */}
      {stats && stats.verified > 0 && stats.byDirection && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Acierto por Dirección</Text>
          <Text style={styles.cardSubtitle}>Precisión del sistema según la dirección predicha</Text>
          <View style={styles.directionStatsGrid}>
            {/* Subida */}
            <View style={styles.directionStatBox}>
              <Text style={styles.directionEmoji}>📈</Text>
              <Text style={styles.directionLabel}>Subida</Text>
              <Text style={[styles.directionAccuracy, { color: stats.byDirection.up.total > 0 && (stats.byDirection.up.correct / stats.byDirection.up.total) >= 0.5 ? '#10b981' : '#ef4444' }]}>
                {stats.byDirection.up.total > 0 
                  ? `${((stats.byDirection.up.correct / stats.byDirection.up.total) * 100).toFixed(0)}%`
                  : '-'}
              </Text>
              <Text style={styles.directionCount}>{stats.byDirection.up.correct}/{stats.byDirection.up.total}</Text>
            </View>
            {/* Bajada */}
            <View style={styles.directionStatBox}>
              <Text style={styles.directionEmoji}>📉</Text>
              <Text style={styles.directionLabel}>Bajada</Text>
              <Text style={[styles.directionAccuracy, { color: stats.byDirection.down.total > 0 && (stats.byDirection.down.correct / stats.byDirection.down.total) >= 0.5 ? '#10b981' : '#ef4444' }]}>
                {stats.byDirection.down.total > 0 
                  ? `${((stats.byDirection.down.correct / stats.byDirection.down.total) * 100).toFixed(0)}%`
                  : '-'}
              </Text>
              <Text style={styles.directionCount}>{stats.byDirection.down.correct}/{stats.byDirection.down.total}</Text>
            </View>
            {/* Sin señal (ex-Lateral) */}
            <View style={[styles.directionStatBox, { opacity: 0.6 }]}>
              <Text style={styles.directionEmoji}>🔇</Text>
              <Text style={styles.directionLabel}>Sin señal</Text>
              <Text style={[styles.directionAccuracy, { color: '#9ca3af' }]}>
                {stats.byDirection.neutral.total}
              </Text>
              <Text style={[styles.directionCount, { color: '#9ca3af' }]}>No cuenta en accuracy</Text>
            </View>
          </View>
        </View>
      )}

      {/* Verificar Predicciones Pendientes */}
      {stats && stats.pending > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⏳ Predicciones Pendientes</Text>
          <Text style={styles.cardSubtitle}>
            {stats.pending} predicciones esperando verificación
          </Text>
          <TouchableOpacity 
            style={[styles.actionButton, styles.actionButtonVerify, isVerifying && styles.actionButtonDisabled]}
            onPress={handleVerifyPending}
            disabled={isVerifying}
          >
            {isVerifying ? (
              <View style={styles.verifyProgressRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.actionButtonText}>
                  {' '}Verificando... ({verifyProgress?.done || 0}/{verifyProgress?.total || stats.pending})
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>✅</Text>
                <Text style={styles.actionButtonText}>Verificar Todas ({stats.verified}/{stats.total} verificadas, {stats.pending} pendientes)</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.actionHint}>Compara las predicciones vencidas con el precio real</Text>
          {verifyResult && (
            <View style={[styles.resultBox, verifyResult.startsWith('❌') ? styles.resultBoxError : styles.resultBoxSuccess]}>
              <Text style={styles.resultText}>{verifyResult}</Text>
            </View>
          )}
        </View>
      )}

      {/* ML Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🤖 Estado del Aprendizaje</Text>
        <View style={styles.mlStatusGrid}>
          <View style={styles.mlStatusItem}>
            <Text style={styles.mlStatusLabel}>Muestras de entrenamiento</Text>
            <Text style={styles.mlStatusValue}>{weightsStatus?.summary?.trainingSamples || 0}</Text>
          </View>
          <View style={styles.mlStatusItem}>
            <Text style={styles.mlStatusLabel}>Clasificadores activos</Text>
            <Text style={styles.mlStatusValue}>{weightsStatus?.availableAssetGroups?.length || 0}</Text>
          </View>
          <View style={styles.mlStatusItem}>
            <Text style={styles.mlStatusLabel}>Última actualización</Text>
            <Text style={styles.mlStatusValue}>{formatDate(weightsStatus?.summary?.lastUpdated || null)}</Text>
          </View>
          <View style={styles.mlStatusItem}>
            <Text style={styles.mlStatusLabel}>Pesos aprendidos</Text>
            <Text style={[styles.mlStatusValue, { color: weightsStatus?.summary?.hasLearnedWeights ? '#10b981' : '#64748b' }]}>
              {weightsStatus?.summary?.hasLearnedWeights ? '✅ Activos' : '⏳ Pendiente'}
            </Text>
          </View>
        </View>
      </View>

    </View>
  );

  const renderWeights = () => {
    const comparison = weightsStatus?.comparison?.[selectedTimeframe];
    
    return (
      <View style={styles.section}>
        {/* Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Resumen de Pesos</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>🕐 Última actualización</Text>
              <Text style={styles.summaryValue}>{formatDate(weightsStatus?.summary?.lastUpdated || null)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>📊 Muestras entrenadas</Text>
              <Text style={styles.summaryValue}>{weightsStatus?.summary?.trainingSamples || 0}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>✅ Pesos aprendidos</Text>
              <Text style={[styles.summaryValue, { color: weightsStatus?.summary?.hasLearnedWeights ? '#10b981' : '#ef4444' }]}>
                {weightsStatus?.summary?.hasLearnedWeights ? 'Activos' : 'No disponibles'}
              </Text>
            </View>
          </View>
        </View>

        {/* Timeframe Selector */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚖️ Pesos de Factores por Timeframe</Text>
          <Text style={styles.cardSubtitle}>Comparación de pesos base vs aprendidos</Text>
          
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

          {/* Weights Comparison Table */}
          {comparison ? (
            <View style={styles.weightsTable}>
              <View style={styles.weightsTableHeader}>
                <Text style={[styles.weightsTableHeaderText, { flex: 2 }]}>Factor</Text>
                <Text style={styles.weightsTableHeaderText}>Base</Text>
                <Text style={styles.weightsTableHeaderText}>Actual</Text>
                <Text style={styles.weightsTableHeaderText}>Δ%</Text>
              </View>
              {Object.entries(comparison)
                .sort((a, b) => b[1].learned - a[1].learned)
                .map(([name, comp]) => (
                  <View key={name} style={styles.weightsTableRow}>
                    <Text style={[styles.weightsTableCell, { flex: 2 }]}>{name}</Text>
                    <Text style={[styles.weightsTableCell, { color: '#64748b' }]}>{(comp.base * 100).toFixed(0)}%</Text>
                    <Text style={[styles.weightsTableCell, { color: getChangeColor(comp.changePercent) }]}>
                      {(comp.learned * 100).toFixed(1)}%
                    </Text>
                    <Text style={[styles.weightsTableCell, { color: getChangeColor(comp.changePercent) }]}>
                      {comp.change}
                    </Text>
                  </View>
                ))}
            </View>
          ) : weightsStatus?.baseWeights ? (
            <View style={styles.weightsTable}>
              <View style={styles.weightsTableHeader}>
                <Text style={[styles.weightsTableHeaderText, { flex: 2 }]}>Factor</Text>
                <Text style={styles.weightsTableHeaderText}>Base</Text>
              </View>
              {Object.entries(weightsStatus.baseWeights)
                .sort((a, b) => b[1] - a[1])
                .map(([factor, weight]) => (
                  <View key={factor} style={styles.weightsTableRow}>
                    <Text style={[styles.weightsTableCell, { flex: 2 }]}>{factor}</Text>
                    <Text style={styles.weightsTableCell}>{(weight * 100).toFixed(1)}%</Text>
                  </View>
                ))}
            </View>
          ) : (
            <Text style={styles.noData}>Sin datos de pesos disponibles</Text>
          )}

          {/* Legend */}
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>📖 Interpretación:</Text>
            <Text style={styles.legendText}>
              <Text style={{ color: '#10b981' }}>Verde</Text>: El ML aprendió que es más importante{'\n'}
              <Text style={{ color: '#ef4444' }}>Rojo</Text>: El ML aprendió que es menos importante{'\n'}
              <Text style={{ color: '#94a3b8' }}>Gris</Text>: Similar al peso base
            </Text>
          </View>
        </View>

        {/* Clasificadores por Grupo de Activo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏷️ Clasificadores por Tipo de Activo</Text>
          <Text style={styles.cardSubtitle}>Multiplicadores específicos para cada grupo</Text>
          
          {/* Retrain Classifiers Button */}
          <TouchableOpacity 
            style={[styles.actionButton, styles.actionButtonSecondary, isRetrainingClassifiers && styles.actionButtonDisabled, { marginBottom: 12 }]}
            onPress={handleRetrainClassifiers}
            disabled={isRetrainingClassifiers}
          >
            {isRetrainingClassifiers ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>🏷️</Text>
                <Text style={styles.actionButtonText}>Reentrenar Clasificadores</Text>
              </>
            )}
          </TouchableOpacity>
          {retrainClassifiersResult && (
            <View style={[styles.resultBox, retrainClassifiersResult.startsWith('❌') ? styles.resultBoxError : styles.resultBoxSuccess, { marginBottom: 12 }]}>
              <Text style={styles.resultText}>{retrainClassifiersResult}</Text>
            </View>
          )}
          
          {/* Asset Group Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assetGroupScroll}>
            <View style={styles.assetGroupRow}>
              {(weightsStatus?.availableAssetGroups || Object.keys(GROUP_DESCRIPTIONS)).map((group) => {
                const info = GROUP_DESCRIPTIONS[group] || { emoji: '📋', description: group };
                return (
                  <TouchableOpacity
                    key={group}
                    style={[styles.assetGroupButton, selectedAssetGroup === group && styles.assetGroupButtonActive]}
                    onPress={() => setSelectedAssetGroup(group)}
                  >
                    <Text style={styles.assetGroupEmoji}>{info.emoji}</Text>
                    <Text style={[styles.assetGroupText, selectedAssetGroup === group && styles.assetGroupTextActive]}>
                      {group.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Selected Group Detail */}
          {(() => {
            const selectedInfo = GROUP_DESCRIPTIONS[selectedAssetGroup] || { emoji: '📋', description: 'Sin descripción' };
            const multipliers = weightsStatus?.assetGroupMultipliers?.[selectedAssetGroup] || {};
            const baseMultipliers = BASE_STATIC_MULTIPLIERS[selectedAssetGroup] || {};
            const stats = weightsStatus?.assetGroupStats?.[selectedAssetGroup];
            const hasLearnedChanges = stats && stats.sampleCount >= 5;

            return (
              <>
                <View style={styles.selectedGroupCard}>
                  <View style={styles.selectedGroupHeader}>
                    <Text style={styles.selectedGroupEmoji}>{selectedInfo.emoji}</Text>
                    <View style={styles.selectedGroupInfo}>
                      <Text style={styles.selectedGroupName}>{selectedAssetGroup.replace(/_/g, ' ')}</Text>
                      <Text style={styles.selectedGroupDescription}>{selectedInfo.description}</Text>
                    </View>
                  </View>
                  {/* Estadísticas */}
                  <View style={styles.classifierStatsGrid}>
                    <View style={styles.classifierStatItem}>
                      <Text style={styles.classifierStatValue}>{stats?.sampleCount || 0}</Text>
                      <Text style={styles.classifierStatLabel}>Muestras</Text>
                    </View>
                    <View style={styles.classifierStatItem}>
                      <Text style={[styles.classifierStatValue, { color: (stats?.successRate || 0) > 0.5 ? '#10b981' : '#64748b' }]}>
                        {typeof stats?.successRate === 'number' ? `${(stats.successRate * 100).toFixed(0)}%` : '-'}
                      </Text>
                      <Text style={styles.classifierStatLabel}>Éxito</Text>
                    </View>
                    <View style={styles.classifierStatItem}>
                      <Text style={[styles.classifierStatValue, { color: hasLearnedChanges ? '#10b981' : '#64748b' }]}>
                        {hasLearnedChanges ? '✓' : '⏳'}
                      </Text>
                      <Text style={styles.classifierStatLabel}>{hasLearnedChanges ? 'Aprendido' : 'Min 5'}</Text>
                    </View>
                  </View>
                </View>

                {/* Multipliers Table */}
                <View style={styles.weightsTable}>
                  <View style={styles.weightsTableHeader}>
                    <Text style={[styles.weightsTableHeaderText, { flex: 2 }]}>Factor</Text>
                    <Text style={styles.weightsTableHeaderText}>Base</Text>
                    <Text style={styles.weightsTableHeaderText}>Actual</Text>
                  </View>
                  {ALL_FACTORS.map((factor) => {
                    const mult = (multipliers[factor] as number) || 1;
                    const baseMult = (baseMultipliers[factor] as number) || 1;
                    const changed = Math.abs(mult - baseMult) > 0.01;
                    return (
                      <View key={factor} style={styles.weightsTableRow}>
                        <Text style={[styles.weightsTableCell, { flex: 2 }]}>{factor}</Text>
                        <Text style={[styles.weightsTableCell, { color: '#64748b' }]}>{(baseMult * 100).toFixed(0)}%</Text>
                        <Text style={[styles.weightsTableCell, changed && { color: getMultiplierColor(mult) }]}>
                          {(mult * 100).toFixed(0)}%
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            );
          })()}
        </View>
      </View>
    );
  };

  const renderModels = () => {
    const modelInfo = [
      { key: 'reinforcementLearning', name: 'Aprendizaje por Refuerzo', emoji: '🎮', 
        detail: mlModels?.reinforcementLearning ? `${mlModels.reinforcementLearning.totalEpisodes} episodios` : '' },
      { key: 'probabilisticModel', name: 'Modelo Probabilístico', emoji: '🎲',
        detail: mlModels?.probabilisticModel ? `${mlModels.probabilisticModel.sampleCount} muestras` : '' },
      { key: 'factorCorrelation', name: 'Correlación de Factores', emoji: '🔗', detail: '' },
      { key: 'metaLearning', name: 'Meta-Aprendizaje', emoji: '🧠', detail: '' },
      { key: 'featureEngineering', name: 'Ingeniería de Features', emoji: '⚙️', detail: '' },
      { key: 'temporalCrossValidation', name: 'Validación Temporal', emoji: '📅', detail: '' },
    ];

    return (
      <View style={styles.section}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🤖 Modelos ML Activos</Text>
          <Text style={styles.cardSubtitle}>
            Estado de cada componente del sistema de Machine Learning
          </Text>
          
          {mlModels ? (
            <View style={styles.modelsList}>
              {modelInfo.map((model) => {
                const data = mlModels[model.key as keyof MLModelsStatus] as { status?: string } | undefined;
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
          ) : (
            <Text style={styles.noData}>Sin datos de modelos disponibles</Text>
          )}
        </View>

        {/* Calidad del Sistema */}
        {mlModels && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 Calidad del Sistema</Text>
            <View style={styles.systemQualityGrid}>
              <View style={styles.systemQualityItem}>
                <Text style={styles.systemQualityValue}>{weightsStatus?.summary?.trainingSamples || 0}</Text>
                <Text style={styles.systemQualityLabel}>Predicciones entrenadas</Text>
              </View>
              <View style={styles.systemQualityItem}>
                <Text style={styles.systemQualityValue}>{mlModels.reinforcementLearning?.totalEpisodes || 0}</Text>
                <Text style={styles.systemQualityLabel}>Episodios RL</Text>
              </View>
              <View style={styles.systemQualityItem}>
                <Text style={[styles.systemQualityValue, { color: (mlModels.reinforcementLearning?.successRate || 0) > 0.5 ? '#10b981' : '#f59e0b' }]}>
                  {((mlModels.reinforcementLearning?.successRate || 0) * 100).toFixed(1)}%
                </Text>
                <Text style={styles.systemQualityLabel}>Tasa de éxito RL</Text>
              </View>
              <View style={styles.systemQualityItem}>
                <Text style={styles.systemQualityValue}>{mlModels.probabilisticModel?.sampleCount || 0}</Text>
                <Text style={styles.systemQualityLabel}>Muestras calibración</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {renderHeader()}
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Cargando métricas ML...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {renderHeader()}
        {renderTabs()}
        <ScrollView style={styles.scrollContent}>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'weights' && renderWeights()}
          {activeTab === 'models' && renderModels()}
        </ScrollView>
        
        {/* Acciones Globales - Fijadas al final */}
        <View style={styles.bottomActionsContainer}>
          <TouchableOpacity 
            style={[styles.bottomActionButton, styles.actionButtonPrimary, isRelearning && styles.actionButtonDisabled]}
            onPress={handleForceRelearn}
            disabled={isRelearning}
          >
            {isRelearning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>🔄</Text>
                <Text style={styles.bottomActionButtonText}>Re-aprender Pesos</Text>
              </>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.bottomActionButton, styles.actionButtonDanger, isResettingModels && styles.actionButtonDisabled]}
            onPress={handleResetModels}
            disabled={isResettingModels}
          >
            {isResettingModels ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>🗑️</Text>
                <Text style={styles.bottomActionButtonText}>Reset Todo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        
        {/* Resultados de acciones */}
        {(relearnResult || resetModelsResult) && (
          <View style={styles.bottomResultsContainer}>
            {relearnResult && (
              <View style={[styles.resultBox, relearnResult.startsWith('❌') ? styles.resultBoxError : styles.resultBoxSuccess]}>
                <Text style={styles.resultText}>{relearnResult}</Text>
              </View>
            )}
            {resetModelsResult && (
              <View style={[styles.resultBox, resetModelsResult.startsWith('❌') ? styles.resultBoxError : styles.resultBoxSuccess]}>
                <Text style={styles.resultText}>{resetModelsResult}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: '#3b82f6',
    fontSize: 16,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#3b82f6',
  },
  scrollContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748b',
    marginTop: 12,
  },
  section: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  statBox: {
    width: '50%',
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  qualityGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  qualityBox: {
    flex: 1,
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  qualityEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  qualityValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  qualityLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
  },
  mlStatusGrid: {
    marginTop: 12,
  },
  mlStatusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  mlStatusLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  mlStatusValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  weightsGrid: {
    marginTop: 12,
  },
  weightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  weightBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    marginRight: 12,
    overflow: 'hidden',
  },
  weightFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  weightLabel: {
    width: 80,
    color: '#94a3b8',
    fontSize: 12,
  },
  weightValue: {
    width: 50,
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'right',
  },
  classifierItem: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  classifierName: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 8,
  },
  classifierStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  classifierStat: {
    color: '#94a3b8',
    fontSize: 12,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  modelEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  modelInfo: {
    flex: 1,
  },
  modelName: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modelDetail: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  modelsList: {
    marginTop: 8,
  },
  modelDescription: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 8,
  },
  modelStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modelStat: {
    color: '#94a3b8',
    fontSize: 12,
    marginRight: 16,
  },
  noData: {
    color: '#64748b',
    textAlign: 'center',
    padding: 20,
  },
  // Action buttons styles
  actionsContainer: {
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },
  actionButtonPrimary: {
    backgroundColor: '#3b82f6',
  },
  actionButtonSecondary: {
    backgroundColor: '#6366f1',
  },
  actionButtonDanger: {
    backgroundColor: '#ef4444',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  actionHint: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  resultBox: {
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  resultBoxSuccess: {
    backgroundColor: '#10b98120',
  },
  resultBoxError: {
    backgroundColor: '#ef444420',
  },
  resultText: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
  },
  // Bottom actions styles
  bottomActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
    gap: 12,
  },
  bottomActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 12,
  },
  bottomActionButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  bottomResultsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#0f172a',
  },
  // Timeframe selector styles
  timeframeSelector: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timeframeButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#334155',
    marginHorizontal: 4,
    alignItems: 'center',
  },
  timeframeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  timeframeText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  timeframeTextActive: {
    color: '#ffffff',
  },
  // Weights table styles
  weightsTable: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#334155',
  },
  weightsTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    padding: 10,
  },
  weightsTableHeaderText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  weightsTableRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  weightsTableCell: {
    color: '#ffffff',
    fontSize: 12,
    flex: 1,
    textAlign: 'center',
  },
  // Summary styles
  summaryGrid: {
    marginTop: 8,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  // Legend styles
  legend: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  legendTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 8,
  },
  legendText: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 18,
  },
  // Asset group selector styles
  assetGroupScroll: {
    marginVertical: 12,
  },
  assetGroupRow: {
    flexDirection: 'row',
  },
  assetGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  assetGroupButtonActive: {
    backgroundColor: '#3b82f6',
  },
  assetGroupEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  assetGroupText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  assetGroupTextActive: {
    color: '#ffffff',
  },
  // Selected group card styles
  selectedGroupCard: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  selectedGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectedGroupEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  selectedGroupInfo: {
    flex: 1,
  },
  selectedGroupName: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  selectedGroupDescription: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  // Classifier stats grid
  classifierStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
  },
  classifierStatItem: {
    alignItems: 'center',
  },
  classifierStatValue: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  classifierStatLabel: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 4,
  },
  // Status badge styles
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: '#10b98120',
  },
  statusInactive: {
    backgroundColor: '#64748b20',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  // Quality item styles (for models tab)
  qualityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  // System quality grid (2x2 grid for models tab)
  systemQualityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  systemQualityItem: {
    width: '47%',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  systemQualityValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  systemQualityLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
  // Direction stats styles
  directionStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  directionStatBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
  },
  directionEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  directionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 4,
  },
  directionAccuracy: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  directionCount: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  // Verify button style
  actionButtonVerify: {
    backgroundColor: '#22c55e',
  },
  verifyProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
