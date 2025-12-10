import { AppConfig } from '../types';

// Prompt por defecto (simple)
const DEFAULT_SYSTEM_PROMPT = `Eres un asistente experto en inversiones y mercados financieros. Responde siempre en español de forma clara y concisa.`;

// Configuración de la aplicación
// IMPORTANTE: En producción, usa variables de entorno
export const appConfig: AppConfig = {
  // Reemplaza con tu API key de Google Gemini
  // Puedes obtener una GRATIS en: https://aistudio.google.com/apikey
  geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'TU_API_KEY_AQUI',

  // Modelo a usar (desde .env o por defecto)
  model: 'gemini-2.5-flash',

  // Máximo de tokens en la respuesta
  maxTokens: 4096,

  // Temperatura (0-2): más bajo = más determinístico, más alto = más creativo
  temperature: 0.5,
};

// System prompt para el asistente de inversiones
// Puede sobrescribirse con EXPO_PUBLIC_SYSTEM_PROMPT en .env
export const INVESTMENT_SYSTEM_PROMPT =
  process.env.EXPO_PUBLIC_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
