"""
Optimizador evolutivo de pesos basado en rendimiento histórico.
Funciona sin necesidad de factor_scores individuales.

Estrategia:
1. Agrupar predicciones por características (timeframe, asset_type, dirección)
2. Calcular rendimiento por grupo (% acierto dirección, error promedio)
3. Premiar/penalizar los pesos usados en predicciones según su rendimiento
4. Aplicar ajustes suaves con momentum
"""
import math
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from ..config.settings import (
    FACTORS, DEFAULT_WEIGHTS, WEIGHT_MIN, WEIGHT_MAX,
    DEFAULT_LEARNING_RATE, DEFAULT_MOMENTUM
)
from ..models.data_models import VerifiedPrediction


@dataclass
class PerformanceStats:
    """Estadísticas de rendimiento de un grupo de predicciones"""
    count: int = 0
    direction_accuracy: float = 0.0
    avg_price_error: float = 0.0
    avg_confidence: float = 0.0
    weight_contribution: Dict[str, float] = None  # Pesos promedio usados


class EvolutionaryOptimizer:
    """
    Optimizador que aprende de los pesos que funcionaron mejor.
    
    Estrategia: Si predicciones con peso alto en 'technical' tuvieron
    buen rendimiento, aumentamos 'technical'. Si fallaron, lo reducimos.
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
        
        # Inicializar pesos
        self.weights = weights if weights else {
            tf: dict(w) for tf, w in DEFAULT_WEIGHTS.items()
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
    
    def compute_performance_score(self, pred: VerifiedPrediction) -> float:
        """
        Calcula un score de rendimiento para una predicción.
        Positivo = buena predicción, Negativo = mala predicción
        """
        score = 0.0
        
        # Dirección correcta: +1, incorrecta: -1
        if pred.direction_correct:
            score += 1.0
        else:
            score -= 1.0
        
        # Bonus/penalización por error de precio
        if pred.price_error is not None:
            # Normalizar: error de 0% = +0.5, error de 5% = 0, error > 5% = negativo
            error_contribution = 0.5 - (abs(pred.price_error) / 10)
            score += max(-0.5, min(0.5, error_contribution))
        
        # Bonus si estuvo en el rango
        if pred.within_range:
            score += 0.3
        
        return score
    
    def learn_from_predictions(
        self,
        predictions: List[VerifiedPrediction],
        verbose: bool = True
    ) -> Dict[str, any]:
        """
        Aprende de las predicciones analizando qué pesos funcionaron mejor.
        """
        if len(predictions) < 5:
            if verbose:
                print(f"⚠ Necesitas al menos 5 predicciones (tienes {len(predictions)})")
            return {'success': False, 'reason': 'insufficient_samples'}
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"APRENDIZAJE EVOLUTIVO - {len(predictions)} predicciones")
            print(f"{'='*60}")
        
        # Estadísticas antes
        total_correct_before = sum(1 for p in predictions if p.direction_correct)
        accuracy_before = total_correct_before / len(predictions)
        
        if verbose:
            print(f"\nPrecisión actual: {accuracy_before:.1%}")
        
        # Agrupar por timeframe
        by_timeframe = defaultdict(list)
        for pred in predictions:
            tf = self.get_timeframe_key(pred.timeframe_days)
            by_timeframe[tf].append(pred)
        
        # Para cada timeframe, calcular gradientes basados en rendimiento
        weight_changes = {tf: {f: 0.0 for f in FACTORS} for tf in self.TIMEFRAMES}
        
        for timeframe, preds in by_timeframe.items():
            if len(preds) < 3:
                continue
            
            if verbose:
                print(f"\n{timeframe.upper()}: {len(preds)} predicciones")
            
            # Calcular score de rendimiento para cada predicción
            pred_scores = [(p, self.compute_performance_score(p)) for p in preds]
            
            # Separar en buenos y malos resultados
            good_preds = [p for p, s in pred_scores if s > 0]
            bad_preds = [p for p, s in pred_scores if s < 0]
            
            if verbose:
                print(f"  Buenos: {len(good_preds)}, Malos: {len(bad_preds)}")
            
            # Verificar si tenemos factor_weights
            has_factor_weights = any(p.factor_weights for p in preds)
            
            if has_factor_weights and good_preds and bad_preds:
                # Estrategia 1: Comparar pesos usados entre buenos y malos
                good_weights = self._average_weights(good_preds)
                bad_weights = self._average_weights(bad_preds)
                
                for factor in FACTORS:
                    gw = good_weights.get(factor, 0.0)
                    bw = bad_weights.get(factor, 0.0)
                    
                    if gw > 0 or bw > 0:
                        diff = (gw - bw)
                        weight_changes[timeframe][factor] = diff
                        
                        if verbose and abs(diff) > 0.01:
                            direction = "↑" if diff > 0 else "↓"
                            print(f"    {factor}: good={gw:.3f}, bad={bw:.3f} → {direction}{abs(diff):.3f}")
            else:
                # Estrategia 2: SIN factor_weights - usar accuracy para ajustar pesos actuales
                # Si accuracy < 50%, reducimos los pesos dominantes
                # Si accuracy > 50%, reforzamos ligeramente los pesos
                accuracy = len(good_preds) / len(preds) if preds else 0.5
                current_weights = self.weights[timeframe]
                
                if verbose:
                    print(f"  Sin factor_weights, usando estrategia por precisión ({accuracy:.1%})")
                
                # Encontrar factores dominantes y subordinados
                sorted_factors = sorted(FACTORS, key=lambda f: current_weights.get(f, 0), reverse=True)
                dominant = sorted_factors[:3]  # Top 3 factores
                subordinate = sorted_factors[-3:]  # Bottom 3 factores
                
                if accuracy < 0.48:
                    # Precisión baja: reducir dominantes significativamente
                    adjustment = (0.50 - accuracy) * 0.3  # Más agresivo
                    if verbose:
                        print(f"  Precisión baja ({accuracy:.1%}): reduciendo {dominant}, aumentando {subordinate}")
                    for f in dominant:
                        weight_changes[timeframe][f] -= adjustment
                    for f in subordinate:
                        weight_changes[timeframe][f] += adjustment * 0.6
                elif accuracy > 0.52:
                    # Precisión alta: reforzar configuración actual
                    adjustment = (accuracy - 0.50) * 0.2
                    if verbose:
                        print(f"  Precisión alta ({accuracy:.1%}): reforzando configuración actual")
                    for f in dominant:
                        weight_changes[timeframe][f] += adjustment * 0.5
                else:
                    # Precisión neutral (~50%): explorar más agresivamente
                    if verbose:
                        print(f"  Precisión neutral ({accuracy:.1%}): explorando variaciones")
                    # Redistribuir peso de dominantes a subordinados
                    for f in subordinate:
                        weight_changes[timeframe][f] += 0.02
                    for f in dominant:
                        weight_changes[timeframe][f] -= 0.015
        
        # Aplicar cambios con momentum
        weights_before = {tf: dict(self.weights[tf]) for tf in self.TIMEFRAMES}
        
        for timeframe in self.TIMEFRAMES:
            for factor in FACTORS:
                change = weight_changes[timeframe][factor]
                
                # Momentum
                self.velocity[timeframe][factor] = (
                    self.momentum * self.velocity[timeframe][factor] +
                    self.learning_rate * change
                )
                
                # Aplicar
                self.weights[timeframe][factor] += self.velocity[timeframe][factor]
            
            # Normalizar y limitar
            self.weights[timeframe] = self.clip_weights(self.weights[timeframe])
        
        # Estadísticas de cambios
        total_changes = 0
        for tf in self.TIMEFRAMES:
            for f in FACTORS:
                if abs(self.weights[tf][f] - weights_before[tf][f]) > 0.0001:
                    total_changes += 1
        
        if verbose:
            print(f"\n{'='*60}")
            print(f"RESULTADO: {total_changes} pesos modificados")
            print(f"{'='*60}")
            
            # Mostrar cambios significativos
            for tf in self.TIMEFRAMES:
                changes = []
                for f in FACTORS:
                    before = weights_before[tf][f]
                    after = self.weights[tf][f]
                    delta = after - before
                    if abs(delta) > 0.001:
                        changes.append(f"{f}: {before:.3f}→{after:.3f}")
                if changes:
                    print(f"\n{tf}:")
                    for c in changes:
                        print(f"  {c}")
        
        return {
            'success': True,
            'samples_used': len(predictions),
            'weights_changed': total_changes,
            'accuracy_before': accuracy_before,
        }
    
    def _average_weights(self, preds: List[VerifiedPrediction]) -> Dict[str, float]:
        """Calcula pesos promedio usados en un grupo de predicciones"""
        sums = {f: 0.0 for f in FACTORS}
        counts = {f: 0 for f in FACTORS}
        
        for p in preds:
            if p.factor_weights:
                for f, w in p.factor_weights.items():
                    if f in FACTORS:
                        sums[f] += w
                        counts[f] += 1
        
        return {
            f: sums[f] / counts[f] if counts[f] > 0 else 0.0
            for f in FACTORS
        }
