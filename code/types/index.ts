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
  symbol?: string; // Símbolo del activo (ej: "AMZN", "ITX.MC", "BTC-USD")
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
    // Datos financieros de la empresa (solo para acciones)
    financials?: {
      revenue: string; // Ingresos formateados (€5.2B)
      revenueGrowth: number; // Crecimiento de ingresos (%)
      netIncome: string; // Beneficio neto formateado
      earningsGrowth: number; // Crecimiento de beneficios (%)
      profitMargin: number; // Margen de beneficio (%)
      peRatio: number; // P/E Ratio
      analystRating: string; // Comprar, Mantener, Vender
      targetPrice: number; // Precio objetivo analistas
      currentVsTarget: number; // % diferencia vs objetivo
      // Expectativas del mercado
      lastEarningsSurprise: number; // % sorpresa último trimestre
      avgEarningsSurprise: number; // % sorpresa promedio
      expectationsOutlook: string; // "Supera expectativas", "Cumple", etc.
      expectationsScore: number; // Score expectativas 0-100
      overallScore: number; // Score general 0-100
    };
    // Noticias recientes
    news?: {
      sentiment: 'positive' | 'negative' | 'neutral';
      score: number; // -100 a +100
      count: number; // Número de noticias analizadas
      summary: string; // Resumen del sentimiento
    };
    // Indicadores macroeconómicos
    macro?: {
      region: string; // europe, usa, etc.
      outlook: 'favorable' | 'neutral' | 'unfavorable';
      score: number; // -100 a +100
      summary: string; // Resumen del contexto macro
    };
    // Análisis de competidores
    competitors?: {
      sector: string; // Nombre del sector
      sectorTrend: 'bullish' | 'bearish' | 'neutral';
      outperforming: boolean; // ¿Supera a competidores?
      score: number; // -100 a +100
      summary: string; // Resumen de la comparación
      competitorNames: string[]; // Nombres de competidores analizados
    };
    // Análisis de tipos de cambio
    forex?: {
      baseCurrency: string; // Moneda base de la empresa (EUR, USD, etc.)
      trend: 'eur_strong' | 'eur_weak' | 'stable';
      score: number; // -100 a +100
      summary: string; // Resumen del impacto
      mainPairs: string[]; // Pares analizados (EUR/USD, EUR/GBP, etc.)
    };
    // Movimientos de inversores institucionales
    institutional?: {
      ownershipPercent?: number; // % en manos de instituciones
      numberOfInstitutions?: number;
      ownershipTrend?: 'increasing' | 'decreasing' | 'stable';
      insiderNetShares?: number;
      insiderNetValue?: number;
      insiderTrend?: 'buying' | 'selling' | 'neutral';
      topHolders: string[]; // Nombres de principales fondos
      score: number; // -100 a +100
      summary: string; // Resumen de la actividad institucional
    };
    // Estacionalidad del mercado (festivos y eventos por país)
    seasonality?: {
      sector: string; // Sector detectado (Retail, Turismo, etc.)
      region: string; // País/región detectada
      events: string[]; // Eventos activos (Black Friday, Navidad, etc.)
      score: number; // -100 a +100
      summary: string; // Resumen del impacto estacional
    };
    // Análisis técnico (indicadores)
    technicalAnalysis?: {
      trend: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
      score: number; // -100 a +100
      rsi14?: number;
      rsiSignal: 'oversold' | 'overbought' | 'neutral';
      macdTrend: 'bullish' | 'bearish' | 'neutral';
      priceVsSMA200: 'above' | 'below';
      priceVsSMA50: 'above' | 'below';
      goldenCross: boolean;
      deathCross: boolean;
      bollingerPosition: 'above' | 'below' | 'inside';
      volumeSignal: 'high' | 'low' | 'normal';
      signals: string[]; // Descripciones de señales activas
      summary: string;
    };
    // Desglose de factores usados en la predicción
    factorBreakdown?: {
      assetGroup: string; // Grupo del activo (large_cap_stock, crypto_major, etc.)
      assetGroupDescription: string; // Descripción legible
      relevantFactors: string[]; // Factores que aplican a este tipo de activo
      availableFactors: { name: string; score: number; hasData: boolean }[];
      confidenceExplanation: string; // Por qué la confianza es X%
      signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
    };
    // AUDITORÍA: Trazabilidad de datos y cálculos para verificación
    audit?: {
      dataSources: {
        name: string;
        url: string;
        fetchedAt: Date;
        rawValue?: string;
      }[];
      calculationSteps: {
        step: string;
        formula: string;
        result: number;
      }[];
      combinedScoreBreakdown: string;
      expectedChangeBreakdown: string;
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
