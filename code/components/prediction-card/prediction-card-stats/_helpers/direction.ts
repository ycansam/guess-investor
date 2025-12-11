export const getDirectionColor = (direction: string): string => {
  switch (direction) {
    case 'up': return '#4CAF50';
    case 'down': return '#F44336';
    default: return '#FF9800';
  }
};
