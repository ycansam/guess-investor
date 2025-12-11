// Tipos para el sistema de predicciones de inversiones con IA

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  prediction?: InvestmentPrediction;
}

export interface InvestmentPrediction {
  id: string;
  asset: string;
  assetType: AssetType;
  currentPrice?: number;
  predictedPrice?: number;
  predictedPriceMin?: number;
  predictedPriceMax?: number;
  predictedChange?: number;
  confidence: number;
  timeframe: string;
  direction: 'up' | 'down' | 'neutral';
  reasoning: string;
  createdAt: Date;
  
  // Datos de análisis reales (para mostrar en el razonamiento)
  analysisData?: {
    sentiment: {
      score: number; // 0-100, donde 50 es neutral
      source: string; // "StockTwits", "Fear & Greed Index", etc.
    };
    historical: {
      change30d: number; // Cambio % últimos 30 días
      change90d: number; // Cambio % últimos 90 días
      volatility: number; // Volatilidad anualizada
    };
  };
}

export type AssetType = 
  | 'stock' 
  | 'crypto' 
  | 'forex' 
  | 'commodity' 
  | 'index' 
  | 'energy'
  | 'other';

export interface Investment {
  id: string;
  name: string;
  symbol: string;
  type: AssetType;
  currentValue?: number;
  purchasePrice?: number;
  quantity?: number;
  notes?: string;
  predictions: InvestmentPrediction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  lastUpdated: Date;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  currency?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

export interface PredictionState {
  predictions: InvestmentPrediction[];
  isAnalyzing: boolean;
  lastAnalysis: Date | null;
}

export interface AppConfig {
  geminiApiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

// Tipo para la respuesta de la IA parseada
export interface ParsedAIResponse {
  message: string;
  prediction?: Partial<InvestmentPrediction>;
  marketInsights?: string[];
}
