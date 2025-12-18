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
    DEFAULT_LEARNING_RATE, DEFAULT_MOMENTUM, DEFAULT_EPOCHS
)
from src.models import WeightOptimizer, LossFunction, VerifiedPrediction
from src.utils import save_weights, append_training_result

# Archivo donde guardar las predicciones recibidas
PREDICTIONS_FILE = DATA_DIR / "verified_predictions.json"


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
        if self.path == '/status':
            status = {
                'running': True,
                'timestamp': datetime.now().isoformat(),
                'predictions_file': str(PREDICTIONS_FILE),
                'predictions_count': self._get_predictions_count(),
                'weights_file': str(WEIGHTS_FILE),
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
    
    def _train(self) -> dict:
        """Ejecuta el entrenamiento"""
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
                pred = VerifiedPrediction(
                    id=p.get('id', ''),
                    symbol=p.get('symbol', ''),
                    asset_type=p.get('asset_type', 'stock'),
                    timeframe_days=p.get('timeframe_days', 1),
                    timeframe=p.get('timeframe', 'intraday'),
                    predicted_direction=p.get('predicted_direction', 'neutral'),
                    predicted_change=p.get('predicted_change', 0),
                    predicted_price_min=p.get('predicted_price_min', 0),
                    predicted_price_max=p.get('predicted_price_max', 0),
                    confidence=p.get('confidence', 50),
                    price_at_prediction=p.get('price_at_prediction', 0),
                    factor_scores=p.get('factor_scores', {}),
                    factor_weights=p.get('factor_weights', {}),
                    actual_price=p.get('actual_price', 0),
                    actual_change=p.get('actual_change', 0),
                    actual_direction=p.get('actual_direction', 'neutral'),
                    direction_correct=p.get('direction_correct', False),
                    price_error=p.get('price_error', 0),
                    within_range=p.get('within_range', False),
                    prediction_date=p.get('prediction_date', ''),
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
        
        # Crear optimizador y entrenar
        loss_fn = LossFunction()
        optimizer = WeightOptimizer(
            learning_rate=DEFAULT_LEARNING_RATE,
            momentum=DEFAULT_MOMENTUM,
            loss_function=loss_fn
        )
        
        print(f"\n[Server] 🧠 Entrenando con {len(predictions)} predicciones...")
        
        # Entrenar por timeframe
        results = {}
        for timeframe in ['intraday', 'swing', 'long']:
            tf_preds = [p for p in predictions if p.timeframe == timeframe]
            if len(tf_preds) >= 3:
                initial_loss, final_loss = optimizer.train(
                    tf_preds, timeframe, epochs=DEFAULT_EPOCHS, verbose=False
                )
                improvement = (initial_loss - final_loss) / initial_loss * 100 if initial_loss > 0 else 0
                results[timeframe] = {
                    'samples': len(tf_preds),
                    'initial_loss': round(initial_loss, 4),
                    'final_loss': round(final_loss, 4),
                    'improvement': round(improvement, 1),
                }
                print(f"   ✓ {timeframe}: {initial_loss:.4f} → {final_loss:.4f} ({improvement:+.1f}%)")
        
        # Guardar pesos
        save_weights(WEIGHTS_FILE, optimizer.weights, len(predictions))
        print(f"[Server] 💾 Pesos guardados en {WEIGHTS_FILE}")
        
        return {
            'success': True,
            'samples_used': len(predictions),
            'results': results,
            'weights_saved': str(WEIGHTS_FILE),
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
    print(f"  GET  /status       - Estado del servidor")
    print(f"  GET  /weights      - Obtener pesos actuales")
    print(f"  POST /predictions  - Enviar predicciones verificadas")
    print(f"  POST /train        - Forzar entrenamiento")
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
