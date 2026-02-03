# 🎯 Guess Investor

**Última actualización:** 22 de enero de 2026  
**Versión:** 1.5.0

**Aplicación de predicción de inversiones con IA híbrida** que combina análisis cuantitativo en tiempo real con machine learning para generar predicciones de precios de activos financieros.

![React Native](https://img.shields.io/badge/React_Native-Expo-blue?logo=expo)
![Node.js](https://img.shields.io/badge/Node.js-Backend-green?logo=node.js)
![Python](https://img.shields.io/badge/Python-ML_Server-green?logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Version](https://img.shields.io/badge/version-1.5.0-brightgreen)

---

## � Quick Start

```
Ctrl+Shift+B
```

Esto inicia los 3 servicios en terminales divididas:
| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| **Backend** | `localhost:3000` | API Node.js |
| **Frontend** | Expo DevTools | App React Native |
| **Python ML** | `localhost:5000` | Servicio ML |

> También puedes usar `.\start-all.bat` o `.\start-all.ps1` desde el explorador.

---

## �📋 Descripción

Guess Investor analiza **11 factores** diferentes para cada activo financiero y genera predicciones de precio con niveles de confianza. La aplicación aprende de sus propios errores mediante un sistema de machine learning que ajusta los pesos de cada factor basándose en el historial de predicciones verificadas.

### ✨ Características principales

- 📊 **11 Factores de análisis**: Tendencia, Técnico, Sentimiento, Noticias, Macro, Competidores, Forex, Institucional, Estacionalidad, Financieros, Expectativas
- 🤖 **IA Híbrida**: Análisis determinista + Machine Learning adaptativo + **Red Neuronal con Gradient Descent**
- 🎯 **Ensemble de 7 Modelos**: Global, Symbol, Regime, Momentum, Mean Reversion, Fundamental, Sentiment
- 🔄 **Selección Dinámica**: Activa/desactiva modelos según datos disponibles
- 🐍 **Clasificador Python**: Clasifica activos por volatilidad para recomendar timeframe óptimo
- 🖥️ **Backend completo**: API REST con Express + Prisma + SQLite/PostgreSQL
- 🧠 **ML Avanzado**: 7 servicios ML (Reinforcement Learning, Meta-Learning, Probabilistic, etc.)
- 📈 **Datos en tiempo real**: Yahoo Finance, Finviz, Dark Pools, COT Report, ETF Flows
- 📉 **Gráficos interactivos**: Históricos + predicción visual con react-native-gifted-charts
- 💶 **Precios en EUR**: Conversión automática a euros con tipos de cambio en tiempo real
- 🎯 **Tracking de predicciones**: Verificación automática con **sistema de accuracy scoring**
- ⭐ **Sistema de favoritos**: Guarda tus activos preferidos para acceso rápido
- 🔍 **Buscador dinámico**: +120 activos organizados por categorías
- 🧠 **Auto-aprendizaje**: El sistema mejora basándose en sus errores
- 🌍 **Mercados globales**: NYSE, NASDAQ, Europa, Crypto, Commodities

---

## 🏗️ Estructura del Proyecto

```
guess-investor/
├── code/                    # App React Native (Expo)
│   ├── app/                 # Pantallas (file-based routing)
│   ├── components/          # Componentes React organizados por feature
│   ├── services/            # Servicios (API, AI, tracking, market data)
│   ├── store/               # Estado global (Zustand)
│   ├── types/               # Tipos TypeScript
│   └── config/              # Configuración y pesos aprendidos
├── backend/                 # API REST (Express + Prisma)
│   ├── src/
│   │   ├── controllers/     # Handlers de endpoints
│   │   ├── services/
│   │   │   ├── external/    # APIs externas (20+ servicios)
│   │   │   ├── prediction/  # Cálculo y predicciones (7 servicios)
│   │   │   └── ml/          # Machine Learning avanzado (9 servicios)
│   │   ├── routes/          # Definición de rutas
│   │   └── repositories/    # Acceso a datos (Prisma)
│   ├── prisma/              # Schema de base de datos
│   └── scripts/             # Scripts de mantenimiento y diagnóstico
├── python/                  # Servidor ML (Gradient Descent + Clasificador)
│   ├── src/
│   │   ├── config/          # Configuración
│   │   ├── models/          # Optimizador, pérdida y clasificador de activos
│   │   └── utils/           # Utilidades
│   ├── server.py            # Servidor HTTP (puerto 8765)
│   └── main.py              # CLI de entrenamiento
└── CHANGELOG.md             # Historial de cambios
```

---

## 🚀 Inicio Rápido

### Requisitos previos

- Node.js 18+
- Python 3.10+
- npm o yarn

### Instalación

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

### Los 11 Factores

| # | Factor | Descripción |
|---|--------|-------------|
| 1 | **Trend** | Tendencias de precio y momentum (30d, 90d, volatilidad) |
| 2 | **Technical** | SMA, EMA, RSI, MACD, Bollinger, Cruces Dorado/Mortal |
| 3 | **Sentiment** | StockTwits, Reddit, Fear & Greed, VIX, Put/Call Ratio |
| 4 | **News** | Yahoo News, earnings calendar, acciones de analistas |
| 5 | **Macro** | CPI, GDP, NFP, PMI, tasas de bancos centrales |
| 6 | **Competitors** | Rendimiento relativo vs sector y competidores |
| 7 | **Forex** | Impacto de divisas en activos internacionales |
| 8 | **Institutional** | COT Report, flujos ETF, Dark Pools, ownership |
| 9 | **Seasonality** | Festivos, eventos comerciales, patrones estacionales |
| 10 | **Financials** | Ingresos, márgenes, P/E, deuda, rating analistas |
| 11 | **Expectations** | EPS surprise, revisiones de analistas, beat rate |

### Machine Learning

El sistema utiliza un **ensemble de 7 modelos dinámicos** que se activan según los datos disponibles:

| Modelo | Propósito | Se activa cuando... |
|--------|-----------|---------------------|
| **Global** | Base por timeframe | Siempre (con trend o technical) |
| **Symbol** | Historial específico del símbolo | Hay datos de trend |
| **Regime** | Ajuste por régimen de mercado | Hay datos técnicos |
| **Momentum** | Prioriza tendencias fuertes | Hay trend + technical |
| **Mean Reversion** | Modelo contrarian | Hay technical |
| **Fundamental** | Análisis fundamental | Hay financials + (macro/expectations) |
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

