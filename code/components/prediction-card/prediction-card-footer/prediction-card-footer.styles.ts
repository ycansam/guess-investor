import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2e2e2e',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateIcon: {
    fontSize: 12,
  },
  timestamp: {
    fontSize: 12,
    color: '#a0a0a0',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertButton: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  alertButtonText: {
    fontSize: 12,
  },
  analysisButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  analysisButtonText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 10,
    color: '#ef4444',
  },
});
