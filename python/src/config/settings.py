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

# Factores del modelo (9 factores - competitors y expectations eliminados)
# Seasonality: solo como bias suave para activos cíclicos
# Forex: solo para activos con exposición internacional significativa
FACTORS = [
    'trend', 'technical', 'sentiment', 'news', 'macro',
    'forex', 'institutional', 'seasonality', 'financials'
]

# Factores relevantes por grupo de activo
# CRÍTICO: Cada grupo solo usa los factores que tienen sentido para ese tipo de activo
ASSET_GROUP_FACTORS = {
    'large_cap_stock': ['trend', 'technical', 'sentiment', 'news', 'macro', 'forex', 'institutional', 'seasonality', 'financials'],
    'small_cap_stock': ['trend', 'technical', 'news', 'seasonality', 'financials'],
    'crypto_major': ['trend', 'technical', 'sentiment', 'news', 'macro'],
    'crypto_alt': ['trend', 'technical', 'sentiment'],
    'etf_index': ['trend', 'technical', 'macro', 'seasonality', 'forex'],
    'commodity': ['trend', 'technical', 'macro', 'forex'],  # SIN seasonality - no es fiable para commodities
    'reit': ['trend', 'technical', 'macro', 'financials', 'seasonality'],
    'forex': ['trend', 'technical', 'macro', 'news'],
    'adr': ['trend', 'technical', 'news', 'forex', 'macro', 'financials'],
    'default': ['trend', 'technical', 'sentiment', 'news'],
}


def get_relevant_factors(asset_group: str) -> list:
    """
    Obtiene los factores relevantes para un grupo de activo.
    
    Args:
        asset_group: Tipo de activo (large_cap_stock, commodity, crypto_major, etc.)
    
    Returns:
        Lista de factores relevantes para ese grupo
    """
    return ASSET_GROUP_FACTORS.get(asset_group, ASSET_GROUP_FACTORS['default'])

# Pesos por defecto por timeframe (9 factores)
DEFAULT_WEIGHTS = {
    'intraday': {
        'trend': 0.22, 'technical': 0.27, 'sentiment': 0.16, 'news': 0.19,
        'macro': 0.05, 'forex': 0.05, 'institutional': 0.05,
        'seasonality': 0.01, 'financials': 0.00
    },
    'swing': {
        'trend': 0.14, 'technical': 0.20, 'sentiment': 0.12, 'news': 0.20,
        'macro': 0.10, 'forex': 0.06, 'institutional': 0.10,
        'seasonality': 0.02, 'financials': 0.06
    },
    'long': {
        'trend': 0.06, 'technical': 0.10, 'sentiment': 0.05, 'news': 0.12,
        'macro': 0.15, 'forex': 0.08, 'institutional': 0.14,
        'seasonality': 0.04, 'financials': 0.26
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
DEFAULT_LEARNING_RATE = 0.05  # Aumentado para cambios más visibles
DEFAULT_MOMENTUM = 0.9
DEFAULT_EPOCHS = 100
EARLY_STOPPING_PATIENCE = 10
MIN_SAMPLES_TO_TRAIN = 5

# Timeframes
TIMEFRAMES = ['intraday', 'swing', 'long']

# Archivo de historial de entrenamiento
TRAINING_HISTORY_FILE = DATA_DIR / "training_history.json"
