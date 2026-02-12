/**
 * Componente para mostrar estadísticas de tracking de predicciones
 * Muestra precisión histórica, predicciones pendientes y verificadas
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../services/api-client';
import { TrackingStats } from '../services/prediction-tracking-service';
import { trainingCacheService } from '../services/training-cache-service';
import { useMenu } from './_shared/menu-context';

interface TrackingStatsCardProps {
  onClose?: () => void;
  asPage?: boolean;
}

export const TrackingStatsCard: React.FC<TrackingStatsCardProps> = ({ onClose, asPage = false }) => {
  const router = useRouter();
  const menuContext = asPage ? useMenu() : null;
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [pendingPredictions, setPendingPredictions] = useState<any[]>([]);
  const [activePredictions, setActivePredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');
  const [historyPredictions, setHistoryPredictions] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Cargar stats desde backend
      const statsData = await apiClient.getPredictionStats();
      setStats(statsData);
      
      // Cargar predicciones pendientes del backend (para lista)
      const pendingData = await apiClient.getPendingPredictions();
      setPendingPredictions(pendingData);
      
      // Cargar predicciones activas del backend (no expiradas)
      const activeData = await apiClient.getActivePredictions();
      setActivePredictions(activeData);
      
      // Cargar historial verificado
      const verifiedData = await apiClient.getVerifiedPredictions(20);
      setHistoryPredictions(verifiedData);
    } catch (error) {
      console.error('Error loading tracking data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await apiClient.verifyAllPending((done, total) => {
        // Actualizar stats.pending en tiempo real para reflejar progreso
        setStats((prev: any) => prev ? { ...prev, pending: total - done } : prev);
      });
      console.log('[TrackingStats] Verificadas:', result.verified);
      await loadData();
    } catch (error) {
      console.error('Error verifying:', error);
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    
    setResetting(true);
    try {
      // Resetear TODO: predicciones, cache, pesos, Python
      await apiClient.resetAllML();
      
      // Limpiar cache local del frontend
      await trainingCacheService.clear();
      
      await loadData();
      setConfirmReset(false);
    } catch (error) {
      console.error('Error resetting:', error);
    } finally {
      setResetting(false);
    }
  };

  const handleCancelReset = () => {
    setConfirmReset(false);
  };

  // Page header for asPage mode
  const renderPageHeader = () => (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderLeft}>
        <TouchableOpacity onPress={() => menuContext?.openMenu()} style={styles.menuButton}>
          <Ionicons name="menu" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.title}>📊 Estadísticas ML</Text>
      </View>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Atrás</Text>
      </TouchableOpacity>
    </View>
  );

  // Modal header
  const renderModalHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>📊 Estadísticas ML</Text>
      {onClose && (
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    const content = (
      <View style={asPage ? styles.pageContainer : styles.container}>
        {asPage ? renderPageHeader() : renderModalHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Cargando estadísticas...</Text>
        </View>
      </View>
    );
    return asPage ? <SafeAreaView style={styles.safeArea}>{content}</SafeAreaView> : content;
  }

  if (!stats || stats.total === 0) {
    const content = (
      <View style={asPage ? styles.pageContainer : styles.container}>
        {asPage ? renderPageHeader() : renderModalHeader()}
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>Sin predicciones registradas</Text>
          <Text style={styles.emptySubtext}>
            Las predicciones que hagas se guardarán aquí para seguir su precisión
          </Text>
        </View>
      </View>
    );
    return asPage ? <SafeAreaView style={styles.safeArea}>{content}</SafeAreaView> : content;
  }

  const mainContent = (
    <>
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

      {activeTab === 'stats' ? (
        <View style={styles.content}>
          {/* Sistema de Estabilidad ML */}
          <SystemStabilityCard stats={stats} />

          {/* Resumen general - Total calculado dinámicamente */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📈 Resumen</Text>
            <View style={styles.statsRow}>
              <StatBox label="Total" value={`${stats.total}`} color="#3b82f6" />
              <StatBox label="Verificadas" value={`${stats.verified}`} color="#10b981" />
              <StatBox label="Activas" value={`${stats.active || 0}`} color="#8b5cf6" />
              <StatBox label="Pendientes" value={`${stats.pending}`} color="#f59e0b" />
            </View>
          </View>

          {/* Precisión */}
          {stats.verified > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🎯 Precisión</Text>
              <Text style={styles.cardSubtitle}>
                Cuánto te desvías de lo que predices vs lo que pasa
              </Text>
              <View style={styles.statsRow}>
                <StatBox
                  label="Dirección"
                  value={`${stats.directionAccuracy.toFixed(1)}%`}
                  subtitle="Aciertos ↑↓"
                  color={stats.directionAccuracy >= 60 ? '#10b981' : stats.directionAccuracy >= 50 ? '#f59e0b' : '#ef4444'}
                />
                <StatBox
                  label="Score"
                  value={`${stats.avgAccuracyScore.toFixed(0)}`}
                  subtitle="0-100 pts"
                  color={stats.avgAccuracyScore >= 70 ? '#10b981' : stats.avgAccuracyScore >= 50 ? '#f59e0b' : '#ef4444'}
                />
                <StatBox
                  label="Desviación"
                  value={`±${stats.avgPriceError.toFixed(1)}%`}
                  subtitle="vs predicho"
                  color={stats.avgPriceError <= 2 ? '#10b981' : stats.avgPriceError <= 5 ? '#f59e0b' : '#ef4444'}
                />
              </View>
            </View>
          )}

          {/* Calidad de Predicciones */}
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
                    {stats.byQuality.excellent}
                  </Text>
                  <Text style={styles.qualityLabel}>Excelentes</Text>
                  <Text style={styles.qualitySubLabel}>{'>75% score'}</Text>
                </View>
                <View style={[styles.qualityBox, { backgroundColor: '#3b82f620' }]}>
                  <Text style={styles.qualityIcon}>👍</Text>
                  <Text style={[styles.qualityValue, { color: '#3b82f6' }]}>
                    {stats.byQuality.good}
                  </Text>
                  <Text style={styles.qualityLabel}>Buenas</Text>
                  <Text style={styles.qualitySubLabel}>{'50-75%'}</Text>
                </View>
                <View style={[styles.qualityBox, { backgroundColor: '#ef444420' }]}>
                  <Text style={styles.qualityIcon}>❌</Text>
                  <Text style={[styles.qualityValue, { color: '#ef4444' }]}>
                    {stats.byQuality.failed}
                  </Text>
                  <Text style={styles.qualityLabel}>Fallidas</Text>
                  <Text style={styles.qualitySubLabel}>{'Dir. mal'}</Text>
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
                    {stats.byDirection.up.correct}/{stats.byDirection.up.total}
                  </Text>
                  <Text style={styles.directionPercent}>
                    {stats.byDirection.up.total > 0 
                      ? `${((stats.byDirection.up.correct / stats.byDirection.up.total) * 100).toFixed(1)}%`
                      : '-'}
                  </Text>
                </View>
                <View style={styles.directionItem}>
                  <Text style={styles.directionIcon}>📉</Text>
                  <Text style={styles.directionLabel}>Bajadas</Text>
                  <Text style={styles.directionValue}>
                    {stats.byDirection.down.correct}/{stats.byDirection.down.total}
                  </Text>
                  <Text style={styles.directionPercent}>
                    {stats.byDirection.down.total > 0 
                      ? `${((stats.byDirection.down.correct / stats.byDirection.down.total) * 100).toFixed(1)}%`
                      : '-'}
                  </Text>
                </View>
                <View style={styles.directionItem}>
                  <Text style={styles.directionIcon}>➡️</Text>
                  <Text style={styles.directionLabel}>Laterales</Text>
                  <Text style={styles.directionValue}>
                    {stats.byDirection.neutral.total}
                  </Text>
                  <Text style={styles.directionPercent}>
                    {stats.byDirection.neutral.total > 0 && stats.verified > 0
                      ? `${((stats.byDirection.neutral.total / stats.verified) * 100).toFixed(1)}%`
                      : '-'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Predicciones activas (no expiradas) */}
          {activePredictions.length > 0 && (
            <ActivePredictionsSection predictions={activePredictions} />
          )}

          {/* Predicciones pendientes (expiradas, listas para verificar) */}
          {pendingPredictions.length > 0 && (
            <PendingPredictionsSection predictions={pendingPredictions} />
          )}

          {/* Botón verificar */}
          {stats.pending > 0 && (
            <TouchableOpacity
              style={[styles.verifyButton, verifying && styles.verifyButtonDisabled]}
              onPress={handleVerify}
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

          {/* Zona de Peligro */}
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
                    onPress={handleCancelReset}
                  >
                    <Text style={styles.cancelResetText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmResetButtonStyle, resetting && styles.verifyButtonDisabled]}
                    onPress={handleReset}
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
                onPress={handleReset}
              >
                <Text style={styles.resetButtonText}>
                  🗑️ Resetear Madurez IA
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <HistoryView predictions={historyPredictions} />
      )}
    </>
  );

  // Page mode
  if (asPage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pageContainer}>
          {renderPageHeader()}
          <ScrollView style={styles.scrollContent}>
            {mainContent}
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Modal mode
  return (
    <ScrollView style={styles.container}>
      {renderModalHeader()}
      {mainContent}
    </ScrollView>
  );
};

// Sistema de Estabilidad ML
const SystemStabilityCard: React.FC<{ stats: TrackingStats }> = ({ stats }) => {
  const getStabilityInfo = () => {
    const verified = stats.verified;
    const qualityPredictions = stats.byQuality.excellent + stats.byQuality.good;
    const totalQuality = stats.byQuality.excellent + stats.byQuality.good + stats.byQuality.failed;
    const qualityRate = totalQuality > 0 ? (qualityPredictions / totalQuality) * 100 : 0;

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

    const qualityBonus = qualityRate >= 60 ? ' (alta calidad)' : qualityRate >= 40 ? '' : ' (calidad mejorable)';

    return { level, color, icon, description: description + qualityBonus, progressPercent, resetImpact, qualityRate };
  };

  const stability = getStabilityInfo();

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

// Vista de historial
const HistoryView: React.FC<{ predictions: any[] }> = ({ predictions }) => {
  if (predictions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyText}>Sin historial de predicciones</Text>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      {predictions.map((pred) => (
        <PredictionHistoryItem key={pred.id} prediction={pred} />
      ))}
    </View>
  );
};

// Item de historial
const PredictionHistoryItem: React.FC<{ prediction: any }> = ({ prediction }) => {
  const directionIcon = prediction.direction === 'up' ? '📈' :
                        prediction.direction === 'down' ? '📉' : '➡️';

  const statusIcon = prediction.verified
    ? (prediction.directionCorrect ? '✅' : '❌')
    : '⏳';

  const date = new Date(prediction.createdAt).toLocaleDateString('es-ES', {
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
            {directionIcon} {prediction.predictedChange >= 0 ? '+' : ''}{prediction.predictedChange?.toFixed(2)}%
          </Text>
        </View>

        {prediction.verified && (
          <View style={styles.historyColumn}>
            <Text style={styles.historyLabel}>Real</Text>
            <Text style={[
              styles.historyValue,
              prediction.directionCorrect ? styles.correct : styles.incorrect
            ]}>
              {prediction.actualChange !== undefined
                ? `${prediction.actualChange >= 0 ? '+' : ''}${prediction.actualChange?.toFixed(2)}%`
                : 'N/A'}
            </Text>
          </View>
        )}

        {prediction.verified && prediction.accuracyScore !== undefined && (
          <View style={styles.historyColumn}>
            <Text style={styles.historyLabel}>Score</Text>
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
const StatBox: React.FC<{ label: string; value: string; color: string; subtitle?: string }> = ({ label, value, color, subtitle }) => (
  <View style={styles.statBox}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
  </View>
);

// Predicciones activas (no expiradas)
const ActivePredictionsSection: React.FC<{ predictions: any[] }> = ({ predictions }) => {
  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    
    if (diffMs <= 0) return { text: 'Expirada', color: '#ef4444' };
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return { text: `${diffDays}d ${diffHours % 24}h`, color: '#8b5cf6' };
    } else if (diffHours > 0) {
      return { text: `${diffHours}h`, color: diffHours <= 4 ? '#f59e0b' : '#8b5cf6' };
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return { text: `${diffMins}min`, color: '#f59e0b' };
    }
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up': return '📈';
      case 'down': return '📉';
      default: return '➡️';
    }
  };

  if (predictions.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🎯 Predicciones Activas</Text>
      <Text style={styles.cardSubtitle}>Esperando expiración para verificar</Text>
      <View style={styles.pendingList}>
        {predictions.slice(0, 8).map((pred, index) => {
          const timeInfo = getTimeRemaining(pred.expiresAt);
          return (
            <View key={pred.id || index} style={styles.pendingItem}>
              <View style={styles.pendingLeft}>
                <Text style={styles.pendingSymbol}>{pred.symbol}</Text>
                <Text style={styles.pendingDirection}>
                  {getDirectionIcon(pred.direction)} {pred.predictedChange > 0 ? '+' : ''}{pred.predictedChange?.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.pendingRight}>
                <View style={[styles.timeBadge, { backgroundColor: timeInfo.color + '20' }]}>
                  <Text style={[styles.timeText, { color: timeInfo.color }]}>
                    ⏱ {timeInfo.text}
                  </Text>
                </View>
                <Text style={styles.pendingDate}>
                  {pred.timeframe}
                </Text>
              </View>
            </View>
          );
        })}
        {predictions.length > 8 && (
          <Text style={styles.moreText}>+{predictions.length - 8} más...</Text>
        )}
      </View>
    </View>
  );
};

// Predicciones pendientes (expiradas, listas para verificar)
const PendingPredictionsSection: React.FC<{ predictions: any[] }> = ({ predictions }) => {
  const getMarketCloseInfo = (expiresAt: string, symbol: string) => {
    const now = new Date();
    const fecha = new Date(expiresAt);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

    const isCrypto = symbol.includes('-USD') || symbol === 'BTC' || symbol === 'ETH' ||
                     symbol === 'DOGE' || symbol === 'SOL' || symbol === 'XRP';

    const closeHour = isCrypto ? 23 : 22;

    if (target < today) {
      return { text: '✓ Listo', color: '#10b981', ready: true };
    }

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

  if (predictions.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>⏳ Predicciones Pendientes</Text>
      <View style={styles.pendingList}>
        {predictions.slice(0, 5).map((pred, index) => {
          const timeInfo = getMarketCloseInfo(pred.expiresAt, pred.symbol);
          return (
            <View key={pred.id || index} style={styles.pendingItem}>
              <View style={styles.pendingLeft}>
                <Text style={styles.pendingSymbol}>{pred.symbol}</Text>
                <Text style={styles.pendingDirection}>
                  {getDirectionIcon(pred.direction)} {pred.predictedChange > 0 ? '+' : ''}{pred.predictedChange?.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.pendingRight}>
                <View style={[styles.timeBadge, { backgroundColor: timeInfo.color + '20' }]}>
                  <Text style={[styles.timeText, { color: timeInfo.color }]}>
                    {timeInfo.ready ? '✓ ' : '⏱ '}{timeInfo.text}
                  </Text>
                </View>
                <Text style={styles.pendingDate}>
                  {new Date(pred.expiresAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                </Text>
              </View>
            </View>
          );
        })}
        {predictions.length > 5 && (
          <Text style={styles.moreText}>+{predictions.length - 5} más...</Text>
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
  safeArea: {
    flex: 1,
    backgroundColor: '#111827',
  },
  pageContainer: {
    flex: 1,
    backgroundColor: '#1f2937',
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  backButton: {
    padding: 8,
  },
  menuButton: {
    padding: 8,
  },
  scrollContent: {
    flex: 1,
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
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
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
  cardSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 12,
    fontStyle: 'italic',
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
  statSubtitle: {
    color: '#6b7280',
    fontSize: 10,
    marginTop: 2,
    fontStyle: 'italic',
  },
  qualityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
  directionPercent: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
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
    minWidth: 60,
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
  verifyButton: {
    backgroundColor: '#3b82f6',
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
  confirmResetButtonStyle: {
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
    backgroundColor: '#4b5563',
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
    borderTopColor: '#4b5563',
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
