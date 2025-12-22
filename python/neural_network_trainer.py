"""
Neural Network Training Module for Guess Investor

Entrena una red neuronal simple para predicción de movimientos de precio
cuando hay suficientes datos verificados (>500 predicciones).

Requiere: tensorflow, numpy, pandas, scikit-learn

Uso:
    python neural_network_trainer.py --data ../code/data/predictions.json --epochs 100
"""

import json
import argparse
import os
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import numpy as np

# Intentar importar TensorFlow (opcional)
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import Dense, Dropout, BatchNormalization
    from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
    from tensorflow.keras.optimizers import Adam
    from tensorflow.keras.regularizers import l2
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("⚠️  TensorFlow no instalado. Instalar con: pip install tensorflow")

try:
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import classification_report, confusion_matrix
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("⚠️  scikit-learn no instalado. Instalar con: pip install scikit-learn")


# ============================================================================
# CONSTANTS
# ============================================================================

FACTORS = [
    'trend', 'technical', 'sentiment', 'news', 'macro',
    'competitors', 'forex', 'institutional', 'seasonality',
    'financials', 'expectations'
]

MIN_SAMPLES = 100  # Mínimo para entrenar (500 recomendado)
RECOMMENDED_SAMPLES = 500

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')


# ============================================================================
# DATA LOADING
# ============================================================================

def load_predictions(filepath: str) -> List[Dict]:
    """Carga predicciones desde archivo JSON"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Filtrar solo predicciones verificadas
    verified = [p for p in data if p.get('actualChange') is not None]
    return verified


def prepare_features(predictions: List[Dict]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Prepara features y labels para entrenamiento
    
    Returns:
        X: Features (factor scores normalizados)
        y_direction: 1 si subió, 0 si bajó
        y_magnitude: Cambio porcentual real
    """
    X = []
    y_direction = []
    y_magnitude = []
    
    for pred in predictions:
        # Extraer factor scores
        factor_scores = pred.get('factorScores', {})
        features = [factor_scores.get(f, 50) / 100.0 for f in FACTORS]
        
        # Añadir features adicionales si existen
        if 'confidence' in pred:
            features.append(pred['confidence'] / 100.0)
        else:
            features.append(0.5)
        
        if 'volatilityScore' in pred:
            features.append(pred['volatilityScore'] / 100.0)
        else:
            features.append(0.5)
        
        # Timeframe encoding (one-hot)
        timeframe = pred.get('timeframe', 'swing')
        features.append(1.0 if timeframe == 'intraday' else 0.0)
        features.append(1.0 if timeframe == 'swing' else 0.0)
        features.append(1.0 if timeframe == 'long' else 0.0)
        
        X.append(features)
        
        # Labels
        actual_change = pred.get('actualChange', 0)
        y_direction.append(1 if actual_change > 0 else 0)
        y_magnitude.append(actual_change)
    
    return np.array(X), np.array(y_direction), np.array(y_magnitude)


# ============================================================================
# MODEL ARCHITECTURE
# ============================================================================

def create_direction_model(input_dim: int) -> 'Sequential':
    """
    Modelo para predecir dirección (subida/bajada)
    
    Arquitectura:
    - Input: 16 features (11 factores + confianza + volatilidad + 3 timeframe)
    - Hidden 1: 32 neuronas con ReLU + Dropout
    - Hidden 2: 16 neuronas con ReLU + Dropout
    - Output: 1 neurona con Sigmoid (probabilidad de subida)
    """
    model = Sequential([
        # Input layer
        Dense(32, activation='relu', input_shape=(input_dim,),
              kernel_regularizer=l2(0.001)),
        BatchNormalization(),
        Dropout(0.3),
        
        # Hidden layer 1
        Dense(16, activation='relu', kernel_regularizer=l2(0.001)),
        BatchNormalization(),
        Dropout(0.2),
        
        # Hidden layer 2
        Dense(8, activation='relu'),
        Dropout(0.1),
        
        # Output layer
        Dense(1, activation='sigmoid')
    ])
    
    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
    )
    
    return model


def create_magnitude_model(input_dim: int) -> 'Sequential':
    """
    Modelo para predecir magnitud del cambio (regresión)
    
    Output: Cambio porcentual esperado
    """
    model = Sequential([
        Dense(32, activation='relu', input_shape=(input_dim,),
              kernel_regularizer=l2(0.001)),
        BatchNormalization(),
        Dropout(0.3),
        
        Dense(16, activation='relu', kernel_regularizer=l2(0.001)),
        BatchNormalization(),
        Dropout(0.2),
        
        Dense(8, activation='relu'),
        
        # Output: sin activación para regresión
        Dense(1, activation='linear')
    ])
    
    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss='mse',
        metrics=['mae']
    )
    
    return model


# ============================================================================
# TRAINING
# ============================================================================

def train_direction_model(
    X: np.ndarray,
    y: np.ndarray,
    epochs: int = 100,
    validation_split: float = 0.2,
    verbose: bool = True
) -> Tuple['Sequential', Dict]:
    """
    Entrena modelo de dirección
    
    Returns:
        model: Modelo entrenado
        history: Historial de entrenamiento
    """
    if not TF_AVAILABLE:
        raise ImportError("TensorFlow requerido para entrenar")
    
    # Split train/validation
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=validation_split, random_state=42, stratify=y
    )
    
    # Normalizar features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    
    # Crear modelo
    model = create_direction_model(X.shape[1])
    
    if verbose:
        model.summary()
    
    # Callbacks
    callbacks = [
        EarlyStopping(
            monitor='val_auc',
            patience=15,
            restore_best_weights=True,
            mode='max'
        ),
        ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=0.0001
        )
    ]
    
    # Entrenar
    history = model.fit(
        X_train_scaled, y_train,
        validation_data=(X_val_scaled, y_val),
        epochs=epochs,
        batch_size=min(32, len(X_train) // 4),
        callbacks=callbacks,
        verbose=1 if verbose else 0
    )
    
    # Evaluar
    y_pred_proba = model.predict(X_val_scaled)
    y_pred = (y_pred_proba > 0.5).astype(int)
    
    results = {
        'accuracy': float((y_pred.flatten() == y_val).mean()),
        'auc': float(history.history['val_auc'][-1]),
        'epochs_trained': len(history.history['loss']),
        'final_loss': float(history.history['val_loss'][-1]),
        'scaler_mean': scaler.mean_.tolist(),
        'scaler_scale': scaler.scale_.tolist()
    }
    
    if verbose:
        print("\n📊 Resultados de Validación:")
        print(f"   Accuracy: {results['accuracy']:.2%}")
        print(f"   AUC: {results['auc']:.3f}")
        print("\n" + classification_report(y_val, y_pred, target_names=['Bajada', 'Subida']))
    
    return model, results, scaler


def train_magnitude_model(
    X: np.ndarray,
    y: np.ndarray,
    epochs: int = 100,
    validation_split: float = 0.2,
    verbose: bool = True
) -> Tuple['Sequential', Dict]:
    """Entrena modelo de magnitud"""
    if not TF_AVAILABLE:
        raise ImportError("TensorFlow requerido para entrenar")
    
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=validation_split, random_state=42
    )
    
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    
    model = create_magnitude_model(X.shape[1])
    
    callbacks = [
        EarlyStopping(monitor='val_mae', patience=15, restore_best_weights=True),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=5, min_lr=0.0001)
    ]
    
    history = model.fit(
        X_train_scaled, y_train,
        validation_data=(X_val_scaled, y_val),
        epochs=epochs,
        batch_size=min(32, len(X_train) // 4),
        callbacks=callbacks,
        verbose=1 if verbose else 0
    )
    
    y_pred = model.predict(X_val_scaled).flatten()
    mae = np.mean(np.abs(y_pred - y_val))
    
    results = {
        'mae': float(mae),
        'epochs_trained': len(history.history['loss']),
        'final_loss': float(history.history['val_loss'][-1])
    }
    
    if verbose:
        print(f"\n📊 MAE de Magnitud: {mae:.2f}%")
    
    return model, results, scaler


# ============================================================================
# SAVING/LOADING
# ============================================================================

def save_models(
    direction_model: 'Sequential',
    magnitude_model: Optional['Sequential'],
    direction_scaler: 'StandardScaler',
    magnitude_scaler: Optional['StandardScaler'],
    metadata: Dict
) -> str:
    """Guarda modelos entrenados"""
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Guardar modelos
    direction_model.save(os.path.join(MODEL_DIR, f'direction_model_{timestamp}.keras'))
    if magnitude_model:
        magnitude_model.save(os.path.join(MODEL_DIR, f'magnitude_model_{timestamp}.keras'))
    
    # Guardar metadata y scalers
    metadata['timestamp'] = timestamp
    metadata['direction_scaler'] = {
        'mean': direction_scaler.mean_.tolist(),
        'scale': direction_scaler.scale_.tolist()
    }
    if magnitude_scaler:
        metadata['magnitude_scaler'] = {
            'mean': magnitude_scaler.mean_.tolist(),
            'scale': magnitude_scaler.scale_.tolist()
        }
    
    with open(os.path.join(MODEL_DIR, f'metadata_{timestamp}.json'), 'w') as f:
        json.dump(metadata, f, indent=2)
    
    # Crear symlink a "latest"
    latest_dir = os.path.join(MODEL_DIR, 'latest')
    if os.path.exists(latest_dir):
        os.remove(latest_dir) if os.path.isfile(latest_dir) else None
    
    # Guardar referencia al último modelo
    with open(os.path.join(MODEL_DIR, 'latest.json'), 'w') as f:
        json.dump({'timestamp': timestamp}, f)
    
    return timestamp


def load_latest_model() -> Tuple[Optional['Sequential'], Optional[Dict]]:
    """Carga el modelo más reciente"""
    if not TF_AVAILABLE:
        return None, None
    
    latest_file = os.path.join(MODEL_DIR, 'latest.json')
    if not os.path.exists(latest_file):
        return None, None
    
    with open(latest_file, 'r') as f:
        latest = json.load(f)
    
    timestamp = latest['timestamp']
    
    model = load_model(os.path.join(MODEL_DIR, f'direction_model_{timestamp}.keras'))
    
    with open(os.path.join(MODEL_DIR, f'metadata_{timestamp}.json'), 'r') as f:
        metadata = json.load(f)
    
    return model, metadata


# ============================================================================
# INFERENCE
# ============================================================================

def predict_direction(
    factor_scores: Dict[str, float],
    confidence: float = 50,
    volatility: float = 50,
    timeframe: str = 'swing',
    model: Optional['Sequential'] = None,
    scaler_params: Optional[Dict] = None
) -> Dict:
    """
    Hace predicción de dirección usando el modelo entrenado
    
    Returns:
        probability_up: Probabilidad de subida (0-1)
        direction: 'up' o 'down'
        confidence: Confianza del modelo en la predicción
    """
    if model is None:
        model, metadata = load_latest_model()
        if model is None:
            return {'error': 'No hay modelo entrenado'}
        scaler_params = metadata.get('direction_scaler')
    
    # Preparar features
    features = [factor_scores.get(f, 50) / 100.0 for f in FACTORS]
    features.append(confidence / 100.0)
    features.append(volatility / 100.0)
    features.append(1.0 if timeframe == 'intraday' else 0.0)
    features.append(1.0 if timeframe == 'swing' else 0.0)
    features.append(1.0 if timeframe == 'long' else 0.0)
    
    X = np.array([features])
    
    # Normalizar
    if scaler_params:
        mean = np.array(scaler_params['mean'])
        scale = np.array(scaler_params['scale'])
        X = (X - mean) / scale
    
    # Predecir
    prob_up = float(model.predict(X, verbose=0)[0][0])
    
    return {
        'probability_up': prob_up,
        'probability_down': 1 - prob_up,
        'direction': 'up' if prob_up > 0.5 else 'down',
        'model_confidence': abs(prob_up - 0.5) * 2,  # 0 = muy inseguro, 1 = muy seguro
        'prediction_strength': 'strong' if abs(prob_up - 0.5) > 0.3 else 
                               'moderate' if abs(prob_up - 0.5) > 0.15 else 'weak'
    }


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='Entrenar red neuronal para Guess Investor')
    parser.add_argument('--data', type=str, required=True, help='Ruta al JSON de predicciones')
    parser.add_argument('--epochs', type=int, default=100, help='Número de épocas')
    parser.add_argument('--magnitude', action='store_true', help='También entrenar modelo de magnitud')
    parser.add_argument('--quiet', action='store_true', help='Modo silencioso')
    
    args = parser.parse_args()
    
    if not TF_AVAILABLE or not SKLEARN_AVAILABLE:
        print("❌ Dependencias faltantes. Instalar:")
        print("   pip install tensorflow scikit-learn numpy")
        return
    
    # Cargar datos
    print(f"📂 Cargando datos de {args.data}...")
    predictions = load_predictions(args.data)
    print(f"   {len(predictions)} predicciones verificadas encontradas")
    
    if len(predictions) < MIN_SAMPLES:
        print(f"❌ Mínimo {MIN_SAMPLES} predicciones requeridas. Tienes {len(predictions)}.")
        return
    
    if len(predictions) < RECOMMENDED_SAMPLES:
        print(f"⚠️  Recomendado: {RECOMMENDED_SAMPLES}+ predicciones para mejores resultados")
    
    # Preparar features
    print("🔧 Preparando features...")
    X, y_direction, y_magnitude = prepare_features(predictions)
    print(f"   Features shape: {X.shape}")
    print(f"   Balance de clases: {y_direction.mean():.1%} subidas, {1-y_direction.mean():.1%} bajadas")
    
    # Entrenar modelo de dirección
    print("\n🧠 Entrenando modelo de DIRECCIÓN...")
    direction_model, direction_results, direction_scaler = train_direction_model(
        X, y_direction, epochs=args.epochs, verbose=not args.quiet
    )
    
    # Entrenar modelo de magnitud (opcional)
    magnitude_model = None
    magnitude_results = None
    magnitude_scaler = None
    
    if args.magnitude:
        print("\n🧠 Entrenando modelo de MAGNITUD...")
        magnitude_model, magnitude_results, magnitude_scaler = train_magnitude_model(
            X, y_magnitude, epochs=args.epochs, verbose=not args.quiet
        )
    
    # Guardar modelos
    print("\n💾 Guardando modelos...")
    metadata = {
        'samples': len(predictions),
        'features': X.shape[1],
        'direction_results': direction_results,
        'magnitude_results': magnitude_results
    }
    timestamp = save_models(
        direction_model, magnitude_model,
        direction_scaler, magnitude_scaler,
        metadata
    )
    print(f"   Modelos guardados con timestamp: {timestamp}")
    
    # Resumen final
    print("\n" + "="*50)
    print("✅ ENTRENAMIENTO COMPLETADO")
    print("="*50)
    print(f"   Accuracy:     {direction_results['accuracy']:.1%}")
    print(f"   AUC:          {direction_results['auc']:.3f}")
    print(f"   Épocas:       {direction_results['epochs_trained']}")
    if magnitude_results:
        print(f"   MAE Magnitud: {magnitude_results['mae']:.2f}%")
    print("\n   Modelo listo para usar en la app.")


if __name__ == '__main__':
    main()
