#!/usr/bin/env python3
"""
Guess Investor - ML Training Entry Point
=========================================

Este script entrena los pesos de los factores de predicción
basándose en el historial de predicciones verificadas.

Uso:
    python main.py                    # Entrenamiento normal
    python main.py --epochs 200       # Número de epochs
    python main.py --lr 0.005         # Learning rate
    python main.py --min-samples 5    # Mínimo de muestras
    python main.py --verbose          # Mostrar detalles
"""

import sys
import argparse
from pathlib import Path
from datetime import datetime

# Agregar src al path
sys.path.insert(0, str(Path(__file__).parent))

from src.config import (
    PREDICTIONS_FILE, WEIGHTS_FILE, TRAINING_HISTORY_FILE,
    DEFAULT_LEARNING_RATE, DEFAULT_MOMENTUM, DEFAULT_EPOCHS,
    MIN_SAMPLES_TO_TRAIN, TIMEFRAMES
)
from src.models import WeightOptimizer, LossFunction, TrainingResult
from src.utils import (
    load_predictions, load_weights, save_weights,
    append_training_result
)


def parse_arguments():
    """Parsear argumentos de línea de comandos"""
    parser = argparse.ArgumentParser(
        description='Entrenar pesos de predicción de inversiones'
    )
    parser.add_argument(
        '--epochs', type=int, default=DEFAULT_EPOCHS,
        help=f'Número de epochs de entrenamiento (default: {DEFAULT_EPOCHS})'
    )
    parser.add_argument(
        '--lr', type=float, default=DEFAULT_LEARNING_RATE,
        help=f'Learning rate (default: {DEFAULT_LEARNING_RATE})'
    )
    parser.add_argument(
        '--momentum', type=float, default=DEFAULT_MOMENTUM,
        help=f'Momentum para optimizador (default: {DEFAULT_MOMENTUM})'
    )
    parser.add_argument(
        '--min-samples', type=int, default=MIN_SAMPLES_TO_TRAIN,
        help=f'Mínimo de muestras para entrenar (default: {MIN_SAMPLES_TO_TRAIN})'
    )
    parser.add_argument(
        '--verbose', '-v', action='store_true',
        help='Mostrar información detallada'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Simular entrenamiento sin guardar resultados'
    )
    return parser.parse_args()


def print_header():
    """Imprimir encabezado del programa"""
    print("\n" + "=" * 60)
    print("  GUESS INVESTOR - ML Weight Optimizer")
    print("  Sistema de Aprendizaje por Retroalimentación")
    print("=" * 60 + "\n")


def print_weights_comparison(title: str, old_weights: dict, new_weights: dict, timeframe: str):
    """Imprimir comparación de pesos antes/después"""
    print(f"\n{title} ({timeframe}):")
    print("-" * 50)
    print(f"{'Factor':<15} {'Antes':>10} {'Después':>10} {'Cambio':>10}")
    print("-" * 50)
    
    for factor in old_weights:
        old = old_weights[factor]
        new = new_weights.get(factor, old)
        change = new - old
        change_str = f"{change:+.4f}" if change != 0 else "="
        print(f"{factor:<15} {old:>10.4f} {new:>10.4f} {change_str:>10}")


def train_timeframe(
    optimizer: WeightOptimizer,
    predictions: list,
    timeframe: str,
    epochs: int,
    verbose: bool = False
) -> dict:
    """Entrenar pesos para un timeframe específico"""
    
    # Filtrar predicciones por timeframe
    tf_predictions = [p for p in predictions if p.timeframe == timeframe]
    
    if len(tf_predictions) < 3:
        if verbose:
            print(f"  ⚠️  {timeframe}: Solo {len(tf_predictions)} muestras (mínimo: 3)")
        return None
    
    # Entrenar
    initial_loss, final_loss = optimizer.train(
        tf_predictions,
        timeframe,
        epochs=epochs,
        verbose=verbose
    )
    
    return {
        'timeframe': timeframe,
        'samples': len(tf_predictions),
        'initial_loss': initial_loss,
        'final_loss': final_loss,
        'improvement': (initial_loss - final_loss) / initial_loss * 100 if initial_loss > 0 else 0
    }


def main():
    """Función principal de entrenamiento"""
    args = parse_arguments()
    print_header()
    
    # 1. Cargar predicciones verificadas
    print("📂 Cargando datos...")
    predictions = load_predictions(PREDICTIONS_FILE)
    
    if len(predictions) < args.min_samples:
        print(f"\n⚠️  Muestras insuficientes: {len(predictions)}/{args.min_samples}")
        print("   Necesitas más predicciones verificadas para entrenar.")
        print("   Usa la app para hacer predicciones y verificarlas cuando se cumplan.\n")
        return 1
    
    print(f"   ✓ {len(predictions)} predicciones verificadas cargadas")
    
    # 2. Cargar pesos actuales
    current_weights = load_weights(WEIGHTS_FILE)
    print(f"   ✓ Pesos actuales cargados")
    
    # Mostrar distribución por timeframe
    for tf in TIMEFRAMES:
        count = len([p for p in predictions if p.timeframe == tf])
        print(f"   - {tf}: {count} predicciones")
    
    # 3. Crear optimizador
    loss_fn = LossFunction()
    optimizer = WeightOptimizer(
        learning_rate=args.lr,
        momentum=args.momentum,
        loss_function=loss_fn
    )
    
    # Cargar pesos iniciales
    if current_weights:
        optimizer.weights = current_weights.get('weights', optimizer.weights)
    
    old_weights = {tf: dict(w) for tf, w in optimizer.weights.items()}
    
    # 4. Entrenar cada timeframe
    print(f"\n🔄 Entrenando ({args.epochs} epochs, lr={args.lr})...")
    
    results = []
    for timeframe in TIMEFRAMES:
        result = train_timeframe(
            optimizer, predictions, timeframe,
            epochs=args.epochs, verbose=args.verbose
        )
        if result:
            results.append(result)
            print(f"   ✓ {timeframe}: loss {result['initial_loss']:.4f} → {result['final_loss']:.4f} ({result['improvement']:+.1f}%)")
    
    if not results:
        print("\n❌ No hay suficientes datos para entrenar ningún timeframe.")
        return 1
    
    # 5. Mostrar comparación de pesos
    if args.verbose:
        for tf in TIMEFRAMES:
            if tf in old_weights and tf in optimizer.weights:
                print_weights_comparison(
                    "Comparación de Pesos",
                    old_weights[tf],
                    optimizer.weights[tf],
                    tf
                )
    
    # 6. Guardar resultados
    if not args.dry_run:
        # Guardar nuevos pesos
        save_weights(
            WEIGHTS_FILE,
            optimizer.weights,
            training_samples=len(predictions)
        )
        print(f"\n💾 Pesos guardados en: {WEIGHTS_FILE}")
        
        # Guardar en historial
        training_result = TrainingResult(
            timestamp=datetime.now().isoformat(),
            epochs=args.epochs,
            learning_rate=args.lr,
            momentum=args.momentum,
            samples_used=len(predictions),
            results_by_timeframe={r['timeframe']: r for r in results},
            final_weights=optimizer.weights
        )
        append_training_result(TRAINING_HISTORY_FILE, training_result)
        print(f"   Historial actualizado: {TRAINING_HISTORY_FILE}")
    else:
        print("\n🔍 Modo dry-run: No se guardaron cambios")
    
    # 7. Resumen final
    print("\n" + "=" * 60)
    print("  RESUMEN DE ENTRENAMIENTO")
    print("=" * 60)
    
    total_improvement = sum(r['improvement'] for r in results) / len(results)
    print(f"  Predicciones usadas: {len(predictions)}")
    print(f"  Timeframes entrenados: {len(results)}/{len(TIMEFRAMES)}")
    print(f"  Mejora promedio: {total_improvement:+.1f}%")
    print("=" * 60 + "\n")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
