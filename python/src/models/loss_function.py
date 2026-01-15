"""
Función de pérdida para el modelo
"""
from typing import Dict, List, Tuple, Optional

from ..config.settings import LOSS_ALPHA, LOSS_BETA, LOSS_GAMMA, FACTORS
from ..models.data_models import VerifiedPrediction


def mean(values: List[float]) -> float:
    """Calcula la media de una lista de valores"""
    return sum(values) / len(values) if values else 0.0


class LossFunction:
    """
    Función de pérdida compuesta que usa los pesos para calcular
    qué predicción habría hecho el modelo y compararla con la realidad.
    
    L = α * L_direction + β * L_magnitude + γ * L_score_alignment
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
        self._weights: Optional[Dict[str, Dict[str, float]]] = None
    
    def set_weights(self, weights: Dict[str, Dict[str, float]]):
        """Establece los pesos actuales para calcular el loss"""
        self._weights = weights
    
    def _compute_weighted_score(
        self, 
        factor_scores: Dict[str, float],
        weights: Dict[str, float]
    ) -> float:
        """
        Calcula el score ponderado usando los pesos dados.
        Score positivo = tendencia alcista, negativo = bajista
        """
        total_weight = 0.0
        weighted_sum = 0.0
        
        for factor in FACTORS:
            if factor in factor_scores and factor in weights:
                score = factor_scores[factor]  # -100 a +100
                weight = weights[factor]
                weighted_sum += score * weight
                total_weight += weight
        
        if total_weight == 0:
            return 0.0
        
        return weighted_sum / total_weight
    
    def compute_direction_loss(
        self, 
        pred: VerifiedPrediction,
        weights: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Pérdida por predicción de dirección incorrecta.
        Si tenemos weights, recalculamos la dirección predicha.
        """
        if weights and pred.factor_scores:
            # Recalcular dirección usando los pesos actuales
            weighted_score = self._compute_weighted_score(pred.factor_scores, weights)
            predicted_direction = 'up' if weighted_score > 0 else ('down' if weighted_score < 0 else 'neutral')
            
            # Comparar con dirección real
            if predicted_direction == 'neutral':
                return 0.5  # Penalización parcial por no decidirse
            return 0.0 if predicted_direction == pred.actual_direction else 1.0
        
        # Fallback al cálculo original
        return 0.0 if pred.direction_correct else 1.0
    
    def compute_magnitude_loss(
        self, 
        pred: VerifiedPrediction,
        weights: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Pérdida por error en la magnitud del cambio.
        """
        # La magnitud depende más del modelo general, no solo de pesos
        expected_magnitude = max(abs(pred.predicted_change), 1.0)
        return ((pred.actual_change - pred.predicted_change) / expected_magnitude) ** 2
    
    def compute_alignment_loss(
        self, 
        pred: VerifiedPrediction,
        weights: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Pérdida por desalineación entre score ponderado y resultado real.
        Un score alto debería correlacionar con un cambio alto en esa dirección.
        """
        if not weights or not pred.factor_scores:
            return 0.0 if pred.within_range else 1.0
        
        weighted_score = self._compute_weighted_score(pred.factor_scores, weights)
        
        # Normalizar el cambio real a escala similar (-100 a +100)
        # Asumiendo que un cambio de ±5% es significativo
        normalized_actual = pred.actual_change * 20  # 5% → 100
        normalized_actual = max(-100, min(100, normalized_actual))
        
        # Error cuadrático normalizado
        error = (weighted_score - normalized_actual) ** 2 / 10000  # Normalizado a [0, 4]
        return min(error, 1.0)  # Limitar a 1.0
    
    def compute_single(
        self, 
        pred: VerifiedPrediction,
        weights: Optional[Dict[str, float]] = None
    ) -> Tuple[float, Dict[str, float]]:
        """
        Calcula la pérdida para una sola predicción.
        
        Returns:
            (loss_total, {'direction': x, 'magnitude': y, 'alignment': z})
        """
        l_dir = self.compute_direction_loss(pred, weights)
        l_mag = self.compute_magnitude_loss(pred, weights)
        l_align = self.compute_alignment_loss(pred, weights)
        
        total = self.alpha * l_dir + self.beta * l_mag + self.gamma * l_align
        
        return total, {
            'direction': l_dir,
            'magnitude': l_mag,
            'alignment': l_align
        }
    
    def compute_batch(
        self, 
        predictions: List[VerifiedPrediction],
        weights: Optional[Dict[str, float]] = None
    ) -> Tuple[float, Dict[str, float]]:
        """
        Calcula la pérdida promedio para un batch de predicciones.
        
        Returns:
            (loss_total, {'direction': avg_x, 'magnitude': avg_y, 'alignment': avg_z})
        """
        if not predictions:
            return 0.0, {'direction': 0.0, 'magnitude': 0.0, 'alignment': 0.0}
        
        dir_losses = []
        mag_losses = []
        align_losses = []
        
        for pred in predictions:
            dir_losses.append(self.compute_direction_loss(pred, weights))
            mag_losses.append(self.compute_magnitude_loss(pred, weights))
            align_losses.append(self.compute_alignment_loss(pred, weights))
        
        avg_dir = mean(dir_losses)
        avg_mag = mean(mag_losses)
        avg_align = mean(align_losses)
        
        total = self.alpha * avg_dir + self.beta * avg_mag + self.gamma * avg_align
        
        return total, {
            'direction': avg_dir,
            'magnitude': avg_mag,
            'alignment': avg_align
        }
