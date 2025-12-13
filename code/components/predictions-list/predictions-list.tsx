import React from 'react';
import { InvestmentPrediction } from '../../types';
import { PredictionsListContent } from './predictions-list-content';
import { PredictionsListEmpty } from './predictions-list-empty';

interface PredictionsListProps {
  predictions: InvestmentPrediction[];
  onClear?: () => void;
  onRemove?: (id: string) => void;
}

export const PredictionsList: React.FC<PredictionsListProps> = ({
  predictions,
  onClear,
  onRemove,
}) => {
  if (predictions.length === 0) {
    return <PredictionsListEmpty />;
  }

  return <PredictionsListContent predictions={predictions} onClear={onClear} onRemove={onRemove} />;
};
