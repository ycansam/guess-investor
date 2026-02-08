# Guess Investor Backend

**Última actualización:** 8 de febrero de 2026  
**Versión:** 1.6.0

API REST para el servicio de predicción de inversiones con ML avanzado, ensemble de 7 modelos dinámicos y soporte multi-timeframe (Intraday, Swing, Long).

## 🆕 Novedades v1.6.0

### 🏷️ Clasificador de Commodities Mejorado
- **50+ símbolos commodity**: GLD, SLV, PPFB.DE, EGLN.L, PHAG.MI, SGLD.L, SIVR, USO, UNG, etc.
- **Detección por nombre**: Patrones para gold, silver, oil, palladium, copper, natural gas, wheat, etc.
- **Backfill corregido**: Script actualizado para reprocesar predicciones con assetGroup correcto
- **Classifier muestras**: Commodity pasó de 15 a 107 muestras de entrenamiento

### 📊 UX Desktop
- **Paginación mejorada**: 42 activos por página para grid 3x14 en desktop
- **Filtrado de activos**: Solo devuelve activos con datos de precio válidos

### 🧠 ML Fixes
- **Evolutivo ML fix**: El optimizador inicializa factores faltantes automáticamente
- **Factor cleanup**: Eliminados `seasonality`, `competitors`, `expectations` (sin valor predictivo)

## 🆕 Novedades v2.0.0

- **Risk Filter**: Sistema de abstención para condiciones de alta incertidumbre
- **Forex v2.0**: 50+ exchanges, VIX integration, risk-on/risk-off sentiment
- **News v2.0**: 200+ keywords EN/ES, urgencia, amplificadores, 40+ fuentes
- **Trend Agreement**: Detección de alineación entre timeframes
- **Volume Direccional**: Volumen confirma/contradice movimiento
- **Commodity Correlation**: ETFs siguen dirección del futuro base

## 🚀 Quick Start

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Generar cliente Prisma
npm run db:generate

# Crear base de datos (SQLite)
npm run db:push

# Iniciar en desarrollo
npm run dev
```

El servidor estará en `http://localhost:3001`

## 📁 Estructura

```
backend/
├── src/
│   ├── config/              # Configuración
│   ├── controllers/         # Handlers de endpoints
│   ├── middleware/          # Error handling, logging
│   ├── models/              # Tipos TypeScript + Zod schemas
│   ├── repositories/        # Acceso a datos (Prisma)
│   ├── routes/              # Definición de rutas
│   ├── services/            # Lógica de negocio
│   │   ├── external/        # 30+ APIs externas
│   │   ├── prediction/      # 9 servicios de predicción
│   │   └── ml/              # 9 servicios ML avanzado
│   └── app.ts               # Entry point
├── prisma/
│   └── schema.prisma        # Schema de base de datos
└── package.json
```

## 🧮 Sistema de Predicción

### Los 14 Factores

#### 8 Factores Tradicionales

| Factor | Score | Fuente | Descripción |
|--------|-------|--------|-------------|
| **Trend** | -100/+100 | Yahoo | Cambio 30d/90d con mean reversion |
| **Technical** | -100/+100 | Interno | RSI, MACD, Bollinger, SMA, ATR, Volume |
| **Sentiment** | -100/+100 | VIX/Fear&Greed | Sentimiento global del mercado |
| **News** | -100/+100 | Yahoo | 200+ keywords, urgencia, credibilidad |
| **Macro** | -100/+100 | Trading Economics | GDP, Inflación, Tipos interés |
| **Forex** | -100/+100 | Yahoo | 50+ exchanges, risk-on/risk-off |
| **Institutional** | -100/+100 | SEC/Finviz | Insider trading, ownership |
| **Financials** | -100/+100 | Yahoo | P/E, Revenue, Target price |

#### 6 Factores Intradía (nuevos v1.6.0)

| Factor | Score | Fuente | Descripción |
|--------|-------|--------|-------------|
| **IntradayTrend** | -100/+100 | Yahoo 1h/4h | Momentum corto, VWAP, Pivots |
| **OptionsFlow** | -100/+100 | Yahoo Options | Put/Call, IV, Max Pain |
| **VolumeProfile** | -100/+100 | Yahoo | POC, Value Area |
| **Divergences** | -100/+100 | Interno | RSI/MACD divergencias |
| **VolatilityIV** | -100/+100 | Yahoo Options | IV vs RV spread |
| **MarketBreadth** | -100/+100 | Yahoo | A/D ratio, salud mercado |

> **Eliminados**: `seasonality`, `competitors`, `expectations` (ruido sin valor predictivo)

### Pesos por Timeframe

```typescript
DEFAULT_WEIGHTS = {
  intraday: {
    technical: 0.20, intradayTrend: 0.15, optionsFlow: 0.10, sentiment: 0.15, news: 0.10,
    volumeProfile: 0.05, divergences: 0.05, volatilityIV: 0.05, marketBreadth: 0.05,
    trend: 0.05, macro: 0.03, forex: 0.02, institutional: 0.00, financials: 0.00
  },
  swing: {
    technical: 0.20, news: 0.17, trend: 0.14, sentiment: 0.12, institutional: 0.08, macro: 0.08,
    forex: 0.05, intradayTrend: 0.05, divergences: 0.05, marketBreadth: 0.04, financials: 0.04,
    volatilityIV: 0.03, optionsFlow: 0.03, volumeProfile: 0.02
  },
  long: {
    financials: 0.25, macro: 0.15, institutional: 0.13, news: 0.10, technical: 0.09, forex: 0.07,
    trend: 0.06, sentiment: 0.04, divergences: 0.03, marketBreadth: 0.03, volatilityIV: 0.02,
    optionsFlow: 0.02, volumeProfile: 0.01, intradayTrend: 0.00
  }
}
```

### 10 Grupos de Activos

Los pesos se ajustan automáticamente según el tipo de activo:

| Grupo | Factores Prioritarios |
|-------|----------------------|
| `large_cap_stock` | Financials ×1.5, Institutional ×1.4, OptionsFlow ×1.3 |
| `small_cap_stock` | Technical ×1.4, IntradayTrend ×1.4, Trend ×1.3 |
| `crypto_major` | Sentiment ×1.5, IntradayTrend ×1.5, Technical ×1.4 |
| `crypto_alt` | Sentiment ×1.8, IntradayTrend ×1.8, Technical ×1.6 |
| `etf_index` | Macro ×1.5, MarketBreadth ×1.5, Institutional ×1.3 |
| `commodity` | Macro ×1.8, Forex ×1.6, VolatilityIV ×1.4 |
| `reit` | Financials ×1.8, Macro ×1.6, MarketBreadth ×1.1 |
| `forex` | Macro ×1.8, IntradayTrend ×1.6, Technical ×1.4 |
| `adr` | Forex ×1.6, Financials ×1.4 |

## 📡 API Endpoints

### Assets
```
GET  /api/assets/search?q=AAPL     # Buscar activos
GET  /api/assets/:symbol/quote      # Cotización actual
GET  /api/assets/:symbol/history    # Datos históricos
```

### Predictions
```
POST   /api/predictions             # Crear predicción
GET    /api/predictions/:id         # Obtener predicción
GET    /api/predictions/symbol/:sym # Predicciones por símbolo
GET    /api/predictions/pending     # Pendientes de verificar
POST   /api/predictions/:id/verify  # Verificar predicción
GET    /api/predictions/stats       # Estadísticas
```

### Training
```
GET    /api/training/weights         # Ver pesos actuales
POST   /api/training/start           # Iniciar entrenamiento
GET    /api/training/python/status   # Estado del servidor Python
POST   /api/training/python/train    # Entrenar con gradient descent
```

### ML Avanzado
```
GET    /api/ml/status                # Estado general de ML
POST   /api/ml/rl/policy             # Obtener política RL
POST   /api/ml/probabilistic/predict # Predicción probabilística
POST   /api/ml/correlation/analyze   # Análisis de correlación
```

## 🧠 Servicios

### Prediction Services (`services/prediction/`)

| Servicio | Descripción |
|----------|-------------|
| `calculator.service.ts` | Motor principal - 14 factores + ajustes |
| `ensemble.service.ts` | Combina 7 modelos dinámicos |
| `track-record.service.ts` | Historial de performance por símbolo |
| `asset-adjustment.service.ts` | Correcciones por activo problemático |
| `commodity-correlation.service.ts` | ETFs siguen futuro base |
| `commodity-underlying.service.ts` | Datos del commodity subyacente |
| `confidence-calibration.service.ts` | Calibra confianza vs accuracy |
| `accuracy-predictor.service.ts` | Predice accuracy esperado |
| `uncertainty-analysis.service.ts` | Detecta alta incertidumbre |

### ML Services (`services/ml/`)

| Servicio | Descripción |
|----------|-------------|
| `reinforcement-learning.service.ts` | Q-Learning: CUÁNDO predecir |
| `factor-correlation.service.ts` | Detecta double-counting |
| `meta-learning.service.ts` | Few-shot para nuevos símbolos |
| `probabilistic-model.service.ts` | Distribuciones de probabilidad |
| `classifier-learning.service.ts` | Aprende multiplicadores por grupo |
| `factor-weight-learning.service.ts` | Ajusta pesos con historial |
| `temporal-cross-validation.service.ts` | Walk-forward validation |
| `feature-engineering.service.ts` | Features derivados |
| `python-ml.service.ts` | Cliente clasificador Python |

### External Services (`services/external/`)

| Servicio | Datos |
|----------|-------|
| `yahoo.service.ts` | Precios, históricos, noticias |
| `technical.service.ts` | RSI, MACD, Bollinger, ATR, Volume |
| `sentiment.service.ts` | VIX + Fear & Greed Index |
| `news.service.ts` | 200+ keywords, urgencia, fuentes |
| `macro.service.ts` | GDP, Inflación, Desempleo |
| `forex.service.ts` | 50+ exchanges, risk sentiment |
| `institutional.service.ts` | Insider trading, ownership |
| `financials.service.ts` | P/E, Revenue, Target price |
| `seasonality.service.ts` | Patrones con detección cambios |
| `trends.service.ts` | Rachas, momentum, agreement |
| `events.service.ts` | Earnings, dividendos, splits |
| `broad-market-context.service.ts` | Detecta crash/corrección |

## ⚠️ Risk Filter

El sistema evalúa si recomendar **abstención**:

```typescript
riskFilter: {
  shouldAbstain: boolean,        // true = mejor no operar
  abstentionLevel: 'none' | 'caution' | 'warning' | 'critical',
  abstentionScore: number,       // 0-100, >40 = warning, >60 = critical
  reasons: string[],
  riskFactors: {
    vixExtreme: boolean,         // VIX > 30
    volatilityExtreme: boolean,  // Vol > 50%
    conflictingSignals: boolean, // Factores opuestos
    lowDataQuality: boolean,     // <50% factores
    trendDivergence: boolean,    // Timeframes desalineados
    earningsNear: boolean,       // Earnings en 3 días
    marketCrash: boolean,        // Mercado en crash
  }
}
```

## 🎯 Ensemble de 7 Modelos

| Modelo | Se activa cuando... |
|--------|---------------------|
| **Global** | Siempre (trend o technical disponible) |
| **Symbol** | Hay datos de trend |
| **Regime** | Hay datos técnicos |
| **Momentum** | Hay trend + technical |
| **Mean Reversion** | Hay technical |
| **Fundamental** | Hay financials |
| **Sentiment** | Hay sentiment |

## 🔧 Scripts

```bash
npm run dev          # Desarrollo con hot reload
npm run build        # Compilar TypeScript
npm start            # Ejecutar build
npm run db:generate  # Generar cliente Prisma
npm run db:push      # Aplicar schema a DB
npm run db:studio    # UI de Prisma
```

## 🗄️ Base de Datos

- **SQLite** en desarrollo (`./dev.db`)
- Modelos: `Prediction`, `Favorite`, `LearnedWeights`, `AssetAdjustment`, `MLModelState`

## 🔐 Variables de Entorno

```env
NODE_ENV=development
PORT=3001
DATABASE_URL="file:./dev.db"
FRONTEND_URL=http://localhost:8081
```
GET    /api/ml/rl/stats                      # Stats de Reinforcement Learning
POST   /api/ml/rl/policy                     # Obtener política RL
POST   /api/ml/tcv/run                       # Ejecutar cross-validation
POST   /api/ml/tcv/out-of-sample             # Test out-of-sample
POST   /api/ml/tcv/detect-overfitting        # Detectar overfitting
GET    /api/ml/probabilistic/stats           # Stats modelo probabilístico
POST   /api/ml/probabilistic/predict         # Predicción probabilística
POST   /api/ml/correlation/analyze           # Análisis de correlación
GET    /api/ml/meta/stats                    # Stats meta-learning
POST   /api/ml/features/generate             # Generar features derivados
```

### Analysis
```
GET    /api/analysis/:symbol         # Análisis completo de un símbolo
```

### Health
```
GET    /api/health                   # Estado del servidor
```

## 🧠 Servicios ML

### Prediction Services (`services/prediction/`)
| Servicio | Descripción |
|----------|-------------|
| `calculator.service.ts` | Motor principal de predicción con 14 factores |
| `asset-adjustment.service.ts` | Ajustes por activo (TSLA, NVDA, crypto) |
| `accuracy-predictor.service.ts` | Predice accuracy esperado |
| `confidence-calibration.service.ts` | Calibra confianza vs accuracy real |
| `uncertainty-analysis.service.ts` | Detecta condiciones de incertidumbre |
| `ensemble.service.ts` | Combina múltiples modelos |
| `track-record.service.ts` | Historial de performance por símbolo |

### ML Services (`services/ml/`)
| Servicio | Descripción |
|----------|-------------|
| `classifier-learning.service.ts` | **Aprendizaje de multiplicadores por grupo de activo** |
| `factor-weight-learning.service.ts` | Ajuste de pesos de factores basado en historial |
| `reinforcement-learning.service.ts` | Q-Learning para CUÁNDO predecir |
| `factor-correlation.service.ts` | Sinergias/conflictos entre factores |
| `temporal-cross-validation.service.ts` | Walk-forward validation |
| `meta-learning.service.ts` | Few-shot learning para nuevos símbolos |
| `probabilistic-model.service.ts` | Distribuciones de probabilidad |
| `feature-engineering.service.ts` | Features derivados automáticos |
| `python-ml.service.ts` | Cliente para clasificador Python |

## 🎯 Ensemble de 7 Modelos

El sistema usa un **ensemble dinámico** que activa/desactiva modelos según datos disponibles:

| Modelo | Propósito | Se activa cuando... |
|--------|-----------|---------------------|
| **Global** | Base por timeframe | Siempre (con trend o technical) |
| **Symbol** | Historial específico | Hay datos de trend |
| **Regime** | Régimen de mercado | Hay datos técnicos |
| **Momentum** | Tendencias fuertes | Hay trend + technical |
| **Mean Reversion** | Modelo contrarian | Hay technical |
| **Fundamental** | Análisis fundamental | Hay financials |
| **Sentiment** | Noticias y sentimiento | Hay sentiment |

### Requisitos de Datos por Modelo

```typescript
MODEL_DATA_REQUIREMENTS = {
  global: { required: ['trend', 'technical'], minRequired: 2 },
  symbol: { required: ['trend'], minRequired: 1 },
  regime: { required: ['technical'], minRequired: 1 },
  momentum: { required: ['trend', 'technical'], minRequired: 2 },
  mean_reversion: { required: ['technical'], minRequired: 1 },
  fundamental: { required: ['financials'], minRequired: 2 },
  sentiment_driven: { required: ['sentiment'], minRequired: 1 },
}
```

### External Services (`services/external/`)
| Servicio | Fuente de datos |
|----------|-----------------|
| `yahoo.service.ts` | Yahoo Finance (precios, históricos) |
| `technical.service.ts` | Indicadores técnicos (RSI, MACD, etc.) |
| `sentiment.service.ts` | Sentimiento de mercado |
| `news.service.ts` | Noticias financieras |
| `macro.service.ts` | Datos macroeconómicos |
| `institutional.service.ts` | Actividad institucional |
| `finviz.service.ts` | Finviz (targets, short interest) |
| `options.service.ts` | Put/Call ratio, flow |
| `dark-pools.service.ts` | Dark pool activity |
| `cot-report.service.ts` | COT Report (CFTC) |
| `etf-flows.service.ts` | Flujos de ETFs |
| ... y más |

## 🔧 Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo con hot reload |
| `npm run build` | Compilar TypeScript |
| `npm start` | Ejecutar build |
| `npm run db:generate` | Generar cliente Prisma |
| `npm run db:push` | Aplicar schema a DB |
| `npm run db:migrate` | Crear migración |
| `npm run db:studio` | UI de Prisma |

## 🗄️ Base de Datos

- **Desarrollo**: SQLite (`./dev.db`)
- **Producción**: PostgreSQL

### Modelos principales:
- `Prediction` - Predicciones generadas
- `Favorite` - Activos favoritos
- `LearnedWeights` - Pesos del sistema ML
- `AssetAdjustment` - Ajustes por activo
- `MarketDataCache` - Cache de datos de mercado
- `MLModelState` - Estado persistido de modelos ML

## 🐍 Python ML Server

El backend se comunica con un servidor Python para:
1. **Gradient Descent Training**: Optimiza pesos de factores
2. **Clasificación de Activos**: Recomienda timeframe y modelos según volatilidad

```bash
cd python
python server.py
```

Puerto: `8765`

### Endpoints Python ML

| Endpoint | Descripción |
|----------|-------------|
| `GET /status` | Estado del servidor |
| `GET /weights` | Pesos aprendidos |
| `POST /train` | Entrenar con datos |
| `GET /classify/{symbol}` | Clasificar un activo |
| `GET /profiles` | Listar perfiles de activos |
| `POST /classify` | Clasificar con datos históricos |
| `POST /classify-batch` | Clasificar múltiples activos |

### Clasificador de Activos

El clasificador Python analiza la volatilidad para recomendar:
- **Timeframe óptimo**: intraday, swing, long
- **Modelos prioritarios**: qué modelos del ensemble usar
- **Pesos personalizados**: ajustes específicos para el activo

## 🔐 Variables de Entorno

```env
NODE_ENV=development
PORT=3001
DATABASE_URL="file:./dev.db"
FRONTEND_URL=http://localhost:8081
RAPIDAPI_KEY=opcional
FRED_API_KEY=opcional
```
