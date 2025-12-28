# 📋 Gaps de Migración - Backend vs Commit 5c77276

Este documento detalla los servicios y funcionalidades que faltan por migrar del frontend original al backend.

## 🔴 PRIORIDAD ALTA (Afectan accuracy significativamente)

### 1. Asset Adjustment Service
**Estado:** ✅ COMPLETADO  
**Archivo original:** `code/services/asset-adjustment-service.ts`  
**Ubicación backend:** `backend/src/services/prediction/asset-adjustment.service.ts`

**Funcionalidad:**
- Corrige predicciones para activos problemáticos (TSLA, NVDA, crypto)
- Aplica factores de escala por activo basados en historial de errores
- Reduce confianza para activos que históricamente fallan
- ✅ Integrado en `calculator.service.ts`

---

### 2. Accuracy Predictor Service
**Estado:** ✅ COMPLETADO  
**Archivo original:** `code/services/accuracy-predictor-service.ts`  
**Ubicación backend:** `backend/src/services/prediction/accuracy-predictor.service.ts`

**Funcionalidad:**
- Predice el accuracy esperado de una predicción antes de hacerla
- Basado en historial por: confianza, volatilidad, timeframe, tipo de activo
- Sugiere mejor timeframe para cada activo

---

### 3. Uncertainty Analysis Service
**Estado:** ✅ COMPLETADO  
**Archivo original:** `code/services/uncertainty-analysis-service.ts`  
**Ubicación backend:** `backend/src/services/prediction/uncertainty-analysis.service.ts`

**Funcionalidad:**
- Meta-learning: detecta condiciones que causan predicciones fallidas
- Calcula `uncertaintyScore` (0-100)
- Decide si `shouldPredict = false` cuando incertidumbre > 70%

---

### 4. Confidence Calibration Service
**Estado:** ✅ COMPLETADO  
**Archivo original:** `code/services/confidence-calibration-service.ts`  
**Ubicación backend:** `backend/src/services/prediction/confidence-calibration.service.ts`

**Funcionalidad:**
- Calibra la confianza reportada vs accuracy real
- Si históricamente 70% confianza = 50% accuracy, ajusta
- Mejora la fiabilidad de la métrica de confianza

---

## 🟠 PRIORIDAD MEDIA (Mejoran la predicción)

### 5. Corporate Events Service
**Estado:** ❌ No implementado  
**Archivo original:** `code/services/corporate-events-service.ts`

**Funcionalidad:**
- Próximas fechas de earnings
- Dividendos y ex-dates
- Stock splits
- Upgrades/Downgrades de analistas

---

### 6. Options Service (Put/Call Ratio)
**Estado:** ❌ No implementado  
**Archivo original:** `code/services/options-service.ts`

**Funcionalidad:**
- Put/Call ratio de CBOE para SPX
- Indicador de sentimiento del mercado
- Ratio alto = bearish, ratio bajo = bullish

---

### 7. Finviz Service
**Estado:** ❌ No implementado  
**Archivo original:** `code/services/finviz-service.ts`

**Funcionalidad:**
- Target price de analistas
- Short float percentage
- Insider transactions
- Recomendación de analistas (1-5)

---

### 8. Ensemble Service
**Estado:** ❌ No implementado  
**Archivo original:** `code/services/ensemble-service.ts`

**Funcionalidad:**
- Combina múltiples modelos de predicción
- Pondera según accuracy histórico de cada modelo

---

## 🟡 PRIORIDAD BAJA (Nice to have)

### 9. Reddit Service
- Sentimiento de r/wallstreetbets, r/stocks, r/CryptoCurrency

### 10. COT Report Service
- Posiciones de futuros (CFTC)

### 11. Dark Pools Service
- Short volume ratio
- Dark pool activity

### 12. ETF Flows Service
- Flujos de ETFs por sector

---

## ✅ YA IMPLEMENTADO

| Servicio | Estado |
|----------|--------|
| Yahoo Finance | ✅ |
| Technical Analysis | ✅ |
| Sentiment (VIX/FearGreed) | ✅ |
| News | ✅ |
| Macro | ✅ |
| Competitors | ✅ |
| Forex | ✅ |
| Institutional | ✅ |
| Seasonality | ✅ |
| Financials | ✅ |
| Expectations | ✅ |
| 11 Factores | ✅ |
| Scale Factor dinámico | ✅ |
| Ajuste por volatilidad | ✅ |
| Target price adjustment | ✅ |

---

## 📊 Progreso

- [x] Servicios core de datos
- [x] 11 factores de predicción
- [x] Fórmula de cálculo corregida
- [ ] Asset Adjustment Service
- [ ] Accuracy Predictor Service
- [ ] Uncertainty Analysis Service
- [ ] Confidence Calibration Service
- [ ] Corporate Events Service
- [ ] Options Service
- [ ] Finviz Service
