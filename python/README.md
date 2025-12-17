# 🧠 Sistema de Aprendizaje Automático - Guess Investor

Este sistema permite que la app aprenda de sus errores y mejore las predicciones con el tiempo.
El proceso es **completamente automático** - la app verifica predicciones y exporta datos sin intervención del usuario.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                          APP React Native                           │
├─────────────────────────────────────────────────────────────────────┤
│  1. Hace predicción con 11 factores + pesos                         │
│  2. Registra predicción en AsyncStorage (tracking)                  │
│  3. AUTOMÁTICO: Verifica predicciones cuando pasa fecha objetivo    │
│  4. AUTOMÁTICO: Exporta datos verificados a AsyncStorage            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (Datos en AsyncStorage)
┌─────────────────────────────────────────────────────────────────────┐
│                         PYTHON ML System                            │
├─────────────────────────────────────────────────────────────────────┤
│  src/                                                               │
│  ├── config/settings.py    - Configuración central                  │
│  ├── models/               - Modelos ML                             │
│  │   ├── data_models.py    - Dataclasses                            │
│  │   ├── loss_function.py  - Función de pérdida                     │
│  │   └── optimizer.py      - Optimizador con momentum               │
│  └── utils/file_io.py      - Lectura/escritura de archivos          │
│                                                                     │
│  main.py - Entry point con CLI                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (learned_weights.json)
┌─────────────────────────────────────────────────────────────────────┐
│                          APP React Native                           │
├─────────────────────────────────────────────────────────────────────┤
│  Carga pesos aprendidos AUTOMÁTICAMENTE en próximas predicciones    │
│  Si no hay pesos aprendidos, usa pesos por defecto                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Instalación

```bash
cd python
# No requiere dependencias externas - usa solo Python estándar
python --version  # Requiere Python 3.8+
```

## Uso

### Flujo Automático (Recomendado)

La app hace todo automáticamente:
1. **Verificación**: Cada 6 horas, verifica predicciones que llegaron a su fecha objetivo
2. **Exportación**: Cuando hay ≥10 predicciones verificadas nuevas, exporta datos
3. **Carga de pesos**: Al hacer nuevas predicciones, carga pesos aprendidos si existen

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

## Los 11 Factores

| Factor | Descripción |
|--------|-------------|
| trend | Tendencia histórica de precios (30d, 90d) |
| technical | Indicadores técnicos (RSI, MACD, SMA, Bollinger) |
| sentiment | Sentimiento de mercado (VIX, Put/Call ratio) |
| news | Impacto de noticias recientes |
| macro | Indicadores macroeconómicos (PIB, inflación) |
| competitors | Análisis vs competidores del sector |
| forex | Impacto de tipos de cambio |
| institutional | Movimientos de inversores institucionales |
| seasonality | Patrones estacionales y festivos |
| financials | Datos financieros fundamentales |
| expectations | Expectativas de earnings y sorpresas |

## Pesos por Timeframe

Los pesos varían según el horizonte temporal:

### Intradía (≤1 día)
Dominan: `technical` (25%), `trend` (20%), `news` (18%), `sentiment` (15%)

### Swing (2-7 días)  
Balance: `technical` (18%), `news` (15%), `trend` (12%), `institutional` (10%)

### Largo plazo (>7 días)
Dominan: `financials` (13%), `macro` (12%), `institutional` (12%), `expectations` (12%)

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
│   │   └── optimizer.py      # Optimizador con momentum
│   └── utils/
│       ├── __init__.py
│       └── file_io.py        # I/O de archivos JSON
└── data/
    ├── verified_predictions.json  # Datos de la app
    ├── learned_weights.json       # Pesos optimizados
    └── training_history.json      # Historial de entrenamientos
```

## Requisitos Mínimos

- **Predicciones mínimas**: 5 verificadas para entrenar
- **Predicciones recomendadas**: 20+ para resultados significativos
- **Python**: 3.9+
- **Dependencias**: numpy, scipy, pandas, scikit-learn
