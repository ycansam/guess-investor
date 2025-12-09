import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    width: '100%',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
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
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  roleLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  userLabel: {
    color: 'rgba(255,255,255,0.8)',
  },
  assistantLabel: {
    color: '#666',
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
  },
  userContent: {
    color: '#FFFFFF',
  },
  assistantContent: {
    color: '#1A1A1A',
  },
  timestamp: {
    fontSize: 10,
    color: '#999',
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  predictionInline: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  predictionLabel: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
});
