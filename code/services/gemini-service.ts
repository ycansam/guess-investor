import { GoogleGenerativeAI } from '@google/generative-ai';
import { appConfig, INVESTMENT_SYSTEM_PROMPT } from '../config/app-config';
import { ChatMessage, ParsedAIResponse } from '../types';
import { getErrorMessage, parseAIResponse } from '../utils/ai-response-utils';
import { cleanConversationHistory, formatHistoryForGemini } from '../utils/conversation-utils';
import { marketDataEnricherService } from './market-data-enricher-service';

/**
 * Servicio principal para comunicación con Google Gemini
 * Refactorizado para ser escalable y mantenible
 */
class GeminiService {
  private client: GoogleGenerativeAI | null = null;

  /**
   * Obtiene o inicializa el cliente de Gemini
   */
  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.validateApiKey();
      this.client = new GoogleGenerativeAI(appConfig.geminiApiKey);
    }
    return this.client;
  }

  /**
   * Valida que la API key esté configurada
   */
  private validateApiKey(): void {
    if (!appConfig.geminiApiKey || appConfig.geminiApiKey === 'TU_API_KEY_AQUI') {
      throw new Error(
        'API Key de Google Gemini no configurada.\n\n' +
        '1. Ve a https://aistudio.google.com/apikey\n' +
        '2. Crea una API Key GRATIS\n' +
        '3. Añádela al archivo .env como EXPO_PUBLIC_GEMINI_API_KEY'
      );
    }
  }

  /**
   * Envía un mensaje al modelo y obtiene la respuesta
   */
  async sendMessage(
    userMessage: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<ParsedAIResponse> {
    try {
      const model = this.createModel();
      
      // Enriquecer el mensaje con datos de mercado
      const { enrichedMessage } = await marketDataEnricherService.enrichMessage(userMessage);

      // Preparar historial limpio
      const cleanedHistory = cleanConversationHistory(conversationHistory);
      const formattedHistory = formatHistoryForGemini(cleanedHistory);

      // Iniciar chat con contexto
      const chat = model.startChat({
        history: this.buildChatHistory(formattedHistory),
      });

      // Enviar mensaje y obtener respuesta
      const result = await chat.sendMessage(enrichedMessage);
      const response = await result.response;
      const assistantMessage = response.text() || 'Lo siento, no pude procesar tu solicitud.';

      return parseAIResponse(assistantMessage);
    } catch (error: any) {
      console.error('Error al comunicarse con Gemini:', error);
      throw new Error(getErrorMessage(error));
    }
  }

  /**
   * Crea una instancia del modelo generativo
   */
  private createModel() {
    const client = this.getClient();
    return client.getGenerativeModel({ 
      model: appConfig.model,
      generationConfig: {
        maxOutputTokens: appConfig.maxTokens,
        temperature: appConfig.temperature,
      },
    });
  }

  /**
   * Construye el historial del chat incluyendo el system prompt
   */
  private buildChatHistory(
    formattedHistory: Array<{ role: string; parts: Array<{ text: string }> }>
  ) {
    return [
      {
        role: 'user',
        parts: [{ text: `Instrucciones del sistema: ${INVESTMENT_SYSTEM_PROMPT}` }],
      },
      {
        role: 'model',
        parts: [{ text: 'Entendido. Soy tu asistente experto en inversiones. ¿En qué puedo ayudarte?' }],
      },
      ...formattedHistory,
    ];
  }

  /**
   * Obtiene un análisis rápido de un activo
   */
  async getQuickAnalysis(asset: string, assetType: string): Promise<ParsedAIResponse> {
    const prompt = `Dame un análisis rápido y una predicción para ${asset} (${assetType}). 
    Incluye:
    1. Situación actual del mercado
    2. Factores clave a considerar
    3. Tu predicción con nivel de confianza
    4. Timeframe recomendado para la inversión`;

    return this.sendMessage(prompt);
  }

  /**
   * Compara múltiples activos
   */
  async compareAssets(assets: string[]): Promise<ParsedAIResponse> {
    const prompt = `Compara los siguientes activos para inversión: ${assets.join(', ')}.
    Para cada uno indica:
    1. Pros y contras
    2. Nivel de riesgo
    3. Potencial de crecimiento
    4. Cuál recomendarías y por qué`;

    return this.sendMessage(prompt);
  }

  /**
   * Verifica si el servicio está configurado correctamente
   */
  isConfigured(): boolean {
    return appConfig.geminiApiKey !== 'TU_API_KEY_AQUI' && 
           appConfig.geminiApiKey.length > 0;
  }
}

// Exportar instancia singleton
export const geminiService = new GeminiService();

// Alias para compatibilidad
export const aiService = geminiService;
