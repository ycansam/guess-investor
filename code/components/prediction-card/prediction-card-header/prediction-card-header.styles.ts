import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  assetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  assetName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  assetType: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  directionIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  directionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  // Uncertainty Warning Banner Styles
  uncertaintyBanner: {
    marginBottom: 12,
    marginTop: -8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  uncertaintyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uncertaintyEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  uncertaintyTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  uncertaintyReason: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    lineHeight: 15,
  },
  uncertaintyWarningText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
    marginTop: 6,
  },
});
