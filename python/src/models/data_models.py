"""
Modelos de datos del sistema
"""
from dataclasses import dataclass, asdict, field
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
    factor_scores: Dict[str, float] = field(default_factory=dict)
    factor_weights: Dict[str, float] = field(default_factory=dict)
    factor_weights_used: Dict[str, float] = field(default_factory=dict)
    
    # Resultados reales
    actual_price: float = 0.0
    actual_change: float = 0.0
    actual_direction: str = 'neutral'

    # Métricas de error
    direction_correct: bool = False
    price_error: float = 0.0
    within_range: bool = False

    # Metadatos
    timeframe: str = 'intraday'
    prediction_date: Optional[str] = ''
    verified_at: Optional[str] = ''
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'VerifiedPrediction':
        return cls(
            id=data['id'],
            symbol=data['symbol'],
            asset_type=data.get('assetType', data.get('asset_type', 'stock')),
            timeframe_days=data.get('timeframeDays', data.get('timeframe_days', 1)),
            timeframe=data.get('timeframe', 'intraday'),
            predicted_direction=data['predictedDirection'] if 'predictedDirection' in data else data.get('predicted_direction', 'neutral'),
            predicted_change=data['predictedChange'] if 'predictedChange' in data else data.get('predicted_change', 0.0),
            predicted_price_min=data['predictedPriceMin'] if 'predictedPriceMin' in data else data.get('predicted_price_min', 0.0),
            predicted_price_max=data['predictedPriceMax'] if 'predictedPriceMax' in data else data.get('predicted_price_max', 0.0),
            confidence=data.get('confidence', 50.0),
            price_at_prediction=data['priceAtPrediction'] if 'priceAtPrediction' in data else data.get('price_at_prediction', 0.0),
            factor_scores=data.get('factorScores', data.get('factor_scores', {})),
            factor_weights=data.get('factorWeights', data.get('factor_weights', {})),
            factor_weights_used=data.get('factorWeightsUsed', data.get('factor_weights_used', {})),
            actual_price=data['actualPrice'] if 'actualPrice' in data else data.get('actual_price', 0.0),
            actual_change=data['actualChange'] if 'actualChange' in data else data.get('actual_change', 0.0),
            actual_direction=data['actualDirection'] if 'actualDirection' in data else data.get('actual_direction', 'neutral'),
            direction_correct=data['directionCorrect'] if 'directionCorrect' in data else data.get('direction_correct', False),
            price_error=data['priceError'] if 'priceError' in data else data.get('price_error', 0.0),
            within_range=data['withinRange'] if 'withinRange' in data else data.get('within_range', False),
            prediction_date=data.get('prediction_date', ''),
            verified_at=data.get('verified_at', '')
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
