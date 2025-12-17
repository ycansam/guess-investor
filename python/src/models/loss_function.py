"""
Función de pérdida para el modelo
"""
from typing import Dict, List, Tuple

from ..config.settings import LOSS_ALPHA, LOSS_BETA, LOSS_GAMMA
from ..models.data_models import VerifiedPrediction


def mean(values: List[float]) -> float:
    """Calcula la media de una lista de valores"""
    return sum(values) / len(values) if values else 0.0


class LossFunction:
    """
    Función de pérdida compuesta:
    L = α * L_direction + β * L_magnitude + γ * L_range
    """
    
    def __init__(
        self, 
        alpha: float = LOSS_ALPHA, 
        beta: float = LOSS_BETA, 
        gamma: float = LOSS_GAMMA
    ):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
    
    def compute_direction_loss(self, pred: VerifiedPrediction) -> float:
        """Pérdida por fallar la dirección (binario)"""
        return 0.0 if pred.direction_correct else 1.0
    
    def compute_magnitude_loss(self, pred: VerifiedPrediction) -> float:
        """Pérdida por error en magnitud del cambio"""
        expected_magnitude = max(abs(pred.predicted_change), 1.0)
        return ((pred.actual_change - pred.predicted_change) / expected_magnitude) ** 2
    
    def compute_range_loss(self, pred: VerifiedPrediction) -> float:
        """Pérdida por precio fuera del rango predicho"""
        return 0.0 if pred.within_range else 1.0
    
    def compute_single(self, pred: VerifiedPrediction) -> Tuple[float, Dict[str, float]]:
        """
        Calcula la pérdida para una sola predicción.
        
        Returns:
            (loss_total, {'direction': x, 'magnitude': y, 'range': z})
        """
        l_dir = self.compute_direction_loss(pred)
        l_mag = self.compute_magnitude_loss(pred)
        l_range = self.compute_range_loss(pred)
        
        total = self.alpha * l_dir + self.beta * l_mag + self.gamma * l_range
        
        return total, {
            'direction': l_dir,
            'magnitude': l_mag,
            'range': l_range
        }
    
    def compute_batch(self, predictions: List[VerifiedPrediction]) -> Tuple[float, Dict[str, float]]:
        """
        Calcula la pérdida promedio para un batch de predicciones.
        
        Returns:
            (loss_total, {'direction': avg_x, 'magnitude': avg_y, 'range': avg_z})
        """
        if not predictions:
            return 0.0, {'direction': 0.0, 'magnitude': 0.0, 'range': 0.0}
        
        dir_losses = []
        mag_losses = []
        range_losses = []
        
        for pred in predictions:
            dir_losses.append(self.compute_direction_loss(pred))
            mag_losses.append(self.compute_magnitude_loss(pred))
            range_losses.append(self.compute_range_loss(pred))
        
        avg_dir = mean(dir_losses)
        avg_mag = mean(mag_losses)
        avg_range = mean(range_losses)
        
        total = self.alpha * avg_dir + self.beta * avg_mag + self.gamma * avg_range
        
        return total, {
            'direction': avg_dir,
            'magnitude': avg_mag,
            'range': avg_range
        }
