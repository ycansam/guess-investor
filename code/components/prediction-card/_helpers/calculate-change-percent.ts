const PERCENTAGE_MULTIPLIER = 100;

export const calculateChangePercent = (
  currentPrice?: number,
  predictedPriceMin?: number,
  predictedPriceMax?: number,
  predictedChange?: number
): number | undefined => {
  // Si tenemos predictedChange directo, usarlo (es el valor calculado correctamente)
  if (predictedChange !== undefined) {
    return predictedChange;
  }
  
  // Fallback: calcular desde precios si no hay predictedChange
  if (!currentPrice || !predictedPriceMin || !predictedPriceMax) {
    return undefined;
  }
  
  // Usar predictedPriceMax como precio objetivo (min y max deberían ser iguales)
  const targetPrice = predictedPriceMax;
  return ((targetPrice - currentPrice) / currentPrice) * PERCENTAGE_MULTIPLIER;
};
