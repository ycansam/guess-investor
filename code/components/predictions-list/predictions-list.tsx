import React from 'react';
import { InvestmentPrediction } from '../../types';
import { PredictionsListContent } from './predictions-list-content';
import { PredictionsListEmpty } from './predictions-list-empty';

interface PredictionsListProps {
  predictions: InvestmentPrediction[];
  onClear?: () => void;
  onRemove?: (id: string) => void;
  onClose?: () => void;
}

export const PredictionsList: React.FC<PredictionsListProps> = ({
  predictions,
  onClear,
  onRemove,
  onClose,
}) => {
  if (predictions.length === 0) {
    return <PredictionsListEmpty onClose={onClose} />;
  }

  return <PredictionsListContent predictions={predictions} onClear={onClear} onRemove={onRemove} onClose={onClose} />;
};
