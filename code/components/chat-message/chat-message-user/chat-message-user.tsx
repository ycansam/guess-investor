import React from 'react';
import { Text, View } from 'react-native';
import { ChatMessage as ChatMessageType } from '../../../types';
import { styles } from './chat-message-user.styles';

interface ChatMessageUserProps {
  message: ChatMessageType;
}

export const ChatMessageUser: React.FC<ChatMessageUserProps> = ({ message }) => {
  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.roleLabel}>👤 Tú</Text>
        <Text style={styles.content}>{message.content}</Text>
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
