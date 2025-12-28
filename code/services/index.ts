// =============================================================================
// SERVICIOS DEL FRONTEND - ESTRUCTURA LIMPIA
// =============================================================================
// El backend hace todo el procesamiento pesado (predicciones, análisis técnico,
// sentiment, noticias, macro). El frontend solo consume la API y maneja UI/cache.

// -----------------------------------------------------------------------------
// CLIENTE API - Comunicación con el backend
// -----------------------------------------------------------------------------
export { apiClient } from './api-client';
export type {
    AssetQuote,
    CalculatedPrediction,
    FullAnalysis,
    HistoricalDataPoint,
    MacroIndicators,
    NewsSummary,
    SearchResult,
    SentimentData,
    TechnicalAnalysis
} from './api-client';

// -----------------------------------------------------------------------------
// SERVICIOS ACTIVOS
// -----------------------------------------------------------------------------

// Favoritos - Persistencia en backend
export { favoritesService } from './favorites-service-v2';

// Servicio de IA - Solo usa el backend
export { aiService } from './ai-service';

// Lista de activos disponibles (datos locales)
export { ALL_ASSETS, marketDataService } from './market-data-service';
export type { MarketAsset } from './market-data-service';

// Cache local de predicciones para training
export { TIMEFRAME_INFO, trainingCacheService } from './training-cache-service';
export type { TrainingPrediction, TrainingTimeframe } from './training-cache-service';

// Conversión de divisas
export { currencyService } from './currency-service';

// Horarios de mercado
export { default as marketHoursService } from './market-hours-service';

// Parser de mensajes del chat
export { messageParserService } from './message-parser-service';
export type { ParsedMessage } from './message-parser-service';

// Lookup de símbolos
export { symbolLookupService } from './symbol-lookup-service';

// Tracking de predicciones
export { predictionTrackingService } from './prediction-tracking-service';
export type { TrackedPrediction, TrackingStats } from './prediction-tracking-service';

// Migración de datos legacy
export { dataMigrationService } from './data-migration-service';

// =============================================================================
// ARQUITECTURA:
// =============================================================================
// 
// Frontend (React Native):
//   - Solo UI, cache local, y llamadas al backend via apiClient
//   - NO hace llamadas directas a APIs externas (Yahoo, FRED, etc.)
//
// Backend (Express + Prisma):
//   - Todas las llamadas a APIs externas
//   - Cálculo de predicciones
//   - Persistencia en base de datos
