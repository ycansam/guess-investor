export const getAssetTypeLabel = (assetType: string): string => {
  switch (assetType) {
    case 'stock': return 'Acción';
    case 'crypto': return 'Criptomoneda';
    case 'forex': return 'Divisa';
    case 'commodity': return 'Materia Prima';
    case 'index': return 'Índice';
    case 'energy': return 'Energía';
    default: return 'Activo';
  }
};

export const getAssetTypeEmoji = (assetType: string): string => {
  switch (assetType) {
    case 'stock': return '📊';
    case 'crypto': return '🪙';
    case 'forex': return '💱';
    case 'commodity': return '🛢️';
    case 'index': return '📈';
    case 'energy': return '⚡';
    default: return '💼';
  }
};
