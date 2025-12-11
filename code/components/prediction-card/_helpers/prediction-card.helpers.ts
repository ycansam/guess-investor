const PRICE_AVERAGE_DIVISOR = 2;
const PERCENTAGE_MULTIPLIER = 100;

export const calculateChangePercent = (
  currentPrice?: number,
  predictedPriceMin?: number,
  predictedPriceMax?: number,
  predictedChange?: number
): number | undefined => {
  if (!currentPrice || !predictedPriceMin || !predictedPriceMax) {
    return predictedChange;
  }
  const avgPredicted = (predictedPriceMin + predictedPriceMax) / PRICE_AVERAGE_DIVISOR;
  return ((avgPredicted - currentPrice) / currentPrice) * PERCENTAGE_MULTIPLIER;
};
