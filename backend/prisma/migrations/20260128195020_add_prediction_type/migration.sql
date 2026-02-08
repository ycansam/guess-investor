-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "targetPrice" REAL NOT NULL DEFAULT 0,
    "percentChange" REAL,
    "condition" TEXT NOT NULL,
    "currentPriceAtCreation" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTriggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" DATETIME,
    "triggeredPrice" REAL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "InvestmentNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "notes" TEXT,
    "thesis" TEXT,
    "targetPrice" REAL,
    "entryPrice" REAL,
    "stopLoss" REAL,
    "status" TEXT NOT NULL DEFAULT 'watching',
    "rating" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "asset" TEXT,
    "assetType" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timeframeDays" INTEGER NOT NULL DEFAULT 1,
    "predictionType" TEXT NOT NULL DEFAULT 'close',
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
    "targetReached" BOOLEAN,
    "targetReachedAt" DATETIME,
    "periodHigh" REAL,
    "periodLow" REAL,
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
    "macroData" TEXT,
    "usedForTraining" BOOLEAN NOT NULL DEFAULT false,
    "trainedAt" DATETIME
);
INSERT INTO "new_Prediction" ("accuracyScore", "actualChange", "actualDirection", "actualPrice", "asset", "assetType", "changeAccuracy", "confidence", "createdAt", "currency", "currentPrice", "direction", "directionCorrect", "expiresAt", "factorBreakdown", "factorWeights", "historicalData", "id", "macroData", "newsData", "periodHigh", "periodLow", "predictedChange", "predictedPriceMax", "predictedPriceMin", "priceError", "quality", "reasoning", "sentimentData", "symbol", "targetPrice", "targetReached", "targetReachedAt", "technicalData", "timeframe", "timeframeDays", "trainedAt", "uncertaintyData", "uncertaintyScore", "usedForTraining", "verified", "verifiedAt", "volatility", "volatilityCategory", "withinRange") SELECT "accuracyScore", "actualChange", "actualDirection", "actualPrice", "asset", "assetType", "changeAccuracy", "confidence", "createdAt", "currency", "currentPrice", "direction", "directionCorrect", "expiresAt", "factorBreakdown", "factorWeights", "historicalData", "id", "macroData", "newsData", "periodHigh", "periodLow", "predictedChange", "predictedPriceMax", "predictedPriceMin", "priceError", "quality", "reasoning", "sentimentData", "symbol", "targetPrice", "targetReached", "targetReachedAt", "technicalData", "timeframe", "timeframeDays", "trainedAt", "uncertaintyData", "uncertaintyScore", "usedForTraining", "verified", "verifiedAt", "volatility", "volatilityCategory", "withinRange" FROM "Prediction";
DROP TABLE "Prediction";
ALTER TABLE "new_Prediction" RENAME TO "Prediction";
CREATE INDEX "Prediction_symbol_idx" ON "Prediction"("symbol");
CREATE INDEX "Prediction_verified_idx" ON "Prediction"("verified");
CREATE INDEX "Prediction_createdAt_idx" ON "Prediction"("createdAt");
CREATE INDEX "Prediction_symbol_timeframe_idx" ON "Prediction"("symbol", "timeframe");
CREATE INDEX "Prediction_symbol_predictionType_idx" ON "Prediction"("symbol", "predictionType");
CREATE INDEX "Prediction_quality_idx" ON "Prediction"("quality");
CREATE INDEX "Prediction_usedForTraining_idx" ON "Prediction"("usedForTraining");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PriceAlert_symbol_idx" ON "PriceAlert"("symbol");

-- CreateIndex
CREATE INDEX "PriceAlert_isActive_idx" ON "PriceAlert"("isActive");

-- CreateIndex
CREATE INDEX "PriceAlert_isTriggered_idx" ON "PriceAlert"("isTriggered");

-- CreateIndex
CREATE INDEX "InvestmentNote_symbol_idx" ON "InvestmentNote"("symbol");

-- CreateIndex
CREATE INDEX "InvestmentNote_status_idx" ON "InvestmentNote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentNote_symbol_key" ON "InvestmentNote"("symbol");
