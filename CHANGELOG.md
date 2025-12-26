# Changelog - Guess Investor

**Última actualización:** 25 de diciembre de 2025  
**Versión:** `1.2.0`  
**Commit actual:** `d54cad0`

---

## [1.2.0] - 25 de diciembre de 2025

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
| **Macro** | Índices regionales, bonos 10Y, VIX, commodities, **CPI (Inflación)**, **GDP (PIB)**, **NFP (Empleo)**, **Tasas Fed/BCE/BoE/BoJ/PBOC**, **PMI (Manufacturing/Services)**, **Ciclo económico**, **Eventos económicos próximos** | - | ~80% |
| **Competitors** | Rendimiento vs 50+ empresas mapeadas, **P/E ratio vs sector**, **Market Cap ranking**, valoración relativa | Cuota de mercado | ~65% |
| **Forex** | Exposición por empresa, cambios de pares, conversión automática EUR | Hedging, volatilidad FX | ~65% |
| **Institutional** | % ownership, tendencia, insiders, top 5 fondos, **COT Report** (especuladores vs comerciales), **Flujos ETFs** (sector vs mercado), **Dark Pools** (short volume, acumulación/distribución, block trades, volumen inusual) | 13F filings SEC detallados | ~85% |
| **Seasonality** | 50+ eventos para 20+ países, patrones globales | Patrones históricos por acción específica | ~60% |
| **Financials** | Ingresos, márgenes, EPS, P/E, deuda, ROE, rating analistas | FCF, CAPEX, balance completo | ~65% |
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
