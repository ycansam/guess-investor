import React from 'react';
import { Text, View } from 'react-native';
import { ChatMessage as ChatMessageType } from '../../types';
import { styles } from './chat-message.styles';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) return null;

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.roleLabel, isUser ? styles.userLabel : styles.assistantLabel]}>
          {isUser ? '👤 Tú' : '🤖 Asistente IA'}
        </Text>
        <Text style={[styles.content, isUser ? styles.userContent : styles.assistantContent]}>
          {message.content}
        </Text>
        {message.prediction && (
          <View style={styles.predictionInline}>
            <Text style={styles.predictionLabel}>📊 Predicción incluida</Text>
          </View>
        )}
        <Text style={styles.timestamp}>
          {message.timestamp.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </Text>
      </View>
    </View>
  );
};
