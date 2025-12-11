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
});
