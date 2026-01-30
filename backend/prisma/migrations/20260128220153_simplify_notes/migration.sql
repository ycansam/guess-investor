/*
  Warnings:

  - You are about to drop the column `assetType` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `entryPrice` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `stopLoss` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `targetPrice` on the `InvestmentNote` table. All the data in the column will be lost.
  - You are about to drop the column `thesis` on the `InvestmentNote` table. All the data in the column will be lost.
  - Added the required column `note` to the `InvestmentNote` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InvestmentNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_InvestmentNote" ("createdAt", "id", "symbol", "updatedAt") SELECT "createdAt", "id", "symbol", "updatedAt" FROM "InvestmentNote";
DROP TABLE "InvestmentNote";
ALTER TABLE "new_InvestmentNote" RENAME TO "InvestmentNote";
CREATE UNIQUE INDEX "InvestmentNote_symbol_key" ON "InvestmentNote"("symbol");
CREATE INDEX "InvestmentNote_symbol_idx" ON "InvestmentNote"("symbol");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
