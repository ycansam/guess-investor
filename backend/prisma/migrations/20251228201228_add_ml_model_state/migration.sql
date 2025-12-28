-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "asset" TEXT,
    "assetType" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timeframeDays" INTEGER NOT NULL DEFAULT 1,
    "direction" TEXT NOT NULL,
    "predictedChange" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "targetPrice" REAL NOT NULL,
    "predictedPriceMin" REAL,
    "predictedPriceMax" REAL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "actualPrice" REAL,
    "actualChange" REAL,
    "actualDirection" TEXT,
    "directionCorrect" BOOLEAN,
    "withinRange" BOOLEAN,
    "priceError" REAL,
    "changeAccuracy" REAL,
    "accuracyScore" REAL,
    "quality" TEXT,
    "volatility" REAL,
    "volatilityCategory" TEXT,
    "factorBreakdown" TEXT,
    "factorWeights" TEXT,
    "reasoning" TEXT,
    "uncertaintyScore" REAL,
    "uncertaintyData" TEXT,
    "sentimentData" TEXT,
    "historicalData" TEXT,
    "technicalData" TEXT,
    "newsData" TEXT,
    "macroData" TEXT
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "LearnedWeights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trend" REAL NOT NULL DEFAULT 0.091,
    "technical" REAL NOT NULL DEFAULT 0.091,
    "sentiment" REAL NOT NULL DEFAULT 0.091,
    "news" REAL NOT NULL DEFAULT 0.091,
    "macro" REAL NOT NULL DEFAULT 0.091,
    "competitors" REAL NOT NULL DEFAULT 0.091,
    "forex" REAL NOT NULL DEFAULT 0.091,
    "institutional" REAL NOT NULL DEFAULT 0.091,
    "seasonality" REAL NOT NULL DEFAULT 0.091,
    "financials" REAL NOT NULL DEFAULT 0.091,
    "expectations" REAL NOT NULL DEFAULT 0.091,
    "version" INTEGER NOT NULL DEFAULT 1,
    "trainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "accuracy" REAL
);

-- CreateTable
CREATE TABLE "AssetAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "magnitudeScale" REAL NOT NULL DEFAULT 1.0,
    "directionalBias" REAL NOT NULL DEFAULT 0.0,
    "confidenceScale" REAL NOT NULL DEFAULT 1.0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "avgPredictedChange" REAL NOT NULL DEFAULT 0.0,
    "avgActualChange" REAL NOT NULL DEFAULT 0.0,
    "avgError" REAL NOT NULL DEFAULT 0.0,
    "avgAbsError" REAL NOT NULL DEFAULT 0.0,
    "hitRate" REAL NOT NULL DEFAULT 0.0,
    "reason" TEXT NOT NULL DEFAULT 'auto_learned',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdaptiveState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "directionAccuracy" REAL,
    "avgAccuracyScore" REAL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "currentAdjustments" TEXT,
    "lastUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConfidenceCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calibrationBins" TEXT,
    "slope" REAL NOT NULL DEFAULT 1.0,
    "intercept" REAL NOT NULL DEFAULT 0.0,
    "trainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "MarketDataCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "timeframe" TEXT,
    "data" TEXT NOT NULL,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrainingCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "predictedChange" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "direction" TEXT NOT NULL,
    "currentPrice" REAL NOT NULL,
    "targetPrice" REAL NOT NULL,
    "analysisData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MLModelState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stateJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Prediction_symbol_idx" ON "Prediction"("symbol");

-- CreateIndex
CREATE INDEX "Prediction_verified_idx" ON "Prediction"("verified");

-- CreateIndex
CREATE INDEX "Prediction_createdAt_idx" ON "Prediction"("createdAt");

-- CreateIndex
CREATE INDEX "Prediction_symbol_timeframe_idx" ON "Prediction"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "Prediction_quality_idx" ON "Prediction"("quality");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_symbol_key" ON "Favorite"("symbol");

-- CreateIndex
CREATE INDEX "Favorite_symbol_idx" ON "Favorite"("symbol");

-- CreateIndex
CREATE INDEX "LearnedWeights_version_idx" ON "LearnedWeights"("version");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAdjustment_symbol_key" ON "AssetAdjustment"("symbol");

-- CreateIndex
CREATE INDEX "AssetAdjustment_symbol_idx" ON "AssetAdjustment"("symbol");

-- CreateIndex
CREATE INDEX "AdaptiveState_lastUpdate_idx" ON "AdaptiveState"("lastUpdate");

-- CreateIndex
CREATE INDEX "ConfidenceCalibration_trainedAt_idx" ON "ConfidenceCalibration"("trainedAt");

-- CreateIndex
CREATE INDEX "MarketDataCache_symbol_idx" ON "MarketDataCache"("symbol");

-- CreateIndex
CREATE INDEX "MarketDataCache_expiresAt_idx" ON "MarketDataCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketDataCache_symbol_dataType_timeframe_key" ON "MarketDataCache"("symbol", "dataType", "timeframe");

-- CreateIndex
CREATE INDEX "TrainingCache_symbol_idx" ON "TrainingCache"("symbol");

-- CreateIndex
CREATE INDEX "TrainingCache_expiresAt_idx" ON "TrainingCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCache_symbol_timeframe_key" ON "TrainingCache"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "MLModelState_modelType_idx" ON "MLModelState"("modelType");

-- CreateIndex
CREATE UNIQUE INDEX "MLModelState_modelType_version_key" ON "MLModelState"("modelType", "version");
