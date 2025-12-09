import React, { useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ChatMessage as ChatMessageType } from '../../../types';
import { ChatInput } from '../../chat-input';
import { ChatMessage } from '../../chat-message';
import { QuickActions } from '../../quick-actions';
import { WelcomeScreen } from '../welcome-screen';

interface ChatViewProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
}

export function ChatView({ messages, isLoading, onSendMessage }: ChatViewProps) {
  const flatListRef = useRef<FlatList>(null);

  const scrollToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Auto-scroll cuando cambian los mensajes
  React.useEffect(() => {
    if (messages.length > 0) {
      scrollToEnd();
    }
  }, [messages.length]);

  return (
    <View style={styles.container}>
      <QuickActions onAction={onSendMessage} />

      {messages.length === 0 ? (
        <WelcomeScreen />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatMessage message={item} />}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ChatInput
        onSend={onSendMessage}
        isLoading={isLoading}
        placeholder="Pregunta sobre inversiones..."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 16,
  },
});
