import { AppConfig } from '../types';

// Prompt por defecto (simple)
const DEFAULT_SYSTEM_PROMPT = `Eres un asistente experto en inversiones y mercados financieros. Responde siempre en español de forma clara y concisa.`;

// Configuración de la aplicación
export const appConfig: AppConfig = {
  // Configuración del modelo de IA (ya no se usa Gemini, todo va por backend)
  maxTokens: 4096,
  temperature: 0.5,
};

// System prompt para el asistente de inversiones
// Puede sobrescribirse con EXPO_PUBLIC_SYSTEM_PROMPT en .env
export const INVESTMENT_SYSTEM_PROMPT =
  process.env.EXPO_PUBLIC_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
