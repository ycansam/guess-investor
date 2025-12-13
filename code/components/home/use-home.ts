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
    removePrediction,
    loadPredictions,
  } = useChatStore();

  // Cargar predicciones guardadas y verificar configuración de API al montar
  useEffect(() => {
    // Cargar predicciones desde IndexedDB
    loadPredictions();
    
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

  const handleRemovePrediction = (id: string) => {
    Alert.alert(
      'Eliminar Predicción',
      '¿Estás seguro de que quieres eliminar esta predicción?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => removePrediction(id) },
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
    handleRemovePrediction,
  };
}
