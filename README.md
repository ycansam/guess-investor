# 🎯 Guess Investor

**Última actualización:** 8 de febrero de 2026  
**Versión:** 1.6.0

**Aplicación de predicción de inversiones con IA híbrida** que combina análisis cuantitativo en tiempo real con machine learning para generar predicciones de precios de activos financieros.

![React Native](https://img.shields.io/badge/React_Native-Expo-blue?logo=expo)
![Node.js](https://img.shields.io/badge/Node.js-Backend-green?logo=node.js)
![Python](https://img.shields.io/badge/Python-ML_Server-green?logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Version](https://img.shields.io/badge/version-1.6.0-brightgreen)

---

## 🚀 Quick Start

```
Ctrl+Shift+B
```

Esto inicia los 3 servicios en terminales divididas:
| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| **Backend** | `localhost:3001` | API Node.js |
| **Frontend** | Expo DevTools | App React Native |
| **Python ML** | `localhost:8765` | Servicio ML |

> También puedes usar `.\start-all.bat` o `.\start-all.ps1` desde el explorador.

---

## 📋 Descripción

Guess Investor analiza **14 factores** diferentes (8 tradicionales + 6 intradía) para cada activo financiero y genera predicciones de precio con niveles de confianza. La aplicación aprende de sus propios errores mediante un sistema de machine learning que ajusta los pesos de cada factor basándose en el historial de predicciones verificadas.

### ✨ Características principales

- 📊 **14 Factores de análisis**: 8 tradicionales + 6 intradía (trend, technical, sentiment, news, macro, forex, institutional, financials, intradayTrend, optionsFlow, volumeProfile, divergences, volatilityIV, marketBreadth)
- 🤖 **IA Híbrida**: Análisis determinista + Machine Learning adaptativo + Red Neuronal con Gradient Descent
- 🎯 **Ensemble de 7 Modelos**: Global, Symbol, Regime, Momentum, Mean Reversion, Fundamental, Sentiment
- 🔄 **Selección Dinámica**: Activa/desactiva modelos según datos disponibles
- ⚠️ **Risk Filter**: Sistema de abstención para condiciones de alta incertidumbre
- 🐍 **Clasificador Python**: Clasifica activos por volatilidad para recomendar timeframe óptimo
- 🖥️ **Backend completo**: API REST con Express + Prisma + SQLite
- 🧠 **ML Avanzado**: 9 servicios ML (Reinforcement Learning, Meta-Learning, Probabilistic, etc.)
- 📈 **Datos en tiempo real**: Yahoo Finance, VIX, Fear & Greed Index
- 📉 **Gráficos interactivos**: Históricos + predicción visual
- 🎯 **Tracking de predicciones**: Verificación automática con sistema de accuracy scoring
- 🌍 **50+ Exchanges**: NYSE, NASDAQ, LSE, Xetra, Euronext, BME, etc.

---

## 🏗️ Arquitectura del Sistema de Predicción

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUJO DE PREDICCIÓN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. RECOLECCIÓN DE DATOS (paralelo)                                         │
│     ┌──────────┬──────────┬──────────┬──────────┬──────────┐               │
│     │ Yahoo    │ VIX      │ News     │ Macro    │ Institu- │               │
│     │ Finance  │ Fear&    │ Headlines│ Indicators│ tional  │               │
│     │          │ Greed    │          │          │          │               │
│     └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘               │
│          │          │          │          │          │                      │
│  2. CÁLCULO DE 14 FACTORES                                                  │
│     ┌────▼─────┬────▼─────┬────▼─────┬────▼─────┬────▼─────┐               │
│     │ Trend    │ Technical│ Sentiment│ News     │ Macro    │               │
│     │ Score    │ Score    │ Score    │ Score    │ Score    │               │
│     └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘               │
│          │          │          │          │          │                      │
│     ┌────▼─────┬────▼─────┬────▼─────┬────▼─────┐                          │
│     │ Forex    │ Institu- │ Season-  │ Finan-   │                          │
│     │ Score    │ tional   │ ality    │ cials    │                          │
│     └────┬─────┴────┬─────┴────┬─────┴────┬─────┘                          │
│          │          │          │          │                                 │
│  3. PONDERACIÓN DINÁMICA                                                    │
│     ┌────▼──────────▼──────────▼──────────▼─────┐                          │
│     │  • Pesos por Timeframe (intraday/swing/long)                         │
│     │  • Ajuste por Grupo de Activo (10 grupos)                            │
│     │  • Ajuste por Volatilidad del Activo                                 │
│     │  • Pesos Aprendidos (ML) si disponibles                              │
│     └────────────────────┬──────────────────────┘                          │
│                          │                                                  │
│  4. ENSEMBLE DE MODELOS                                                     │
│     ┌────────────────────▼──────────────────────┐                          │
│     │  7 Modelos Dinámicos:                     │                          │
│     │  • Global, Symbol, Regime                 │                          │
│     │  • Momentum, Mean Reversion               │                          │
│     │  • Fundamental, Sentiment                 │                          │
│     └────────────────────┬──────────────────────┘                          │
│                          │                                                  │
│  5. AJUSTES POST-PREDICCIÓN                                                 │
│     ┌────────────────────▼──────────────────────┐                          │
│     │  • Track Record del símbolo               │                          │
│     │  • Ajuste por dirección (UP/DOWN/NEUTRAL) │                          │
│     │  • Volatilidad extrema penalty            │                          │
│     │  • Caída intradía extrema                 │                          │
│     │  • Mean Reversion (si VIX>25)             │                          │
│     │  • Momentum intradía (si >3%)             │                          │
│     │  • Correlación de factores                │                          │
│     │  • Contexto de mercado global             │                          │
│     │  • Commodity correlation                  │                          │
│     └────────────────────┬──────────────────────┘                          │
│                          │                                                  │
│  6. RISK FILTER                                                             │
│     ┌────────────────────▼──────────────────────┐                          │
│     │  Evalúa si recomendar ABSTENCIÓN:         │                          │
│     │  • VIX > 30 (pánico)                      │                          │
│     │  • Volatilidad activo > 50%               │                          │
│     │  • Señales conflictivas                   │                          │
│     │  • Pocos datos disponibles                │                          │
│     │  • Earnings en próximos 3 días            │                          │
│     │  • Mercado en crash                       │                          │
│     └────────────────────┬──────────────────────┘                          │
│                          │                                                  │
│  7. OUTPUT FINAL                                                            │
│     ┌────────────────────▼──────────────────────┐                          │
│     │  • Dirección: UP / DOWN / NEUTRAL         │                          │
│     │  • Cambio esperado: -X% a +X%             │                          │
│     │  • Confianza: 0-100%                      │                          │
│     │  • Recomendación inteligente              │                          │
│     │  • Intervalos de confianza (50/80/95%)    │                          │
│     │  • Risk Filter (abstención)               │                          │
│     └───────────────────────────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Los 14 Factores de Análisis

### 8 Factores Tradicionales

| # | Factor | Fuente | Score Range | Descripción |
|---|--------|--------|-------------|-------------|
| 1 | **Trend** | Yahoo Finance | -100 a +100 | Cambio 30d/90d con amplificación y mean reversion |
| 2 | **Technical** | Cálculo interno | -100 a +100 | RSI, MACD, Bollinger, SMA, Stochastic, ATR, Volumen |
| 3 | **Sentiment** | VIX + Fear&Greed | -100 a +100 | Sentimiento del mercado global |
| 4 | **News** | Yahoo Finance | -100 a +100 | 200+ keywords EN/ES, urgencia, credibilidad fuentes |
| 5 | **Macro** | Trading Economics | -100 a +100 | GDP, Inflación, Desempleo, Tipos de interés |
| 6 | **Forex** | Yahoo Finance | -100 a +100 | 50+ exchanges, VIX, risk-on/risk-off, commodities |
| 7 | **Institutional** | SEC/Finviz | -100 a +100 | Insider trading, institutional ownership |
| 8 | **Financials** | Yahoo Finance | -100 a +100 | P/E, Revenue growth, Target price analistas |

### 6 Factores Intradía (nuevos en v1.6.0)

| # | Factor | Fuente | Score Range | Descripción |
|---|--------|--------|-------------|-------------|
| 9 | **IntradayTrend** | Yahoo 1h/4h | -100 a +100 | Momentum corto plazo, VWAP, Pivots |
| 10 | **OptionsFlow** | Yahoo Options | -100 a +100 | Put/Call ratio, IV, Max Pain |
| 11 | **VolumeProfile** | Yahoo Volume | -100 a +100 | POC, Value Area, Volume Clusters |
| 12 | **Divergences** | Cálculo interno | -100 a +100 | RSI/MACD divergencias alcistas/bajistas |
| 13 | **VolatilityIV** | Yahoo Options | -100 a +100 | IV vs RV spread, volatilidad implícita |
| 14 | **MarketBreadth** | Yahoo Market | -100 a +100 | A/D ratio, salud del mercado |

> **Nota**: Los factores `seasonality`, `competitors` y `expectations` fueron eliminados por añadir ruido sin valor predictivo demostrable.

---

## ⏱️ Timeframes Soportados

| Timeframe | Días | Factores Dominantes | Límite Cambio |
|-----------|------|---------------------|---------------|
| **Intraday** | ≤1 | Technical (20%), IntradayTrend (15%), Sentiment (15%) | ±8% |
| **Swing** | 2-7 | Technical (20%), News (17%), Trend (14%) | ±15% |
| **Long** | >7 | Financials (25%), Macro (15%), Institutional (13%) | ±15% |

---

## 🏢 Grupos de Activos (10 tipos)

El sistema detecta automáticamente el tipo de activo y ajusta los pesos:

| Grupo | Ejemplos | Factores Prioritarios |
|-------|----------|----------------------|
| Large Cap | AAPL, MSFT, GOOGL | Institutional ×1.4, Financials ×1.5, OptionsFlow ×1.3 |
| Small Cap | - | Technical ×1.4, IntradayTrend ×1.4, Trend ×1.3 |
| Crypto Major | BTC, ETH | Sentiment ×1.5, IntradayTrend ×1.5, Technical ×1.4 |
| Crypto Alt | SOL, ADA, DOGE | Sentiment ×1.8, IntradayTrend ×1.8, Technical ×1.6 |
| ETF/Index | SPY, QQQ, ^GSPC | Macro ×1.5, MarketBreadth ×1.5, Institutional ×1.3 |
| Commodity | GC=F, GLD, SI=F | Macro ×1.8, Forex ×1.6, VolatilityIV ×1.4 |
| REIT | O, AMT, VNQ | Financials ×1.8, Macro ×1.6 |
| Forex | EURUSD=X | Macro ×1.8, IntradayTrend ×1.6, Technical ×1.4 |
| ADR | BABA, TSM | Forex ×1.6, Financials ×1.4 |

---

## 🏗️ Estructura del Proyecto

```
guess-investor/
├── code/                    # App React Native (Expo)
│   ├── app/                 # Pantallas (file-based routing)
│   ├── components/          # Componentes React
│   ├── services/            # API client, AI service
│   ├── store/               # Estado global (Zustand)
│   └── config/              # Configuración
├── backend/                 # API REST (Express + Prisma)
│   ├── src/
│   │   ├── controllers/     # Handlers de endpoints
│   │   ├── services/
│   │   │   ├── external/    # 30+ servicios de datos externos
│   │   │   ├── prediction/  # 9 servicios de predicción
│   │   │   └── ml/          # 9 servicios ML avanzado
│   │   ├── routes/          # Definición de rutas
│   │   └── repositories/    # Acceso a datos (Prisma)
│   ├── prisma/              # Schema de base de datos
│   └── scripts/             # Scripts de mantenimiento
└── python/                  # Servidor ML (Gradient Descent)
    ├── src/
    │   ├── models/          # Optimizador, clasificador
    │   └── utils/           # Utilidades
    └── server.py            # Servidor HTTP (puerto 8765)
```

---

## 🚀 Instalación

### Requisitos previos

- Node.js 18+
- Python 3.10+
- npm o yarn

### Backend

```bash
cd backend
npm install
npm run db:generate
npm run db:push
npm run dev  # Puerto 3001
```

### Frontend

```bash
cd code
npm install
npm start  # Expo DevTools
```

### Python ML (Opcional)

```bash
cd python
python server.py  # Puerto 8765
```

---

## 📈 Novedades v1.6.0

### Clasificador de Commodities Mejorado

- **50+ símbolos commodity**: Detección expandida para GLD, SLV, PPFB.DE, EGLN.L, etc.
- **Patrones de nombre**: Detección automática por nombre (gold, silver, palladium, etc.)
- **Muestras multiplicadas**: Commodity pasó de 15 a 107 muestras de entrenamiento

### Mejoras en UX

- **Filtrado inteligente**: Los activos sin datos de precio no se muestran
- **Paginación desktop**: Carga 42 activos por página (3x14 grid)
- **Scroll infinito optimizado**: Debounce y throttling mejorado
- **Evolutivo ML**: El optimizador inicializa factores faltantes automáticamente

### 14 Factores de Análisis

- **8 Tradicionales**: Trend, Technical, Sentiment, News, Macro, Forex, Institutional, Financials
- **6 Intradía**: IntradayTrend, OptionsFlow, VolumeProfile, Divergences, VolatilityIV, MarketBreadth
- **Eliminados**: Seasonality, Competitors, Expectations (añadían ruido sin valor predictivo)

### Forex v2.0

- 50+ exchanges, VIX integration, risk-on/risk-off, commodity currencies

### News v2.0

- 200+ keywords (EN/ES), urgencia, amplificadores, 40+ fuentes con credibilidad

### Risk Filter (Nuevo)

Sistema de abstención que detecta condiciones de alta incertidumbre:
- VIX > 30 (pánico de mercado)
- Volatilidad del activo > 50%
- Señales conflictivas entre factores
- Pocos datos disponibles (<50%)
- Earnings en próximos 3 días
- Mercado en crash/corrección

### Otras Mejoras

- Commodity Correlation: ETFs siguen dirección del futuro base
- 10 grupos de activos con pesos específicos
- Track Record por símbolo
- Intervalos de confianza (50/80/95%)

---

## 📊 Servicios ML (9)

| Servicio | Función |
|----------|---------|
| Ensemble | Selección dinámica de modelos |
| Probabilistic | Distribución de probabilidad |
| Reinforcement Learning | Política de trading adaptativa |
| Factor Correlation | Detecta double-counting |
| Meta-Learning | Aprende de errores |
| Track Record | Historial por símbolo |
| Asset Adjustment | Correcciones por activo |
| Confidence Calibration | Calibra confianza |
| Classifier Learning | Aprende multiplicadores |

---

## 📝 Licencia

MIT License - Ver [LICENSE](LICENSE) para más detalles.

```bash
# Clonar repositorio
git clone <repo-url>
cd guess-investor

# === BACKEND ===
cd backend
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev   # Puerto 3001

# === PYTHON ML SERVER ===
cd ../python
python server.py   # Puerto 8765

# === FRONTEND ===
cd ../code
npm install
npm start
```

### Ejecutar Todo Junto

```bash
# Windows
cd code
.\start-all.bat

# Linux/Mac
cd code
./start-all.sh
```

---

## 🧠 Sistema de Predicción

### Los 14 Factores

#### 8 Factores Tradicionales

| # | Factor | Descripción |
|---|--------|-------------|
| 1 | **Trend** | Tendencias de precio y momentum (30d, 90d, volatilidad) |
| 2 | **Technical** | SMA, EMA, RSI, MACD, Bollinger, ATR, Stochastic |
| 3 | **Sentiment** | VIX, Fear & Greed Index, Put/Call Ratio |
| 4 | **News** | Yahoo News, 200+ keywords EN/ES, urgencia, credibilidad |
| 5 | **Macro** | CPI, GDP, NFP, tasas de bancos centrales |
| 6 | **Forex** | 50+ exchanges, risk-on/risk-off, commodity currencies |
| 7 | **Institutional** | Insider trading, institutional ownership, SEC filings |
| 8 | **Financials** | P/E, Revenue, márgenes, deuda, Target price analistas |

#### 6 Factores Intradía (nuevos v1.6.0)

| # | Factor | Descripción |
|---|--------|-------------|
| 9 | **IntradayTrend** | Momentum 1h/4h, VWAP, Pivot Points |
| 10 | **OptionsFlow** | Put/Call ratio en tiempo real, IV, Max Pain |
| 11 | **VolumeProfile** | POC, Value Area, Volume Clusters |
| 12 | **Divergences** | RSI/MACD divergencias alcistas/bajistas |
| 13 | **VolatilityIV** | IV vs RV spread, volatilidad implícita |
| 14 | **MarketBreadth** | Advance/Decline ratio, salud del mercado |

> **Eliminados**: `Competitors`, `Seasonality`, `Expectations` (añadían ruido sin valor predictivo)

### Machine Learning

El sistema utiliza un **ensemble de 7 modelos dinámicos** que se activan según los datos disponibles:

| Modelo | Propósito | Se activa cuando... |
|--------|-----------|---------------------|
| **Global** | Base por timeframe | Siempre (con trend o technical) |
| **Symbol** | Historial específico del símbolo | Hay datos de trend |
| **Regime** | Ajuste por régimen de mercado | Hay datos técnicos |
| **Momentum** | Prioriza tendencias fuertes | Hay trend + technical |
| **Mean Reversion** | Modelo contrarian | Hay technical |
| **Fundamental** | Análisis fundamental | Hay financials + macro |
| **Sentiment** | Noticias y sentimiento | Hay sentiment |

#### Clasificador de Activos (Python ML)

El servidor Python clasifica activos por **volatilidad** para recomendar:
- **Timeframe óptimo**: intraday, swing o long
- **Modelos recomendados**: qué modelos usar según el tipo de activo
- **Pesos ajustados**: pesos personalizados para el ensemble

```
Activo (ej: TSLA) → Python ML → volatilidad: 45%
                              → timeframe: intraday
                              → modelos: [momentum, sentiment, regime]
```

#### Gradient Descent

Los pesos de cada factor se optimizan con gradient descent:

```
Loss = α·DirectionLoss + β·MagnitudeLoss + γ·RangeLoss
```

Donde:
- **α = 0.5**: Importancia de acertar la dirección (sube/baja)
- **β = 0.35**: Importancia de acertar la magnitud del cambio
- **γ = 0.15**: Importancia de que el precio esté en el rango predicho

### Servicios ML Avanzados (Backend)

| Servicio | Descripción |
|----------|-------------|
| **Reinforcement Learning** | Q-Learning para decidir CUÁNDO predecir |
| **Factor Correlation** | Detecta sinergias/conflictos entre factores |
| **Meta-Learning** | Few-shot learning para nuevos símbolos |
| **Probabilistic Model** | Distribuciones de probabilidad en lugar de puntos |
| **Temporal Cross-Validation** | Walk-forward validation para detectar overfitting |
| **Feature Engineering** | Features derivados automáticos |
| **Python ML Client** | Cliente para clasificador de activos Python |

---

## ⭐ Sistema de Accuracy Scoring

El sistema evalúa la calidad de las predicciones con un **score de 0-100** que combina:

### Fórmula
```
AccuracyScore = DirectionScore (50pts) + ChangeScore (50pts)
```

### Clasificación

| Score | Calidad | Descripción |
|-------|---------|-------------|
| 75-100 | 🎯 Excellent | Dirección correcta + cambio muy preciso |
| 50-74 | 👍 Good | Dirección correcta pero cambio impreciso |
| 25-49 | ⚠️ Poor | Cambio muy impreciso |
| 0-24 | ❌ Failed | Dirección incorrecta |

### Ejemplo
```
Predicción: AAPL +3% en 1 día
Real: AAPL +2.8% en 1 día
→ Dirección: ✅ (50 pts)
→ Precisión: 93% (46 pts)
→ Score Final: 96/100 🎯 EXCELLENT
```

---

## �️ Backend API

El backend proporciona una API REST completa:

### Endpoints Principales

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/assets/search` | Buscar activos |
| `POST /api/predictions` | Crear predicción |
| `GET /api/predictions/stats` | Estadísticas |
| `GET /api/ml/status` | Estado de ML |
| `POST /api/ml/rl/policy` | Política RL |
| `POST /api/ml/probabilistic/predict` | Predicción probabilística |

Ver [backend/README.md](./backend/README.md) para documentación completa.

---

## 📊 APIs y Fuentes de Datos

| Fuente | Uso | Costo |
|--------|-----|-------|
| Yahoo Finance V8 | Precios, históricos, OHLCV | ✅ Gratis |
| Finviz | Target prices, short interest | ✅ Gratis |
| Dark Pools | Short volume ratio | ✅ Gratis |
| COT Report | Posiciones CFTC | ✅ Gratis |
| StockTwits | Sentimiento social | ✅ Gratis |
| CBOE | Put/Call Ratio SPX | ✅ Gratis |

---

## 🌍 Mercados Soportados

| Mercado | Ejemplos |
|---------|----------|
| 🇺🇸 NYSE/NASDAQ | AAPL, MSFT, GOOGL, AMZN, TSLA |
| 🇪🇸 España (.MC) | ITX, SAN, BBVA, TEF, IBE |
| 🇩🇪 Alemania (.DE) | SAP, SIE, BMW, VOW3 |
| 🇫🇷 Francia (.PA) | MC (LVMH), OR (L'Oréal), TTE |
| ₿ Crypto | BTC-USD, ETH-USD, SOL-USD |

---

## 📱 Capturas

*Próximamente*

---

## 📄 Licencia

MIT © 2025

---

## 📝 Changelog

Ver [CHANGELOG.md](./CHANGELOG.md) para el historial completo de cambios.

### Últimas actualizaciones (22/01/2026)
- 🧠 **Classifier Learning**: El sistema ML ahora aprende de predicciones verificadas con multiplicadores dinámicos
- 🎯 **UI Simplificada**: Eliminados selectores de categorías para una interfaz más limpia
- 🔧 **factorBreakdown Fix**: Los datos de factores ahora se guardan correctamente para entrenamiento
- 📊 **Ensemble de 7 modelos**: Global, Symbol, Regime, Momentum, Mean Reversion, Fundamental, Sentiment
- 🐍 **Python ML Server**: Clasificador de activos por volatilidad integrado

