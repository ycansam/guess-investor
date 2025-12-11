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
});
