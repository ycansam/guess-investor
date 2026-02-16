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

# Factores del modelo (15 factores: 9 tradicionales + 6 intradía)
# Seasonality: solo como bias suave para activos cíclicos
# Forex: solo para activos con exposición internacional significativa
# Factores intradía: intradayTrend, optionsFlow, volumeProfile, divergences, volatilityIV, marketBreadth
FACTORS = [
    'trend', 'technical', 'sentiment', 'news', 'macro',
    'forex', 'institutional', 'seasonality', 'financials',
    # Factores intradía
    'intradayTrend', 'optionsFlow', 'volumeProfile',
    'divergences', 'volatilityIV', 'marketBreadth'
]

# Factores relevantes por grupo de activo
# CRÍTICO: Cada grupo solo usa los factores que tienen sentido para ese tipo de activo
ASSET_GROUP_FACTORS = {
    'large_cap_stock': ['trend', 'technical', 'sentiment', 'news', 'macro', 'forex', 'institutional', 'seasonality', 'financials',
                        'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'volatilityIV', 'marketBreadth'],
    'small_cap_stock': ['trend', 'technical', 'news', 'seasonality', 'financials',
                        'intradayTrend', 'volumeProfile', 'divergences', 'marketBreadth'],
    'crypto_major': ['trend', 'technical', 'sentiment', 'news', 'macro',
                     'intradayTrend', 'volumeProfile', 'divergences', 'marketBreadth'],
    'crypto_alt': ['trend', 'technical', 'sentiment',
                   'intradayTrend', 'volumeProfile', 'divergences'],
    'etf_index': ['trend', 'technical', 'macro', 'seasonality', 'forex',
                  'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'volatilityIV', 'marketBreadth'],
    'commodity': ['trend', 'technical', 'macro', 'forex',
                  'intradayTrend', 'volumeProfile', 'divergences', 'volatilityIV'],
    'reit': ['trend', 'technical', 'macro', 'financials', 'seasonality',
             'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'marketBreadth'],
    'forex': ['trend', 'technical', 'macro', 'news',
              'intradayTrend', 'volumeProfile', 'divergences'],
    'adr': ['trend', 'technical', 'news', 'forex', 'macro', 'financials',
            'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'volatilityIV', 'marketBreadth'],
    'default': ['trend', 'technical', 'sentiment', 'news',
                'intradayTrend', 'volumeProfile', 'divergences', 'marketBreadth'],
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

# Pesos por defecto por timeframe (15 factores: 9 tradicionales + 6 intradía)
DEFAULT_WEIGHTS = {
    'intraday': {
        # Factores tradicionales (ajustados para dar espacio a los intradía)
        'trend': 0.05, 'technical': 0.17, 'sentiment': 0.12, 'news': 0.08,
        'macro': 0.03, 'forex': 0.02, 'institutional': 0.00,
        'seasonality': 0.01, 'financials': 0.00,
        # Factores intradía (peso alto - diseñados para esto)
        'intradayTrend': 0.15, 'optionsFlow': 0.10, 'volumeProfile': 0.07,
        'divergences': 0.07, 'volatilityIV': 0.06, 'marketBreadth': 0.07
    },
    'swing': {
        # Factores tradicionales
        'trend': 0.12, 'technical': 0.17, 'sentiment': 0.10, 'news': 0.15,
        'macro': 0.07, 'forex': 0.05, 'institutional': 0.07,
        'seasonality': 0.02, 'financials': 0.04,
        # Factores intradía (peso moderado)
        'intradayTrend': 0.05, 'optionsFlow': 0.03, 'volumeProfile': 0.02,
        'divergences': 0.05, 'volatilityIV': 0.03, 'marketBreadth': 0.03
    },
    'long': {
        # Factores tradicionales (dominan en largo plazo)
        'trend': 0.06, 'technical': 0.08, 'sentiment': 0.04, 'news': 0.10,
        'macro': 0.14, 'forex': 0.07, 'institutional': 0.13,
        'seasonality': 0.04, 'financials': 0.23,
        # Factores intradía (peso mínimo o cero)
        'intradayTrend': 0.00, 'optionsFlow': 0.02, 'volumeProfile': 0.01,
        'divergences': 0.03, 'volatilityIV': 0.02, 'marketBreadth': 0.03
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
