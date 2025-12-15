# Changelog - Funcionalidades Revertidas

**Fecha:** 15 de diciembre de 2025  
**Revertido a:** Commit `d1b1a21` - "creada prediccion determinista y sin rangos"

---

## Commits eliminados (5):

### 1. `021fec2` - fixed cors
**Funcionalidades quitadas:**
- Función `safeParseJsonResponse()` para detectar rate limiting en respuestas
- Rotación automática de proxies CORS para distribuir carga
- Delay de 400-500ms entre requests para evitar rate limiting
- Detección de respuestas "Too Many Requests" y respuestas no-JSON
- Actualización de todos los servicios para usar parsing seguro de JSON
- Proxy `api.allorigins.win` como principal (en lugar de `api.codetabs.com`)
- Manejo de error cuando falla la predicción (devuelve mensaje de error en lugar de dejar que Gemini invente)

**Servicios modificados:**
- `cors-proxy.ts`
- `yahoo-finance-service.ts`
- `news-service.ts`
- `macro-economic-service.ts`
- `competitors-service.ts`
- `forex-analysis-service.ts`
- `institutional-investors-service.ts`
- `cnbc-financials-service.ts`
- `currency-service.ts`
- `stocktwits-service.ts`
- `reddit-service.ts`
- `market-data-enricher-service.ts`
- `gemini-service.ts`

---

### 2. `0bb2e15` - confianza determinista
**Funcionalidades quitadas:**
- Cálculo de confianza más determinista basado en cobertura de factores
- Ajustes en el peso de alineación vs intensidad de señales

---

### 3. `ad4c022` - confianza un poco más determinista
**Funcionalidades quitadas:**
- Refinamiento adicional del cálculo de confianza
- Ajustes menores en umbrales de señales

---

### 4. `6d95f7e` - modificacion de noticias
**Funcionalidades quitadas:**
- Cambios en cómo se procesan y ponderan las noticias
- Ajustes en el score de noticias

---

### 5. `2a5a19b` - añadida modificacion de noticias
**Funcionalidades quitadas:**
- Implementación inicial de modificaciones en el servicio de noticias

---

## Estado actual después del revert:

El proyecto ahora está en el estado del commit `d1b1a21` que incluye:
- ✅ Predicción determinista funcionando
- ✅ Sin rangos de precio (precio objetivo único)
- ✅ 10 factores de análisis (trend, sentiment, news, macro, competitors, forex, institutional, seasonality, financials, expectations)
- ✅ Interfaz con todos los factores visibles

## Problemas conocidos que pueden persistir:

1. **Rate Limiting de proxies CORS** - El código anterior no manejaba bien cuando los proxies devolvían "Too Many Requests"
2. **Parsing de JSON sin validación** - Puede fallar silenciosamente si el proxy devuelve HTML o texto de error
3. **Gemini puede inventar datos** - Si la predicción falla, Gemini podría generar respuestas con datos inventados

---

## Para restaurar las funcionalidades revertidas:

```bash
git reflog  # Ver el historial de cambios
git reset --hard 021fec2  # Volver al estado anterior
```
