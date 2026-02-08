import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { InvestorInfo } from '../../types';

interface InvestorInfoCardProps {
  info: InvestorInfo;
  currency?: string;
}

export const InvestorInfoCard: React.FC<InvestorInfoCardProps> = ({ info, currency = 'EUR' }) => {
  const currencySymbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  // Formatear fecha
  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Color por valoración
  const getValuationColor = (status: string) => {
    switch (status) {
      case 'undervalued': return '#4CAF50';
      case 'overvalued': return '#F44336';
      case 'fair': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  // Color por salud
  const getHealthColor = (status: string) => {
    switch (status) {
      case 'excellent': return '#4CAF50';
      case 'good': return '#8BC34A';
      case 'fair': return '#FF9800';
      case 'poor': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  // Color por riesgo
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return '#4CAF50';
      case 'moderate': return '#FF9800';
      case 'high': return '#FF5722';
      case 'very_high': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  return (
    <View style={styles.container}>
      {/* Key Points (si hay) */}
      {info.keyPoints && info.keyPoints.length > 0 && (
        <View style={styles.keyPointsContainer}>
          {info.keyPoints.map((point, index) => (
            <Text key={index} style={styles.keyPoint}>{point}</Text>
          ))}
        </View>
      )}

      {/* Grid de información */}
      <View style={styles.sectionsGrid}>
        {/* Earnings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📅</Text>
            <Text style={styles.sectionTitle}>Próximos Earnings</Text>
          </View>
          {info.earnings.daysUntil !== null && info.earnings.daysUntil > 0 ? (
            <View style={styles.sectionContent}>
              <View style={styles.mainValue}>
                <Text style={[
                  styles.bigNumber,
                  { color: info.earnings.daysUntil <= 7 ? '#F44336' : 
                           info.earnings.daysUntil <= 14 ? '#FF9800' : '#4CAF50' }
                ]}>
                  {info.earnings.daysUntil}
                </Text>
                <Text style={styles.bigNumberLabel}>días</Text>
              </View>
              {info.earnings.quarter && (
                <Text style={styles.subText}>{info.earnings.quarter}</Text>
              )}
              {info.earnings.estimatedEPS !== null && (
                <Text style={styles.subText}>
                  EPS est.: {currencySymbol}{info.earnings.estimatedEPS.toFixed(2)}
                </Text>
              )}
              {info.earnings.beatRate > 0 && (
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>Beat rate:</Text>
                  <Text style={[
                    styles.miniStatValue,
                    { color: info.earnings.beatRate >= 70 ? '#4CAF50' : '#FF9800' }
                  ]}>
                    {info.earnings.beatRate.toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.noData}>Sin earnings próximos</Text>
          )}
        </View>

        {/* Dividendos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>💰</Text>
            <Text style={styles.sectionTitle}>Dividendos</Text>
          </View>
          {info.dividends.yield !== null && info.dividends.yield > 0 ? (
            <View style={styles.sectionContent}>
              <View style={styles.mainValue}>
                <Text style={[
                  styles.bigNumber,
                  { color: info.dividends.yield >= 3 ? '#4CAF50' : '#666' }
                ]}>
                  {info.dividends.yield.toFixed(2)}%
                </Text>
                <Text style={styles.bigNumberLabel}>yield anual</Text>
              </View>
              {info.dividends.annualAmount !== null && (
                <Text style={styles.subText}>
                  {currencySymbol}{info.dividends.annualAmount.toFixed(2)}/acción
                </Text>
              )}
              {info.dividends.exDate && (
                <View style={[styles.dateBadge, info.dividends.isUpcoming && styles.upcomingBadge]}>
                  <Text style={styles.dateLabel}>Ex-div:</Text>
                  <Text style={[
                    styles.dateValue,
                    info.dividends.isUpcoming && { color: '#4CAF50' }
                  ]}>
                    {formatDate(info.dividends.exDate)}
                  </Text>
                </View>
              )}
              {info.dividends.payoutRatio !== null && (
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>Payout:</Text>
                  <Text style={[
                    styles.miniStatValue,
                    { color: info.dividends.payoutRatio > 80 ? '#F44336' : '#666' }
                  ]}>
                    {info.dividends.payoutRatio.toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.noData}>No paga dividendo</Text>
          )}
        </View>

        {/* Valoración / Fair Value */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>🎯</Text>
            <Text style={styles.sectionTitle}>Valoración</Text>
          </View>
          <View style={styles.sectionContent}>
            {/* Status badge */}
            <View style={[
              styles.statusBadge,
              { backgroundColor: getValuationColor(info.fairValue.valuationStatus) + '20' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: getValuationColor(info.fairValue.valuationStatus) }
              ]}>
                {info.fairValue.valuationStatus === 'undervalued' ? '📉 Infravalorada' :
                 info.fairValue.valuationStatus === 'overvalued' ? '📈 Sobrevalorada' :
                 info.fairValue.valuationStatus === 'fair' ? '⚖️ Precio justo' : '❓ Sin datos'}
              </Text>
            </View>

            {/* Target price */}
            {info.fairValue.targetPrice !== null && (
              <View style={styles.targetRow}>
                <Text style={styles.targetLabel}>Target analistas:</Text>
                <Text style={styles.targetValue}>
                  {currencySymbol}{info.fairValue.targetPrice.toFixed(2)}
                </Text>
              </View>
            )}
            
            {/* Upside */}
            {info.fairValue.upside !== null && (
              <View style={styles.mainValue}>
                <Text style={[
                  styles.bigNumber,
                  { color: info.fairValue.upside > 0 ? '#4CAF50' : '#F44336' }
                ]}>
                  {info.fairValue.upside > 0 ? '+' : ''}{info.fairValue.upside.toFixed(1)}%
                </Text>
                <Text style={styles.bigNumberLabel}>potencial</Text>
              </View>
            )}

            {/* Ratios */}
            <View style={styles.ratiosRow}>
              {info.fairValue.peRatio !== null && (
                <View style={styles.ratioItem}>
                  <Text style={styles.ratioLabel}>P/E</Text>
                  <Text style={styles.ratioValue}>{info.fairValue.peRatio.toFixed(1)}</Text>
                </View>
              )}
              {info.fairValue.pegRatio !== null && (
                <View style={styles.ratioItem}>
                  <Text style={styles.ratioLabel}>PEG</Text>
                  <Text style={[
                    styles.ratioValue,
                    { color: info.fairValue.pegRatio < 1 ? '#4CAF50' : 
                             info.fairValue.pegRatio > 2 ? '#F44336' : '#666' }
                  ]}>
                    {info.fairValue.pegRatio.toFixed(2)}
                  </Text>
                </View>
              )}
              {info.fairValue.priceToBook !== null && (
                <View style={styles.ratioItem}>
                  <Text style={styles.ratioLabel}>P/B</Text>
                  <Text style={styles.ratioValue}>{info.fairValue.priceToBook.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Salud Financiera */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>💪</Text>
            <Text style={styles.sectionTitle}>Salud Financiera</Text>
          </View>
          <View style={styles.sectionContent}>
            {/* Health status */}
            <View style={[
              styles.statusBadge,
              { backgroundColor: getHealthColor(info.financialHealth.healthStatus) + '20' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: getHealthColor(info.financialHealth.healthStatus) }
              ]}>
                {info.financialHealth.healthStatus === 'excellent' ? '🌟 Excelente' :
                 info.financialHealth.healthStatus === 'good' ? '✅ Buena' :
                 info.financialHealth.healthStatus === 'fair' ? '⚠️ Aceptable' :
                 info.financialHealth.healthStatus === 'poor' ? '❌ Débil' : '❓ Sin datos'}
              </Text>
            </View>

            {/* Score bar */}
            <View style={styles.scoreBarContainer}>
              <View style={[
                styles.scoreBar,
                { 
                  width: `${info.financialHealth.healthScore}%`,
                  backgroundColor: getHealthColor(info.financialHealth.healthStatus)
                }
              ]} />
              <Text style={styles.scoreLabel}>{info.financialHealth.healthScore}/100</Text>
            </View>

            {/* Key metrics */}
            <View style={styles.metricsGrid}>
              {info.financialHealth.freeCashFlowFormatted && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>FCF</Text>
                  <Text style={[
                    styles.metricValue,
                    { color: info.financialHealth.freeCashFlow && info.financialHealth.freeCashFlow > 0 ? '#4CAF50' : '#F44336' }
                  ]}>
                    {info.financialHealth.freeCashFlowFormatted}
                  </Text>
                </View>
              )}
              {info.financialHealth.fcfYield !== null && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>FCF Yield</Text>
                  <Text style={[
                    styles.metricValue,
                    { color: info.financialHealth.fcfYield > 5 ? '#4CAF50' : '#666' }
                  ]}>
                    {info.financialHealth.fcfYield.toFixed(1)}%
                  </Text>
                </View>
              )}
              {info.financialHealth.profitMargin !== null && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Margen</Text>
                  <Text style={[
                    styles.metricValue,
                    { color: info.financialHealth.profitMargin > 15 ? '#4CAF50' : 
                             info.financialHealth.profitMargin > 0 ? '#666' : '#F44336' }
                  ]}>
                    {info.financialHealth.profitMargin.toFixed(1)}%
                  </Text>
                </View>
              )}
              {info.financialHealth.returnOnEquity !== null && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>ROE</Text>
                  <Text style={[
                    styles.metricValue,
                    { color: info.financialHealth.returnOnEquity > 15 ? '#4CAF50' : '#666' }
                  ]}>
                    {info.financialHealth.returnOnEquity.toFixed(1)}%
                  </Text>
                </View>
              )}
              {info.financialHealth.debtToEquity !== null && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>D/E</Text>
                  <Text style={[
                    styles.metricValue,
                    { color: info.financialHealth.debtToEquity < 1 ? '#4CAF50' : 
                             info.financialHealth.debtToEquity < 2 ? '#FF9800' : '#F44336' }
                  ]}>
                    {info.financialHealth.debtToEquity.toFixed(2)}
                  </Text>
                </View>
              )}
              {info.financialHealth.currentRatio !== null && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Current R.</Text>
                  <Text style={[
                    styles.metricValue,
                    { color: info.financialHealth.currentRatio > 1.5 ? '#4CAF50' : 
                             info.financialHealth.currentRatio > 1 ? '#FF9800' : '#F44336' }
                  ]}>
                    {info.financialHealth.currentRatio.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Riesgo */}
        <View style={styles.sectionWide}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>⚠️</Text>
            <Text style={styles.sectionTitle}>Métricas de Riesgo</Text>
          </View>
          <View style={styles.sectionContentHorizontal}>
            {/* Risk level badge */}
            <View style={[
              styles.statusBadge,
              { backgroundColor: getRiskColor(info.riskMetrics.riskLevel) + '20' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: getRiskColor(info.riskMetrics.riskLevel) }
              ]}>
                {info.riskMetrics.riskLevel === 'low' ? '🟢 Bajo' :
                 info.riskMetrics.riskLevel === 'moderate' ? '🟡 Moderado' :
                 info.riskMetrics.riskLevel === 'high' ? '🟠 Alto' :
                 info.riskMetrics.riskLevel === 'very_high' ? '🔴 Muy Alto' : '❓'}
              </Text>
            </View>

            {/* Risk metrics */}
            <View style={styles.riskMetricsRow}>
              {info.riskMetrics.beta !== null && (
                <View style={styles.riskMetricItem}>
                  <Text style={styles.riskMetricLabel}>Beta</Text>
                  <Text style={[
                    styles.riskMetricValue,
                    { color: info.riskMetrics.beta > 1.5 ? '#F44336' : 
                             info.riskMetrics.beta > 1 ? '#FF9800' : '#4CAF50' }
                  ]}>
                    {info.riskMetrics.beta.toFixed(2)}
                  </Text>
                </View>
              )}
              {info.riskMetrics.volatility52w !== null && (
                <View style={styles.riskMetricItem}>
                  <Text style={styles.riskMetricLabel}>Volatilidad 52s</Text>
                  <Text style={[
                    styles.riskMetricValue,
                    { color: info.riskMetrics.volatility52w > 50 ? '#F44336' : 
                             info.riskMetrics.volatility52w > 30 ? '#FF9800' : '#4CAF50' }
                  ]}>
                    {info.riskMetrics.volatility52w.toFixed(1)}%
                  </Text>
                </View>
              )}
              {info.riskMetrics.maxDrawdown52w !== null && (
                <View style={styles.riskMetricItem}>
                  <Text style={styles.riskMetricLabel}>Desde máx.</Text>
                  <Text style={[
                    styles.riskMetricValue,
                    { color: info.riskMetrics.maxDrawdown52w > 30 ? '#F44336' : 
                             info.riskMetrics.maxDrawdown52w > 15 ? '#FF9800' : '#4CAF50' }
                  ]}>
                    -{info.riskMetrics.maxDrawdown52w.toFixed(1)}%
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  keyPointsContainer: {
    backgroundColor: '#252540',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  keyPoint: {
    fontSize: 13,
    color: '#e5e5e5',
    lineHeight: 20,
  },
  sectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  section: {
    backgroundColor: '#252540',
    borderRadius: 10,
    padding: 12,
    flex: 1,
    minWidth: 140,
  },
  sectionWide: {
    backgroundColor: '#252540',
    borderRadius: 10,
    padding: 12,
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  sectionIcon: {
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    gap: 8,
  },
  sectionContentHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  mainValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  bigNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  bigNumberLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  subText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  noData: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  miniStatValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  upcomingBadge: {
    backgroundColor: '#4CAF5020',
  },
  dateLabel: {
    fontSize: 10,
    color: '#6b7280',
  },
  dateValue: {
    fontSize: 11,
    color: '#e5e5e5',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  targetValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  ratiosRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  ratioItem: {
    alignItems: 'center',
  },
  ratioLabel: {
    fontSize: 10,
    color: '#6b7280',
  },
  ratioValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  scoreBarContainer: {
    height: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreBar: {
    height: '100%',
    borderRadius: 10,
    minWidth: 40,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
    position: 'absolute',
    right: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metricItem: {
    minWidth: 55,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 9,
    color: '#6b7280',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  riskMetricsRow: {
    flexDirection: 'row',
    gap: 20,
    flex: 1,
    justifyContent: 'flex-end',
  },
  riskMetricItem: {
    alignItems: 'center',
  },
  riskMetricLabel: {
    fontSize: 10,
    color: '#6b7280',
  },
  riskMetricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e5e5',
  },
});

export default InvestorInfoCard;
