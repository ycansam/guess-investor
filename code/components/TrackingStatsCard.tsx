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

  // Helper para mostrar alertas en web y móvil
  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message, [{ text: 'OK' }]);
    }
  };

  const handleVerify = async () => {
    console.log('[TrackingStatsCard] handleVerify llamado');
    setVerifying(true);
    try {
      console.log('[TrackingStatsCard] Llamando a verifyPendingPredictions...');
      const verified = await predictionTrackingService.verifyPendingPredictions();
      console.log('[TrackingStatsCard] Resultado:', verified.length, 'verificadas');
      if (verified.length > 0) {
        showAlert('✅ Verificación completada', `Se verificaron ${verified.length} predicción(es).`);
        await loadData(); // Recargar datos
      } else {
        // Mostrar por qué no se verificó nada
        const pending = await predictionTrackingService.getPendingPredictions();
        console.log('[TrackingStatsCard] Pendientes:', pending.length);
        if (pending.length === 0) {
          showAlert('ℹ️ Sin pendientes', 'No hay predicciones pendientes de verificar.');
        } else {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          
          // Ordenar por fecha más cercana
          const sorted = pending.sort((a, b) => 
            new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
          );
          
          // Mostrar info con hora de cierre del mercado
          const fechasInfo = sorted.slice(0, 5).map(p => {
            const fecha = new Date(p.targetDate);
            const target = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
            const isCrypto = p.symbol.includes('-USD') || p.symbol === 'BTC' || p.symbol === 'ETH';
            const closeHour = isCrypto ? 23 : 22;
            
            let estado = '';
            if (target < today) {
              estado = '✓ Listo';
            } else if (target.getTime() === today.getTime()) {
              if (now.getHours() >= closeHour) {
                estado = '✓ Mercado cerrado';
              } else {
                estado = `Cierre a las ${closeHour}:00`;
              }
            } else {
              const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              estado = diffDays === 1 ? 'Mañana' : `${diffDays} días`;
            }
            
            return `• ${p.symbol}: ${fecha.toLocaleDateString('es-ES')} (${estado})`;
          }).join('\n');
          
          console.log('[TrackingStatsCard] Fechas info:', fechasInfo);
          
          // Verificar si hay alguna lista para verificar
          const readyToVerify = sorted.some(p => {
            const fecha = new Date(p.targetDate);
            const target = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
            const isCrypto = p.symbol.includes('-USD') || p.symbol === 'BTC' || p.symbol === 'ETH';
            const closeHour = isCrypto ? 23 : 22;
            
            if (target < today) return true;
            if (target.getTime() === today.getTime() && now.getHours() >= closeHour) return true;
            return false;
          });
          
          if (!readyToVerify) {
            showAlert(
              'ℹ️ Esperando cierre de mercado', 
              `Las predicciones se verificarán cuando el mercado cierre:\n\n${fechasInfo}\n\n📊 NYSE/NASDAQ: 22:00\n₿ Crypto: 23:00`
            );
          } else {
            showAlert('⚠️ Error', `Algunas predicciones están listas pero hubo error al obtener precios:\n\n${fechasInfo}`);
          }
        }
      }
    } catch (error) {
      console.error('Error verifying predictions:', error);
      showAlert('❌ Error', `No se pudieron verificar: ${error}`);
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

      {/* Predicciones pendientes con tiempo restante */}
      {stats.pending > 0 && (
        <PendingPredictionsSection stats={stats} />
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

// Componente para mostrar predicciones pendientes con tiempo restante
const PendingPredictionsSection: React.FC<{ stats: TrackingStats }> = ({ stats }) => {
  const [pendingPredictions, setPendingPredictions] = useState<TrackedPrediction[]>([]);
  
  useEffect(() => {
    const loadPending = async () => {
      const pending = await predictionTrackingService.getPendingPredictions();
      // Ordenar por fecha más cercana
      pending.sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime());
      setPendingPredictions(pending);
    };
    loadPending();
  }, [stats.pending]);

  const getMarketCloseInfo = (targetDate: string, symbol: string) => {
    const now = new Date();
    const fecha = new Date(targetDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    
    const isCrypto = symbol.includes('-USD') || symbol === 'BTC' || symbol === 'ETH' || 
                     symbol === 'DOGE' || symbol === 'SOL' || symbol === 'XRP';
    
    // Hora de cierre del mercado
    const closeHour = isCrypto ? 23 : 22; // 22:00 para acciones, 23:00 para crypto
    
    // Si la fecha objetivo ya pasó
    if (target < today) {
      return { text: '✓ Listo', color: '#10b981', ready: true };
    }
    
    // Si es hoy
    if (target.getTime() === today.getTime()) {
      if (now.getHours() >= closeHour) {
        return { text: '✓ Cerrado', color: '#10b981', ready: true };
      } else {
        const hoursToClose = closeHour - now.getHours();
        return { 
          text: `Cierre en ${hoursToClose}h`, 
          color: hoursToClose <= 2 ? '#10b981' : '#f59e0b', 
          ready: false 
        };
      }
    }
    
    // Si es futuro
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      return { text: 'Mañana', color: '#f59e0b', ready: false };
    } else {
      return { text: `${diffDays} días`, color: '#6b7280', ready: false };
    }
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  if (pendingPredictions.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>⏳ Predicciones Pendientes</Text>
      <View style={styles.pendingList}>
        {pendingPredictions.slice(0, 5).map((pred, index) => {
          const timeInfo = getMarketCloseInfo(pred.targetDate, pred.symbol);
          return (
            <View key={pred.id || index} style={styles.pendingItem}>
              <View style={styles.pendingLeft}>
                <Text style={styles.pendingSymbol}>{pred.symbol}</Text>
                <Text style={styles.pendingDirection}>
                  {getDirectionIcon(pred.predictedDirection)} {pred.predictedChange > 0 ? '+' : ''}{pred.predictedChange.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.pendingRight}>
                <View style={[styles.timeBadge, { backgroundColor: timeInfo.color + '20' }]}>
                  <Text style={[styles.timeText, { color: timeInfo.color }]}>
                    {timeInfo.ready ? '✓ ' : '⏱ '}{timeInfo.text}
                  </Text>
                </View>
                <Text style={styles.pendingDate}>
                  {new Date(pred.targetDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                </Text>
              </View>
            </View>
          );
        })}
        {pendingPredictions.length > 5 && (
          <Text style={styles.moreText}>+{pendingPredictions.length - 5} más...</Text>
        )}
      </View>
    </View>
  );
};

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
  // Estilos para predicciones pendientes
  pendingList: {
    gap: 8,
  },
  pendingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 10,
  },
  pendingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pendingSymbol: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    minWidth: 50,
  },
  pendingDirection: {
    color: '#9ca3af',
    fontSize: 13,
  },
  pendingRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  pendingDate: {
    color: '#6b7280',
    fontSize: 11,
  },
  moreText: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
