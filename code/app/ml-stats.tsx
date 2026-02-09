/**
 * ML Stats Dashboard
 * Dashboard completo de métricas del sistema de machine learning
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useMenu } from '../components/_shared/menu-context';
import { apiClient, BacktestSummary } from '../services/api-client';
import { TrackingStats } from '../services/prediction-tracking-service';

type TabType = 'overview' | 'weights' | 'backtest' | 'models';

interface WeightsStatus {
  current: Record<string, number>;
  version: number;
  trainedAt: string;
  sampleCount: number;
  classifiers: {
    name: string;
    sampleCount: number;
    successRate: number;
    avgAccuracy: number;
  }[];
}

interface MLModelsStatus {
  reinforcementLearning: { states: number; experiences: number; avgReward: number };
  probabilisticModel: { calibrations: number; isCalibrated: boolean };
  factorCorrelation: { correlations: number };
  metaLearning: { patterns: number };
}

export default function MLStatsPage() {
  const router = useRouter();
  const menuContext = useMenu();
  
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [weightsStatus, setWeightsStatus] = useState<WeightsStatus | null>(null);
  const [mlModels, setMlModels] = useState<MLModelsStatus | null>(null);
  
  // Backtesting
  const [backtestSymbol, setBacktestSymbol] = useState('AAPL');
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestSummary | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);

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

  const runBacktest = async () => {
    if (!backtestSymbol.trim()) return;
    
    setBacktestLoading(true);
    setBacktestError(null);
    setBacktestResult(null);
    
    try {
      const result = await apiClient.getBacktestSummary(backtestSymbol.toUpperCase(), 90);
      setBacktestResult(result);
    } catch (error: any) {
      setBacktestError(error.message || 'Error ejecutando backtest');
    } finally {
      setBacktestLoading(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity onPress={() => menuContext?.openMenu()} style={styles.menuButton}>
          <Ionicons name="menu" size={24} color="#ffffff" />
        </TouchableOpacity>
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
        { id: 'backtest' as TabType, label: '🧪 Backtest', icon: 'flask' },
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

      {/* ML Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🤖 Estado del Aprendizaje</Text>
        <View style={styles.mlStatusGrid}>
          <View style={styles.mlStatusItem}>
            <Text style={styles.mlStatusLabel}>Muestras de entrenamiento</Text>
            <Text style={styles.mlStatusValue}>{weightsStatus?.sampleCount || 0}</Text>
          </View>
          <View style={styles.mlStatusItem}>
            <Text style={styles.mlStatusLabel}>Clasificadores activos</Text>
            <Text style={styles.mlStatusValue}>{weightsStatus?.classifiers?.length || 0}</Text>
          </View>
          <View style={styles.mlStatusItem}>
            <Text style={styles.mlStatusLabel}>Última actualización</Text>
            <Text style={styles.mlStatusValue}>
              {weightsStatus?.trainedAt ? new Date(weightsStatus.trainedAt).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderWeights = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚖️ Pesos de Factores Actuales</Text>
        <Text style={styles.cardSubtitle}>Cómo el sistema pondera cada factor en las predicciones</Text>
        
        {weightsStatus?.current ? (
          <View style={styles.weightsGrid}>
            {Object.entries(weightsStatus.current)
              .sort((a, b) => b[1] - a[1])
              .map(([factor, weight]) => (
                <View key={factor} style={styles.weightItem}>
                  <View style={styles.weightBar}>
                    <View style={[styles.weightFill, { width: `${weight * 100}%` }]} />
                  </View>
                  <Text style={styles.weightLabel}>{factor}</Text>
                  <Text style={styles.weightValue}>{(weight * 100).toFixed(1)}%</Text>
                </View>
              ))}
          </View>
        ) : (
          <Text style={styles.noData}>Sin datos de pesos disponibles</Text>
        )}
      </View>

      {/* Clasificadores */}
      {weightsStatus?.classifiers && weightsStatus.classifiers.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏷️ Clasificadores por Tipo de Activo</Text>
          {weightsStatus.classifiers.map((classifier, index) => (
            <View key={index} style={styles.classifierItem}>
              <Text style={styles.classifierName}>{classifier.name}</Text>
              <View style={styles.classifierStats}>
                <Text style={styles.classifierStat}>
                  📊 {classifier.sampleCount} muestras
                </Text>
                <Text style={styles.classifierStat}>
                  ✅ {(classifier.successRate * 100).toFixed(1)}% éxito
                </Text>
                <Text style={styles.classifierStat}>
                  🎯 {classifier.avgAccuracy.toFixed(0)} score
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderBacktest = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧪 Backtesting</Text>
        <Text style={styles.cardSubtitle}>
          Valida el rendimiento histórico del sistema con datos reales de Yahoo Finance
        </Text>
        
        <View style={styles.backtestInput}>
          <TextInput
            style={styles.input}
            placeholder="Símbolo (ej: AAPL, TSLA, BTC-USD)"
            placeholderTextColor="#64748b"
            value={backtestSymbol}
            onChangeText={setBacktestSymbol}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.backtestButton, backtestLoading && styles.disabledButton]}
            onPress={runBacktest}
            disabled={backtestLoading}
          >
            {backtestLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.backtestButtonText}>Ejecutar</Text>
            )}
          </TouchableOpacity>
        </View>

        {backtestError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>❌ {backtestError}</Text>
          </View>
        )}

        {backtestResult && (
          <View style={styles.backtestResults}>
            <View style={styles.backtestHeader}>
              <Text style={styles.backtestSymbol}>{backtestResult.symbol}</Text>
              <Text style={styles.backtestPeriod}>{backtestResult.period}</Text>
            </View>

            <View style={styles.backtestStatsGrid}>
              <View style={styles.backtestStat}>
                <Text style={styles.backtestStatValue}>
                  {backtestResult.directionAccuracy.toFixed(1)}%
                </Text>
                <Text style={styles.backtestStatLabel}>Precisión</Text>
              </View>
              <View style={styles.backtestStat}>
                <Text style={styles.backtestStatValue}>
                  {backtestResult.avgAccuracyScore.toFixed(0)}
                </Text>
                <Text style={styles.backtestStatLabel}>Score Avg</Text>
              </View>
              <View style={styles.backtestStat}>
                <Text style={styles.backtestStatValue}>
                  {backtestResult.bestTimeframe}d
                </Text>
                <Text style={styles.backtestStatLabel}>Mejor TF</Text>
              </View>
              <View style={styles.backtestStat}>
                <Text style={styles.backtestStatValue}>
                  {backtestResult.totalTests}
                </Text>
                <Text style={styles.backtestStatLabel}>Tests</Text>
              </View>
            </View>

            <View style={styles.recommendationBox}>
              <Text style={styles.recommendationText}>{backtestResult.recommendation}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Símbolos sugeridos */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💡 Símbolos Populares</Text>
        <View style={styles.suggestedSymbols}>
          {['AAPL', 'TSLA', 'NVDA', 'MSFT', 'BTC-USD', 'SPY', 'QQQ'].map(symbol => (
            <TouchableOpacity
              key={symbol}
              style={styles.symbolChip}
              onPress={() => setBacktestSymbol(symbol)}
            >
              <Text style={styles.symbolChipText}>{symbol}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderModels = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🤖 Modelos ML Activos</Text>
        
        {mlModels ? (
          <>
            <View style={styles.modelCard}>
              <Text style={styles.modelName}>🎮 Reinforcement Learning</Text>
              <Text style={styles.modelDescription}>
                Aprende qué acciones tomar según condiciones de mercado
              </Text>
              <View style={styles.modelStats}>
                <Text style={styles.modelStat}>Estados: {mlModels.reinforcementLearning?.states || 0}</Text>
                <Text style={styles.modelStat}>Experiencias: {mlModels.reinforcementLearning?.experiences || 0}</Text>
                <Text style={styles.modelStat}>
                  Reward Avg: {mlModels.reinforcementLearning?.avgReward?.toFixed(2) || 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.modelCard}>
              <Text style={styles.modelName}>📊 Modelo Probabilístico</Text>
              <Text style={styles.modelDescription}>
                Genera intervalos de confianza y probabilidades
              </Text>
              <View style={styles.modelStats}>
                <Text style={styles.modelStat}>
                  Calibraciones: {mlModels.probabilisticModel?.calibrations || 0}
                </Text>
                <Text style={styles.modelStat}>
                  Estado: {mlModels.probabilisticModel?.isCalibrated ? '✅ Calibrado' : '⏳ Calibrando'}
                </Text>
              </View>
            </View>

            <View style={styles.modelCard}>
              <Text style={styles.modelName}>🔗 Correlación de Factores</Text>
              <Text style={styles.modelDescription}>
                Detecta correlaciones entre factores y resultados
              </Text>
              <View style={styles.modelStats}>
                <Text style={styles.modelStat}>
                  Correlaciones: {mlModels.factorCorrelation?.correlations || 0}
                </Text>
              </View>
            </View>

            <View style={styles.modelCard}>
              <Text style={styles.modelName}>🧠 Meta-Learning</Text>
              <Text style={styles.modelDescription}>
                Aprende patrones de condiciones de mercado
              </Text>
              <View style={styles.modelStats}>
                <Text style={styles.modelStat}>
                  Patrones: {mlModels.metaLearning?.patterns || 0}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.noData}>Sin datos de modelos disponibles</Text>
        )}
      </View>
    </View>
  );

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
          {activeTab === 'backtest' && renderBacktest()}
          {activeTab === 'models' && renderModels()}
        </ScrollView>
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
  menuButton: {
    padding: 8,
    marginRight: 8,
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
  backtestInput: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    marginRight: 8,
  },
  backtestButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  backtestButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  errorBox: {
    backgroundColor: '#ef444420',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
  },
  backtestResults: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 16,
  },
  backtestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backtestSymbol: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backtestPeriod: {
    color: '#64748b',
  },
  backtestStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backtestStat: {
    alignItems: 'center',
  },
  backtestStatValue: {
    color: '#3b82f6',
    fontSize: 20,
    fontWeight: 'bold',
  },
  backtestStatLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
  },
  recommendationBox: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
  },
  recommendationText: {
    color: '#ffffff',
    textAlign: 'center',
  },
  suggestedSymbols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  symbolChip: {
    backgroundColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  symbolChipText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  modelCard: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  modelName: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
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
});
