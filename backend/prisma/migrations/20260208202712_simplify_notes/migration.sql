/*
  Warnings:

  - You are about to drop the column `competitors` on the `LearnedWeights` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "PortfolioPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "avgCost" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "targetPrice" REAL,
    "stopLoss" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PortfolioTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "shares" REAL NOT NULL,
    "price" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "commission" REAL,
    "notes" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InvestmentNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "dineroInvertido" REAL NOT NULL DEFAULT 0,
    "beneficioEsperado" REAL NOT NULL DEFAULT 0,
    "perdidaEsperada" REAL NOT NULL DEFAULT 0,
    "resultado" TEXT,
    "resultadoFinal" REAL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_InvestmentNote" ("createdAt", "id", "note", "symbol", "updatedAt") SELECT "createdAt", "id", "note", "symbol", "updatedAt" FROM "InvestmentNote";
DROP TABLE "InvestmentNote";
ALTER TABLE "new_InvestmentNote" RENAME TO "InvestmentNote";
CREATE UNIQUE INDEX "InvestmentNote_symbol_key" ON "InvestmentNote"("symbol");
CREATE INDEX "InvestmentNote_symbol_idx" ON "InvestmentNote"("symbol");
CREATE INDEX "InvestmentNote_resultado_idx" ON "InvestmentNote"("resultado");
CREATE TABLE "new_LearnedWeights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trend" REAL NOT NULL DEFAULT 0.111,
    "technical" REAL NOT NULL DEFAULT 0.111,
    "sentiment" REAL NOT NULL DEFAULT 0.111,
    "news" REAL NOT NULL DEFAULT 0.111,
    "macro" REAL NOT NULL DEFAULT 0.111,
    "forex" REAL NOT NULL DEFAULT 0.111,
    "institutional" REAL NOT NULL DEFAULT 0.111,
    "seasonality" REAL NOT NULL DEFAULT 0.02,
    "financials" REAL NOT NULL DEFAULT 0.111,
    "expectations" REAL NOT NULL DEFAULT 0.000,
    "version" INTEGER NOT NULL DEFAULT 1,
    "trainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "accuracy" REAL
);
INSERT INTO "new_LearnedWeights" ("accuracy", "expectations", "financials", "forex", "id", "institutional", "macro", "news", "sampleCount", "seasonality", "sentiment", "technical", "trainedAt", "trend", "version") SELECT "accuracy", "expectations", "financials", "forex", "id", "institutional", "macro", "news", "sampleCount", "seasonality", "sentiment", "technical", "trainedAt", "trend", "version" FROM "LearnedWeights";
DROP TABLE "LearnedWeights";
ALTER TABLE "new_LearnedWeights" RENAME TO "LearnedWeights";
CREATE INDEX "LearnedWeights_version_idx" ON "LearnedWeights"("version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPosition_symbol_key" ON "PortfolioPosition"("symbol");

-- CreateIndex
CREATE INDEX "PortfolioPosition_symbol_idx" ON "PortfolioPosition"("symbol");

-- CreateIndex
CREATE INDEX "PortfolioTransaction_symbol_idx" ON "PortfolioTransaction"("symbol");

-- CreateIndex
CREATE INDEX "PortfolioTransaction_executedAt_idx" ON "PortfolioTransaction"("executedAt");
