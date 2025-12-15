# Changelog - Guess Investor

**Última actualización:** 15 de diciembre de 2025  
**Commit actual:** `70fa7f8`

---

## Funcionalidades Implementadas

| Commit | Funcionalidad |
|--------|---------------|
| `70fa7f8` | Eliminado temporadas (estaciones del año) del factor seasonality |
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

## Resumen de Factores de Predicción (10)

1. **Trend** - Análisis de tendencia de precio
2. **Sentiment** - Sentimiento de mercado
3. **News** - Análisis de noticias
4. **Macro** - Indicadores macroeconómicos
5. **Competitors** - Análisis de competencia y sector
6. **Forex** - Impacto de divisas
7. **Institutional** - Grandes inversores institucionales
8. **Seasonality** - Festivos y eventos por países
9. **Financials** - Resultados financieros
10. **Expectations** - Expectativas de mercado

---

## Historial de Reverts

### Revert del 15/12/2025

**Commits eliminados:** `021fec2`, `0bb2e15`, `ad4c022`, `6d95f7e`, `2a5a19b`

**Funcionalidades revertidas:**
- Safe JSON parsing con detección de rate limiting
- Rotación automática de proxies CORS
- Delay entre requests para evitar rate limiting
- Manejo de error cuando falla la predicción
