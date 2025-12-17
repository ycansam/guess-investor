"""
Optimizador de pesos usando descenso de gradiente con momentum
"""
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from ..config.settings import (
    FACTORS, DEFAULT_WEIGHTS, WEIGHT_MIN, WEIGHT_MAX,
    DEFAULT_LEARNING_RATE, DEFAULT_MOMENTUM, DEFAULT_EPOCHS,
    EARLY_STOPPING_PATIENCE, MIN_SAMPLES_TO_TRAIN
)
from ..models.data_models import VerifiedPrediction, TrainingResult
from ..models.loss_function import LossFunction


class WeightOptimizer:
    """
    Optimizador de pesos usando descenso de gradiente con momentum.
    
    Cada tipo de timeframe tiene sus propios pesos:
    - intraday (≤1 día)
    - swing (2-7 días)
    - long (>7 días)
    """
    
    TIMEFRAMES = ['intraday', 'swing', 'long']
    
    def __init__(
        self, 
        weights: Optional[Dict[str, Dict[str, float]]] = None,
        learning_rate: float = DEFAULT_LEARNING_RATE, 
        momentum: float = DEFAULT_MOMENTUM
    ):
        self.learning_rate = learning_rate
        self.momentum = momentum
        self.loss_fn = LossFunction()
        
        # Inicializar pesos
        self.weights = weights if weights else {
            k: v.copy() for k, v in DEFAULT_WEIGHTS.items()
        }
        
        # Velocidad para momentum
        self.velocity = {
            tf: {f: 0.0 for f in FACTORS}
            for tf in self.TIMEFRAMES
        }
    
    @staticmethod
    def get_timeframe_key(days: int) -> str:
        """Convierte días a clave de timeframe"""
        if days <= 1:
            return 'intraday'
        elif days <= 7:
            return 'swing'
        else:
            return 'long'
    
    @staticmethod
    def normalize_weights(weights: Dict[str, float]) -> Dict[str, float]:
        """Normaliza pesos para que sumen 1.0"""
        total = sum(weights.values())
        if total == 0:
            return weights
        return {k: v / total for k, v in weights.items()}
    
    def clip_weights(self, weights: Dict[str, float]) -> Dict[str, float]:
        """Aplica límites y normaliza"""
        clipped = {
            k: max(WEIGHT_MIN, min(WEIGHT_MAX, v))
            for k, v in weights.items()
        }
        return self.normalize_weights(clipped)
    
    def group_by_timeframe(
        self, 
        predictions: List[VerifiedPrediction]
    ) -> Dict[str, List[VerifiedPrediction]]:
        """Agrupa predicciones por timeframe"""
        groups = {tf: [] for tf in self.TIMEFRAMES}
        for pred in predictions:
            tf = self.get_timeframe_key(pred.timeframe_days)
            groups[tf].append(pred)
        return groups
    
    def compute_gradients(
        self, 
        predictions: List[VerifiedPrediction],
        epsilon: float = 0.001
    ) -> Dict[str, Dict[str, float]]:
        """
        Calcula gradientes numéricos usando diferencias finitas.
        
        ∂L/∂w_i ≈ (L(w_i + ε) - L(w_i - ε)) / (2ε)
        """
        gradients = {
            tf: {f: 0.0 for f in FACTORS}
            for tf in self.TIMEFRAMES
        }
        
        by_timeframe = self.group_by_timeframe(predictions)
        
        for timeframe, preds in by_timeframe.items():
            if not preds:
                continue
            
            for factor in FACTORS:
                original = self.weights[timeframe][factor]
                
                # Loss con peso aumentado
                self.weights[timeframe][factor] = original + epsilon
                loss_plus, _ = self.loss_fn.compute_batch(preds)
                
                # Loss con peso disminuido
                self.weights[timeframe][factor] = original - epsilon
                loss_minus, _ = self.loss_fn.compute_batch(preds)
                
                # Restaurar
                self.weights[timeframe][factor] = original
                
                # Gradiente
                gradients[timeframe][factor] = (loss_plus - loss_minus) / (2 * epsilon)
        
        return gradients
    
    def train_step(self, predictions: List[VerifiedPrediction]) -> float:
        """
        Ejecuta un paso de entrenamiento.
        
        Returns:
            Pérdida actual
        """
        gradients = self.compute_gradients(predictions)
        
        for timeframe in self.TIMEFRAMES:
            for factor in FACTORS:
                grad = gradients[timeframe][factor]
                
                # Actualizar velocidad (momentum)
                self.velocity[timeframe][factor] = (
                    self.momentum * self.velocity[timeframe][factor] - 
                    self.learning_rate * grad
                )
                
                # Actualizar peso
                self.weights[timeframe][factor] += self.velocity[timeframe][factor]
            
            # Normalizar y aplicar límites
            self.weights[timeframe] = self.clip_weights(self.weights[timeframe])
        
        loss, _ = self.loss_fn.compute_batch(predictions)
        return loss
    
    def train(
        self, 
        predictions: List[VerifiedPrediction], 
        epochs: int = DEFAULT_EPOCHS,
        patience: int = EARLY_STOPPING_PATIENCE,
        verbose: bool = True
    ) -> Optional[TrainingResult]:
        """
        Entrena el modelo por varios epochs.
        """
        if len(predictions) < MIN_SAMPLES_TO_TRAIN:
            if verbose:
                print(f"⚠ Necesitas al menos {MIN_SAMPLES_TO_TRAIN} predicciones (tienes {len(predictions)})")
            return None
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"ENTRENAMIENTO - {len(predictions)} predicciones")
            print(f"{'='*60}")
        
        initial_loss, initial_breakdown = self.loss_fn.compute_batch(predictions)
        
        if verbose:
            print(f"\nPérdida inicial: {initial_loss:.4f}")
            print(f"  - Dirección: {initial_breakdown['direction']:.2%}")
            print(f"  - Magnitud: {initial_breakdown['magnitude']:.4f}")
            print(f"  - Rango: {initial_breakdown['range']:.2%}")
        
        best_loss = initial_loss
        best_weights = {k: v.copy() for k, v in self.weights.items()}
        patience_counter = 0
        epochs_run = 0
        
        for epoch in range(epochs):
            loss = self.train_step(predictions)
            epochs_run = epoch + 1
            
            if loss < best_loss - 0.0001:
                best_loss = loss
                best_weights = {k: v.copy() for k, v in self.weights.items()}
                patience_counter = 0
            else:
                patience_counter += 1
            
            if verbose and (epoch + 1) % 10 == 0:
                print(f"Epoch {epoch + 1}/{epochs} - Loss: {loss:.4f} (best: {best_loss:.4f})")
            
            if patience_counter >= patience:
                if verbose:
                    print(f"\n⚡ Early stopping en epoch {epoch + 1}")
                break
        
        # Restaurar mejores pesos
        self.weights = best_weights
        
        # Calcular métricas finales
        final_loss, final_breakdown = self.loss_fn.compute_batch(predictions)
        direction_accuracy = 1 - final_breakdown['direction']
        avg_price_error = math.sqrt(final_breakdown['magnitude']) * 100
        within_range_rate = 1 - final_breakdown['range']
        improvement = (initial_loss - final_loss) / initial_loss if initial_loss > 0 else 0
        
        if verbose:
            print(f"\n{'='*60}")
            print("RESULTADOS")
            print(f"{'='*60}")
            print(f"Pérdida: {initial_loss:.4f} → {final_loss:.4f} ({improvement:.1%} mejora)")
            print(f"Precisión dirección: {direction_accuracy:.1%}")
            print(f"Error promedio: {avg_price_error:.2f}%")
            print(f"Dentro del rango: {within_range_rate:.1%}")
        
        return TrainingResult(
            timestamp=datetime.now().isoformat(),
            total_samples=len(predictions),
            initial_loss=initial_loss,
            final_loss=final_loss,
            improvement=improvement,
            direction_accuracy=direction_accuracy,
            avg_price_error=avg_price_error,
            within_range_rate=within_range_rate,
            weights=self.weights,
            epochs_run=epochs_run
        )
