import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  toggleButton: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  toggleButtonText: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
  },
  text: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dataItem: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dataLabel: {
    fontSize: 10,
    color: '#888',
    marginBottom: 2,
    textAlign: 'center',
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  sentimentContainer: {
    marginTop: 4,
  },
  sentimentBar: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  sentimentFill: {
    height: '100%',
    borderRadius: 6,
  },
  sentimentInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sentimentScore: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  sentimentSource: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  conclusionText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
    fontStyle: 'italic',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1976D2',
    marginTop: 4,
  },
  // Financials
  financialsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  financialsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  financialItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  financialLabel: {
    fontSize: 9,
    color: '#888',
    marginBottom: 2,
    textAlign: 'center',
  },
  financialValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  analystRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    marginTop: 4,
  },
  ratingBadge: {
    alignItems: 'center',
  },
  ratingLabel: {
    fontSize: 9,
    color: '#888',
    marginBottom: 2,
  },
  ratingValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  targetPriceContainer: {
    alignItems: 'flex-end',
  },
  targetPriceLabel: {
    fontSize: 9,
    color: '#888',
  },
  targetPriceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  targetPriceDiff: {
    fontSize: 11,
    fontWeight: '600',
  },
  overallScoreContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  overallScoreLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
  },
  overallScoreBarBg: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  overallScoreBar: {
    height: '100%',
    borderRadius: 4,
  },
  overallScoreValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  // News
  newsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  newsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  newsSentiment: {
    fontSize: 13,
    fontWeight: '700',
  },
  newsCount: {
    fontSize: 11,
    color: '#888',
  },
  newsSummary: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  // Macro
  macroContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  macroRegion: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  macroOutlook: {
    fontSize: 12,
    fontWeight: '700',
  },
  macroSummary: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  // Competitors
  competitorsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  competitorsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  competitorsSector: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  competitorsTrend: {
    fontSize: 12,
    fontWeight: '700',
  },
  competitorsOutperform: {
    marginBottom: 8,
  },
  outperformBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  competitorsNames: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  competitorsSummary: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  // Forex
  forexContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  forexHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forexBaseCurrency: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  forexTrend: {
    fontSize: 12,
    fontWeight: '700',
  },
  forexPairs: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  forexSummary: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  // Institutional investors
  institutionalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  institutionalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  institutionalItem: {
    flex: 1,
    alignItems: 'center',
  },
  institutionalLabel: {
    fontSize: 9,
    color: '#888',
    marginBottom: 2,
    textAlign: 'center',
  },
  institutionalValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  insiderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  insiderBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  insiderValue: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  institutionalHolders: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  institutionalSummary: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  // Seasonality
  seasonalityContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  seasonalityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  seasonalitySector: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  seasonalityScore: {
    fontSize: 12,
    fontWeight: '700',
  },
  seasonalityMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  seasonalitySeason: {
    fontSize: 11,
    color: '#666',
  },
  seasonalityRegion: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  seasonalityEvents: {
    marginBottom: 6,
  },
  seasonalityEvent: {
    fontSize: 11,
    color: '#555',
    marginBottom: 2,
  },
  seasonalitySummary: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  // Market Hours
  marketHoursContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderLeftWidth: 4,
  },
  marketHoursHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  marketExchange: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  marketStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  marketStatusEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  marketStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  marketHoursInfo: {
    marginBottom: 6,
  },
  marketHoursDetail: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  marketNextEvent: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  marketSuggestion: {
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  // Factor Breakdown
  factorBreakdownContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  factorAssetType: {
    fontSize: 11,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  signalSummaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  signalSummaryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  factorBarContainer: {
    marginBottom: 12,
  },
  factorItem: {
    marginBottom: 8,
  },
  factorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  factorName: {
    fontSize: 11,
    color: '#333',
  },
  factorScore: {
    fontSize: 11,
    fontWeight: '600',
  },
  factorBar: {
    height: 4,
    backgroundColor: '#E8E8E8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  factorBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  confidenceExplanation: {
    fontSize: 11,
    color: '#555',
    lineHeight: 16,
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 6,
  },
  
  // Estilos de Auditoría
  auditSubtitle: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  auditSourcesContainer: {
    marginBottom: 12,
  },
  auditSourceItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  auditSourceName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  auditSourceValue: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  auditSourceUrl: {
    fontSize: 10,
    color: '#1976D2',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  auditCalcTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  auditCalcContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  auditCalcStep: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  auditStepName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
  },
  auditStepFormula: {
    fontSize: 10,
    color: '#888',
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  auditStepResult: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
  auditFinalFormula: {
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  auditFormulaTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  auditFormulaText: {
    fontSize: 11,
    color: '#555',
    fontFamily: 'monospace',
  },
});
