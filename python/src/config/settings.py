"""
Configuración central del sistema de ML
"""
from pathlib import Path

# Directorios base
BASE_DIR = Path(__file__).parent.parent.parent
CODE_DIR = BASE_DIR.parent / "code"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Archivos
PREDICTIONS_FILE = DATA_DIR / "verified_predictions.json"
WEIGHTS_FILE = CODE_DIR / "config" / "learned_weights.json"
TRAINING_LOG_FILE = DATA_DIR / "training_log.json"

# Factores del modelo (en orden)
FACTORS = [
    'trend', 'technical', 'sentiment', 'news', 'macro',
    'competitors', 'forex', 'institutional', 'seasonality',
    'financials', 'expectations'
]

# Pesos por defecto por timeframe
DEFAULT_WEIGHTS = {
    'intraday': {
        'trend': 0.20, 'technical': 0.25, 'sentiment': 0.15, 'news': 0.18,
        'macro': 0.04, 'competitors': 0.04, 'forex': 0.04, 'institutional': 0.05,
        'seasonality': 0.02, 'financials': 0.02, 'expectations': 0.01
    },
    'swing': {
        'trend': 0.12, 'technical': 0.18, 'sentiment': 0.10, 'news': 0.15,
        'macro': 0.08, 'competitors': 0.07, 'forex': 0.06, 'institutional': 0.10,
        'seasonality': 0.04, 'financials': 0.05, 'expectations': 0.05
    },
    'long': {
        'trend': 0.05, 'technical': 0.08, 'sentiment': 0.04, 'news': 0.08,
        'macro': 0.12, 'competitors': 0.10, 'forex': 0.08, 'institutional': 0.12,
        'seasonality': 0.08, 'financials': 0.13, 'expectations': 0.12
    }
}

# Límites para los pesos
WEIGHT_MIN = 0.01
WEIGHT_MAX = 0.40

# Pesos de la función de pérdida
LOSS_ALPHA = 0.5   # Peso de pérdida por dirección
LOSS_BETA = 0.35   # Peso de pérdida por magnitud
LOSS_GAMMA = 0.15  # Peso de pérdida por rango

# Hiperparámetros de entrenamiento
DEFAULT_LEARNING_RATE = 0.01
DEFAULT_MOMENTUM = 0.9
DEFAULT_EPOCHS = 100
EARLY_STOPPING_PATIENCE = 10
MIN_SAMPLES_TO_TRAIN = 5

# Timeframes
TIMEFRAMES = ['intraday', 'swing', 'long']

# Archivo de historial de entrenamiento
TRAINING_HISTORY_FILE = DATA_DIR / "training_history.json"
