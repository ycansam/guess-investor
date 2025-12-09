import { useEffect } from 'react';
import { Alert } from 'react-native';
import { geminiService } from '../../services/gemini-service';
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
  } = useChatStore();

  // Verificar configuración de API al montar
  useEffect(() => {
    if (!geminiService.isConfigured()) {
      Alert.alert(
        '⚠️ Configuración Requerida',
        'Necesitas configurar tu API Key de Google Gemini (GRATIS).\n\n' +
        '1. Ve a https://aistudio.google.com/apikey\n' +
        '2. Crea una API Key\n' +
        '3. Añádela al archivo .env como EXPO_PUBLIC_GEMINI_API_KEY',
        [{ text: 'Entendido' }]
      );
    }
  }, []);

  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };

  const handleClearChat = () => {
    Alert.alert(
      'Limpiar Chat',
      '¿Estás seguro de que quieres borrar todo el historial?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpiar', style: 'destructive', onPress: clearMessages },
      ]
    );
  };

  const handleClearPredictions = () => {
    Alert.alert(
      'Limpiar Predicciones',
      '¿Borrar todas las predicciones guardadas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpiar', style: 'destructive', onPress: clearPredictions },
      ]
    );
  };

  return {
    messages,
    isLoading,
    predictions,
    handleSendMessage,
    handleClearChat,
    handleClearPredictions,
  };
}
