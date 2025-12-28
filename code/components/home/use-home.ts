import { useEffect } from 'react';
import { useChatStore } from '../../store/chat-store';



/**
 * Hook que encapsula la lógica de la pantalla Home
 */
export function useHome() {
  const {
    messages,
    isLoading,
    predictions,
    sendMessage,
    clearMessages,
    clearPredictions,
    removePrediction,
    loadPredictions,
  } = useChatStore();

  // Cargar predicciones guardadas al montar
  useEffect(() => {
    // Cargar predicciones desde IndexedDB
    loadPredictions();
  }, []);

  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };

  const handleClearChat = () => {
    clearMessages();
  };

  const handleClearPredictions = () => {
    clearPredictions();
  };

  const handleRemovePrediction = (id: string) => {
    removePrediction(id);
  };

  return {
    messages,
    isLoading,
    predictions,
    handleSendMessage,
    handleClearChat,
    handleClearPredictions,
    handleRemovePrediction,
  };
}
