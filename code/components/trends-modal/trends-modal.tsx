import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import theme from '../../config/theme';
import { TrendAnalysis } from '../../services/api-client';

interface TrendsModalProps {
  visible: boolean;
  onClose: () => void;
  trends: TrendAnalysis | null;
  loading: boolean;
  error: string | null;
}

export function TrendsModal({ visible, onClose, trends, loading, error }: TrendsModalProps) {
  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up':
        return { name: 'trending-up' as const, color: theme.colors.success };
      case 'down':
        return { name: 'trending-down' as const, color: theme.colors.danger };
      default:
        return { name: 'remove' as const, color: theme.colors.textSecondary };
    }
  };

  const getMomentumColor = (signal: string) => {
    switch (signal) {
      case 'bullish':
        return theme.colors.success;
      case 'bearish':
        return theme.colors.danger;
      default:
        return theme.colors.textSecondary;
    }
  };

  const getStrengthBars = (strength: string) => {
    switch (strength) {
      case 'strong':
        return 3;
      case 'moderate':
        return 2;
      default:
        return 1;
    }
  };

  const getPredictionColor = (direction: string) => {
    switch (direction) {
      case 'continue':
        return theme.colors.success;
      case 'reverse':
        return theme.colors.warning;
      default:
        return theme.colors.textSecondary;
    }
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const renderStrengthIndicator = (strength: string, color: string) => {
    const bars = getStrengthBars(strength);
    return (
      <View style={styles.strengthBars}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.strengthBar,
              { backgroundColor: i <= bars ? color : theme.colors.background },
            ]}
          />
        ))}
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Analizando tendencias...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (!trends) {
      return null;
    }

    const streakIcon = getDirectionIcon(trends.currentStreak.direction);

    return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Racha actual */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Racha Actual</Text>
          <View style={styles.streakCard}>
            <View style={styles.streakHeader}>
              <Ionicons name={streakIcon.name} size={32} color={streakIcon.color} />
              <View style={styles.streakInfo}>
                <Text style={styles.streakDays}>
                  {trends.currentStreak.days} días{' '}
                  {trends.currentStreak.direction === 'up'
                    ? 'subiendo'
                    : trends.currentStreak.direction === 'down'
                    ? 'bajando'
                    : 'lateral'}
                </Text>
                <Text style={[styles.streakChange, { color: streakIcon.color }]}>
                  {formatPercent(trends.currentStreak.totalChange)} total
                </Text>
              </View>
            </View>
            <View style={styles.streakStats}>
              <View style={styles.streakStat}>
                <Text style={styles.streakStatLabel}>Media diaria</Text>
                <Text style={[styles.streakStatValue, { color: streakIcon.color }]}>
                  {formatPercent(trends.currentStreak.avgDailyChange)}
                </Text>
              </View>
              <View style={styles.streakStat}>
                <Text style={styles.streakStatLabel}>Desde</Text>
                <Text style={styles.streakStatValue}>{trends.currentStreak.startDate}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Momentum */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚀 Momentum</Text>
          <View style={styles.momentumCard}>
            <View style={styles.momentumHeader}>
              <Text
                style={[styles.momentumSignal, { color: getMomentumColor(trends.momentum.signal) }]}
              >
                {trends.momentum.signal === 'bullish'
                  ? 'Alcista'
                  : trends.momentum.signal === 'bearish'
                  ? 'Bajista'
                  : 'Neutral'}
              </Text>
              {renderStrengthIndicator(
                trends.momentum.strength,
                getMomentumColor(trends.momentum.signal)
              )}
            </View>
            <View style={styles.momentumBars}>
              <View style={styles.momentumItem}>
                <Text style={styles.momentumLabel}>Corto</Text>
                <View style={styles.momentumBarContainer}>
                  <View
                    style={[
                      styles.momentumBar,
                      {
                        width: `${Math.min(Math.abs(trends.momentum.short) * 10, 100)}%`,
                        backgroundColor:
                          trends.momentum.short >= 0 ? theme.colors.success : theme.colors.danger,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.momentumValue}>{trends.momentum.short.toFixed(1)}</Text>
              </View>
              <View style={styles.momentumItem}>
                <Text style={styles.momentumLabel}>Medio</Text>
                <View style={styles.momentumBarContainer}>
                  <View
                    style={[
                      styles.momentumBar,
                      {
                        width: `${Math.min(Math.abs(trends.momentum.medium) * 10, 100)}%`,
                        backgroundColor:
                          trends.momentum.medium >= 0 ? theme.colors.success : theme.colors.danger,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.momentumValue}>{trends.momentum.medium.toFixed(1)}</Text>
              </View>
              <View style={styles.momentumItem}>
                <Text style={styles.momentumLabel}>Largo</Text>
                <View style={styles.momentumBarContainer}>
                  <View
                    style={[
                      styles.momentumBar,
                      {
                        width: `${Math.min(Math.abs(trends.momentum.long) * 10, 100)}%`,
                        backgroundColor:
                          trends.momentum.long >= 0 ? theme.colors.success : theme.colors.danger,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.momentumValue}>{trends.momentum.long.toFixed(1)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Soportes y Resistencias */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Niveles Clave</Text>
          <View style={styles.levelsCard}>
            <View style={styles.levelSection}>
              <Text style={styles.levelTitle}>Resistencias (arriba)</Text>
              {trends.resistances.slice(0, 2).map((r, i) => (
                <View key={i} style={styles.levelItem}>
                  <Text style={[styles.levelPrice, { color: theme.colors.danger }]}>
                    ${r.level.toFixed(2)}
                  </Text>
                  <Text style={styles.levelDistance}>+{r.distancePercent.toFixed(1)}%</Text>
                  {renderStrengthIndicator(r.strength, theme.colors.danger)}
                </View>
              ))}
            </View>
            <View style={styles.currentPriceRow}>
              <View style={styles.currentPriceLine} />
              <Text style={styles.currentPrice}>${trends.currentPrice.toFixed(2)}</Text>
              <View style={styles.currentPriceLine} />
            </View>
            <View style={styles.levelSection}>
              <Text style={styles.levelTitle}>Soportes (abajo)</Text>
              {trends.supports.slice(0, 2).map((s, i) => (
                <View key={i} style={styles.levelItem}>
                  <Text style={[styles.levelPrice, { color: theme.colors.success }]}>
                    ${s.level.toFixed(2)}
                  </Text>
                  <Text style={styles.levelDistance}>{s.distancePercent.toFixed(1)}%</Text>
                  {renderStrengthIndicator(s.strength, theme.colors.success)}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Estadísticas 30d */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Últimos 30 días</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{trends.stats.up_days_30d}</Text>
              <Text style={styles.statLabel}>Días verdes</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{trends.stats.down_days_30d}</Text>
              <Text style={styles.statLabel}>Días rojos</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>
                {formatPercent(trends.stats.avg_up_move)}
              </Text>
              <Text style={styles.statLabel}>Media subida</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.colors.danger }]}>
                {formatPercent(trends.stats.avg_down_move)}
              </Text>
              <Text style={styles.statLabel}>Media bajada</Text>
            </View>
          </View>
          <View style={styles.bestWorstRow}>
            <View style={styles.bestWorstItem}>
              <Text style={styles.bestWorstLabel}>🎉 Mejor día</Text>
              <Text style={[styles.bestWorstValue, { color: theme.colors.success }]}>
                {formatPercent(trends.stats.best_day_30d.change)}
              </Text>
              <Text style={styles.bestWorstDate}>{trends.stats.best_day_30d.date}</Text>
            </View>
            <View style={styles.bestWorstItem}>
              <Text style={styles.bestWorstLabel}>😓 Peor día</Text>
              <Text style={[styles.bestWorstValue, { color: theme.colors.danger }]}>
                {formatPercent(trends.stats.worst_day_30d.change)}
              </Text>
              <Text style={styles.bestWorstDate}>{trends.stats.worst_day_30d.date}</Text>
            </View>
          </View>
        </View>

        {/* Predicción de tendencia */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔮 Predicción de Tendencia</Text>
          <View
            style={[
              styles.predictionCard,
              { borderColor: getPredictionColor(trends.trendPrediction.direction) },
            ]}
          >
            <View style={styles.predictionHeader}>
              <Text
                style={[
                  styles.predictionDirection,
                  { color: getPredictionColor(trends.trendPrediction.direction) },
                ]}
              >
                {trends.trendPrediction.direction === 'continue'
                  ? 'Continuará'
                  : trends.trendPrediction.direction === 'reverse'
                  ? 'Posible cambio'
                  : 'Incierto'}
              </Text>
              <Text style={styles.predictionProb}>
                {(trends.trendPrediction.probability * 100).toFixed(0)}% probabilidad
              </Text>
            </View>
            <Text style={styles.predictionReason}>{trends.trendPrediction.reasoning}</Text>
          </View>
        </View>

        {/* Volatilidad */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Volatilidad</Text>
          <View style={styles.volatilityCard}>
            <View style={styles.volatilityRow}>
              <Text style={styles.volatilityLabel}>Actual</Text>
              <Text style={styles.volatilityValue}>{trends.volatility.current.toFixed(2)}%</Text>
            </View>
            <View style={styles.volatilityRow}>
              <Text style={styles.volatilityLabel}>Media</Text>
              <Text style={styles.volatilityValue}>{trends.volatility.average.toFixed(2)}%</Text>
            </View>
            <View style={styles.volatilityRow}>
              <Text style={styles.volatilityLabel}>Tendencia</Text>
              <Text
                style={[
                  styles.volatilityValue,
                  {
                    color:
                      trends.volatility.trend === 'increasing'
                        ? theme.colors.warning
                        : trends.volatility.trend === 'decreasing'
                        ? theme.colors.success
                        : theme.colors.textSecondary,
                  },
                ]}
              >
                {trends.volatility.trend === 'increasing'
                  ? '↑ Aumentando'
                  : trends.volatility.trend === 'decreasing'
                  ? '↓ Disminuyendo'
                  : '→ Estable'}
              </Text>
            </View>
            <View style={styles.volatilityRow}>
              <Text style={styles.volatilityLabel}>Percentil</Text>
              <Text style={styles.volatilityValue}>{trends.volatility.percentile.toFixed(0)}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              📊 Tendencias {trends?.symbol ? `de ${trends.symbol}` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  errorContainer: {
    padding: 60,
    alignItems: 'center',
  },
  errorText: {
    marginTop: 16,
    color: theme.colors.danger,
    fontSize: 16,
    textAlign: 'center',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  streakCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  streakInfo: {
    marginLeft: 12,
  },
  streakDays: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  streakChange: {
    fontSize: 16,
    fontWeight: '600',
  },
  streakStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  streakStat: {
    alignItems: 'center',
  },
  streakStatLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  streakStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  momentumCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
  },
  momentumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  momentumSignal: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 4,
  },
  strengthBar: {
    width: 8,
    height: 16,
    borderRadius: 2,
  },
  momentumBars: {
    gap: 12,
  },
  momentumItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  momentumLabel: {
    width: 50,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  momentumBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  momentumBar: {
    height: '100%',
    borderRadius: 4,
  },
  momentumValue: {
    width: 40,
    textAlign: 'right',
    fontSize: 12,
    color: theme.colors.text,
  },
  levelsCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
  },
  levelSection: {
    marginBottom: 8,
  },
  levelTitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  levelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  levelPrice: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  levelDistance: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 12,
  },
  currentPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  currentPriceLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.primary,
  },
  currentPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginHorizontal: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  bestWorstRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bestWorstItem: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  bestWorstLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  bestWorstValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  bestWorstDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  predictionCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  predictionDirection: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  predictionProb: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  predictionReason: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  volatilityCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  volatilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volatilityLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  volatilityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  bottomSpacer: {
    height: 20,
  },
});
