-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN "periodHigh" REAL;
ALTER TABLE "Prediction" ADD COLUMN "periodLow" REAL;
ALTER TABLE "Prediction" ADD COLUMN "targetReached" BOOLEAN;
ALTER TABLE "Prediction" ADD COLUMN "targetReachedAt" DATETIME;
