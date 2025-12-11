export const formatPrice = (price?: number): string => {
  if (!price) return 'N/A';
  return `€${price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
