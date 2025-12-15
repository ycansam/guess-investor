# Changelog - Guess Investor

**Última actualización:** 16 de diciembre de 2025  
**Commit actual:** `pendiente`

---

## Funcionalidades Implementadas

| Commit | Funcionalidad |
|--------|---------------|
| `pendiente` | **Factor Sentiment mejorado** - VIX Index, Put/Call Ratio (CBOE SPX), indicadores institucionales en UI |
| `pendiente` | Fix: discrepancia entre % cambio del chat y tarjeta de predicción |
| `34c65e3` | **Factor de Indicadores Técnicos** (SMA 20/50/200, EMA 12/26, RSI 14, MACD, Bandas de Bollinger, Análisis de Volumen, Cruces Dorado/Mortal) |
| `0be2753` | Eliminado temporadas (estaciones del año) del factor seasonality |
| `f74ebc7` | Changelog actualizado con funcionalidades implementadas |
| `d1b1a21` | Predicción determinista y sin rangos de precio (precio objetivo único) |
| `96d002b` | Explicación más detallada en las predicciones |
| `d0a7fb6` | Correcciones de confianza basada en factores existentes |
| `8d52e02` | Eventos por países a nivel global |
| `0d09872` | Factor de festivos y días importantes por países |
| `7e54d7a` | Factor de grandes inversores institucionales |
| `421a82d` | Factor Forex y valor de la moneda de la empresa |
| `9261367` | Factor de competencia y sector |
| `a0d4ac6` | Fix en sumatorio de factores |
| `fae9542` | Factor de noticias |
| `9c5a736` | Predicción basada en confianza |
| `582a22e` | Fix datos reales |
| `ecbb155` | Fix predicciones sin datos |
| `7fa52de` | Factor de expectativas de mercado |
| `a9047e1` | Fecha de inicio de predicción |
| `50eeffb` | IndexedDB funcionando con eliminación, fix Xiaomi y monedas |
| `e5893b7` | Persistencia con IndexedDB |
| `9c108ad` | Helpers de utilidad |
| `eb4decf` | Separación de función de cálculo |
| `0dc4b93` | Header separado en componente |
| `a0be338` | División de componentes |
| `8e9fa95` | Separación en componentes |
| `e1bcad8` | Factor de resultados financieros |
| `b121f18` | Modificación de card de predicción |
| `1026e52` | IA funcionando rápido y determinista |
| `b9d0a5d` | Uso exclusivo de Yahoo Finance |
| `3abaedd` | Pantalla Home |
| `3f090d6` | Modelo en .env |
| `6668d47` | Prompt en .env |
| `596dae9` | Refactor v2 Finnhub |
| `5d3a8ec` | Refactorizado Finnhub |
| `6e4e3fb` | Escalabilidad en finnhub-service |
| `fe37485` | Primera versión funcionando |
| `3ccf626` | Primera versión working |
| `8af53f1` | Proyecto reseteado |
| `bb43dbc` | Proyecto inicial |

---

## Resumen de Factores de Predicción (11)

| # | Factor | Descripción |
|---|--------|-------------|
| 1 | **Trend** | Análisis de tendencias de precio y momentum histórico (cambios 30d, 90d, volatilidad) |
| 2 | **Technical** | **NUEVO** - Indicadores técnicos: SMA (20/50/200), EMA (12/26), RSI 14, MACD, Bandas de Bollinger, Volumen, Cruces Dorado/Mortal |
| 3 | **Sentiment** | Sentimiento de mercado: StockTwits, Reddit, Fear & Greed, **VIX Index**, **Put/Call Ratio** (CBOE SPX) |
| 4 | **News** | Impacto de noticias relevantes sobre el activo o sector (Yahoo Finance) |
| 5 | **Macro** | Indicadores macroeconómicos: índices regionales, tipos de interés, VIX, commodities |
| 6 | **Competitors** | Contexto relativo frente a competidores y sector: rendimiento comparativo |
| 7 | **Forex** | Efectos de movimientos de divisas sobre activos internacionales |
| 8 | **Institutional** | Movimientos de grandes inversores: ownership, insiders, top holders |
| 9 | **Seasonality** | Festivos por país, eventos comerciales (Black Friday, Buen Fin), patrones históricos (Rally Santa Claus, Sell in May) |
| 10 | **Financials** | Resultados financieros: ingresos, márgenes, deuda, P/E, rating analistas, precio objetivo |
| 11 | **Expectations** | Expectativas de mercado: earnings surprise, EPS estimado, guidance |

---

## Cobertura por Factor

| Factor | Implementado | Pendiente | % |
|--------|-------------|-----------|---|
| **Trend** | Cambios 30d/90d/1Y, volatilidad | - | 100% |
| **Technical** | SMA 20/50/200, EMA 12/26, RSI 14, MACD, Bollinger, Volumen, Cruces | Patrones chartistas, soportes/resistencias | ~80% |
| **Sentiment** | StockTwits, Reddit, Fear & Greed (crypto), **VIX Index**, **Put/Call Ratio (CBOE SPX)** | Short interest (requiere API FINRA pagada), Twitter/X (requiere API pagada), options flow detallado | ~70% |
| **News** | Yahoo News + análisis keywords | Calendario earnings, eventos corporativos (splits, M&A) | ~35% |
| **Macro** | Índices regionales, bonos 10Y, VIX, commodities | Inflación (CPI), PIB, empleo (NFP), decisiones Fed/BCE | ~40% |
| **Competitors** | Rendimiento relativo vs competidores mapeados | Cuota de mercado, comparación de ratios P/E | ~50% |
| **Forex** | Exposición por empresa, cambios de pares | Hedging, volatilidad FX | ~60% |
| **Institutional** | % ownership, tendencia, insiders, top 5 fondos | COT report, 13F filings SEC, flujos ETFs | ~50% |
| **Seasonality** | 50+ eventos para 20+ países, patrones globales | Patrones históricos por acción específica | ~60% |
| **Financials** | Ingresos, márgenes, EPS, P/E, deuda, ROE, rating analistas | FCF, CAPEX, balance completo | ~65% |
| **Expectations** | Earnings surprise histórico, EPS estimado | Revenue surprise, revisiones analistas, fecha próx earnings | ~45% |

### APIs/Fuentes de Datos

| Fuente | Uso |
|--------|-----|
| **Yahoo Finance Chart API** | Precios, históricos, OHLCV para indicadores técnicos |
| **Yahoo Finance quoteSummary** | Fundamentales, institucional, earnings |
| **Yahoo Finance Search** | Noticias |
| **Yahoo Finance VIX** | Índice de volatilidad VIX (indicador de miedo) |
| **CBOE Options API** | Put/Call Ratio de opciones SPX (indicador institucional) |
| **StockTwits API** | Sentimiento USA/crypto |
| **Reddit JSON** | Sentimiento social (r/wallstreetbets, r/stocks) |
| **Alternative.me** | Fear & Greed Index (crypto) |
| **Datos hardcoded** | Competidores, exposición forex, eventos estacionales |

---

## Historial de Reverts

### Revert del 15/12/2025

**Commits eliminados:** `021fec2`, `0bb2e15`, `ad4c022`, `6d95f7e`, `2a5a19b`

**Funcionalidades revertidas:**
- Safe JSON parsing con detección de rate limiting
- Rotación automática de proxies CORS
- Delay entre requests para evitar rate limiting
- Manejo de error cuando falla la predicción
