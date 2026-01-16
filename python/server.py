#!/usr/bin/env python3
"""
Guess Investor - ML Training Server
====================================

Servidor HTTP local que recibe datos de la app y entrena automáticamente.
La app envía predicciones verificadas a este servidor.

Uso:
    python server.py              # Inicia en puerto 8765
    python server.py --port 3000  # Puerto personalizado
"""

import sys
import json
import argparse
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from urllib.parse import parse_qs

# Agregar src al path
sys.path.insert(0, str(Path(__file__).parent))

from src.config import (
    DATA_DIR, WEIGHTS_FILE,
    DEFAULT_LEARNING_RATE, DEFAULT_MOMENTUM, DEFAULT_EPOCHS,
    EARLY_STOPPING_PATIENCE
)
from src.models import WeightOptimizer, LossFunction, VerifiedPrediction, AssetClassifier, get_classifier, EvolutionaryOptimizer
from src.utils import save_weights, append_training_result, load_weights

# Archivo donde guardar las predicciones recibidas
PREDICTIONS_FILE = DATA_DIR / "verified_predictions.json"
ASSET_PROFILES_FILE = DATA_DIR / "asset_profiles.json"

# Inicializar clasificador de activos
asset_classifier = get_classifier(ASSET_PROFILES_FILE)


class TrainingHandler(BaseHTTPRequestHandler):
    """Handler para requests HTTP"""
    
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_OPTIONS(self):
        """Manejar preflight CORS"""
        self._set_headers(200)
    
    def do_GET(self):
        """GET /status - Obtener estado del servidor"""
        if self.path == '/health':
            # Endpoint de health check
            self._set_headers(200)
            self.wfile.write(json.dumps({
                'status': 'ok',
                'service': 'guess-investor-ml',
                'timestamp': datetime.now().isoformat()
            }).encode())
        
        elif self.path == '/status':
            status = {
                'running': True,
                'timestamp': datetime.now().isoformat(),
                'predictions_file': str(PREDICTIONS_FILE),
                'predictions_count': self._get_predictions_count(),
                'weights_file': str(WEIGHTS_FILE),
                'asset_profiles_count': len(asset_classifier.profiles),
            }
            self._set_headers(200)
            self.wfile.write(json.dumps(status).encode())
        
        elif self.path == '/weights':
            # Devolver pesos actuales
            if WEIGHTS_FILE.exists():
                with open(WEIGHTS_FILE, 'r') as f:
                    weights = json.load(f)
                self._set_headers(200)
                self.wfile.write(json.dumps(weights).encode())
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({'error': 'No hay pesos entrenados'}).encode())
        
        elif self.path.startswith('/classify/'):
            # Clasificar un activo: GET /classify/AAPL
            symbol = self.path.split('/classify/')[1].upper()
            try:
                profile = asset_classifier.classify(symbol)
                self._set_headers(200)
                self.wfile.write(json.dumps(profile.to_dict()).encode())
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        
        elif self.path == '/profiles':
            # Listar todos los perfiles clasificados
            profiles = {s: p.to_dict() for s, p in asset_classifier.profiles.items()}
            self._set_headers(200)
            self.wfile.write(json.dumps(profiles).encode())
        
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())
    
    def do_POST(self):
        """POST /predictions - Recibir predicciones de la app"""
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        if self.path == '/predictions':
            try:
                data = json.loads(post_data.decode('utf-8'))
                
                # Guardar predicciones
                with open(PREDICTIONS_FILE, 'w') as f:
                    json.dump(data, f, indent=2)
                
                count = len(data.get('predictions', []))
                print(f"[Server] 📥 Recibidas {count} predicciones")
                
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    'success': True,
                    'predictions_received': count,
                }).encode())
                
            except Exception as e:
                print(f"[Server] ❌ Error: {e}")
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        
        elif self.path == '/classify':
            # Clasificar activo con datos históricos
            # POST /classify { symbol: "AAPL", asset_type: "stock", historical_data: [...] }
            try:
                data = json.loads(post_data.decode('utf-8'))
                symbol = data.get('symbol', '').upper()
                asset_type = data.get('asset_type', 'stock')
                historical_data = data.get('historical_data', [])
                force = data.get('force', False)
                
                if not symbol:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({'error': 'Symbol requerido'}).encode())
                    return
                
                profile = asset_classifier.classify(
                    symbol=symbol,
                    historical_data=historical_data if historical_data else None,
                    asset_type=asset_type,
                    force_recalculate=force
                )
                
                print(f"[Server] 🏷️ Clasificado {symbol}: {profile.recommended_timeframe} (confianza: {profile.confidence}%)")
                
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    'success': True,
                    'profile': profile.to_dict(),
                }).encode())
                
            except Exception as e:
                print(f"[Server] ❌ Error clasificando: {e}")
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        
        elif self.path == '/classify-batch':
            # Clasificar múltiples activos
            # POST /classify-batch { symbols: ["AAPL", "BTC-USD"], historical_data: { "AAPL": [...] } }
            try:
                data = json.loads(post_data.decode('utf-8'))
                symbols = data.get('symbols', [])
                historical_data_map = data.get('historical_data', {})
                
                if not symbols:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({'error': 'Symbols requerido'}).encode())
                    return
                
                results = asset_classifier.batch_classify(
                    symbols=[s.upper() for s in symbols],
                    historical_data_map=historical_data_map
                )
                
                print(f"[Server] 🏷️ Clasificados {len(results)} activos")
                
                self._set_headers(200)
                self.wfile.write(json.dumps({
                    'success': True,
                    'profiles': {s: p.to_dict() for s, p in results.items()},
                }).encode())
                
            except Exception as e:
                print(f"[Server] ❌ Error en batch: {e}")
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        
        elif self.path == '/train':
            try:
                # Entrenar con los datos actuales
                result = self._train()
                self._set_headers(200)
                self.wfile.write(json.dumps(result).encode())
                
            except Exception as e:
                print(f"[Server] ❌ Error entrenando: {e}")
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        
        elif self.path == '/reset':
            try:
                # Resetear todo: predicciones y pesos
                result = self._reset_all()
                self._set_headers(200)
                self.wfile.write(json.dumps(result).encode())
                
            except Exception as e:
                print(f"[Server] ❌ Error reseteando: {e}")
                self._set_headers(500)
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode())
    
    def _get_predictions_count(self) -> int:
        """Cuenta predicciones en el archivo"""
        if not PREDICTIONS_FILE.exists():
            return 0
        try:
            with open(PREDICTIONS_FILE, 'r') as f:
                data = json.load(f)
                return len(data.get('predictions', []))
        except:
            return 0
    
    def _reset_all(self) -> dict:
        """Resetea todo: predicciones verificadas y pesos aprendidos"""
        deleted_predictions = False
        deleted_weights = False
        
        # 1. Resetear verified_predictions.json
        if PREDICTIONS_FILE.exists():
            try:
                with open(PREDICTIONS_FILE, 'w') as f:
                    json.dump({'predictions': []}, f, indent=2)
                deleted_predictions = True
                print(f"[Server] 🗑️ Predicciones verificadas borradas")
            except Exception as e:
                print(f"[Server] ⚠️ Error borrando predicciones: {e}")
        
        # 2. Resetear learned_weights.json a valores por defecto (los buenos, no uniformes)
        # Importar DEFAULT_WEIGHTS del config
        from src.config import DEFAULT_WEIGHTS
        
        default_weights = {
            "version": "1.0",
            "updated_at": datetime.now().isoformat(),
            "training_samples": 0,
            "weights": DEFAULT_WEIGHTS,
            "metadata": {
                "learning_rate": DEFAULT_LEARNING_RATE,
                "momentum": DEFAULT_MOMENTUM
            }
        }
        
        try:
            with open(WEIGHTS_FILE, 'w') as f:
                json.dump(default_weights, f, indent=2)
            deleted_weights = True
            print(f"[Server] 🗑️ Pesos reseteados a valores por defecto")
        except Exception as e:
            print(f"[Server] ⚠️ Error reseteando pesos: {e}")
        
        # 3. También resetear el archivo en code/config/learned_weights.json
        frontend_weights_file = Path(__file__).parent.parent / "code" / "config" / "learned_weights.json"
        if frontend_weights_file.exists():
            try:
                with open(frontend_weights_file, 'w') as f:
                    json.dump(default_weights, f, indent=2)
                print(f"[Server] 🗑️ Pesos del frontend reseteados")
            except Exception as e:
                print(f"[Server] ⚠️ Error reseteando pesos frontend: {e}")
        
        print(f"[Server] ✅ Reset completo")
        
        return {
            'success': True,
            'deleted_predictions': deleted_predictions,
            'deleted_weights': deleted_weights,
            'message': 'Todo reseteado correctamente'
        }
    
    def _train(self) -> dict:
        """Ejecuta el entrenamiento usando el optimizador más apropiado"""
        if not PREDICTIONS_FILE.exists():
            return {'success': False, 'error': 'No hay datos de predicciones'}
        
        with open(PREDICTIONS_FILE, 'r') as f:
            data = json.load(f)
        
        predictions_data = data.get('predictions', [])
        if len(predictions_data) < 5:
            return {
                'success': False,
                'error': f'Muestras insuficientes: {len(predictions_data)}/5'
            }
        
        # Convertir a VerifiedPrediction
        predictions = []
        for p in predictions_data:
            try:
                actual_change = p.get('actual_change', 0)
                pred = VerifiedPrediction(
                    id=p.get('id', ''),
                    symbol=p.get('symbol', ''),
                    asset_type=p.get('asset_type', 'stock'),
                    timeframe_days=p.get('timeframe_days', 1),
                    predicted_direction=p.get('direction', p.get('predicted_direction', 'neutral')),
                    predicted_change=p.get('predicted_change', 0),
                    predicted_price_min=p.get('predicted_price_min', 0),
                    predicted_price_max=p.get('predicted_price_max', 0),
                    confidence=p.get('confidence', 50),
                    price_at_prediction=p.get('current_price', p.get('price_at_prediction', 0)),
                    factor_scores=p.get('factor_scores', {}),
                    factor_weights=p.get('factor_weights', {}),
                    actual_price=p.get('actual_price', 0),
                    actual_change=actual_change,
                    actual_direction='up' if actual_change > 0 else ('down' if actual_change < 0 else 'neutral'),
                    direction_correct=p.get('direction_correct', False),
                    price_error=abs(p.get('predicted_change', 0) - actual_change),
                    within_range=p.get('within_range', False),
                    prediction_date=p.get('created_at', p.get('prediction_date', '')),
                    verified_at=p.get('verified_at', ''),
                )
                predictions.append(pred)
            except Exception as e:
                print(f"[Server] ⚠️ Error parseando predicción: {e}")
        
        if len(predictions) < 5:
            return {
                'success': False,
                'error': f'Predicciones válidas insuficientes: {len(predictions)}/5'
            }
        
        # Contar predicciones con factor_scores
        with_scores = sum(1 for p in predictions if p.factor_scores)
        score_ratio = with_scores / len(predictions)
        
        # Cargar pesos previos si existen
        existing_weights = load_weights(WEIGHTS_FILE)
        if existing_weights:
            print(f"[Server] 📦 Cargando pesos previos desde {WEIGHTS_FILE}")
        else:
            print(f"[Server] 🆕 Iniciando con pesos por defecto")
        
        print(f"\n[Server] 🧠 Entrenando con {len(predictions)} predicciones...")
        print(f"[Server] 📊 Predicciones con factor_scores: {with_scores}/{len(predictions)} ({score_ratio:.1%})")
        
        # Decidir qué optimizador usar
        # Si menos del 30% tiene factor_scores, usar evolutivo
        if score_ratio < 0.30:
            print(f"[Server] 🧬 Usando optimizador EVOLUTIVO (datos sin factor_scores)")
            optimizer = EvolutionaryOptimizer(
                weights=existing_weights,
                learning_rate=0.05,  # Más agresivo para evolución
                momentum=0.8
            )
            
            # Guardar pesos iniciales
            weights_before = {tf: dict(optimizer.weights[tf]) for tf in optimizer.TIMEFRAMES}
            
            # Aprender
            result = optimizer.learn_from_predictions(predictions, verbose=True)
            
            if result['success']:
                # Contar cambios
                changes_count = 0
                results = {}
                for tf in optimizer.TIMEFRAMES:
                    tf_changes = []
                    for factor in optimizer.weights[tf]:
                        before = weights_before[tf][factor]
                        after = optimizer.weights[tf][factor]
                        delta = after - before
                        if abs(delta) > 0.0001:
                            changes_count += 1
                            tf_changes.append(f"{factor}: {delta:+.4f}")
                    results[tf] = {
                        'changes': len(tf_changes),
                        'details': tf_changes[:3]
                    }
                
                # Guardar pesos
                save_weights(
                    weights=optimizer.weights,
                    training_samples=len(predictions),
                    learning_rate=0.05,
                    momentum=0.8,
                    filepath=WEIGHTS_FILE
                )
                print(f"[Server] 💾 Pesos evolutivos guardados")
                
                return {
                    'success': True,
                    'method': 'evolutionary',
                    'samples_used': len(predictions),
                    'weights_changed': changes_count,
                    'accuracy': result['accuracy_before'],
                    'results': results
                }
            else:
                return {'success': False, 'error': result.get('reason', 'Unknown error')}
        
        else:
            print(f"[Server] 🎯 Usando optimizador de GRADIENTES (datos con factor_scores)")
            # Optimizador original basado en gradientes
            loss_fn = LossFunction()
            optimizer = WeightOptimizer(
                learning_rate=DEFAULT_LEARNING_RATE,
                momentum=DEFAULT_MOMENTUM,
                weights=existing_weights
            )
            optimizer.loss_fn = loss_fn
            
            weights_before = {tf: dict(optimizer.weights[tf]) for tf in optimizer.weights}
            
            # Entrenar por timeframe
            results = {}
            for timeframe in ['intraday', 'swing', 'long']:
                tf_preds = [p for p in predictions if p.timeframe == timeframe]
                if len(tf_preds) >= 3:
                    result = optimizer.train(
                        predictions=tf_preds,
                        epochs=DEFAULT_EPOCHS,
                        patience=EARLY_STOPPING_PATIENCE,
                        verbose=False
                    )
                    if result:
                        initial_loss = result.initial_loss
                        final_loss = result.final_loss
                        improvement = (initial_loss - final_loss) / initial_loss * 100 if initial_loss > 0 else 0
                        results[timeframe] = {
                            'samples': len(tf_preds),
                            'initial_loss': round(initial_loss, 4),
                            'final_loss': round(final_loss, 4),
                            'improvement': round(improvement, 1),
                        }
                        print(f"   ✓ {timeframe}: {initial_loss:.4f} → {final_loss:.4f} ({improvement:+.1f}%)")
            
            # Mostrar cambios
            print(f"\n[Server] 📊 Cambios en pesos:")
            for tf in ['intraday', 'swing', 'long']:
                changes = []
                for factor in optimizer.weights[tf]:
                    before = weights_before[tf][factor]
                    after = optimizer.weights[tf][factor]
                    delta = after - before
                    if abs(delta) > 0.0001:
                        changes.append(f"{factor}: {before:.4f}→{after:.4f}")
                if changes:
                    print(f"   {tf}: {', '.join(changes[:3])}{'...' if len(changes) > 3 else ''}")
                else:
                    print(f"   {tf}: sin cambios significativos")
            
            # Guardar pesos
            save_weights(
                weights=optimizer.weights,
                training_samples=len(predictions),
                learning_rate=DEFAULT_LEARNING_RATE,
                momentum=DEFAULT_MOMENTUM,
                filepath=WEIGHTS_FILE
            )
            print(f"[Server] 💾 Pesos guardados en {WEIGHTS_FILE}")
            
            return {
                'success': True,
                'method': 'gradient',
                'samples_used': len(predictions),
                'results': results,
            }
    
    def log_message(self, format, *args):
        """Personalizar logging"""
        print(f"[Server] {args[0]}")


def run_server(port: int = 8765):
    """Inicia el servidor HTTP"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, TrainingHandler)
    
    print("\n" + "=" * 60)
    print("  GUESS INVESTOR - ML Training Server")
    print("=" * 60)
    print(f"\n🚀 Servidor corriendo en http://localhost:{port}")
    print(f"\nEndpoints:")
    print(f"  GET  /status          - Estado del servidor")
    print(f"  GET  /weights         - Obtener pesos actuales")
    print(f"  GET  /classify/SYMBOL - Clasificar un activo")
    print(f"  GET  /profiles        - Listar perfiles clasificados")
    print(f"  POST /predictions     - Enviar predicciones verificadas")
    print(f"  POST /train           - Forzar entrenamiento")
    print(f"  POST /classify        - Clasificar con datos históricos")
    print(f"  POST /classify-batch  - Clasificar múltiples activos")
    print(f"\nPresiona Ctrl+C para detener\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Server] Detenido")
        httpd.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ML Training Server')
    parser.add_argument('--port', type=int, default=8765, help='Puerto del servidor')
    args = parser.parse_args()
    
    run_server(args.port)
