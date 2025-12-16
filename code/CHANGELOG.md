# Changelog - Guess Investor

**Última actualización:** 16 de diciembre de 2025  
**Commit actual:** `1f0a1d0`

---

## Funcionalidades Implementadas

| Commit | Fecha | Funcionalidad |
|--------|-------|---------------|
| `1f0a1d0` | 16/12/2025 | Fix: Ticker GPS → GAP (Gap Inc delistado) |
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
| **Technical** | SMA 20/50/200, EMA 12/26, RSI 14, MACD, Bollinger, Volumen, Cruces | Patrones chartistas, soportes/resistencias | ~80% |
| **Sentiment** | StockTwits, Reddit, Fear & Greed (crypto), **VIX Index**, **Put/Call Ratio (CBOE SPX)** | Short interest (requiere API FINRA pagada), Twitter/X (requiere API pagada), options flow detallado | ~70% |
| **News** | Yahoo News + análisis keywords, **Earnings calendar**, **Dividendos**, **Acciones de analistas** (upgrades/downgrades), **Detección de eventos regulatorios** (SEC, FDA, FTC, DOJ, EU, antitrust) | Splits históricos, M&A rumores | ~65% |
| **Macro** | Índices regionales, bonos 10Y, VIX, commodities, **CPI (Inflación)**, **GDP (PIB)**, **NFP (Empleo)**, **Tasas Fed/BCE/BoE/BoJ/PBOC**, **PMI (Manufacturing/Services)**, **Ciclo económico**, **Eventos económicos próximos** | - | ~75% |
| **Competitors** | Rendimiento relativo vs competidores mapeados | Cuota de mercado, comparación de ratios P/E | ~50% |
| **Forex** | Exposición por empresa, cambios de pares | Hedging, volatilidad FX | ~60% |
| **Institutional** | % ownership, tendencia, insiders, top 5 fondos, **COT Report** (especuladores vs comerciales), **Flujos ETFs** (sector vs mercado), **Dark Pools** (short volume, acumulación/distribución, block trades) | 13F filings SEC detallados | ~75% |
| **Seasonality** | 50+ eventos para 20+ países, patrones globales | Patrones históricos por acción específica | ~60% |
| **Financials** | Ingresos, márgenes, EPS, P/E, deuda, ROE, rating analistas | FCF, CAPEX, balance completo | ~65% |
| **Expectations** | EPS surprise histórico, **Revenue surprise**, **Revisiones analistas** (7d/30d/90d), EPS/Revenue estimados, **Fecha próx. earnings**, **Beat rate**, **Riesgo earnings**, **Whisper numbers** | Guidance management | ~75% |

### APIs/Fuentes de Datos

| Fuente | Uso |
|--------|-----|
| **Yahoo Finance Chart API** | Precios, históricos, OHLCV para indicadores técnicos, **volumen para análisis de dark pools** |
| **Yahoo Finance quoteSummary** | Fundamentales, institucional, earnings, **calendarEvents** (earnings dates, dividendos), **upgradeDowngradeHistory** (acciones de analistas), **earningsHistory** (EPS surprise histórico), **earningsTrend** (revisiones de analistas 7d/30d/90d, estimaciones EPS/Revenue), **earnings** (revenue trimestral) |
| **Yahoo Finance Options** | Datos de opciones para **análisis de dark pools** (put/call ratio, open interest, volumen inusual) |
| **Yahoo Finance Search** | Noticias |
| **Yahoo Finance VIX** | Índice de volatilidad VIX (indicador de miedo), **estimación de posiciones COT** |
| **CBOE Options API** | Put/Call Ratio de opciones SPX (indicador institucional) |
| **ETFs Sectoriales** | Flujos de **SPY, QQQ, XLK, XLF**, etc. para detectar rotación sectorial |
| **StockTwits API** | Sentimiento USA/crypto |
| **Reddit JSON** | Sentimiento social (r/wallstreetbets, r/stocks) |
| **Alternative.me** | Fear & Greed Index (crypto) |
| **Datos económicos hardcoded** | **CPI, GDP, NFP, PMI, Tasas bancos centrales** (actualizados con datos oficiales de BLS, BEA, Fed, BCE, BoE, NBS) |
| **Datos hardcoded** | Competidores, exposición forex, eventos estacionales, **mapeos stock-futuros para COT**, **calendario eventos económicos** |

---

## Historial de Reverts

### Revert del 15/12/2025

**Commits eliminados:** `021fec2`, `0bb2e15`, `ad4c022`, `6d95f7e`, `2a5a19b`

**Funcionalidades revertidas:**
- Safe JSON parsing con detección de rate limiting
- Rotación automática de proxies CORS
- Delay entre requests para evitar rate limiting
- Manejo de error cuando falla la predicción
