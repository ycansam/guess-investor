# 🧠 Sistema de Aprendizaje Automático - Guess Investor

**Última actualización:** 8 de febrero de 2026  
**Versión:** 1.6.0

Este sistema permite que la app aprenda de sus errores y mejore las predicciones con el tiempo.

## 🆕 Novedades v1.6.0

### 🧠 Evolutivo ML Mejorado
- **Auto-inicialización de factores**: El optimizador inicializa automáticamente factores faltantes desde DEFAULT_WEIGHTS
- **Factor cleanup**: Eliminados `seasonality`, `competitors`, `expectations` (sin valor predictivo)
- **Debounce training**: Evita entrenamientos duplicados

### 🏷️ Clasificador de Activos Mejorado
- **50+ commodity symbols**: GLD, SLV, PPFB.DE, EGLN.L, PHAG.MI, SGLD.L, etc.
- **Patrones de detección**: gold, silver, palladium, copper, oil, natural gas, wheat...
- **Muestras commodity**: Pasó de 15 a 107 muestras de entrenamiento
El proceso es **completamente automático** - el backend sincroniza predicciones y entrena sin intervención del usuario.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND Node.js (Puerto 3001)               │
├─────────────────────────────────────────────────────────────────────┤
│  1. Hace predicción con 14 factores + ensemble de 7 modelos        │
│  2. Registra predicción en base de datos (Prisma/SQLite)            │
│  3. Verifica predicciones cuando pasa fecha objetivo                │
│  4. Sincroniza datos verificados con Python server                  │
│  5. Obtiene clasificación de activos para optimizar modelos         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (HTTP API)
┌─────────────────────────────────────────────────────────────────────┐
│                    PYTHON ML Server (Puerto 8765)                   │
├─────────────────────────────────────────────────────────────────────┤
│  server.py - Servidor HTTP                                          │
│  ├── POST /train - Entrena con gradient descent                     │
│  ├── GET /weights - Retorna pesos aprendidos                        │
│  ├── GET /status - Estado del servidor                              │
│  ├── GET /classify/{symbol} - Clasificar un activo                  │
│  ├── GET /profiles - Listar todos los perfiles de activos           │
│  ├── POST /classify - Clasificar con datos históricos               │
│  └── POST /classify-batch - Clasificar múltiples activos            │
│                                                                     │
│  src/                                                               │
│  ├── config/settings.py    - Configuración central                  │
│  ├── models/               - Modelos ML                             │
│  │   ├── data_models.py    - Dataclasses                            │
│  │   ├── loss_function.py  - Función de pérdida                     │
│  │   ├── optimizer.py      - Optimizador con momentum               │
│  │   └── asset_classifier.py - Clasificador de activos              │
│  └── utils/file_io.py      - Lectura/escritura de archivos          │
│                                                                     │
│  main.py - Entry point con CLI                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (learned_weights.json + asset_profiles.json)
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND Node.js                             │
├─────────────────────────────────────────────────────────────────────┤
│  Importa pesos aprendidos a la base de datos (LearnedWeights)       │
│  Usa perfiles de activos para ajustar el ensemble                   │
│  Los usa en próximas predicciones                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Los 14 Factores

### 8 Factores Tradicionales

| Factor | Descripción |
|--------|-------------|
| **trend** | Tendencia histórica de precios (30d, 90d) con mean reversion |
| **technical** | Indicadores técnicos (RSI, MACD, SMA, Bollinger, ATR, Volume) |
| **sentiment** | Sentimiento de mercado (VIX, Fear & Greed Index) |
| **news** | Impacto de noticias (200+ keywords EN/ES, urgencia, credibilidad) |
| **macro** | Indicadores macroeconómicos (PIB, inflación, tipos interés) |
| **forex** | Impacto de divisas (50+ exchanges, risk-on/risk-off) |
| **institutional** | Movimientos de inversores institucionales |
| **financials** | Datos financieros fundamentales (P/E, Revenue, Target price) |

### 6 Factores Intradía (nuevos v1.6.0)

| Factor | Descripción |
|--------|-------------|
| **intradayTrend** | Momentum corto plazo (1h/4h), VWAP, Pivots |
| **optionsFlow** | Put/Call ratio, IV, Max Pain |
| **volumeProfile** | POC, Value Area, Volume Clusters |
| **divergences** | RSI/MACD divergencias alcistas/bajistas |
| **volatilityIV** | IV vs RV spread, volatilidad implícita |
| **marketBreadth** | A/D ratio, salud del mercado |

> **Eliminados**: `seasonality`, `competitors` y `expectations` (añadían ruido sin valor predictivo).

## Clasificador de Activos

El sistema incluye un **clasificador de activos** que analiza la volatilidad para recomendar:

### Timeframes Recomendados

| Tipo de Activo | Volatilidad | Timeframe |
|----------------|-------------|-----------|
| Crypto (BTC, ETH) | Alta (>40%) | Intraday/Swing |
| Growth stocks (TSLA, NVDA) | Media-Alta | Swing |
| Blue chips (AAPL, MSFT) | Media | Swing/Long |
| ETFs (SPY, QQQ) | Baja (<20%) | Long |

### Modelos Recomendados por Tipo

| Tipo de Activo | Modelos Prioritarios |
|----------------|---------------------|
| Alta volatilidad | Momentum, Sentiment, Regime |
| Media volatilidad | Global, Symbol, Momentum |
| Baja volatilidad | Fundamental, Mean Reversion, Symbol |

## Instalación

```bash
cd python
# No requiere dependencias externas - usa solo Python estándar
python --version  # Requiere Python 3.8+
```

## Uso

### Servidor HTTP (Recomendado)

Para que el backend pueda comunicarse con Python:

```bash
cd python
python server.py
```

El servidor escucha en `http://localhost:8765`

### Endpoints del Servidor

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/status` | GET | Estado del servidor |
| `/weights` | GET | Retorna pesos actuales |
| `/train` | POST | Entrena con datos recibidos |
| `/classify/{symbol}` | GET | Clasificar un activo |
| `/profiles` | GET | Listar perfiles de activos |
| `/classify` | POST | Clasificar con datos históricos |
| `/classify-batch` | POST | Clasificar múltiples activos |

### Flujo Automático desde Backend

El backend (`python-training.service.ts`) maneja todo:

1. **Sincronizar**: `POST /api/training/python/sync`
2. **Entrenar**: `POST /api/training/python/train`
3. **Importar pesos**: `POST /api/training/python/import-weights`

O todo junto:
```
POST /api/training/python/sync-and-train
```

### Entrenamiento Manual (Opcional)

Para entrenar manualmente con datos exportados:

```bash
cd python

# Entrenamiento básico
python main.py

# Con más epochs
python main.py --epochs 200

# Con learning rate diferente
python main.py --lr 0.005

# Ver detalles del entrenamiento
python main.py --verbose

# Simular sin guardar cambios
python main.py --dry-run
```

### Opciones de CLI

| Opción | Descripción | Default |
|--------|-------------|---------|
| `--epochs` | Número de epochs | 100 |
| `--lr` | Learning rate | 0.01 |
| `--momentum` | Momentum del optimizador | 0.9 |
| `--min-samples` | Mínimo de muestras para entrenar | 10 |
| `--verbose` | Mostrar información detallada | false |
| `--dry-run` | Simular sin guardar | false |

### Resultado

El script mostrará:
- Pérdida inicial vs final por timeframe
- Mejora porcentual
- Comparación de pesos antes/después (con --verbose)

Los pesos se guardan automáticamente en:
- `data/learned_weights.json` (para la app)
- `data/training_history.json` (historial de entrenamientos)

## Pesos por Timeframe

Los pesos varían según el horizonte temporal:

### Intradía (≤1 día)
Dominan: `technical` (20%), `intradayTrend` (15%), `sentiment` (15%), `optionsFlow` (10%), `news` (10%)

### Swing (2-7 días)  
Balance: `technical` (20%), `news` (17%), `trend` (14%), `sentiment` (12%), `institutional` (8%)

### Largo plazo (>7 días)
Dominan: `financials` (25%), `macro` (15%), `institutional` (13%), `news` (10%), `technical` (9%)

## Función de Pérdida

```
L = α * L_direction + β * L_magnitude + γ * L_range

Donde:
- L_direction: 1 si falló la dirección, 0 si acertó
- L_magnitude: Error cuadrático del % de cambio
- L_range: 1 si precio real fuera del rango min-max

Pesos actuales:
- α = 0.5 (dirección es lo más importante)
- β = 0.35 (magnitud importa bastante)
- γ = 0.15 (estar en el rango es bonus)
```

## Algoritmo de Optimización

- **Método**: Descenso de gradiente con momentum
- **Learning rate**: 0.01 (ajustable via CLI)
- **Momentum**: 0.9
- **Early stopping**: Para si no mejora en 10 epochs
- **Límites de pesos**: Min 0.01, Max 0.40 (evita extremos)
- **Normalización**: Pesos siempre suman 1.0

## Estructura de Archivos

```
python/
├── main.py                   # Entry point con CLI
├── server.py                 # Servidor HTTP (puerto 8765)
├── requirements.txt          # Dependencias (solo Python estándar)
├── README.md                 # Este archivo
├── src/
│   ├── __init__.py
│   ├── config/
│   │   ├── __init__.py
│   │   └── settings.py       # Configuración central
│   ├── models/
│   │   ├── __init__.py
│   │   ├── data_models.py    # Dataclasses
│   │   ├── loss_function.py  # Función de pérdida
│   │   ├── optimizer.py      # Optimizador con momentum
│   │   └── asset_classifier.py  # Clasificador de activos (NEW)
│   └── utils/
│       ├── __init__.py
│       └── file_io.py        # I/O de archivos JSON
└── data/
    ├── verified_predictions.json  # Datos de la app
    ├── learned_weights.json       # Pesos optimizados
    ├── asset_profiles.json        # Perfiles de activos (NEW)
    └── training_history.json      # Historial de entrenamientos
```

## Clasificador de Activos - Detalles

El clasificador (`asset_classifier.py`) analiza las siguientes métricas:

| Métrica | Descripción |
|---------|-------------|
| `daily_volatility` | Volatilidad diaria anualizada (%) |
| `weekly_volatility` | Volatilidad semanal anualizada (%) |
| `atr_percent` | Average True Range como % del precio |
| `avg_daily_range` | Rango diario promedio (high-low) |
| `gap_frequency` | Frecuencia de gaps en apertura |
| `trend_persistence` | Qué tan persistentes son las tendencias |
| `mean_reversion_score` | Tendencia a revertir a la media |

### Umbrales de Volatilidad

```python
VOLATILITY_THRESHOLDS = {
    'low': 15,      # < 15% → Long term
    'medium': 35,   # 15-35% → Swing
    'high': 60,     # 35-60% → Intraday/Swing
    'extreme': 100  # > 60% → Muy arriesgado
}
```

### Perfiles Conocidos

El clasificador incluye perfiles preconfigurados para activos populares:

| Símbolo | Tipo | Volatilidad | Timeframe |
|---------|------|-------------|-----------|
| BTC-USD | Crypto | 65% | Swing |
| ETH-USD | Crypto | 75% | Intraday |
| AAPL | Stock | 25% | Swing |
| TSLA | Stock | 55% | Intraday |
| SPY | ETF | 15% | Long |
| NVDA | Stock | 50% | Swing |

## Requisitos Mínimos

- **Predicciones mínimas**: 5 verificadas para entrenar
- **Predicciones recomendadas**: 20+ para resultados significativos
- **Python**: 3.9+
- **Dependencias**: numpy, scipy, pandas, scikit-learn
