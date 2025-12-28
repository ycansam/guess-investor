# Changelog - Guess Investor

**Última actualización:** 28 de diciembre de 2025  
**Versión:** `1.3.0`  
**Commit actual:** `590e536`

---

## [1.3.0] - 28 de diciembre de 2025

### 📝 Commits Principales

```
590e536 - actualizados readmes [develop]
27aa153 - fixed some services [develop]
00464ac - añadido factor confianza en base a prediccion IA [develop]
5b45e6a - fixed color error [develop]
f8cfe36 - fixed some services [develop]
73be218 - añadido prioridad media [develop]
13e924d - integrada python [develop]
ddda123 - fixeada migracion prioridad alta [develop]
adfc636 - fixed prediccions como original [develop]
a3dcdb2 - migrados 11 factores de back [develop]
93bc24b - fixeada pestaña graficos [develop]
e17fbbe - fixed predictions [develop]
106f402 - fixed grafico [develop]
f67f268 - movidas predicciones al backend y etc [develop]
91d0441 - migracion back [develop]
```

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
- `finviz.service.ts` - Target prices, short interest
- `options.service.ts` - Put/Call ratio, flow
- `dark-pools.service.ts` - Dark pool activity
- `cot-report.service.ts` - COT Report (CFTC)
- `etf-flows.service.ts` - Flujos de ETFs
- Y 10+ más...

#### Servicios Prediction (7)
- `calculator.service.ts` - Motor principal con 11 factores
- `asset-adjustment.service.ts` - Ajustes por activo (TSLA, NVDA, crypto)
- `accuracy-predictor.service.ts` - Predice accuracy esperado
- `confidence-calibration.service.ts` - Calibra confianza vs accuracy real
- `uncertainty-analysis.service.ts` - Detecta condiciones de incertidumbre
- `ensemble.service.ts` - Combina múltiples modelos
- `track-record.service.ts` - Historial de performance por símbolo

### 🧠 ML Avanzado (6 nuevos servicios)

#### Reinforcement Learning Service
- **Q-Learning** para decidir CUÁNDO predecir
- Acciones: skip, predict_low, predict_medium, predict_high
- Persistencia de Q-Table en base de datos (MLModelState)
- ε-greedy policy con exploración decreciente

#### Factor Correlation Service
- Detecta **sinergias** entre factores (technical+trend, sentiment+news)
- Penaliza **conflictos** y **redundancias**
- Ajusta confianza automáticamente
- Coherence bonus / Conflict penalty

#### Temporal Cross-Validation Service
- **Walk-forward validation**
- Out-of-sample testing
- **Detección de overfitting**
- Métricas de degradación y estabilidad

#### Meta-Learning Service
- **MAML-inspired** few-shot learning
- Adaptación rápida para nuevos símbolos (2-5 datos)
- Transfer learning entre activos similares
- Perfiles de símbolo aprendidos

#### Probabilistic Model Service
- **Distribuciones de probabilidad** en lugar de puntos
- Intervalos de confianza (50%, 80%, 95%)
- 7 escenarios con probabilidades (crash → rally)
- Métricas: expected value, median, mode, std, skew

#### Feature Engineering Service
- Features derivados automáticos
- Momentum, volatility, cross-factor features
- Temporal features (day of week, etc.)
- Divergencias y señales de agotamiento

### 📡 Nuevos Endpoints

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

### 🗄️ Base de Datos

#### Nuevo modelo MLModelState
- Persiste estados de modelos ML
- Campos: modelType, version, stateJson
- Soporta RL Q-Tables, Meta-Learning profiles, etc.

### 📊 Integración en Calculator

El `calculator.service.ts` ahora integra:
- Factor correlation adjustment (sinergias/conflictos)
- Probabilistic predictions (distribuciones)
- Reinforcement Learning (ajuste de confianza)

---

## [1.2.0] - 26 de diciembre de 2025

### Competitors Avanzado (Cobertura: 65% → 85%)

#### Nuevas Métricas por Competidor
- **Revenue (Ingresos)** - Total Revenue TTM para calcular cuota de mercado
- **Revenue Growth** - Crecimiento de ingresos YoY %
- **Profit Margins** - Margen neto, bruto y operativo
- **ROE/ROA** - Return on Equity y Return on Assets
- **Debt to Equity** - Ratio de apalancamiento
- **Beta** - Volatilidad vs mercado

#### Market Share Analysis (NUEVO)
- **Cuota de mercado estimada** basada en revenue del grupo de competidores
- **Ranking por ingresos** - Posición de la empresa vs peers
- **Revenue vs Sector Average** - Comparación con el promedio

#### Profitability Analysis (NUEVO)
- **Profit Margin vs Sector** - Comparación de márgenes
- **ROE vs Sector** - Rentabilidad sobre equity comparativa
- **Bonus por alta rentabilidad** (+8 puntos al score)

#### Growth Analysis (NUEVO)
- **Revenue Growth vs Sector** - Diferencia en puntos porcentuales
- **Identificación de fast-growers** - Empresas que crecen más rápido
- **Bonus por alto crecimiento** (+7 puntos al score)

#### Relative Strength (NUEVO)
- **RS Rating** - Fuerza relativa: strong/average/weak
- **Momentum Detection** - Acelerando/Desacelerando/Estable
- **RS semanal y mensual** vs promedio del sector

### Asset-Specific Adjustments (NUEVO)

#### Servicio de Ajustes por Activo
- **Nuevo archivo**: `asset-adjustment-service.ts`
- **Ajustes predefinidos** para activos problemáticos (TSLA, NVDA, AMD, crypto, meme stocks)
- **Escalado de magnitud** - Reduce predicciones exageradas (ej: TSLA al 55%)
- **Sesgo direccional** - Corrección de tendencia sistemática (ej: -0.5% para TSLA)
- **Escalado de confianza** - Reduce confianza para activos volátiles

#### Ajustes Predefinidos
| Activo | Magnitud | Sesgo | Confianza | Razón |
|--------|----------|-------|-----------|-------|
| TSLA | 55% | -0.5% | 85% | Alta volatilidad, predicciones exageradas |
| NVDA | 60% | -0.3% | 88% | Volatilidad por IA/chips |
| AMD | 65% | -0.2% | 90% | Similar a NVDA |
| BTC-USD | 70% | 0% | 80% | Crypto altamente volátil |
| ETH-USD | 70% | 0% | 82% | Crypto |
| GME | 50% | 0% | 70% | Meme stock extremo |
| AMC | 50% | 0% | 70% | Meme stock |
| PLTR | 60% | -0.2% | 85% | Alto momentum/retail |
| COIN | 60% | -0.2% | 80% | Exposición crypto |
| MSTR | 55% | 0% | 75% | Bitcoin treasury |

#### Auto-Learning
- **EMA con α=0.2** - Suaviza estadísticas aprendidas
- **Mínimo 5 muestras** antes de aplicar ajustes aprendidos
- **Persistencia** en AsyncStorage
- **Integración con verificación** - Aprende de cada predicción verificada

### Datos Dinámicos - Mayor Cobertura de Factores

#### Competitors Dinámico
- **Detección automática de competidores** usando Yahoo Finance sector/industry
- **Sin necesidad de mapeos manuales** para nuevas empresas
- **Descubrimiento por industria** - Peers detectados automáticamente por sector
- **Fallback a ETF sectorial** si no se encuentran peers específicos
- **Cache de 1 hora** para perfiles de empresas

#### Macro con FRED API (Cobertura: 40% → 80%)
- **Integración con Federal Reserve Economic Data API** para datos US en tiempo real
- **Indicadores dinámicos**: CPI (inflación), Unemployment Rate, Fed Funds Rate, Treasury Yields
- **Curva de rendimiento** - Detecta inversiones (predictor de recesión)
- **Consumer Sentiment** como proxy de PMI
- **Fallback automático** a datos estáticos si API no disponible
- Nuevo archivo: `fred-api-service.ts`

#### Forex Dinámico (Cobertura: 65% → 80%)
- **Exposición FX por sector** inferida desde Yahoo Finance assetProfile
- **Patrones por industria**: Technology, Healthcare, Automotive, Energy, Consumer, etc.
- **Volatilidad FX calculada** - Desviación estándar anualizada de pares de divisas
- **15+ nuevas empresas** con exposiciones específicas

#### Competitors (50% → 65%)
- Comparación de ratios P/E (trailing y forward)
- Market Cap comparativo y ranking
- 50+ empresas nuevas mapeadas (AMD, INTC, TSM, BAC, GS, V, MA, etc.)

#### Seasonality (60% → 70%)
- **Patrón histórico por acción** - Analiza rendimiento del mismo período los últimos 3 años
- Consistencia y dirección (bullish/bearish/neutral)
- Nuevo método `analyzeSeasonalityWithHistory()`

#### Financials (65% → 75%)
- Free Cash Flow y Operating Cash Flow
- Total Cash, Total Debt, Net Debt
- FCF Margin calculado

### Mejoras de UI/UX

#### Tooltip del Gráfico Mejorado
- **Fecha y hora** en el tooltip al mantener pulsado sobre el gráfico
- **Indicador (Pred)** para distinguir puntos de predicción vs históricos
- **Borde de color diferenciado** - Morado para predicción, índigo para histórico
- Propiedades `timestamp` e `isPrediction` en datos del gráfico

---

## [Unreleased]

_Próximas mejoras pendientes de release_

---

## [1.1.0] - 25 de diciembre de 2025

### Nueva Navegación y UI
- **Sistema de 3 pestañas** (`a115d41`) - Favoritos, Explorar y Predicciones como pestañas principales
- **Pestaña Favoritos** - Lista de activos marcados como favoritos con acceso rápido
- **Pestaña Explorar** - Buscador dinámico con +120 activos organizados por categorías
- **Buscador con debounce** - Búsqueda en tiempo real sin perder foco del input

### Gráficos Interactivos con Predicciones
- **Gráficos históricos** (`b157fcf`) - Integración de react-native-gifted-charts
- **Predicción visual** (`48d1fdd`) - Línea de predicción superpuesta al histórico
- **3 Timeframes** - Intradía (1 día), Swing (4 días), Largo Plazo (15-90 días)
- **Tooltips interactivos** - Precio en EUR al tocar cualquier punto del gráfico
- **Leyenda visual** - Histórico (verde) vs Predicción (morado punteado)

### Conversión a Euros
- **Precios en EUR** - Todos los precios convertidos a euros usando tipos de cambio en tiempo real
- **Currency Service** - Integración con Yahoo Finance para tipos de cambio actualizados
- **Fallback rates** - Tipos de cambio predefinidos si falla la API

### Nuevos Activos - Categoría Commodities
- **Oro Físico** (`GC=F`) - Futuros de oro
- **Plata Física** (`SI=F`) - Futuros de plata
- **Mineras de oro** - Newmont (NEM), Barrick Gold (GOLD), Franco-Nevada (FNV), Wheaton Precious (WPM)
- **ETFs de minería** - GDX (Gold Miners), GDXJ (Junior Gold Miners)
- **Energía** - Petróleo Crudo (CL=F), Gas Natural (NG=F)

### Correcciones
- **Fix gráficos intradía** (`d54cad0`) - Etiquetas de días corregidas, predicción inicia desde fecha actual
- **Fix verificación predicciones** (`6114015`) - Arreglado bug que impedía verificar predicciones completadas
- **Optimización fetching** (`190b602`) - Carga de datos reducida a menos de 1 segundo
- **Fix cache** (`d4326f7`) - Corregido manejo de cache de predicciones

---

## [1.1.0] - 22 de diciembre de 2025

### Nuevo Sistema de Machine Learning
- **Red Neuronal MAML** (`cd2da08`) - Implementación de Model-Agnostic Meta-Learning para aprendizaje por activo
- **Red Neuronal Base** (`af0303d`) - Arquitectura de red neuronal para predicciones
- **Skip Predicciones** (`b0ae53b`) - Lógica para omitir predicciones en alta incertidumbre
- **Calibración de Confianza** (`0d0622c`) - Sistema mejorado de calibración del nivel de confianza
- **Factores de Incertidumbre** (`ac170e9`) - Análisis de incertidumbre antes de predecir
- **Optimizador de Pesos** (`f4f39bb`) - Optimización automática de pesos por factor
- **Pasos por Símbolo** (`86b3725`) - Tracking de entrenamiento por activo individual
- **ML Learning System** (`d583949`) - Sistema completo de aprendizaje automático
- **Indicador de Estabilidad** (`4bc0bc5`) - Métricas de estabilidad del modelo
- **Clasificador de Activos** (`6cea18d`) - Clasificación automática de tipos de activos

### Yahoo V8 Extended
- **Dividendos** (`11cbc1a`) - Extracción de dividend yield desde Yahoo V8 (sin auth)
- **Volatilidad Calculada** - Volatilidad anualizada de 30 días
- **Nombre Completo** - longName/shortName del activo
- **Métricas Derivadas** - Distancia a 52w high/low

### Correcciones
- **Fix Ordenación** (`53e9143`) - Corregida ordenación en MarketPredictions
- **Fix Datos** (`11cbc1a`) - Arreglados factores que mostraban 0 o N/D

---

## Funcionalidades Implementadas

| Commit | Fecha | Funcionalidad |
|--------|-------|---------------|
| `d54cad0` | 25/12/2025 | **Fix gráficos** - Corregidas etiquetas de días en gráfico intradía, predicción inicia desde fecha actual |
| `a115d41` | 25/12/2025 | **Nueva navegación** - 3 pestañas (Favoritos/Explorar/Predicciones), buscador dinámico con +120 activos, categorías horizontales, infinite scroll con batching |
| `6d38c50` | 24/12/2025 | **Info predicción en chart** - Panel de información de predicción integrado en gráfico |
| `190b602` | 24/12/2025 | **Optimización fetching** - Carga de datos reducida a <1 segundo con cache mejorado |
| `d4326f7` | 24/12/2025 | **Fix cache** - Corregido manejo de cache de predicciones |
| `6114015` | 24/12/2025 | **Fix verificación** - Arreglado bug que impedía verificar predicciones completadas |
| `48d1fdd` | 23/12/2025 | **Gráfico con predicción** - Línea de predicción superpuesta al histórico con estilos diferenciados |
| `a7d39b9` | 23/12/2025 | **Migración gráfico** - Migrado a react-native-gifted-charts |
| `b157fcf` | 23/12/2025 | **Gráficos interactivos** - Página de detalle de activo con gráficos históricos y tooltips |
| `1cffc8e` | 21/12/2025 | **Sistema de Accuracy Scoring** - Nuevo sistema de puntuación que considera precisión del cambio porcentual, no solo dirección. Score 0-100 con clasificación: Excellent (75-100), Good (50-75), Poor (25-50), Failed (0-25) |
| `1cffc8e` | 21/12/2025 | **Mejoras de contraste** - Modal de análisis individual con mejor contraste: fondos más oscuros, textos más brillantes (#818cf8), labels #9ca3af |
| `1cffc8e` | 21/12/2025 | **Modal full screen** - Tracking de predicciones ahora ocupa toda la pantalla para mejor visualización |
| `1cffc8e` | 21/12/2025 | **Botón Recalcular Scores** - Migración automática de predicciones antiguas al nuevo sistema de scoring |
| `bf57c55` | 21/12/2025 | **Eliminados Alerts** - Removidos todos los Alert.alert() de la app (19 instancias), UX más fluida sin popups |
| `9b693ba` | 20/12/2025 | **Modal análisis individual** - Botón 🔍 en cada predicción cached muestra análisis completo con 11+ factores, precios, métricas, audit trail |
| `5d7c5e3` | 19/12/2025 | **Eliminado ChatView** - Consolidada UI removiendo pestaña de chat, focus en predicciones |
| `d43dcd2` | 18/12/2025 | **Ordenación en Predicciones** - Ordenar por precio (€↑/↓) o cambio (%↑/↓), conversión EUR consistente |
| `fbded15` | 18/12/2025 | **Confianza consistente** - Predicciones usan predictionCalculatorService real en vez de fórmula simplificada |
| `2d00b35` | 18/12/2025 | **Modo Eliminar** - Selector Predict/Delete, eliminar predicciones seleccionadas de la cache |
| `e90ee9a` | 18/12/2025 | **Cache persistente** - Predicciones guardadas en AsyncStorage, persisten entre recargas |
| `e90ee9a` | 18/12/2025 | **Pestaña Predicciones** - Nueva pestaña "Predic." para entrenar IA con predicciones por timeframe |
| `98d8ac5` | 18/12/2025 | **Sistema ML Python** - Servidor HTTP para entrenamiento, arquitectura modular (config/, models/, utils/), gradiente descendente con momentum |
| `aaf764f` | 18/12/2025 | **Auto-aprendizaje** - weight-optimizer-service.ts, integración automática con servidor Python, pesos aprendidos en AsyncStorage |
| `a84de4e` | 18/12/2025 | **Verificación por cierre de mercado** - Predicciones se verifican al cierre (22:00 acciones, 23:00 crypto), uso de precio de cierre |
| `a84de4e` | 18/12/2025 | **UI Predicciones Pendientes** - Nueva sección mostrando tiempo hasta cierre, estado por activo, badges de color |
| `5c61882` | 18/12/2025 | **Scripts de inicio** - start-all.bat para ejecutar Python + Expo juntos, comandos npm para servidor |
| `5c61882` | 18/12/2025 | **Documentación** - README.md en root con descripción completa, CHANGELOG movido a root |
| `f35ac1b` | 16/12/2025 | **Versión destacada** - Todos los 11 factores funcionando, Yahoo V8 API (gratis/ilimitado), soporte símbolos europeos |
| `a9e2905` | 16/12/2025 | Añadido resultados financieros, expectativas y async storage, web scraping |
| `1f0a1d0` | 16/12/2025 | Fix: Ticker GPS → GAP (Gap Inc delistado) |
| `a0d6cd0` | 16/12/2025 | Changelog actualizado |
| `486ceab` | 15/12/2025 | Fix: Pesos normalizados en fórmula de auditoría |
| `cdfe4d6` | 15/12/2025 | **Factor Macro mejorado** - CPI (Inflación), GDP (PIB), NFP (Empleo), PMI (Manufacturing/Services), Tasas bancos centrales (Fed/BCE/BoE/BoJ/PBOC), Ciclo económico, Eventos económicos próximos |
| `c7080c6` | 15/12/2025 | **Factor Expectations mejorado** - Revenue Surprise (real vs estimado), Revisiones de analistas (7d/30d/90d trends), Fecha próximos earnings con riesgo, Beat Rate histórico, Whisper numbers |
| `07b2853` | 15/12/2025 | **Factor Institutional mejorado** - COT Report (Commitment of Traders), Flujos ETFs del sector, Dark Pools (short volume, acumulación/distribución), Block trades |
| `ec4eb4e` | 15/12/2025 | **Factor News mejorado** - Eventos corporativos (earnings calendar, dividendos, splits, M&A), Acciones de analistas (upgrades/downgrades), Detección de eventos regulatorios (SEC, FDA, FTC, DOJ, EU, antitrust) |
| `fd79316` | 15/12/2025 | **Factor Sentiment mejorado** - VIX Index, Put/Call Ratio (CBOE SPX), indicadores institucionales en UI |
| `91a22e9` | 15/12/2025 | Fix: discrepancia entre % cambio del chat y tarjeta de predicción + tabla cobertura changelog |
| `1a01ef4` | 15/12/2025 | **Factor de Indicadores Técnicos** (SMA 20/50/200, EMA 12/26, RSI 14, MACD, Bandas de Bollinger, Análisis de Volumen, Cruces Dorado/Mortal) |
| `0be2753` | 15/12/2025 | Eliminado temporadas (estaciones del año) del factor seasonality |
| `f74ebc7` | 15/12/2025 | Changelog actualizado con funcionalidades implementadas |
| `d1b1a21` | 15/12/2025 | Predicción determinista y sin rangos de precio (precio objetivo único) |
| `96d002b` | 15/12/2025 | Explicación más detallada en las predicciones |
| `d0a7fb6` | 14/12/2025 | Correcciones de confianza basada en factores existentes |
| `8d52e02` | 14/12/2025 | Eventos por países a nivel global |
| `0d09872` | 14/12/2025 | Factor de festivos y días importantes por países |
| `7e54d7a` | 14/12/2025 | Factor de grandes inversores institucionales |
| `421a82d` | 14/12/2025 | Factor Forex y valor de la moneda de la empresa |
| `9261367` | 14/12/2025 | Factor de competencia y sector |
| `a0d4ac6` | 14/12/2025 | Fix en sumatorio de factores |
| `fae9542` | 14/12/2025 | Factor de noticias |
| `9c5a736` | 14/12/2025 | Predicción basada en confianza |
| `582a22e` | 14/12/2025 | Fix datos reales |
| `ecbb155` | 14/12/2025 | Fix predicciones sin datos |
| `7fa52de` | 14/12/2025 | Factor de expectativas de mercado |
| `a9047e1` | 14/12/2025 | Fecha de inicio de predicción |
| `50eeffb` | 14/12/2025 | IndexedDB funcionando con eliminación, fix Xiaomi y monedas |
| `e5893b7` | 13/12/2025 | Persistencia con IndexedDB |
| `9c108ad` | 11/12/2025 | Helpers de utilidad |
| `eb4decf` | 11/12/2025 | Separación de función de cálculo |
| `0dc4b93` | 11/12/2025 | Header separado en componente |
| `a0be338` | 11/12/2025 | División de componentes |
| `8e9fa95` | 11/12/2025 | Separación en componentes |
| `e1bcad8` | 11/12/2025 | Factor de resultados financieros |
| `b121f18` | 11/12/2025 | Modificación de card de predicción |
| `1026e52` | 10/12/2025 | IA funcionando rápido y determinista |
| `b9d0a5d` | 10/12/2025 | Uso exclusivo de Yahoo Finance |
| `3abaedd` | 09/12/2025 | Pantalla Home |
| `3f090d6` | 09/12/2025 | Modelo en .env |
| `6668d47` | 09/12/2025 | Prompt en .env |
| `596dae9` | 09/12/2025 | Refactor v2 Finnhub |
| `5d3a8ec` | 09/12/2025 | Refactorizado Finnhub |
| `6e4e3fb` | 09/12/2025 | Escalabilidad en finnhub-service |
| `fe37485` | 09/12/2025 | Primera versión funcionando |
| `3ccf626` | 09/12/2025 | Primera versión working |
| `8af53f1` | 08/12/2025 | Proyecto reseteado |
| `bb43dbc` | 08/12/2025 | Proyecto inicial |

---

## Sistema de Accuracy Scoring (Nuevo 21/12/2025)

### Problema Resuelto
El sistema antiguo solo verificaba si la predicción acertó la **dirección** (subir/bajar), pero ignoraba la precisión del cambio porcentual. Por ejemplo:
- ❌ **ANTES**: Predice +3%, sube +0.2% → ✅ CORRECTO (100%)
- ✅ **AHORA**: Predice +3%, sube +0.2% → 53/100 POOR ⚠️

### Nuevo Sistema de Puntuación (0-100)

```
AccuracyScore = DirectionScore (50pts) + ChangeScore (50pts)
```

**ChangeScore**: Basado en qué % del cambio predicho se cumplió
```typescript
fulfillmentRatio = |actualChange| / |predictedChange|
changeScore = min(100, fulfillmentRatio * 100) * 0.5
// Penalización si el exceso es >150%
```

### Clasificación de Calidad

| Score | Calidad | Emoji | Significado |
|-------|---------|-------|-------------|
| 75-100 | Excellent | 🎯 | Dirección correcta + cambio muy preciso |
| 50-74 | Good | 👍 | Dirección correcta pero cambio impreciso |
| 25-49 | Poor | ⚠️ | Cambio muy impreciso |
| 0-24 | Failed | ❌ | Dirección incorrecta o totalmente errado |

### Nuevas Métricas UI

- **Score Medio**: Promedio de accuracy scores (0-100)
- **Panel de Calidad**: Distribución en 4 categorías (Excelentes/Buenas/Pobres/Fallidas)
- **Historial Individual**: Cada predicción muestra score + emoji de calidad
- **Botón Recalcular**: Migración automática de predicciones antiguas

---

## Sistema de Machine Learning (18/12/2025)

### Arquitectura

```
python/
├── server.py              # Servidor HTTP (localhost:8765)
├── main.py                # CLI para entrenamiento manual
└── src/
    ├── config/settings.py # Configuración central
    ├── models/
    │   ├── optimizer.py   # Gradiente descendente con momentum
    │   └── loss_function.py
    └── utils/
        ├── data_loader.py
        └── file_utils.py
```

### Función de Pérdida

```
Loss = α·DirectionLoss + β·MagnitudeLoss + γ·RangeLoss
```

| Componente | Peso | Descripción |
|------------|------|-------------|
| DirectionLoss | α=0.5 | Penaliza errores de dirección (sube/baja) |
| MagnitudeLoss | β=0.35 | Penaliza errores en magnitud del cambio |
| RangeLoss | γ=0.15 | Penaliza si precio real fuera del rango predicho |

### Endpoints del Servidor

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/status` | GET | Estado del servidor |
| `/weights` | GET | Pesos actuales aprendidos |
| `/predictions` | POST | Recibir predicciones de la app |
| `/train` | POST | Ejecutar entrenamiento |

### Verificación de Predicciones

| Tipo de Activo | Hora de Cierre | Cuándo Verificar |
|----------------|----------------|------------------|
| Acciones (NYSE/NASDAQ) | 16:00 ET | Después de 22:00 hora local |
| Crypto | 24/7 | Después de 23:00 hora local |

---

## Resumen de Factores de Predicción (11)

| # | Factor | Descripción |
|---|--------|-------------|
| 1 | **Trend** | Análisis de tendencias de precio y momentum histórico (cambios 30d, 90d, volatilidad) |
| 2 | **Technical** | **NUEVO** - Indicadores técnicos: SMA (20/50/200), EMA (12/26), RSI 14, MACD, Bandas de Bollinger, Volumen, Cruces Dorado/Mortal |
| 3 | **Sentiment** | Sentimiento de mercado: StockTwits, Reddit, Fear & Greed, **VIX Index**, **Put/Call Ratio** (CBOE SPX) |
| 4 | **News** | Impacto de noticias: Yahoo Finance, **Eventos corporativos** (earnings calendar, dividendos, splits), **Acciones de analistas** (upgrades/downgrades), **Detección regulatoria** (SEC, FDA, FTC, DOJ, EU, antitrust) |
| 5 | **Macro** | Indicadores macroeconómicos: índices regionales, tipos de interés, VIX, commodities, **CPI (Inflación)**, **GDP (PIB)**, **NFP (Empleo)**, **PMI**, **Tasas bancos centrales** (Fed/BCE/BoE/BoJ/PBOC), **Ciclo económico**, **Eventos económicos próximos** |
| 6 | **Competitors** | Contexto relativo frente a competidores y sector: rendimiento comparativo |
| 7 | **Forex** | Efectos de movimientos de divisas sobre activos internacionales |
| 8 | **Institutional** | Movimientos de grandes inversores: ownership, insiders, top holders, **COT Report** (posiciones futuros), **Flujos ETFs** del sector, **Dark Pools** (short volume, acumulación/distribución) |
| 9 | **Seasonality** | Festivos por país, eventos comerciales (Black Friday, Buen Fin), patrones históricos (Rally Santa Claus, Sell in May) |
| 10 | **Financials** | Resultados financieros: ingresos, márgenes, deuda, P/E, rating analistas, precio objetivo |
| 11 | **Expectations** | Expectativas de mercado: **earnings surprise** (EPS + Revenue), **revisiones de analistas** (7d/30d/90d), EPS estimado, **fecha próximos earnings**, **beat rate** histórico |
---

## Cobertura por Factor

| Factor | Implementado | Pendiente | % |
|--------|-------------|-----------|---|
| **Trend** | Cambios 30d/90d/1Y, volatilidad | - | 100% |
| **Technical** | SMA 20/50/200, EMA 12/26, RSI 14, MACD, Bollinger, Volumen, Golden/Death Cross | Patrones chartistas, soportes/resistencias | ~85% |
| **Sentiment** | StockTwits, Reddit, **Fear & Greed Index** (crypto con histórico), **VIX Index**, **Put/Call Ratio (CBOE SPX)** | Short interest (requiere API FINRA pagada), Twitter/X (requiere API pagada) | ~75% |
| **News** | Yahoo News + análisis keywords, **Earnings calendar**, **Dividendos**, **Acciones de analistas** (upgrades/downgrades), **Detección de eventos regulatorios** (SEC, FDA, FTC, DOJ, EU, antitrust) | Splits históricos, M&A rumores | ~70% |
| **Macro** | Índices regionales, bonos 10Y, VIX, commodities, **CPI (Inflación)**, **GDP (PIB)**, **NFP (Empleo)**, **Tasas Fed/BCE/BoE/BoJ/PBOC**, **PMI (Manufacturing/Services)**, **Ciclo económico**, **Eventos económicos próximos**, **FRED API (datos US en tiempo real)** | - | ~80% |
| **Competitors** | Rendimiento vs 50+ empresas mapeadas, **P/E ratio vs sector**, **Market Cap ranking**, valoración relativa, **Detección dinámica de peers**, **Market Share Analysis**, **Profitability Analysis (Margins/ROE)**, **Growth Analysis**, **Relative Strength** | - | ~85% |
| **Forex** | **Exposición dinámica por sector/industria** (obtiene perfil de Yahoo Finance y genera exposiciones automáticas), 25+ empresas con mapeo específico, volatilidad FX anualizada, nivel de riesgo cambiario | Correlación histórica stock-forex | ~80% |
| **Institutional** | % ownership, tendencia, insiders, top 5 fondos, **COT Report** (especuladores vs comerciales), **Flujos ETFs** (sector vs mercado), **Dark Pools** (short volume, acumulación/distribución, block trades, volumen inusual) | 13F filings SEC detallados | ~85% |
| **Seasonality** | 50+ eventos para 20+ países, patrones globales, **patrones históricos por acción específica** (performance mismo período 3 años), **ajuste score por consistencia histórica** | - | ~70% |
| **Financials** | Ingresos, márgenes, EPS, P/E, deuda, ROE, rating analistas, **FCF (Free Cash Flow)**, **Operating Cash Flow**, **Total Cash/Debt**, **Net Debt**, **FCF Margin** | CAPEX detallado, balance trimestral | ~75% |
| **Expectations** | EPS surprise histórico, **Revenue surprise**, **Revisiones analistas** (7d/30d/90d), EPS/Revenue estimados, **Fecha próx. earnings**, **Beat rate**, **Riesgo earnings**, **Whisper numbers** | Guidance management | ~80% |

### Empresas con Competidores Mapeados (v1.2)

| Sector | Empresas |
|--------|----------|
| **Tech Big** | AAPL, MSFT, GOOGL, META, AMZN, NVDA |
| **Semiconductores** | AMD, INTC, TSM, ASML, LRCX, AMAT |
| **Software/Cloud** | CRM, ADBE, ORCL, SAP.DE |
| **Banca USA** | JPM, BAC, GS, MS, WFC |
| **Banca EU** | SAN.MC, BBVA.MC, BNP.PA |
| **Pagos** | V, MA, PYPL, SQ |
| **Healthcare** | JNJ, PFE, LLY, UNH, CVS, CI, MRK, NVO |
| **Consumer** | PG, KO, PEP, MCD, NKE, WMT, COST, HD |
| **Streaming** | NFLX, DIS, WBD |
| **Energía** | XOM, CVX, COP, REP.MC, IBE.MC |
| **Autos** | TSLA, F, GM |
| **Mineras** | NEM, GOLD, AEM, FNV |
| **Lujo EU** | MC.PA, KER.PA, RMS.PA, OR.PA |
| **Industrial** | BA, LMT, RTX, SIE.DE, GE, HON |
| **Crypto** | BTC-USD, ETH-USD, SOL-USD |
| **Asia** | 1810.HK (Xiaomi), 005930.KS (Samsung) |

### Servicios Integrados (v1.2)

| Servicio | Factor | Descripción |
|----------|--------|-------------|
| `dark-pools-service.ts` | Institutional | Detecta acumulación/distribución institucional oculta, short volume ratio, block trades |
| `cot-report-service.ts` | Institutional | Posiciones de especuladores vs comerciales (Commitment of Traders) |
| `etf-flows-service.ts` | Institutional | Flujos de dinero a ETFs sectoriales, rotación sectorial |
| `fear-greed-service.ts` | Sentiment | Fear & Greed Index para crypto (0-100 con histórico) |

### APIs/Fuentes de Datos

| Fuente | Uso |
|--------|-----|
| **Yahoo Finance V8 Chart API** | **GRATIS e ILIMITADO** - Precios en tiempo real, históricos, OHLCV, medias móviles (50d/200d), volumen |
| **Yahoo Finance quoteSummary (RapidAPI)** | Fundamentales, institucional, earnings, **calendarEvents** (earnings dates, dividendos), **upgradeDowngradeHistory** (acciones de analistas), **earningsHistory** (EPS surprise histórico), **earningsTrend** (revisiones de analistas 7d/30d/90d, estimaciones EPS/Revenue), **earnings** (revenue trimestral) |
| **Yahoo Finance Options** | Datos de opciones para **análisis de dark pools** (put/call ratio, open interest, volumen inusual) |
| **Yahoo Finance Search** | Noticias |
| **Yahoo Finance VIX** | Índice de volatilidad VIX (indicador de miedo), **estimación de posiciones COT** |
| **CBOE Options API** | Put/Call Ratio de opciones SPX (indicador institucional) |
| **ETFs Sectoriales** | Flujos de **SPY, QQQ, XLK, XLF, XLE, XLV, XLY, SMH, GDX, EZU, VGK, FEZ**, etc. para detectar rotación sectorial |
| **StockTwits API** | Sentimiento USA/crypto |
| **Reddit JSON** | Sentimiento social (r/wallstreetbets, r/stocks) |
| **Alternative.me** | Fear & Greed Index (crypto) con histórico 30 días |
| **Datos económicos hardcoded** | **CPI, GDP, NFP, PMI, Tasas bancos centrales** (actualizados con datos oficiales de BLS, BEA, Fed, BCE, BoE, NBS) |
| **Datos hardcoded** | Competidores, exposición forex, eventos estacionales, **mapeos stock-futuros para COT** (incluye EURO STOXX 50), **calendario eventos económicos** |

### Optimizador ML (v1.2)

| Característica | Descripción |
|----------------|-------------|
| **Algoritmo** | Adam optimizer (antes SGD+Momentum) |
| **Learning Rate** | 0.001 (adaptativo por parámetro) |
| **Bias Correction** | ✅ Corrige sesgo en primeras iteraciones |
| **Time Decay** | Predicciones recientes pesan más (half-life 180 días) |
| **Loss Function** | 35% dirección + 25% magnitud + 10% rango + 30% accuracy score |
| **Pesos por Volatilidad** | Ajuste dinámico según volatilidad del activo (low/medium/high) |

---

## Commodities Soportados (v1.2)

| Categoría | Símbolos |
|-----------|----------|
| **Futuros** | GC=F (oro), SI=F (plata), CL=F (petróleo), NG=F (gas), PL=F (platino), PA=F (paladio), HG=F (cobre), ZC=F (maíz), ZW=F (trigo), ZS=F (soja) |
| **ETFs Commodities** | GLD, SLV, USO, UNG, DBA, DBC, PDBC, GSG, COMT |
| **Mineras Oro/Plata** | NEM, GOLD, FNV, WPM, AEM, KGC, AU, GDX, GDXJ, SIL, SILJ |

---

## Símbolos Europeos Soportados

| Mercado | Símbolos |
|---------|----------|
| **España (.MC)** | ITX, SAN, BBVA, TEF, IBE, REP, ACS |
| **Alemania (.DE)** | SAP, SIE, BMW, VOW3 |
| **Francia (.PA)** | MC (LVMH), OR (L'Oréal), TTE (TotalEnergies) |

---

## Historial de Reverts

### Revert del 15/12/2025

**Commits eliminados:** `021fec2`, `0bb2e15`, `ad4c022`, `6d95f7e`, `2a5a19b`

**Funcionalidades revertidas:**
- Safe JSON parsing con detección de rate limiting
- Rotación automática de proxies CORS
- Delay entre requests para evitar rate limiting
- Manejo de error cuando falla la predicción
