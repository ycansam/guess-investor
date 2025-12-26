import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  
  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8081',
  
  // API Keys
  rapidApiKey: process.env.RAPIDAPI_KEY || '',
  fredApiKey: process.env.FRED_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  
  // Cache TTLs (en segundos)
  cache: {
    quote: 60,           // 1 minuto
    history: 300,        // 5 minutos
    profile: 3600,       // 1 hora
    financials: 86400,   // 24 horas
  },
} as const;

export type Config = typeof config;
