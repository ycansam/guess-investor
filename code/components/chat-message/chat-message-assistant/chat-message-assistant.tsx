import React from 'react';
import { Text, View } from 'react-native';
import { ChatMessage as ChatMessageType } from '../../../types';
import { styles } from './chat-message-assistant.styles';

interface ChatMessageAssistantProps {
  message: ChatMessageType;
}

export const ChatMessageAssistant: React.FC<ChatMessageAssistantProps> = ({ message }) => {
  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.roleLabel}>🤖 Asistente IA</Text>
        <Text style={styles.content}>{message.content}</Text>
        {message.prediction && (
          <View style={styles.predictionInline}>
            <Text style={styles.predictionLabel}>📊 Predicción incluida</Text>
          </View>
        )}
        <Text style={styles.timestamp}>
          {message.timestamp.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
};
