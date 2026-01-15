"""
Asset Classifier - Clasificador dinámico de activos
====================================================

Clasifica automáticamente los activos según su comportamiento
para determinar qué timeframe y modelos son más apropiados.

Criterios de clasificación:
- Volatilidad diaria promedio
- Rango diario típico (ATR)
- Frecuencia de gaps
- Correlación con índices de mercado
- Volumen relativo
"""

import json
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from datetime import datetime
import math


@dataclass
class AssetProfile:
    """Perfil de un activo clasificado"""
    symbol: str
    name: str
    asset_type: str  # 'stock', 'crypto', 'etf', 'commodity', 'forex'
    
    # Métricas de volatilidad
    daily_volatility: float = 0.0      # Volatilidad diaria promedio (%)
    weekly_volatility: float = 0.0     # Volatilidad semanal promedio (%)
    atr_percent: float = 0.0           # Average True Range como % del precio
    
    # Métricas de comportamiento
    avg_daily_range: float = 0.0       # Rango diario promedio (high-low) en %
    gap_frequency: float = 0.0         # Frecuencia de gaps significativos (>1%)
    trend_persistence: float = 0.0     # Cuánto persisten las tendencias (0-1)
    mean_reversion_score: float = 0.0  # Tendencia a revertir a la media (0-1)
    
    # Clasificación recomendada
    recommended_timeframe: str = 'swing'  # 'intraday', 'swing', 'long'
    timeframe_scores: Dict[str, float] = field(default_factory=dict)
    
    # Modelos recomendados
    recommended_models: List[str] = field(default_factory=list)
    model_weights: Dict[str, float] = field(default_factory=dict)
    
    # Metadatos
    classified_at: str = ''
    samples_used: int = 0
    confidence: float = 0.0
    
    def to_dict(self) -> dict:
        return asdict(self)


class AssetClassifier:
    """
    Clasificador de activos basado en comportamiento histórico.
    
    Determina automáticamente:
    1. Qué timeframe es más apropiado para el activo
    2. Qué modelos del ensemble usar
    3. Ajustes de confianza según el tipo de activo
    """
    
    # Umbrales de volatilidad para clasificación
    VOLATILITY_THRESHOLDS = {
        'low': 15,      # < 15% anualizada = baja volatilidad (largo plazo)
        'medium': 35,   # 15-35% = media volatilidad (swing)
        'high': 60,     # 35-60% = alta volatilidad (intradía)
        'extreme': 100, # > 60% = extrema (criptos, meme stocks)
    }
    
    # Umbrales de ATR para intradía
    ATR_THRESHOLDS = {
        'suitable_intraday': 1.5,  # ATR > 1.5% del precio
        'suitable_swing': 0.5,      # ATR > 0.5%
    }
    
    # Perfiles conocidos de activos (cache)
    KNOWN_PROFILES: Dict[str, dict] = {
        # Criptos majors - alta volatilidad
        'BTC-USD': {'type': 'crypto_major', 'base_vol': 45, 'trend_bias': 0.6},
        'ETH-USD': {'type': 'crypto_major', 'base_vol': 55, 'trend_bias': 0.55},
        'BNB-USD': {'type': 'crypto_major', 'base_vol': 50, 'trend_bias': 0.5},
        
        # Criptos alts - muy alta volatilidad
        'SOL-USD': {'type': 'crypto_alt', 'base_vol': 70, 'trend_bias': 0.5},
        'DOGE-USD': {'type': 'crypto_alt', 'base_vol': 80, 'trend_bias': 0.4},
        'XRP-USD': {'type': 'crypto_alt', 'base_vol': 65, 'trend_bias': 0.45},
        'ADA-USD': {'type': 'crypto_alt', 'base_vol': 68, 'trend_bias': 0.45},
        'AVAX-USD': {'type': 'crypto_alt', 'base_vol': 75, 'trend_bias': 0.45},
        'SHIB-USD': {'type': 'crypto_alt', 'base_vol': 90, 'trend_bias': 0.35},
        
        # Large caps tech
        'AAPL': {'type': 'large_cap', 'base_vol': 25, 'trend_bias': 0.65},
        'MSFT': {'type': 'large_cap', 'base_vol': 22, 'trend_bias': 0.7},
        'GOOGL': {'type': 'large_cap', 'base_vol': 28, 'trend_bias': 0.6},
        'GOOG': {'type': 'large_cap', 'base_vol': 28, 'trend_bias': 0.6},
        'AMZN': {'type': 'large_cap', 'base_vol': 30, 'trend_bias': 0.55},
        'META': {'type': 'large_cap', 'base_vol': 35, 'trend_bias': 0.55},
        'NFLX': {'type': 'large_cap', 'base_vol': 38, 'trend_bias': 0.5},
        
        # Large caps finance
        'JPM': {'type': 'large_cap', 'base_vol': 22, 'trend_bias': 0.6},
        'BAC': {'type': 'large_cap', 'base_vol': 25, 'trend_bias': 0.55},
        'V': {'type': 'large_cap', 'base_vol': 20, 'trend_bias': 0.65},
        'MA': {'type': 'large_cap', 'base_vol': 22, 'trend_bias': 0.65},
        
        # High volatility stocks
        'TSLA': {'type': 'high_vol_stock', 'base_vol': 50, 'trend_bias': 0.5},
        'NVDA': {'type': 'high_vol_stock', 'base_vol': 45, 'trend_bias': 0.6},
        'AMD': {'type': 'high_vol_stock', 'base_vol': 48, 'trend_bias': 0.55},
        
        # ETFs - baja volatilidad
        'SPY': {'type': 'etf_index', 'base_vol': 15, 'trend_bias': 0.75},
        'QQQ': {'type': 'etf_index', 'base_vol': 20, 'trend_bias': 0.7},
        'VOO': {'type': 'etf_index', 'base_vol': 14, 'trend_bias': 0.75},
        'VTI': {'type': 'etf_index', 'base_vol': 15, 'trend_bias': 0.75},
        'IWM': {'type': 'etf_index', 'base_vol': 22, 'trend_bias': 0.6},
        
        # Commodities - Oro/Plata (baja-media volatilidad)
        'GC=F': {'type': 'commodity', 'base_vol': 12, 'trend_bias': 0.6},
        'SI=F': {'type': 'commodity', 'base_vol': 22, 'trend_bias': 0.5},
        'GLD': {'type': 'commodity', 'base_vol': 12, 'trend_bias': 0.6},
        'SLV': {'type': 'commodity', 'base_vol': 22, 'trend_bias': 0.5},
        'IAU': {'type': 'commodity', 'base_vol': 12, 'trend_bias': 0.6},
        
        # Commodities - Petróleo (alta volatilidad)
        'CL=F': {'type': 'commodity', 'base_vol': 35, 'trend_bias': 0.5},
        'USO': {'type': 'commodity', 'base_vol': 35, 'trend_bias': 0.5},
        
        # Mineras (se comportan como commodity)
        'NEM': {'type': 'commodity', 'base_vol': 28, 'trend_bias': 0.55},
        'GOLD': {'type': 'commodity', 'base_vol': 30, 'trend_bias': 0.55},
        'FNV': {'type': 'commodity', 'base_vol': 22, 'trend_bias': 0.6},
        'WPM': {'type': 'commodity', 'base_vol': 25, 'trend_bias': 0.55},
        
        # ADRs
        'BABA': {'type': 'adr', 'base_vol': 42, 'trend_bias': 0.45},
        'TSM': {'type': 'adr', 'base_vol': 30, 'trend_bias': 0.6},
        'NIO': {'type': 'adr', 'base_vol': 55, 'trend_bias': 0.4},
    }
    
    def __init__(self, cache_file: Optional[Path] = None):
        """
        Inicializa el clasificador.
        
        Args:
            cache_file: Archivo para guardar/cargar perfiles clasificados
        """
        self.cache_file = cache_file
        self.profiles: Dict[str, AssetProfile] = {}
        
        if cache_file and cache_file.exists():
            self._load_cache()
    
    def classify(
        self,
        symbol: str,
        historical_data: Optional[List[dict]] = None,
        asset_type: str = 'stock',
        force_recalculate: bool = False
    ) -> AssetProfile:
        """
        Clasifica un activo basándose en sus datos históricos.
        
        Args:
            symbol: Símbolo del activo
            historical_data: Lista de OHLCV data (opcional)
            asset_type: Tipo base del activo
            force_recalculate: Forzar recálculo incluso si está en cache
            
        Returns:
            AssetProfile con la clasificación
        """
        # Verificar cache
        if not force_recalculate and symbol in self.profiles:
            return self.profiles[symbol]
        
        # Crear perfil base
        profile = AssetProfile(
            symbol=symbol,
            name=symbol,
            asset_type=asset_type,
            classified_at=datetime.now().isoformat(),
        )
        
        # Usar perfil conocido si existe
        if symbol in self.KNOWN_PROFILES:
            known = self.KNOWN_PROFILES[symbol]
            profile.daily_volatility = known['base_vol']
            profile.trend_persistence = known['trend_bias']
        
        # Calcular métricas si hay datos históricos
        if historical_data and len(historical_data) >= 20:
            self._calculate_metrics(profile, historical_data)
        else:
            # Estimar métricas basándose en el tipo
            self._estimate_metrics(profile)
        
        # Clasificar timeframe recomendado
        self._classify_timeframe(profile)
        
        # Recomendar modelos
        self._recommend_models(profile)
        
        # Calcular confianza de la clasificación
        profile.confidence = self._calculate_confidence(profile, historical_data)
        
        # Guardar en cache
        self.profiles[symbol] = profile
        if self.cache_file:
            self._save_cache()
        
        return profile
    
    def _calculate_metrics(self, profile: AssetProfile, data: List[dict]):
        """Calcula métricas reales a partir de datos históricos"""
        if len(data) < 20:
            return
        
        profile.samples_used = len(data)
        
        # Calcular retornos diarios
        closes = [d.get('close', d.get('c', 0)) for d in data if d.get('close') or d.get('c')]
        if len(closes) < 20:
            return
        
        returns = []
        for i in range(1, len(closes)):
            if closes[i-1] > 0:
                ret = (closes[i] - closes[i-1]) / closes[i-1] * 100
                returns.append(ret)
        
        if not returns:
            return
        
        # Volatilidad diaria (desviación estándar de retornos)
        mean_ret = sum(returns) / len(returns)
        variance = sum((r - mean_ret) ** 2 for r in returns) / len(returns)
        daily_vol = math.sqrt(variance)
        profile.daily_volatility = daily_vol * math.sqrt(252)  # Anualizada
        
        # Volatilidad semanal
        weekly_vol = daily_vol * math.sqrt(5)
        profile.weekly_volatility = weekly_vol * math.sqrt(52)
        
        # ATR como porcentaje
        atr_values = []
        for d in data[-20:]:
            high = d.get('high', d.get('h', 0))
            low = d.get('low', d.get('l', 0))
            close = d.get('close', d.get('c', 0))
            if high > 0 and low > 0 and close > 0:
                tr = max(high - low, abs(high - close), abs(low - close))
                atr_values.append(tr / close * 100)
        
        if atr_values:
            profile.atr_percent = sum(atr_values) / len(atr_values)
        
        # Rango diario promedio
        ranges = []
        for d in data[-20:]:
            high = d.get('high', d.get('h', 0))
            low = d.get('low', d.get('l', 0))
            close = d.get('close', d.get('c', 0))
            if high > 0 and low > 0 and close > 0:
                daily_range = (high - low) / close * 100
                ranges.append(daily_range)
        
        if ranges:
            profile.avg_daily_range = sum(ranges) / len(ranges)
        
        # Frecuencia de gaps
        gaps = 0
        for i in range(1, len(data)):
            prev_close = data[i-1].get('close', data[i-1].get('c', 0))
            curr_open = data[i].get('open', data[i].get('o', 0))
            if prev_close > 0 and curr_open > 0:
                gap = abs(curr_open - prev_close) / prev_close * 100
                if gap > 1:  # Gap significativo > 1%
                    gaps += 1
        
        profile.gap_frequency = gaps / len(data) if len(data) > 0 else 0
        
        # Persistencia de tendencia
        same_direction = 0
        for i in range(1, len(returns)):
            if returns[i] * returns[i-1] > 0:  # Mismo signo
                same_direction += 1
        
        profile.trend_persistence = same_direction / (len(returns) - 1) if len(returns) > 1 else 0.5
        
        # Mean reversion score (inverso de trend persistence)
        profile.mean_reversion_score = 1 - profile.trend_persistence
    
    def _estimate_metrics(self, profile: AssetProfile):
        """Estima métricas basándose en el tipo de activo"""
        estimates = {
            'crypto': {'vol': 60, 'atr': 3.5, 'trend': 0.45, 'range': 5.0},
            'crypto_major': {'vol': 50, 'atr': 2.5, 'trend': 0.55, 'range': 4.0},
            'crypto_alt': {'vol': 80, 'atr': 5.0, 'trend': 0.4, 'range': 7.0},
            'stock': {'vol': 25, 'atr': 1.5, 'trend': 0.6, 'range': 2.0},
            'large_cap': {'vol': 22, 'atr': 1.2, 'trend': 0.65, 'range': 1.5},
            'high_vol_stock': {'vol': 45, 'atr': 2.5, 'trend': 0.5, 'range': 3.5},
            'etf': {'vol': 15, 'atr': 0.8, 'trend': 0.7, 'range': 1.0},
            'etf_index': {'vol': 15, 'atr': 0.8, 'trend': 0.75, 'range': 1.0},
            'commodity': {'vol': 20, 'atr': 1.5, 'trend': 0.55, 'range': 2.0},
            'forex': {'vol': 8, 'atr': 0.5, 'trend': 0.5, 'range': 0.7},
        }
        
        # Buscar perfil conocido primero
        if profile.symbol in self.KNOWN_PROFILES:
            known = self.KNOWN_PROFILES[profile.symbol]
            est_type = known.get('type', profile.asset_type)
        else:
            est_type = profile.asset_type
        
        est = estimates.get(est_type, estimates.get(profile.asset_type, estimates['stock']))
        
        if profile.daily_volatility == 0:
            profile.daily_volatility = est['vol']
        if profile.atr_percent == 0:
            profile.atr_percent = est['atr']
        if profile.trend_persistence == 0:
            profile.trend_persistence = est['trend']
        if profile.avg_daily_range == 0:
            profile.avg_daily_range = est['range']
        
        profile.mean_reversion_score = 1 - profile.trend_persistence
    
    def _classify_timeframe(self, profile: AssetProfile):
        """Clasifica el timeframe recomendado basándose en las métricas"""
        scores = {'intraday': 0, 'swing': 0, 'long': 0}
        
        # Factor 1: Volatilidad (más volatilidad = mejor para intradía)
        vol = profile.daily_volatility
        if vol >= self.VOLATILITY_THRESHOLDS['high']:
            scores['intraday'] += 40
            scores['swing'] += 30
            scores['long'] += 10
        elif vol >= self.VOLATILITY_THRESHOLDS['medium']:
            scores['intraday'] += 25
            scores['swing'] += 40
            scores['long'] += 20
        elif vol >= self.VOLATILITY_THRESHOLDS['low']:
            scores['intraday'] += 10
            scores['swing'] += 35
            scores['long'] += 40
        else:
            scores['intraday'] += 5
            scores['swing'] += 25
            scores['long'] += 50
        
        # Factor 2: ATR (más ATR = mejor para intradía)
        atr = profile.atr_percent
        if atr >= self.ATR_THRESHOLDS['suitable_intraday']:
            scores['intraday'] += 25
            scores['swing'] += 15
        elif atr >= self.ATR_THRESHOLDS['suitable_swing']:
            scores['swing'] += 25
            scores['intraday'] += 10
            scores['long'] += 10
        else:
            scores['long'] += 25
            scores['swing'] += 15
        
        # Factor 3: Persistencia de tendencia
        if profile.trend_persistence > 0.6:
            # Tendencias persistentes = mejor para swing/largo
            scores['long'] += 20
            scores['swing'] += 15
        elif profile.trend_persistence < 0.4:
            # Mean reversion = mejor para intradía
            scores['intraday'] += 20
        else:
            scores['swing'] += 15
        
        # Factor 4: Tipo de activo
        if profile.asset_type in ['crypto', 'crypto_major', 'crypto_alt']:
            scores['intraday'] += 10
            scores['swing'] += 10
        elif profile.asset_type in ['etf', 'etf_index']:
            scores['long'] += 15
        
        # Normalizar scores
        total = sum(scores.values())
        if total > 0:
            for tf in scores:
                scores[tf] = round(scores[tf] / total * 100, 1)
        
        profile.timeframe_scores = scores
        profile.recommended_timeframe = max(scores, key=scores.get)
    
    def _recommend_models(self, profile: AssetProfile):
        """Recomienda modelos del ensemble basándose en el perfil"""
        models = {}
        
        # Modelo global siempre activo
        models['global'] = 0.2
        
        # Modelos según volatilidad
        if profile.daily_volatility >= self.VOLATILITY_THRESHOLDS['high']:
            # Alta volatilidad: momentum y técnico
            models['momentum'] = 0.25
            models['regime'] = 0.15
            models['mean_reversion'] = 0.1
        elif profile.daily_volatility >= self.VOLATILITY_THRESHOLDS['medium']:
            # Media volatilidad: balance
            models['momentum'] = 0.15
            models['regime'] = 0.15
            models['mean_reversion'] = 0.15
        else:
            # Baja volatilidad: fundamentales
            models['fundamental'] = 0.25
            models['mean_reversion'] = 0.1
        
        # Modelos según tipo
        if profile.asset_type in ['stock', 'large_cap']:
            models['fundamental'] = models.get('fundamental', 0) + 0.15
            models['symbol'] = 0.1
        elif profile.asset_type in ['crypto', 'crypto_major', 'crypto_alt']:
            models['sentiment_driven'] = 0.2
            models['momentum'] = models.get('momentum', 0) + 0.1
        elif profile.asset_type in ['etf', 'etf_index']:
            models['regime'] = models.get('regime', 0) + 0.1
            models['fundamental'] = models.get('fundamental', 0) + 0.1
        
        # Modelos según comportamiento
        if profile.trend_persistence > 0.6:
            models['momentum'] = models.get('momentum', 0) + 0.1
        else:
            models['mean_reversion'] = models.get('mean_reversion', 0) + 0.1
        
        # Normalizar pesos
        total = sum(models.values())
        if total > 0:
            for m in models:
                models[m] = round(models[m] / total, 3)
        
        profile.model_weights = models
        profile.recommended_models = [m for m, w in sorted(models.items(), key=lambda x: -x[1]) if w > 0.05]
    
    def _calculate_confidence(self, profile: AssetProfile, historical_data: Optional[List[dict]]) -> float:
        """Calcula la confianza de la clasificación"""
        confidence = 50  # Base
        
        # Más datos = más confianza
        if historical_data:
            samples = len(historical_data)
            if samples >= 100:
                confidence += 30
            elif samples >= 50:
                confidence += 20
            elif samples >= 20:
                confidence += 10
        
        # Perfil conocido = más confianza
        if profile.symbol in self.KNOWN_PROFILES:
            confidence += 15
        
        # Claridad en la clasificación (diferencia entre scores)
        scores = list(profile.timeframe_scores.values())
        if scores:
            max_score = max(scores)
            second_max = sorted(scores)[-2] if len(scores) > 1 else 0
            if max_score - second_max > 20:
                confidence += 10
        
        return min(95, confidence)
    
    def get_model_weights_for_asset(self, symbol: str) -> Dict[str, float]:
        """
        Obtiene los pesos de modelos recomendados para un activo.
        
        Returns:
            Dict con modelo -> peso (0-1)
        """
        if symbol in self.profiles:
            return self.profiles[symbol].model_weights
        
        # Clasificar primero
        profile = self.classify(symbol)
        return profile.model_weights
    
    def get_recommended_timeframe(self, symbol: str) -> Tuple[str, float]:
        """
        Obtiene el timeframe recomendado para un activo.
        
        Returns:
            Tuple de (timeframe, confianza)
        """
        if symbol in self.profiles:
            profile = self.profiles[symbol]
        else:
            profile = self.classify(symbol)
        
        return (
            profile.recommended_timeframe,
            profile.timeframe_scores.get(profile.recommended_timeframe, 50)
        )
    
    def batch_classify(self, symbols: List[str], historical_data_map: Dict[str, List[dict]] = None) -> Dict[str, AssetProfile]:
        """Clasifica múltiples activos a la vez"""
        results = {}
        for symbol in symbols:
            data = historical_data_map.get(symbol) if historical_data_map else None
            results[symbol] = self.classify(symbol, data)
        return results
    
    def _load_cache(self):
        """Carga perfiles del cache"""
        try:
            with open(self.cache_file, 'r') as f:
                data = json.load(f)
                for symbol, profile_data in data.items():
                    self.profiles[symbol] = AssetProfile(**profile_data)
        except Exception as e:
            print(f"[AssetClassifier] Error cargando cache: {e}")
    
    def _save_cache(self):
        """Guarda perfiles en cache"""
        try:
            data = {s: p.to_dict() for s, p in self.profiles.items()}
            with open(self.cache_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[AssetClassifier] Error guardando cache: {e}")
    
    def to_json(self, symbol: str) -> str:
        """Exporta el perfil de un activo a JSON"""
        if symbol in self.profiles:
            return json.dumps(self.profiles[symbol].to_dict(), indent=2)
        return '{}'


# Instancia global del clasificador
_classifier: Optional[AssetClassifier] = None

def get_classifier(cache_file: Optional[Path] = None) -> AssetClassifier:
    """Obtiene la instancia global del clasificador"""
    global _classifier
    if _classifier is None:
        _classifier = AssetClassifier(cache_file)
    return _classifier
