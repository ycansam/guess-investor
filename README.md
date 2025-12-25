# 🎯 Guess Investor

**Aplicación de predicción de inversiones con IA híbrida** que combina análisis cuantitativo en tiempo real con machine learning para generar predicciones de precios de activos financieros.

![React Native](https://img.shields.io/badge/React_Native-Expo-blue?logo=expo)
![Python](https://img.shields.io/badge/Python-ML_Server-green?logo=python)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Version](https://img.shields.io/badge/version-1.2.0-brightgreen)

---

## 📋 Descripción

Guess Investor analiza **11 factores** diferentes para cada activo financiero y genera predicciones de precio con niveles de confianza. La aplicación aprende de sus propios errores mediante un sistema de machine learning que ajusta los pesos de cada factor basándose en el historial de predicciones verificadas.

### ✨ Características principales

- 📊 **11 Factores de análisis**: Tendencia, Técnico, Sentimiento, Noticias, Macro, Competidores, Forex, Institucional, Estacionalidad, Financieros, Expectativas
- 🤖 **IA Híbrida**: Análisis determinista + Machine Learning adaptativo + **Red Neuronal MAML**
- 📈 **Datos en tiempo real**: Yahoo Finance V8 API (gratis e ilimitado) + **V8 Extended** (dividendos, volatilidad)
- 📉 **Gráficos interactivos**: Históricos + predicción visual con react-native-gifted-charts
- 💶 **Precios en EUR**: Conversión automática a euros con tipos de cambio en tiempo real
- 🎯 **Tracking de predicciones**: Verificación automática al cierre del mercado con **sistema de accuracy scoring**
- ⭐ **Sistema de favoritos**: Guarda tus activos preferidos para acceso rápido
- 🔍 **Buscador dinámico**: +120 activos organizados por categorías (Tech, Crypto, España, ETFs, Commodities...)
- 🧠 **Auto-aprendizaje**: El sistema mejora basándose en sus errores con **calibración de confianza** e **incertidumbre**
- 🌍 **Mercados globales**: NYSE, NASDAQ, Europa (.MC, .DE, .PA), Crypto, Commodities
- 📱 **UI moderna**: 3 pestañas (Favoritos/Explorar/Predicciones), gráficos con tooltips, infinite scroll

---

## 🏗️ Estructura del Proyecto

```
guess-investor/
├── code/                    # App React Native (Expo)
│   ├── app/                 # Pantallas (file-based routing)
│   ├── components/          # Componentes React
│   ├── services/            # Servicios (Yahoo, AI, tracking, ML)
│   ├── store/               # Estado global (Zustand)
│   ├── types/               # Tipos TypeScript
│   └── utils/               # Utilidades
├── python/                  # Servidor ML
│   ├── src/
│   │   ├── config/          # Configuración
│   │   ├── models/          # Optimizador y función de pérdida
│   │   └── utils/           # Utilidades
│   ├── server.py            # Servidor HTTP para la app
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

# Instalar dependencias de la app
cd code
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus API keys
```

### Ejecutar

**Opción 1: Todo junto (recomendado)**
```bash
cd code
.\start-all.bat
```

**Opción 2: Por separado**
```bash
# Terminal 1 - Servidor Python ML
cd python
python server.py

# Terminal 2 - App Expo
cd code
npm start
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

El sistema utiliza **gradiente descendente con momentum** para optimizar los pesos de cada factor:

```
Loss = α·DirectionLoss + β·MagnitudeLoss + γ·RangeLoss
```

Donde:
- **α = 0.5**: Importancia de acertar la dirección (sube/baja)
- **β = 0.35**: Importancia de acertar la magnitud del cambio
- **γ = 0.15**: Importancia de que el precio esté en el rango predicho

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

## 📊 APIs y Fuentes de Datos

| Fuente | Uso | Costo |
|--------|-----|-------|
| Yahoo Finance V8 | Precios, históricos, OHLCV | ✅ Gratis |
| Yahoo Finance (RapidAPI) | Fundamentales, institucional, earnings | 💰 Freemium |
| StockTwits | Sentimiento social | ✅ Gratis |
| Reddit JSON | r/wallstreetbets, r/stocks | ✅ Gratis |
| Alternative.me | Fear & Greed (crypto) | ✅ Gratis |
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

### Últimas actualizaciones (21/12/2025)
- ⭐ **Sistema de Accuracy Scoring**: Puntuación 0-100 considerando precisión del cambio
- 🎨 **Mejoras de contraste**: Modal de análisis con mejor legibilidad
- 📱 **Modal full screen**: Tracking ocupa toda la pantalla
- 🔕 **Sin popups**: Eliminados todos los Alert.alert para mejor UX
- 🔍 **Análisis individual**: Botón para ver análisis completo de cada predicción

