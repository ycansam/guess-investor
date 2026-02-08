# Changelog - Guess Investor

**Última actualización:** 8 de febrero de 2026  
**Versión:** `1.6.0`

---

## [1.6.0] - 8 de febrero de 2026

### ✨ Nuevas Funcionalidades

#### 🏷️ Clasificador de Commodities Mejorado
- **50+ símbolos commodity**: Detección expandida para GLD, SLV, PPFB.DE, EGLN.L, PHAG.MI, SGLD.L, SIVR, USO, UNG, WEAT, CORN, SOYB, DBA, DBC, etc.
- **Patrones de nombre**: Detección automática por nombre (gold, silver, palladium, copper, oil, natural gas, wheat, corn, soybean, etc.)
- **Backfill actualizado**: Script `backfill-factor-breakdown.ts` procesa TODAS las predicciones para corregir assetGroup
- **Muestras multiplicadas**: Commodity pasó de 15 a 107 muestras de entrenamiento

#### 🎨 UX Desktop Mejorada
- **Paginación desktop**: Carga 42 activos por página (grid 3x14) en lugar de 20
- **Filtrado inteligente**: Los activos sin datos de precio válido se ocultan automáticamente
- **Scroll infinito optimizado**: Debounce de 300ms + throttling para evitar cargas duplicadas
- **Footer informativo**: Muestra progreso de carga (ej: "42/523 activos")

#### 🧠 ML Mejorado
- **Evolutivo fix**: El optimizador inicializa automáticamente factores faltantes desde DEFAULT_WEIGHTS
- **Factor cleanup**: Eliminados `seasonality`, `competitors`, `expectations` (sin valor predictivo demostrable)
- **6 factores intradía**: IntradayTrend, OptionsFlow, VolumeProfile, Divergences, VolatilityIV, MarketBreadth

### 🐛 Correcciones

- **Factores obsoletos**: Eliminados factores sin valor predictivo antes de causar errores en entrenamiento
- **Activos sin datos**: Activos como RDSA.L, PPLT.MI que no devuelven precio ya no aparecen en las listas
- **Scroll errático**: Corregido comportamiento de scroll que cargaba cantidades inconsistentes
- **Classifier 15 muestras**: Corregido problema donde commodity solo mostraba 15 muestras pese a 600+ predicciones totales

### 🔧 Cambios Técnicos

#### Backend
- `backfill-factor-breakdown.ts`: Expandido SYMBOL_TO_GROUP con 50+ commodity symbols
- `backfill-factor-breakdown.ts`: Añadidos COMMODITY_NAME_PATTERNS (20+ patrones)
- `backfill-factor-breakdown.ts`: detectAssetGroup() mejorado para detectar commodities antes de ETFs
- `backfill-factor-breakdown.ts`: main() procesa TODAS las predicciones, no solo las sin factorBreakdown
- `market-data-service.ts`: `BATCH_SIZE` cambiado de 20 a 42

#### Frontend
- `market-predictions.tsx`: Filtro `withValidData` para excluir activos sin precio
- `predictions-list-content.tsx`: Sistema de paginación basado en páginas con debounce

#### Python
- `evolutionary_optimizer.py`: Inicializa factores faltantes en `__init__`
- `learned_weights.json`: Actualizado con 14 factores (8 tradicionales + 6 intradía)

---

## [2.0.0] - 5 de febrero de 2026

### ✨ Nuevas Funcionalidades

#### 🎯 Sistema de Predicción v2
- **Risk Filter**: Sistema de abstención para condiciones de alta incertidumbre
- **Forex v2.0**: 50+ exchanges, VIX integration, risk-on/risk-off sentiment
- **News v2.0**: 200+ keywords EN/ES, urgencia, amplificadores, 40+ fuentes
- **Trend Agreement**: Detección de alineación entre timeframes
- **Volume Direccional**: Volumen confirma/contradice movimiento
- **Commodity Correlation**: ETFs siguen dirección del futuro base

---

## [1.5.0] - 22 de enero de 2026

### ✨ Nuevas Funcionalidades

#### 🧠 Sistema de Aprendizaje ML Mejorado
- **Classifier Learning Service**: El clasificador ML ahora aprende de predicciones verificadas
- **factorBreakdown Persistente**: Los datos de análisis de factores se guardan correctamente para entrenamiento
- **Multiplicadores Dinámicos**: Ajuste automático de pesos por grupo de activo según historial

#### 🎯 UI Simplificada
- **Selectores de Categorías Eliminados**: Removidos los filtros de Tech USA, Crypto, España de la pestaña de predicciones
- **Interfaz Más Limpia**: Menos clutter, foco en ordenamiento y timeframe

### 🐛 Correcciones

- **factorBreakdown null**: Corregido bug donde `factorBreakdown` se guardaba como null en nuevas predicciones
- **availableFactors vacío**: Corregido el array `availableFactors` que quedaba vacío al trackear predicciones
- **Classifier 0 samples**: Resuelto problema donde el clasificador mostraba "0 samples" a pesar de tener predicciones verificadas
- **Modelo de entrenamiento**: Corregida incompatibilidad entre modelos base y esperados por el clasificador

### 🔧 Cambios Técnicos

#### Backend
- Logging mejorado en `prediction.controller.ts` para debug de tracking
- Script `force-retrain-classifier.ts` para re-entrenar con datos históricos
- Script `check-factor-data.ts` para diagnosticar datos de factores

#### Frontend
- Eliminados estados `categories` y `selectedCategory` de `market-predictions.tsx`
- Limpieza de imports no utilizados (`AssetCategory`)

---

## [1.4.0] - 15 de enero de 2026

### ✨ Nuevas Funcionalidades

#### 🎯 Predicciones Multi-Timeframe
- Soporte completo para Intraday (1 día), Swing (7 días) y Largo Plazo (30 días)
- Nuevo endpoint `POST /api/training/import-active` para sincronizar predicciones activas
- Conversión automática de labels (`'Swing'`) a keys (`'swing'`)

#### 📊 Yahoo Finance v2 Integration
- Migración a biblioteca `yahoo-finance2` para autenticación automática
- Solución al error "Invalid Crumb" de Yahoo Finance
- Todos los 11 factores ahora retornan datos correctamente

#### 📈 Vista de Tendencias
- Nueva página de tendencias con análisis de mercado
- Modal de tendencias con rachas y probabilidades
- Indicadores de dirección en predicciones

#### 🎚️ Mejoras de UI/UX
- Custom scrollbar visible y arrastrable
- Predicciones aparecen primero al cargar
- Umbral neutral reducido para detectar más movimientos direccionales

### 🐛 Correcciones

- Swing Predictions Bug: Las predicciones swing ahora se muestran correctamente
- TrainingCache Sync: Sincronización entre tablas `Prediction` y `TrainingCache`
- Neural Network: Factor scores usan 0 (neutro) para factores sin datos

---

## [1.3.0] - 28 de diciembre de 2025

### 🖥️ Backend Completo

- **API REST completa** con Express + Prisma + SQLite/PostgreSQL
- **33+ servicios** migrados del frontend al backend
- **Ensemble de 7 modelos** dinámicos: Global, Symbol, Regime, Momentum, Mean Reversion, Fundamental, Sentiment
- **Clasificador Python**: Clasifica activos por volatilidad para recomendar timeframe óptimo

### 🧠 ML Avanzado (6 servicios)

- Reinforcement Learning: Q-Learning para decidir CUÁNDO predecir
- Factor Correlation: Detecta sinergias y conflictos entre factores
- Meta-Learning: MAML-inspired few-shot learning
- Probabilistic Model: Distribuciones de probabilidad

---

## [1.2.0] - 26 de diciembre de 2025

### Mejoras

- Competitors Avanzado: Detección automática de competidores usando Yahoo Finance
- Asset-Specific Adjustments: Ajustes predefinidos para TSLA, NVDA, AMD, BTC, ETH
- Macro con FRED API: CPI, Unemployment Rate, Fed Funds Rate

---

## [1.1.0] - 25 de diciembre de 2025

### Mejoras

- Gráficos interactivos con react-native-gifted-charts
- Sistema de 3 pestañas: Favoritos, Explorar, Predicciones
- Sistema de accuracy scoring 0-100

---

## [1.0.0] - 21 de diciembre de 2025

### Release Inicial
- 11 factores de análisis funcionando
- Yahoo V8 API (gratis/ilimitado)
- Soporte símbolos europeos (.MC, .DE, .PA)
- Sistema ML con gradiente descendente

---

## Resumen de Factores (11)

| # | Factor | Descripción |
|---|--------|-------------|
| 1 | **Trend** | Cambios 30d/90d, volatilidad, momentum |
| 2 | **Technical** | SMA, EMA, RSI, MACD, Bollinger, Volumen |
| 3 | **Sentiment** | VIX, Fear & Greed, Put/Call Ratio |
| 4 | **News** | Yahoo News, earnings calendar, analyst actions |
| 5 | **Macro** | Índices, tipos de interés, CPI, GDP, PMI |
| 6 | **Competitors** | Rendimiento vs sector, P/E ratio, market share |
| 7 | **Forex** | Exposición FX, volatilidad de divisas |
| 8 | **Institutional** | COT Report, ETF flows, dark pools |
| 9 | **Seasonality** | Patrones históricos, eventos por país |
| 10 | **Financials** | Ingresos, márgenes, FCF, deuda |
| 11 | **Expectations** | EPS surprise, analyst revisions, beat rate |

---

## APIs/Fuentes de Datos

| Fuente | Uso |
|--------|-----|
| **Yahoo Finance** | Precios, históricos, fundamentales |
| **yahoo-finance2** | Autenticación automática |
| **CBOE Options API** | Put/Call Ratio |
| **FRED API** | Datos macroeconómicos US |
| **StockTwits** | Sentimiento social |
| **Alternative.me** | Fear & Greed Index |
