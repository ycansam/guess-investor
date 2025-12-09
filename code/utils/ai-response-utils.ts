import { ParsedAIResponse } from '../types';

/**
 * Parsea la respuesta del modelo para extraer predicciones
 */
export function parseAIResponse(content: string): ParsedAIResponse {
  const result: ParsedAIResponse = {
    message: content,
  };

  // Buscar bloque JSON con predicción
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  
  if (jsonMatch) {
    try {
      const predictionData = JSON.parse(jsonMatch[1]);
      
      result.prediction = {
        asset: predictionData.asset,
        assetType: predictionData.assetType || 'other',
        direction: predictionData.direction || 'neutral',
        confidence: predictionData.confidence || 50,
        timeframe: predictionData.timeframe || 'No especificado',
        predictedChange: predictionData.predictedChange,
        reasoning: content.replace(/```json[\s\S]*?```/, '').trim(),
      };

      // Limpiar el mensaje removiendo el JSON
      result.message = content.replace(/```json[\s\S]*?```/, '').trim();
    } catch (e) {
      console.log('No se pudo parsear predicción JSON:', e);
    }
  }

  return result;
}

/**
 * Genera mensajes de error amigables según el tipo de error
 */
export function getErrorMessage(error: any): string {
  const message = error.message || '';

  if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
    return 'API Key inválida. Por favor, verifica tu configuración en https://aistudio.google.com/apikey';
  }
  
  if (message.includes('RATE_LIMIT') || message.includes('quota')) {
    return 'Límite de requests excedido. Espera unos segundos e intenta de nuevo.';
  }
  
  if (message.includes('SAFETY')) {
    return 'La respuesta fue bloqueada por filtros de seguridad. Intenta reformular tu pregunta.';
  }
  
  return message || 'Error al conectar con Gemini';
}
