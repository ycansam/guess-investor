import React from 'react';
import { ChatMessage as ChatMessageType } from '../../types';
import { ChatMessageAssistant } from './chat-message-assistant';
import { ChatMessageUser } from './chat-message-user';

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  if (message.role === 'system') return null;

  if (message.role === 'user') {
    return <ChatMessageUser message={message} />;
  }

  return <ChatMessageAssistant message={message} />;
};
