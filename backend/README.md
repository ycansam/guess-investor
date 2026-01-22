# Guess Investor Backend

**Última actualización:** 22 de enero de 2026  
**Versión:** 1.5.0

API REST para el servicio de predicción de inversiones con ML avanzado, ensemble de 7 modelos dinámicos y soporte multi-timeframe (Intraday, Swing, Long).

## 🆕 Novedades v1.5.0

- **Classifier Learning Service**: Aprendizaje automático de multiplicadores por grupo de activo
- **factorBreakdown Persistente**: Los datos de factores se guardan correctamente al trackear predicciones
- **Scripts de Diagnóstico**: Nuevos scripts para forzar reentrenamiento y verificar datos
- **Logging Mejorado**: Debug más detallado en el proceso de tracking

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
│   │   ├── external/        # APIs externas (Yahoo, Finviz, etc.)
│   │   ├── prediction/      # Cálculo y predicciones (7 servicios)
│   │   └── ml/              # Machine Learning avanzado (7 servicios)
│   └── app.ts               # Entry point
├── prisma/
│   └── schema.prisma        # Schema de base de datos
├── python/                  # ML Server (Gradient Descent)
└── package.json
```

## 📡 API Endpoints

### Assets
```
GET  /api/assets/search?q=AAPL     # Buscar activos
GET  /api/assets/:symbol/quote      # Cotización actual
GET  /api/assets/:symbol/history    # Datos históricos
```

### Favorites
```
GET    /api/favorites               # Listar favoritos
POST   /api/favorites               # Añadir favorito
DELETE /api/favorites/:symbol       # Eliminar favorito
GET    /api/favorites/:symbol/check # Verificar si es favorito
PUT    /api/favorites/reorder       # Reordenar favoritos
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
GET    /api/training/cache           # Cache de predicciones activas
POST   /api/training/import-active   # Importar predicciones activas a cache
POST   /api/training/sync-cache      # Sincronizar cache con verificadas
POST   /api/training/start           # Iniciar entrenamiento
GET    /api/training/python/status   # Estado del servidor Python
POST   /api/training/python/sync     # Sincronizar con Python
POST   /api/training/python/train    # Entrenar con gradient descent
```

### ML Avanzado
```
GET    /api/ml/status                        # Estado general de ML
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
| `calculator.service.ts` | Motor principal de predicción con 11 factores |
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
