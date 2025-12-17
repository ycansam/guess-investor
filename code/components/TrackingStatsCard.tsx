/**
 * Componente para mostrar estadísticas de tracking de predicciones
 * Muestra precisión histórica, predicciones pendientes y verificadas
 */

import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { predictionTrackingService, TrackedPrediction, TrackingStats } from '../services/prediction-tracking-service';

interface TrackingStatsCardProps {
  onClose?: () => void;
}

export const TrackingStatsCard: React.FC<TrackingStatsCardProps> = ({ onClose }) => {
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, predictionsData] = await Promise.all([
        predictionTrackingService.getStats(),
        predictionTrackingService.getAllPredictions(),
      ]);
      setStats(statsData);
      setPredictions(predictionsData);
    } catch (error) {
      console.error('Error loading tracking data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const verified = await predictionTrackingService.verifyPendingPredictions();
      if (verified.length > 0) {
        await loadData(); // Recargar datos
      }
    } catch (error) {
      console.error('Error verifying predictions:', error);
    } finally {
      setVerifying(false);
    }
  };

  const handleExportForML = async () => {
    setExporting(true);
    try {
      const jsonData = await predictionTrackingService.exportForML();
      
      // Copiar al portapapeles
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(jsonData);
      } else {
        await Clipboard.setStringAsync(jsonData);
      }
      
      Alert.alert(
        '✅ Datos exportados',
        `Se han copiado ${stats?.verified || 0} predicciones verificadas al portapapeles.\\n\\nPega el contenido en python/data/predictions_data.json y ejecuta el script de entrenamiento.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error exporting for ML:', error);
      Alert.alert('Error', 'No se pudieron exportar los datos');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Cargando estadísticas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📊 Tracking de Predicciones</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'stats' && styles.activeTab]}
          onPress={() => setActiveTab('stats')}
        >
          <Text style={[styles.tabText, activeTab === 'stats' && styles.activeTabText]}>
            Estadísticas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            Historial
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'stats' ? (
          <StatsView 
            stats={stats} 
            onVerify={handleVerify} 
            verifying={verifying}
            onExport={handleExportForML}
            exporting={exporting}
          />
        ) : (
          <HistoryView predictions={predictions} />
        )}
      </ScrollView>
    </View>
  );
};

// Vista de estadísticas
const StatsView: React.FC<{ 
  stats: TrackingStats | null; 
  onVerify: () => void;
  verifying: boolean;
  onExport: () => void;
  exporting: boolean;
}> = ({ stats, onVerify, verifying, onExport, exporting }) => {
  if (!stats || stats.totalPredictions === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>Aún no hay predicciones registradas</Text>
        <Text style={styles.emptySubtext}>
          Las predicciones se registrarán automáticamente cuando hagas consultas
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Resumen general */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📈 Resumen General</Text>
        <View style={styles.statsRow}>
          <StatBox label="Total" value={stats.totalPredictions.toString()} color="#6b7280" />
          <StatBox label="Verificadas" value={stats.verified.toString()} color="#10b981" />
          <StatBox label="Pendientes" value={stats.pending.toString()} color="#f59e0b" />
        </View>
      </View>

      {/* Precisión */}
      {stats.verified > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎯 Precisión</Text>
          <View style={styles.statsRow}>
            <StatBox 
              label="Dirección" 
              value={`${stats.directionAccuracy}%`} 
              color={stats.directionAccuracy >= 60 ? '#10b981' : stats.directionAccuracy >= 50 ? '#f59e0b' : '#ef4444'}
            />
            <StatBox 
              label="En rango" 
              value={`${stats.withinRangeRate}%`} 
              color={stats.withinRangeRate >= 50 ? '#10b981' : '#f59e0b'}
            />
            <StatBox 
              label="Error prom." 
              value={`${stats.avgPriceError}%`} 
              color={stats.avgPriceError <= 2 ? '#10b981' : stats.avgPriceError <= 5 ? '#f59e0b' : '#ef4444'}
            />
          </View>
        </View>
      )}

      {/* Por dirección */}
      {stats.verified > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Por Dirección</Text>
          <View style={styles.directionRow}>
            <View style={styles.directionItem}>
              <Text style={styles.directionIcon}>📈</Text>
              <Text style={styles.directionLabel}>Subidas</Text>
              <Text style={styles.directionValue}>
                {stats.upCorrect}/{stats.upPredictions}
              </Text>
            </View>
            <View style={styles.directionItem}>
              <Text style={styles.directionIcon}>📉</Text>
              <Text style={styles.directionLabel}>Bajadas</Text>
              <Text style={styles.directionValue}>
                {stats.downCorrect}/{stats.downPredictions}
              </Text>
            </View>
            <View style={styles.directionItem}>
              <Text style={styles.directionIcon}>➡️</Text>
              <Text style={styles.directionLabel}>Laterales</Text>
              <Text style={styles.directionValue}>
                {stats.neutralPredictions}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Por confianza */}
      {stats.verified > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔒 Por Nivel de Confianza</Text>
          <View style={styles.confidenceList}>
            <ConfidenceRow 
              label="Alta (≥70%)" 
              accuracy={stats.highConfidenceAccuracy} 
            />
            <ConfidenceRow 
              label="Media (50-69%)" 
              accuracy={stats.mediumConfidenceAccuracy} 
            />
            <ConfidenceRow 
              label="Baja (<50%)" 
              accuracy={stats.lowConfidenceAccuracy} 
            />
          </View>
        </View>
      )}

      {/* Botón verificar */}
      {stats.pending > 0 && (
        <TouchableOpacity 
          style={[styles.verifyButton, verifying && styles.verifyButtonDisabled]}
          onPress={onVerify}
          disabled={verifying}
        >
          {verifying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.verifyButtonText}>
              🔄 Verificar predicciones pendientes ({stats.pending})
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Botón exportar para ML */}
      {stats.verified > 0 && (
        <TouchableOpacity 
          style={[styles.exportButton, exporting && styles.verifyButtonDisabled]}
          onPress={onExport}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.verifyButtonText}>
              🧠 Exportar para entrenamiento ML ({stats.verified})
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

// Vista de historial
const HistoryView: React.FC<{ predictions: TrackedPrediction[] }> = ({ predictions }) => {
  if (predictions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>Sin historial de predicciones</Text>
      </View>
    );
  }

  return (
    <View>
      {predictions.slice(0, 20).map((pred) => (
        <PredictionHistoryItem key={pred.id} prediction={pred} />
      ))}
    </View>
  );
};

// Item de historial
const PredictionHistoryItem: React.FC<{ prediction: TrackedPrediction }> = ({ prediction }) => {
  const directionIcon = prediction.predictedDirection === 'up' ? '📈' : 
                        prediction.predictedDirection === 'down' ? '📉' : '➡️';
  
  const statusIcon = prediction.status === 'verified' 
    ? (prediction.directionCorrect ? '✅' : '❌')
    : prediction.status === 'pending' ? '⏳' : '⚠️';

  const date = new Date(prediction.predictionDate).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });

  return (
    <View style={styles.historyItem}>
      <View style={styles.historyHeader}>
        <Text style={styles.historySymbol}>{prediction.symbol}</Text>
        <Text style={styles.historyDate}>{date}</Text>
        <Text style={styles.historyStatus}>{statusIcon}</Text>
      </View>
      
      <View style={styles.historyBody}>
        <View style={styles.historyColumn}>
          <Text style={styles.historyLabel}>Predicción</Text>
          <Text style={styles.historyValue}>
            {directionIcon} {prediction.predictedChange >= 0 ? '+' : ''}{prediction.predictedChange}%
          </Text>
        </View>
        
        {prediction.status === 'verified' && (
          <View style={styles.historyColumn}>
            <Text style={styles.historyLabel}>Real</Text>
            <Text style={[
              styles.historyValue,
              prediction.directionCorrect ? styles.correct : styles.incorrect
            ]}>
              {prediction.actualChange !== undefined 
                ? `${prediction.actualChange >= 0 ? '+' : ''}${prediction.actualChange}%`
                : 'N/A'}
            </Text>
          </View>
        )}
        
        <View style={styles.historyColumn}>
          <Text style={styles.historyLabel}>Confianza</Text>
          <Text style={styles.historyValue}>{prediction.confidence}%</Text>
        </View>
      </View>
    </View>
  );
};

// Componentes auxiliares
const StatBox: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <View style={styles.statBox}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const ConfidenceRow: React.FC<{ label: string; accuracy: number }> = ({ label, accuracy }) => (
  <View style={styles.confidenceRow}>
    <Text style={styles.confidenceLabel}>{label}</Text>
    <View style={styles.confidenceBar}>
      <View style={[styles.confidenceFill, { width: `${accuracy}%` }]} />
    </View>
    <Text style={styles.confidenceValue}>{accuracy}%</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    margin: 8,
    maxHeight: 500,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    color: '#9ca3af',
    fontSize: 18,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#374151',
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  activeTabText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  content: {
    maxHeight: 350,
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
  },
  directionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  directionItem: {
    alignItems: 'center',
  },
  directionIcon: {
    fontSize: 24,
  },
  directionLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
  },
  directionValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  confidenceList: {
    gap: 8,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confidenceLabel: {
    color: '#9ca3af',
    fontSize: 12,
    width: 100,
  },
  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#4b5563',
    borderRadius: 4,
    marginHorizontal: 8,
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  confidenceValue: {
    color: '#fff',
    fontSize: 12,
    width: 40,
    textAlign: 'right',
  },
  verifyButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  exportButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  verifyButtonDisabled: {
    backgroundColor: '#6b7280',
  },
  verifyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  historyItem: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  historySymbol: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    flex: 1,
  },
  historyDate: {
    color: '#9ca3af',
    fontSize: 12,
    marginRight: 8,
  },
  historyStatus: {
    fontSize: 16,
  },
  historyBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyColumn: {
    alignItems: 'center',
  },
  historyLabel: {
    color: '#6b7280',
    fontSize: 10,
  },
  historyValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  correct: {
    color: '#10b981',
  },
  incorrect: {
    color: '#ef4444',
  },
});
