import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { geminiService } from '../../services/gemini-service';
import { useChatStore } from '../../store/chat-store';

// Helper para mostrar confirmación compatible con web y mobile
const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

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
    showConfirm(
      'Limpiar Chat',
      '¿Estás seguro de que quieres borrar todo el historial?',
      clearMessages
    );
  };

  const handleClearPredictions = () => {
    showConfirm(
      'Limpiar Predicciones',
      '¿Borrar todas las predicciones guardadas?',
      clearPredictions
    );
  };

  const handleRemovePrediction = (id: string) => {
    showConfirm(
      'Eliminar Predicción',
      '¿Estás seguro de que quieres eliminar esta predicción?',
      () => removePrediction(id)
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
