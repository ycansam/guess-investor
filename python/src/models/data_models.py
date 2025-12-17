"""
Modelos de datos del sistema
"""
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional


@dataclass
class VerifiedPrediction:
    """Predicción verificada con resultado real"""
    id: str
    symbol: str
    asset_type: str
    timeframe_days: int
    
    # Datos de la predicción original
    predicted_direction: str  # 'up', 'down', 'neutral'
    predicted_change: float   # % cambio predicho
    predicted_price_min: float
    predicted_price_max: float
    confidence: float         # 0-100
    price_at_prediction: float
    
    # Scores de cada factor (los que tenían datos)
    factor_scores: Dict[str, float]
    factor_weights_used: Dict[str, float]
    
    # Resultados reales
    actual_price: float
    actual_change: float
    actual_direction: str
    
    # Métricas de error
    direction_correct: bool
    price_error: float
    within_range: bool
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'VerifiedPrediction':
        return cls(
            id=data['id'],
            symbol=data['symbol'],
            asset_type=data.get('assetType', 'stock'),
            timeframe_days=data.get('timeframeDays', 1),
            predicted_direction=data['predictedDirection'],
            predicted_change=data['predictedChange'],
            predicted_price_min=data['predictedPriceMin'],
            predicted_price_max=data['predictedPriceMax'],
            confidence=data['confidence'],
            price_at_prediction=data['priceAtPrediction'],
            factor_scores=data.get('factorScores', {}),
            factor_weights_used=data.get('factorWeightsUsed', {}),
            actual_price=data['actualPrice'],
            actual_change=data['actualChange'],
            actual_direction=data['actualDirection'],
            direction_correct=data['directionCorrect'],
            price_error=data['priceError'],
            within_range=data['withinRange']
        )


@dataclass
class TrainingResult:
    """Resultado de una sesión de entrenamiento"""
    timestamp: str
    total_samples: int
    initial_loss: float
    final_loss: float
    improvement: float
    direction_accuracy: float
    avg_price_error: float
    within_range_rate: float
    weights: Dict[str, Dict[str, float]]
    epochs_run: int
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class WeightsData:
    """Estructura de datos de pesos guardados"""
    version: str
    updated_at: str
    training_samples: int
    weights: Dict[str, Dict[str, float]]
    metadata: dict
    
    def to_dict(self) -> dict:
        return asdict(self)
