/**
 * Componente para mostrar estadísticas de tracking de predicciones
 * Muestra precisión histórica, predicciones pendientes y verificadas
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { predictionTrackingService, TrackedPrediction, TrackingStats } from '../services/prediction-tracking-service';

interface TrackingStatsCardProps {
  onClose?: () => void;
}

export const TrackingStatsCard: React.FC<TrackingStatsCardProps> = ({ onClose }) => {
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
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
    console.log('[TrackingStatsCard] handleVerify llamado');
    setVerifying(true);
    try {
      console.log('[TrackingStatsCard] Llamando a verifyPendingPredictions...');
      const verified = await predictionTrackingService.verifyPendingPredictions();
      console.log('[TrackingStatsCard] Resultado:', verified.length, 'verificadas');
      if (verified.length > 0) {
        await loadData(); // Recargar datos
      } else {
        // Mostrar por qué no se verificó nada
        const pending = await predictionTrackingService.getPendingPredictions();
        console.log('[TrackingStatsCard] Pendientes:', pending.length);
        if (pending.length === 0) {
          console.log('Sin pendientes: No hay predicciones pendientes de verificar');
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
            console.log('Esperando cierre de mercado:', fechasInfo);
          } else {
            console.log('Error al obtener precios:', fechasInfo);
          }
        }
      }
    } catch (error) {
      console.error('Error verifying predictions:', error);
    } finally {
      setVerifying(false);
    }
  };

  const handleRecalculate = async () => {
    console.log('[TrackingStatsCard] handleRecalculate llamado');
    setRecalculating(true);
    try {
      const updated = await predictionTrackingService.recalculateAccuracyScores();
      console.log(`[TrackingStatsCard] ${updated} predicciones actualizadas`);
      if (updated > 0) {
        await loadData(); // Recargar datos
      }
    } catch (error) {
      console.error('Error recalculating scores:', error);
    } finally {
      setRecalculating(false);
    }
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    
    console.log('[TrackingStatsCard] handleReset confirmado');
    setResetting(true);
    try {
      await predictionTrackingService.resetAll();
      console.log('[TrackingStatsCard] Reset completado');
      setConfirmReset(false);
      await loadData(); // Recargar datos (ahora vacíos)
    } catch (error) {
      console.error('Error resetting data:', error);
    } finally {
      setResetting(false);
    }
  };

  const cancelReset = () => {
    setConfirmReset(false);
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
            onRecalculate={handleRecalculate}
            recalculating={recalculating}
            onReset={handleReset}
            resetting={resetting}
            confirmReset={confirmReset}
            onCancelReset={cancelReset}
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
  onRecalculate: () => void;
  recalculating: boolean;
  onReset: () => void;
  resetting: boolean;
  confirmReset: boolean;
  onCancelReset: () => void;
}> = ({ stats, onVerify, verifying, onRecalculate, recalculating, onReset, resetting, confirmReset, onCancelReset }) => {
  if (!stats || stats.totalPredictions === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>Aún no hay predicciones registradas</Text>
        <Text style={styles.emptySubtext}>
          Las predicciones se registrarán automáticamente cuando hagas consultas
        </Text>
        
        {/* Botón reset en estado vacío por si hay datos residuales */}
        <TouchableOpacity 
          style={[styles.resetButton, { marginTop: 20 }]}
          onPress={onReset}
          disabled={resetting}
        >
          {resetting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.resetButtonText}>
              🗑️ Limpiar datos ML
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {/* Estabilidad del Sistema ML */}
      <SystemStabilityCard stats={stats} />
      
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
              label="Score medio" 
              value={`${stats.avgAccuracyScore}%`} 
              color={stats.avgAccuracyScore >= 70 ? '#10b981' : stats.avgAccuracyScore >= 50 ? '#f59e0b' : '#ef4444'}
            />
            <StatBox 
              label="Error prom." 
              value={`${stats.avgPriceError}%`} 
              color={stats.avgPriceError <= 2 ? '#10b981' : stats.avgPriceError <= 5 ? '#f59e0b' : '#ef4444'}
            />
          </View>
        </View>
      )}
      
      {/* Calidad de Predicciones - NUEVO */}
      {stats.verified > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⭐ Calidad de Predicciones</Text>
          <Text style={styles.cardSubtitle}>
            Considera dirección + precisión del cambio porcentual
          </Text>
          <View style={styles.qualityGrid}>
            <View style={[styles.qualityBox, { backgroundColor: '#10b98120' }]}>
              <Text style={styles.qualityIcon}>🎯</Text>
              <Text style={[styles.qualityValue, { color: '#10b981' }]}>
                {stats.excellentPredictions}
              </Text>
              <Text style={styles.qualityLabel}>Excelentes</Text>
              <Text style={styles.qualitySubLabel}>{'>75% score'}</Text>
            </View>
            <View style={[styles.qualityBox, { backgroundColor: '#3b82f620' }]}>
              <Text style={styles.qualityIcon}>👍</Text>
              <Text style={[styles.qualityValue, { color: '#3b82f6' }]}>
                {stats.goodPredictions}
              </Text>
              <Text style={styles.qualityLabel}>Buenas</Text>
              <Text style={styles.qualitySubLabel}>{'50-75%'}</Text>
            </View>
            <View style={[styles.qualityBox, { backgroundColor: '#f59e0b20' }]}>
              <Text style={styles.qualityIcon}>⚠️</Text>
              <Text style={[styles.qualityValue, { color: '#f59e0b' }]}>
                {stats.poorPredictions}
              </Text>
              <Text style={styles.qualityLabel}>Pobres</Text>
              <Text style={styles.qualitySubLabel}>{'25-50%'}</Text>
            </View>
            <View style={[styles.qualityBox, { backgroundColor: '#ef444420' }]}>
              <Text style={styles.qualityIcon}>❌</Text>
              <Text style={[styles.qualityValue, { color: '#ef4444' }]}>
                {stats.failedPredictions}
              </Text>
              <Text style={styles.qualityLabel}>Fallidas</Text>
              <Text style={styles.qualitySubLabel}>{'<25%'}</Text>
            </View>
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
      
      {/* Botón recalcular scores - NUEVO */}
      {stats.verified > 0 && (stats.excellentPredictions + stats.goodPredictions + stats.poorPredictions + stats.failedPredictions) === 0 && (
        <View style={styles.migrationNotice}>
          <Text style={styles.migrationText}>
            ⚠️ Tienes {stats.verified} predicciones verificadas sin el nuevo sistema de scoring
          </Text>
          <TouchableOpacity 
            style={[styles.recalculateButton, recalculating && styles.verifyButtonDisabled]}
            onPress={onRecalculate}
            disabled={recalculating}
          >
            {recalculating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.verifyButtonText}>
                🎯 Recalcular Scores
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Botón resetear todo - ZONA DE PELIGRO */}
      <View style={styles.dangerZone}>
        <Text style={styles.dangerZoneTitle}>⚠️ Zona de Peligro</Text>
        <Text style={styles.dangerZoneText}>
          Elimina todas las predicciones, verificaciones y datos de aprendizaje ML
        </Text>
        
        {confirmReset ? (
          <View style={styles.confirmResetContainer}>
            <Text style={styles.confirmResetText}>
              ¿Estás seguro? Esta acción no se puede deshacer.
            </Text>
            <View style={styles.confirmResetButtons}>
              <TouchableOpacity 
                style={styles.cancelResetButton}
                onPress={onCancelReset}
              >
                <Text style={styles.cancelResetText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmResetButton, resetting && styles.verifyButtonDisabled]}
                onPress={onReset}
                disabled={resetting}
              >
                {resetting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmResetButtonText}>Sí, eliminar todo</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.resetButton}
            onPress={onReset}
          >
            <Text style={styles.resetButtonText}>
              🗑️ Resetear Todo
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Botón exportar para ML removido - no es necesario */}
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
        
        {/* NUEVO: Mostrar accuracy score */}
        {prediction.status === 'verified' && prediction.accuracyScore !== undefined && (
          <View style={styles.historyColumn}>
            <Text style={styles.historyLabel}>Score</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[
                styles.historyValue,
                { 
                  color: prediction.accuracyScore >= 75 ? '#10b981' :
                         prediction.accuracyScore >= 50 ? '#3b82f6' :
                         prediction.accuracyScore >= 25 ? '#f59e0b' : '#ef4444'
                }
              ]}>
                {prediction.accuracyScore}
              </Text>
              <Text style={{ fontSize: 16 }}>
                {prediction.predictionQuality === 'excellent' ? '🎯' :
                 prediction.predictionQuality === 'good' ? '👍' :
                 prediction.predictionQuality === 'poor' ? '⚠️' : '❌'}
              </Text>
            </View>
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

// Componente de Estabilidad del Sistema ML
const SystemStabilityCard: React.FC<{ stats: TrackingStats }> = ({ stats }) => {
  // Calcular nivel de estabilidad basado en datos disponibles
  const getStabilityInfo = () => {
    const verified = stats.verified;
    const qualityPredictions = stats.excellentPredictions + stats.goodPredictions;
    const totalQuality = stats.excellentPredictions + stats.goodPredictions + stats.poorPredictions + stats.failedPredictions;
    const qualityRate = totalQuality > 0 ? (qualityPredictions / totalQuality) * 100 : 0;
    
    // Nivel basado en cantidad de predicciones verificadas
    let level: 'inicial' | 'aprendiendo' | 'desarrollando' | 'estable' | 'maduro';
    let color: string;
    let icon: string;
    let description: string;
    let progressPercent: number;
    let resetImpact: string;
    
    if (verified < 5) {
      level = 'inicial';
      color = '#9ca3af';
      icon = '🌱';
      description = 'Sistema nuevo, recopilando datos iniciales';
      progressPercent = Math.min((verified / 5) * 100, 100);
      resetImpact = 'Sin impacto - pocos datos';
    } else if (verified < 15) {
      level = 'aprendiendo';
      color = '#f59e0b';
      icon = '📚';
      description = 'Aprendiendo patrones básicos';
      progressPercent = Math.min(((verified - 5) / 10) * 100, 100);
      resetImpact = 'Impacto bajo - datos recuperables';
    } else if (verified < 30) {
      level = 'desarrollando';
      color = '#3b82f6';
      icon = '🔧';
      description = 'Desarrollando precisión en predicciones';
      progressPercent = Math.min(((verified - 15) / 15) * 100, 100);
      resetImpact = 'Impacto moderado - perderás semanas de aprendizaje';
    } else if (verified < 50) {
      level = 'estable';
      color = '#10b981';
      icon = '✅';
      description = 'Sistema estable con buena base de datos';
      progressPercent = Math.min(((verified - 30) / 20) * 100, 100);
      resetImpact = 'Impacto alto - datos valiosos';
    } else {
      level = 'maduro';
      color = '#8b5cf6';
      icon = '🏆';
      description = 'Sistema maduro con amplio historial';
      progressPercent = 100;
      resetImpact = 'Impacto muy alto - meses de aprendizaje';
    }
    
    // Ajustar por calidad de predicciones
    const qualityBonus = qualityRate >= 60 ? ' (alta calidad)' : qualityRate >= 40 ? '' : ' (calidad mejorable)';
    
    return { level, color, icon, description: description + qualityBonus, progressPercent, resetImpact, qualityRate };
  };
  
  const stability = getStabilityInfo();
  
  // Calcular siguiente hito
  const getNextMilestone = () => {
    const verified = stats.verified;
    if (verified < 5) return { target: 5, label: 'Fase Aprendizaje', remaining: 5 - verified };
    if (verified < 15) return { target: 15, label: 'Fase Desarrollo', remaining: 15 - verified };
    if (verified < 30) return { target: 30, label: 'Fase Estable', remaining: 30 - verified };
    if (verified < 50) return { target: 50, label: 'Fase Madura', remaining: 50 - verified };
    return { target: 100, label: 'Máximo rendimiento', remaining: Math.max(0, 100 - verified) };
  };
  
  const milestone = getNextMilestone();
  
  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: stability.color }]}>
      <View style={styles.stabilityHeader}>
        <Text style={styles.cardTitle}>{stability.icon} Estabilidad del Sistema ML</Text>
        <View style={[styles.stabilityBadge, { backgroundColor: stability.color + '30' }]}>
          <Text style={[styles.stabilityBadgeText, { color: stability.color }]}>
            {stability.level.toUpperCase()}
          </Text>
        </View>
      </View>
      
      <Text style={styles.stabilityDescription}>{stability.description}</Text>
      
      {/* Barra de progreso hacia siguiente nivel */}
      <View style={styles.stabilityProgressContainer}>
        <View style={styles.stabilityProgressBar}>
          <View style={[styles.stabilityProgressFill, { width: `${stability.progressPercent}%`, backgroundColor: stability.color }]} />
        </View>
        <Text style={styles.stabilityProgressText}>
          {milestone.remaining > 0 
            ? `${milestone.remaining} verificaciones más → ${milestone.label}`
            : '¡Máximo nivel alcanzado!'
          }
        </Text>
      </View>
      
      {/* Estadísticas clave */}
      <View style={styles.stabilityStats}>
        <View style={styles.stabilityStat}>
          <Text style={styles.stabilityStatValue}>{stats.verified}</Text>
          <Text style={styles.stabilityStatLabel}>Verificadas</Text>
        </View>
        <View style={styles.stabilityStat}>
          <Text style={styles.stabilityStatValue}>{stability.qualityRate.toFixed(0)}%</Text>
          <Text style={styles.stabilityStatLabel}>Calidad</Text>
        </View>
        <View style={styles.stabilityStat}>
          <Text style={[styles.stabilityStatValue, { fontSize: 12 }]}>{stability.resetImpact.split(' - ')[0]}</Text>
          <Text style={styles.stabilityStatLabel}>Si reseteas</Text>
        </View>
      </View>
    </View>
  );
};

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
    flex: 1,
    backgroundColor: '#1f2937',
    padding: 16,
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
    flex: 1,
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
  // Estilos para calidad de predicciones - NUEVO
  qualityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  qualityBox: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  qualityValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  qualityLabel: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  qualitySubLabel: {
    color: '#9ca3af',
    fontSize: 11,
  },
  cardSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
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
  recalculateButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  migrationNotice: {
    backgroundColor: '#f59e0b20',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  migrationText: {
    color: '#fbbf24',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
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
  // Estilos para zona de peligro / reset
  dangerZone: {
    backgroundColor: '#7f1d1d20',
    borderWidth: 1,
    borderColor: '#dc262680',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  dangerZoneTitle: {
    color: '#fca5a5',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  dangerZoneText: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 12,
  },
  resetButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  confirmResetContainer: {
    gap: 12,
  },
  confirmResetText: {
    color: '#fca5a5',
    fontSize: 13,
    textAlign: 'center',
  },
  confirmResetButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  cancelResetButton: {
    backgroundColor: '#374151',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelResetText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  confirmResetButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  confirmResetButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // Estilos para Sistema de Estabilidad ML
  stabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stabilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stabilityBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  stabilityDescription: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 12,
  },
  stabilityProgressContainer: {
    marginBottom: 12,
  },
  stabilityProgressBar: {
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    marginBottom: 6,
    overflow: 'hidden',
  },
  stabilityProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  stabilityProgressText: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
  },
  stabilityStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  stabilityStat: {
    alignItems: 'center',
  },
  stabilityStatValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stabilityStatLabel: {
    color: '#6b7280',
    fontSize: 10,
    marginTop: 2,
  },
});
