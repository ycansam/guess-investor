import { z } from 'zod';

// ============================================================================
// PREDICTION TYPES
// ============================================================================

export const AssetTypeSchema = z.enum(['stock', 'crypto', 'etf', 'commodity']);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const TimeframeSchema = z.enum(['intraday', 'swing', 'longterm']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const DirectionSchema = z.enum(['up', 'down']);
export type Direction = z.infer<typeof DirectionSchema>;

// Factor scores (9 factores - competitors y seasonality eliminados)
export const FactorScoresSchema = z.object({
  trend: z.number(),
  technical: z.number(),
  sentiment: z.number(),
  news: z.number(),
  macro: z.number(),
  forex: z.number(),
  institutional: z.number(),
  financials: z.number(),
  expectations: z.number(),
});
export type FactorScores = z.infer<typeof FactorScoresSchema>;

// Request para crear predicción
export const CreatePredictionRequestSchema = z.object({
  symbol: z.string().min(1).max(10),
  assetType: AssetTypeSchema.optional(),
  timeframe: TimeframeSchema.default('intraday'),
  days: z.number().int().min(1).max(90).default(1),
});
export type CreatePredictionRequest = z.infer<typeof CreatePredictionRequestSchema>;

// Respuesta de predicción
export const PredictionResponseSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  assetType: AssetTypeSchema,
  timeframe: TimeframeSchema,
  direction: DirectionSchema,
  predictedChange: z.number(),
  confidence: z.number(),
  currentPrice: z.number(),
  targetPrice: z.number(),
  predictedPriceMin: z.number().optional(),
  predictedPriceMax: z.number().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  reasoning: z.string().optional(),
  factorBreakdown: FactorScoresSchema.optional(),
});
export type PredictionResponse = z.infer<typeof PredictionResponseSchema>;

// ============================================================================
// VERIFICATION TYPES
// ============================================================================

export const VerifyPredictionRequestSchema = z.object({
  predictionId: z.string().uuid(),
  actualPrice: z.number().positive(),
});
export type VerifyPredictionRequest = z.infer<typeof VerifyPredictionRequestSchema>;

export const VerificationResultSchema = z.object({
  predictionId: z.string(),
  directionCorrect: z.boolean(),
  actualChange: z.number(),
  predictedChange: z.number(),
  accuracyScore: z.number(),
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// ============================================================================
// ASSET TYPES
// ============================================================================

export const AssetQuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  currency: z.string(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number().optional(),
  marketCap: z.number().optional(),
  previousClose: z.number().optional(),
});
export type AssetQuote = z.infer<typeof AssetQuoteSchema>;

export const HistoricalDataPointSchema = z.object({
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
});
export type HistoricalDataPoint = z.infer<typeof HistoricalDataPointSchema>;

// ============================================================================
// FAVORITE TYPES
// ============================================================================

export const CreateFavoriteRequestSchema = z.object({
  symbol: z.string().min(1).max(10),
  name: z.string().min(1),
  assetType: AssetTypeSchema,
});
export type CreateFavoriteRequest = z.infer<typeof CreateFavoriteRequestSchema>;

export const FavoriteResponseSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  assetType: AssetTypeSchema,
  addedAt: z.string(),
});
export type FavoriteResponse = z.infer<typeof FavoriteResponseSchema>;

// ============================================================================
// WEIGHTS TYPES
// ============================================================================

export const WeightsSchema = z.object({
  trend: z.number().min(0).max(1),
  technical: z.number().min(0).max(1),
  sentiment: z.number().min(0).max(1),
  news: z.number().min(0).max(1),
  macro: z.number().min(0).max(1),
  forex: z.number().min(0).max(1),
  institutional: z.number().min(0).max(1),
  financials: z.number().min(0).max(1),
  expectations: z.number().min(0).max(1),
});
export type Weights = z.infer<typeof WeightsSchema>;

// ============================================================================
// API RESPONSE WRAPPER
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}
