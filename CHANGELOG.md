# Changelog - Guess Investor

**Última actualización:** 15 de enero de 2026  
**Versión:** `1.4.0`  
**Commit actual:** `e13ccbb`

---

## [1.4.0] - 15 de enero de 2026

### 📝 Commits

| Commit | Descripción |
|--------|-------------|
| `e13ccbb` | **Fix Neural Network** - Corrección de factor scores neutros (0 en lugar de 50 para factores sin datos) |
| `8c7c121` | **Custom Scrollbar** - Scrollbar visible y arrastrable con PanResponder |
| `584a881` | **Neutral Threshold** - Reducido umbral neutral de 0.5% a 0.2% para detectar más movimientos |
| `ab127b7` | **Fix Swing Predictions** - Predicciones swing ahora aparecen correctamente en UI |
| `2628282` | **Fix Factors** - Corrección de factores duplicados en cálculo |
| `ec0166a` | **Yahoo Finance v2** - Migración a yahoo-finance2 con autenticación automática |
| `6652af5` | **Calculator Improvements** - Mejoras en el motor de predicciones |
| `b688721` | **Asset Classifier** - Clasificador de activos integrado en predicciones |
| `e4ce40d` | **Intraday Weights** - Pesos optimizados para predicciones intradía |
| `4d880f3` | **Prediction Bonus** - Sistema de bonus para predicciones con alta confianza |
| `568e71b` | **Trends Page** - Nueva página de tendencias de mercado |
| `ac57e9a` | **Trends Modal** - Modal con análisis de tendencias y rachas |
| `20513c3` | **Direction Indicator** - Indicador visual de dirección en predicciones |
| `25051af` | **Simplified Navigation** - Eliminada pestaña de buscador redundante |
| `cac0972` | **ML Model Integration** - Modelo ML ahora se aplica a predicciones |
| `80a24c0` | **Predictions View** - Nueva vista de predicciones activas |
| `1cd8beb` | **Day Predictions** - Predicciones por día añadidas |
| `da43dbc` | **Retraining Fix** - Corrección del proceso de re-entrenamiento |
| `319fa84` | **Popular Sort** - Ordenamiento por popular por defecto |
| `c24f6a9` | **Dynamic Search** - Buscador dinámico mejorado |

### ✨ Nuevas Funcionalidades

#### 🎯 Predicciones Multi-Timeframe
- **Soporte completo para Intraday (1 día), Swing (7 días) y Largo Plazo (30 días)**
- Nuevo endpoint `POST /api/training/import-active` para sincronizar predicciones activas
- Corrección del bug donde predicciones swing no aparecían en la UI
- Conversión automática de labels (`'Swing'`) a keys (`'swing'`) para consistencia

#### 📊 Yahoo Finance v2 Integration
- Migración a biblioteca `yahoo-finance2` para autenticación automática
- Solución al error "Invalid Crumb" de Yahoo Finance
- Todos los 11 factores ahora retornan datos correctamente
- Servicios actualizados: `institutional.service.ts`, `financials.service.ts`, `expectations.service.ts`

#### 📈 Vista de Tendencias
- Nueva página de tendencias con análisis de mercado
- Modal de tendencias con rachas y probabilidades
- Indicadores de dirección en predicciones

#### 🎚️ Mejoras de UI/UX
- Custom scrollbar visible y arrastrable
- Predicciones aparecen primero al cargar (sin necesidad de scroll)
- Umbral neutral reducido para detectar más movimientos direccionales

#### 🧮 Mejoras en el Calculador
- Clasificador de activos mejorado
- Sistema de bonus para predicciones
- Pesos intraday optimizados
- Factor scores neutros corregidos (0 para factores sin datos)

#### 🎯 Ensemble de 7 Modelos Dinámicos
- **Global**: Base por timeframe/volatilidad
- **Symbol**: Pesos específicos del símbolo (historial)
- **Regime**: Ajustado al régimen de mercado actual
- **Momentum**: Prioriza trend y análisis técnico
- **Mean Reversion**: Contrarian, busca reversiones
- **Fundamental**: Prioriza financials, macro, expectations
- **Sentiment Driven**: Prioriza sentiment y noticias

#### 🐍 Clasificador de Activos (Python ML)
- Clasifica activos por volatilidad (daily, weekly, ATR)
- Recomienda timeframe óptimo: intraday, swing, long
- Sugiere modelos prioritarios según tipo de activo
- Genera pesos personalizados para el ensemble

### 🐛 Correcciones

- **Swing Predictions Bug**: Las predicciones swing ahora se muestran correctamente en la UI
- **TrainingCache Sync**: Sincronización entre tablas `Prediction` y `TrainingCache`
- **Yahoo Finance Auth**: Resuelto error de autenticación con crumbs
- **Factor Data**: Todos los factores (Competitors, Institutional, Financials, Expectations) ahora funcionan
- **Neural Network**: Factor scores usan 0 (neutro) en lugar de 50 para factores sin datos
- **Cache Issues**: Múltiples correcciones de cache

### 🔧 Cambios Técnicos

#### Backend
```typescript
// Nuevo endpoint para importar predicciones activas
POST /api/training/import-active?timeframeDays=7

// yahoo-finance2 reemplaza implementación manual
import YahooFinance from 'yahoo-finance2';

// Factor scores ahora usan 0 como neutro
features = [factor_scores.get(f, 0) / 100.0 for f in FACTORS]
```

#### Frontend
```typescript
// Predicciones prioritarias al cargar
const prioritySymbols = [...new Set([...favSymbols, ...predictionSymbols])];

// Custom scrollbar con PanResponder
const panResponder = PanResponder.create({...});
```

---

## [1.3.0] - 28 de diciembre de 2025

### 📝 Commits

| Commit | Descripción |
|--------|-------------|
| `590e536` | **Docs Update** - READMEs actualizados con nueva arquitectura |
| `00464ac` | **AI Confidence Factor** - Factor de confianza basado en predicción IA |
| `13e924d` | **Python Integration** - Servidor Python ML integrado |
| `a3dcdb2` | **11 Factors Migration** - Migrados todos los factores al backend |
| `f67f268` | **Backend Migration** - Predicciones movidas al backend |
| `91d0441` | **Backend Setup** - Configuración inicial del backend |

### 🖥️ Backend Completo

#### Nueva Arquitectura
- **API REST completa** con Express + Prisma + SQLite/PostgreSQL
- **33+ servicios** migrados del frontend al backend
- **Puerto 3001** para el servidor Node.js
- **Puerto 8765** para el servidor Python ML

#### Servicios External (20+)
- `yahoo.service.ts` - Precios, históricos, fundamentales
- `technical.service.ts` - RSI, MACD, Bollinger, etc.
- `sentiment.service.ts` - Sentimiento del mercado
- `news.service.ts` - Noticias financieras
- `institutional.service.ts` - Actividad institucional
- `dark-pools.service.ts` - Dark pool activity
- `cot-report.service.ts` - COT Report (CFTC)
- `etf-flows.service.ts` - Flujos de ETFs

#### Servicios Prediction (7)
- `calculator.service.ts` - Motor principal con 11 factores
- `asset-adjustment.service.ts` - Ajustes por activo
- `ensemble.service.ts` - Combina múltiples modelos
- `track-record.service.ts` - Historial de performance

### 🧠 ML Avanzado (6 servicios)

- **Reinforcement Learning**: Q-Learning para decidir CUÁNDO predecir
- **Factor Correlation**: Detecta sinergias y conflictos entre factores
- **Meta-Learning**: MAML-inspired few-shot learning
- **Probabilistic Model**: Distribuciones de probabilidad

---

## [1.2.0] - 26 de diciembre de 2025

### Commits

| Commit | Descripción |
|--------|-------------|
| `d54cad0` | **Fix Charts** - Corregidas etiquetas de días en gráfico intradía |
| `a115d41` | **New Navigation** - 3 pestañas, buscador dinámico con +120 activos |
| `6d38c50` | **Chart Info Panel** - Panel de información de predicción en gráfico |
| `190b602` | **Fetch Optimization** - Carga reducida a <1 segundo |

### Competitors Avanzado
- **Detección automática de competidores** usando Yahoo Finance
- **Market Share Analysis** basado en revenue
- **Profitability Analysis** (Margins/ROE)

### Asset-Specific Adjustments
- Ajustes predefinidos para TSLA, NVDA, AMD, BTC, ETH
- Escalado de magnitud para predicciones exageradas

### Macro con FRED API
- Integración con Federal Reserve Economic Data
- CPI, Unemployment Rate, Fed Funds Rate

---

## [1.1.0] - 25 de diciembre de 2025

### Commits

| Commit | Descripción |
|--------|-------------|
| `48d1fdd` | **Prediction Chart** - Línea de predicción superpuesta al histórico |
| `a7d39b9` | **Chart Migration** - Migrado a react-native-gifted-charts |
| `b157fcf` | **Interactive Charts** - Página de detalle con gráficos y tooltips |
| `1cffc8e` | **Accuracy Scoring** - Sistema de puntuación 0-100 |

### Nueva Navegación y UI
- **Sistema de 3 pestañas** - Favoritos, Explorar, Predicciones
- **Gráficos interactivos** con react-native-gifted-charts
- **Conversión a EUR** en tiempo real

### Nuevo Sistema de ML
- **Red Neuronal MAML** para aprendizaje por activo
- **Optimizador de Pesos** automático

---

## [1.0.0] - 21 de diciembre de 2025

### Commits

| Commit | Descripción |
|--------|-------------|
| `98d8ac5` | **ML Python Server** - Servidor HTTP para entrenamiento |
| `aaf764f` | **Auto-Learning** - Weight optimizer con integración Python |
| `a84de4e` | **Market Close Verification** - Verificación al cierre de mercado |
| `f35ac1b` | **11 Factors Complete** - Todos los factores funcionando |

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
