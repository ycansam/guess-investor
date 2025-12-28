import { ChatMessage } from '../types';

/**
 * Utilidades para gestionar el historial de conversación
 */

// Patrones que indican errores en respuestas anteriores
const ERROR_PATTERNS = [
  /\b\d{6}\s*\([A-Z]{2,4}\)/,  // Patrón como "408525 (UNA)"
  /no se encontraron datos/i,
  /No encontré información/i,
];

/**
 * Filtra el historial eliminando mensajes con errores de símbolos
 */
export function cleanConversationHistory(
  history: ChatMessage[], 
  maxMessages: number = 10
): ChatMessage[] {
  return history.slice(-maxMessages).filter(msg => {
    if (msg.role !== 'assistant') return true;
    
    // Verificar si el mensaje tiene patrones de error
    const hasError = ERROR_PATTERNS.some(pattern => pattern.test(msg.content));
    
    // Excluir mensajes cortos con errores
    if (hasError && msg.content.length < 200) {
      return false;
    }
    
    return true;
  });
}


