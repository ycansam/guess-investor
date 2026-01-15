"""
Utilidades para manejo de archivos JSON
"""
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from ..config.settings import PREDICTIONS_FILE, WEIGHTS_FILE, TRAINING_LOG_FILE
from ..models.data_models import VerifiedPrediction, TrainingResult, WeightsData


def load_predictions(filepath: Path = PREDICTIONS_FILE) -> List[VerifiedPrediction]:
    """Carga predicciones verificadas desde JSON"""
    if not filepath.exists():
        return []
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        predictions = []
        for item in data.get('verified_predictions', []):
            try:
                predictions.append(VerifiedPrediction.from_dict(item))
            except (KeyError, TypeError) as e:
                print(f"⚠ Predicción inválida: {e}")
        
        return predictions
    except Exception as e:
        print(f"Error cargando predicciones: {e}")
        return []


def load_weights(filepath: Path = WEIGHTS_FILE) -> Optional[dict]:
    """Carga pesos aprendidos desde JSON"""
    if not filepath.exists():
        return None
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if data.get('weights') and data.get('training_samples', 0) > 0:
            return data['weights']
        return None
    except Exception:
        return None


def save_weights(
    weights: dict, 
    training_samples: int,
    learning_rate: float,
    momentum: float,
    filepath: Path = WEIGHTS_FILE
) -> None:
    """Guarda pesos optimizados a JSON con alta precisión"""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    # Redondear a 6 decimales para mayor precisión
    rounded_weights = {}
    for timeframe, factors in weights.items():
        rounded_weights[timeframe] = {
            k: round(v, 6) for k, v in factors.items()
        }
    
    data = {
        'version': '1.0',
        'updated_at': datetime.now().isoformat(),
        'training_samples': training_samples,
        'weights': rounded_weights,
        'metadata': {
            'learning_rate': learning_rate,
            'momentum': momentum,
        }
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def load_training_history(filepath: Path = TRAINING_LOG_FILE) -> List[dict]:
    """Carga historial de entrenamiento"""
    if not filepath.exists():
        return []
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('history', [])
    except Exception:
        return []


def save_training_history(
    history: List[dict], 
    filepath: Path = TRAINING_LOG_FILE,
    max_entries: int = 100
) -> None:
    """Guarda historial de entrenamiento"""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    # Mantener solo los últimos N
    history = history[-max_entries:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump({'history': history}, f, indent=2)


def append_training_result(result: TrainingResult) -> None:
    """Añade un resultado al historial"""
    history = load_training_history()
    history.append(result.to_dict())
    save_training_history(history)
