export const getDirectionColor = (direction: string): string => {
  switch (direction) {
    case 'up': return '#4CAF50';
    case 'down': return '#F44336';
    default: return '#FF9800';
  }
};

export const getDirectionIcon = (direction: string): string => {
  switch (direction) {
    case 'up': return '📈';
    case 'down': return '📉';
    default: return '➡️';
  }
};

export const getDirectionText = (direction: string): string => {
  switch (direction) {
    case 'up': return 'SUBIDA';
    case 'down': return 'BAJADA';
    default: return 'LATERAL';
  }
};
