import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    width: '100%',
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    color: 'rgba(255,255,255,0.8)',
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: '#FFFFFF',
  },
  timestamp: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
    alignSelf: 'flex-end',
  },
});
