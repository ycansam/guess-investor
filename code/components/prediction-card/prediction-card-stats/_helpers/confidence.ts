export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 70) return '#4CAF50';
  if (confidence >= 40) return '#FF9800';
  return '#F44336';
};
