/**
 * Componente que muestra el historial de predicciones de un activo
 * Incluye estadísticas de aciertos y porcentajes
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { predictionTrackingService, TrackedPrediction } from '../../services/prediction-tracking-service';

interface PredictionHistoryCardProps {
  symbol: string;
  maxItems?: number;
}

interface SymbolStats {
  total: number;
  verified: number;
  pending: number;
  correct: number;
  directionAccuracy: number;
  avgAccuracyScore: number;
  withinRangeRate: number;
  byQuality: {
    excellent: number;
    good: number;
    failed: number;
  };
}

// Función para calcular estadísticas de un símbolo
function calculateSymbolStats(predictions: TrackedPrediction[]): SymbolStats {
  const verified = predictions.filter(p => p.verified);
  const pending = predictions.filter(p => !p.verified);
  const correct = verified.filter(p => p.directionCorrect);
  const withinRange = verified.filter(p => p.withinRange);
  
  const byQuality = {
    excellent: verified.filter(p => p.quality === 'excellent').length,
    good: verified.filter(p => p.quality === 'good').length,
    failed: verified.filter(p => p.quality === 'failed').length,
  };
  
  const avgAccuracyScore = verified.length > 0
    ? verified.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / verified.length
    : 0;

  return {
    total: predictions.length,
    verified: verified.length,
    pending: pending.length,
    correct: correct.length,
    directionAccuracy: verified.length > 0 ? (correct.length / verified.length) * 100 : 0,
    avgAccuracyScore,
    withinRangeRate: verified.length > 0 ? (withinRange.length / verified.length) * 100 : 0,
    byQuality,
  };
}

export function PredictionHistoryCard({ symbol, maxItems = 10 }: PredictionHistoryCardProps) {
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<TrackedPrediction[]>([]);
  const [stats, setStats] = useState<SymbolStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadPredictions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await predictionTrackingService.getBySymbol(symbol, maxItems);
      setPredictions(data);
      
      if (data.length > 0) {
        setStats(calculateSymbolStats(data));
      }
    } catch (error) {
      console.error('[PredictionHistory] Error loading predictions:', error);
    }
    setLoading(false);
  }, [symbol, maxItems]);

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  // Formatear fecha corta (día/mes hora:min)
  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
  };

  // Formatear fecha completa con hora
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
  };

  // Formatear timeframe para mostrar
  const formatTimeframe = (timeframe: string, days: number) => {
    if (days === 1) return '1d';
    if (days <= 7) return `${days}d`;
    if (days <= 30) return `${days}d`;
    return timeframe;
  };

  // Color según calidad
  const getQualityColor = (quality?: string) => {
    switch (quality) {
      case 'excellent': return '#22c55e';
      case 'good': return '#84cc16';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // Icono según dirección
  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up': return 'trending-up';
      case 'down': return 'trending-down';
      default: return 'remove';
    }
  };

  // Color según dirección
  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'up': return '#22c55e';
      case 'down': return '#ef4444';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.loadingText}>Cargando historial...</Text>
        </View>
      </View>
    );
  }

  if (predictions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="time-outline" size={20} color="#6366f1" />
          <Text style={styles.title}>Historial de Predicciones</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="analytics-outline" size={32} color="#4b5563" />
          <Text style={styles.emptyText}>Sin predicciones anteriores</Text>
          <Text style={styles.emptySubtext}>Las predicciones se guardarán aquí automáticamente</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)}>
        <View style={styles.headerLeft}>
          <Ionicons name="time-outline" size={20} color="#6366f1" />
          <Text style={styles.title}>Historial de Predicciones</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.countBadge}>{predictions.length}</Text>
          <Ionicons 
            name={expanded ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color="#9ca3af" 
          />
        </View>
      </TouchableOpacity>

      {/* Estadísticas resumen */}
      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.verified}</Text>
            <Text style={styles.statLabel}>Verificadas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: stats.directionAccuracy >= 50 ? '#22c55e' : '#ef4444' }]}>
              {stats.directionAccuracy.toFixed(0)}%
            </Text>
            <Text style={styles.statLabel}>Acierto Dir.</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: stats.avgAccuracyScore >= 50 ? '#22c55e' : '#f59e0b' }]}>
              {stats.avgAccuracyScore.toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>Score Prom.</Text>
          </View>
        </View>
      )}

      {/* Barra de calidad */}
      {stats && stats.verified > 0 && (
        <View style={styles.qualityBarContainer}>
          <Text style={styles.qualityTitle}>Calidad de predicciones:</Text>
          <View style={styles.qualityBar}>
            {stats.byQuality.excellent > 0 && (
              <View 
                style={[
                  styles.qualitySegment, 
                  { backgroundColor: '#22c55e', flex: stats.byQuality.excellent }
                ]} 
              />
            )}
            {stats.byQuality.good > 0 && (
              <View 
                style={[
                  styles.qualitySegment, 
                  { backgroundColor: '#84cc16', flex: stats.byQuality.good }
                ]} 
              />
            )}
            {stats.byQuality.failed > 0 && (
              <View 
                style={[
                  styles.qualitySegment, 
                  { backgroundColor: '#ef4444', flex: stats.byQuality.failed }
                ]} 
              />
            )}
          </View>
          <View style={styles.qualityLegend}>
            <View style={styles.qualityLegendItem}>
              <View style={[styles.qualityDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.qualityLegendText}>{stats.byQuality.excellent} Exc.</Text>
            </View>
            <View style={styles.qualityLegendItem}>
              <View style={[styles.qualityDot, { backgroundColor: '#84cc16' }]} />
              <Text style={styles.qualityLegendText}>{stats.byQuality.good} Bien</Text>
            </View>
            <View style={styles.qualityLegendItem}>
              <View style={[styles.qualityDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.qualityLegendText}>{stats.byQuality.failed} Dir.✗</Text>
            </View>
          </View>
        </View>
      )}

      {/* Lista de predicciones (expandible) */}
      {expanded && (
        <View style={styles.predictionsList}>
          {predictions.map((pred, index) => (
            <View key={pred.id} style={styles.predictionItem}>
              <View style={styles.predictionLeft}>
                <Ionicons 
                  name={getDirectionIcon(pred.direction) as any}
                  size={18} 
                  color={getDirectionColor(pred.direction)} 
                />
                <View style={styles.predictionInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.predictionDate}>
                      {formatDateShort(pred.createdAt)} → {formatDateShort(pred.expiresAt)}
                    </Text>
                    <View style={styles.timeframeBadge}>
                      <Text style={styles.timeframeText}>
                        {formatTimeframe(pred.timeframe, pred.timeframeDays)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.predictionChange}>
                    {pred.predictedChange >= 0 ? '+' : ''}{pred.predictedChange.toFixed(2)}%
                    <Text style={styles.predictionConfidence}> ({pred.confidence}% conf.)</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.predictionRight}>
                {pred.verified ? (
                  <View style={styles.verifiedBadge}>
                    <View 
                      style={[
                        styles.qualityIndicator, 
                        { backgroundColor: getQualityColor(pred.quality) }
                      ]} 
                    />
                    <View style={styles.verifiedInfo}>
                      <Text style={styles.verifiedResult}>
                        {pred.directionCorrect ? '✓ Acertó' : '✗ Falló'}
                      </Text>
                      <Text style={styles.verifiedScore}>
                        Score: {(pred.accuracyScore || 0).toFixed(0)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.pendingBadge}>
                    <Ionicons name="time-outline" size={14} color="#f59e0b" />
                    <Text style={styles.pendingText}>Pendiente</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#6366f120',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1',
  },
  countBadge: {
    backgroundColor: '#6366f1',
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#2a2a2a',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
    textAlign: 'center',
  },
  qualityBarContainer: {
    marginTop: 12,
  },
  qualityTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  qualityBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  qualitySegment: {
    height: '100%',
  },
  qualityLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  qualityLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  qualityLegendText: {
    fontSize: 10,
    color: '#9ca3af',
  },
  predictionsList: {
    marginTop: 16,
    gap: 8,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
  },
  predictionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  predictionInfo: {
    gap: 2,
  },
  predictionDate: {
    fontSize: 11,
    color: '#6b7280',
  },
  timeframeBadge: {
    backgroundColor: '#6366f120',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeframeText: {
    fontSize: 9,
    color: '#818cf8',
    fontWeight: '600',
  },
  predictionChange: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  predictionConfidence: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '400',
  },
  predictionRight: {
    alignItems: 'flex-end',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qualityIndicator: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  verifiedInfo: {
    alignItems: 'flex-end',
  },
  verifiedResult: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  verifiedScore: {
    fontSize: 10,
    color: '#9ca3af',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f59e0b20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingText: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '500',
  },
});
