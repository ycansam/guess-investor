# 📊 Reporte de Migración de Servicios: commit 5c77276 → Backend Actual

**Fecha de análisis:** 28 de diciembre de 2025  
**Total servicios en 5c77276:** 58 servicios  
**Total servicios en backend actual:** 27 servicios

---

## 📋 Resumen Ejecutivo

| Categoría | Cantidad | Porcentaje |
|-----------|----------|------------|
| ✅ MIGRADOS | 22 | 38% |
| ⚠️ PARCIALMENTE MIGRADOS | 6 | 10% |
| ❌ NO MIGRADOS | 11 | 19% |
| 🔄 FRONTEND-ONLY | 12 | 21% |
| 🗑️ OBSOLETOS | 7 | 12% |

---

## 🔴 SERVICIOS CRÍTICOS NO MIGRADOS (Requieren Acción Inmediata)

### 1. ❌ adaptive-weights-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** ALTA  
**Descripción:** Ajusta pesos de factores en TIEMPO REAL basándose en performance reciente (online learning).

**Diferencia vs weight-optimizer:**
- `weight-optimizer`: Entrena periódicamente con todos los datos (batch)
- `adaptive-weights`: Ajusta on-the-fly basado en performance reciente (online)

**Funcionalidades:**
- Registrar predicciones para adaptación
- Actualizar resultados con feedback inmediato
- Recalcular ajustes basándose en últimas N predicciones
- Aplicar decay rate a ajustes antiguos
- Detectar tendencias de performance

**Impacto de no tenerlo:** El sistema no puede adaptarse rápidamente a cambios de mercado entre entrenamientos batch.

---

### 2. ❌ weight-optimizer-service.ts
**Estado:** NO MIGRADO (parcialmente en Python)  
**Criticidad:** ALTA  
**Descripción:** Implementa descenso de gradiente con **Adam optimizer** para optimizar pesos.

**Funcionalidades únicas no presentes en backend:**
- Adam optimizer (momentum + RMSProp) en TypeScript
- Time-decay weighting (predicciones recientes pesan más)
- Pesos segmentados por volatilidad (low/medium/high)
- Early stopping con patience
- Historial completo de entrenamientos

**Nota:** El backend actual delega esto a Python (`python-training.service.ts`), pero pierde la capacidad de entrenar sin Python.

---

### 3. ❌ reinforcement-learning-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** MEDIA-ALTA  
**Descripción:** Q-Learning para aprender CUÁNDO predecir (no solo cómo).

**Funcionalidades:**
- Estado discretizado: régimen, volatilidad, timeframe, fuerza de señales
- Acciones: skip, predict_low, predict_medium, predict_high
- Q-Table con aproximación de función
- Experience replay para batch learning
- ε-greedy policy con exploración decreciente

**Impacto:** El sistema no puede aprender a "saltarse" predicciones en condiciones desfavorables.

---

### 4. ❌ meta-learning-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** MEDIA-ALTA  
**Descripción:** MAML-inspired few-shot learning para nuevos símbolos.

**Funcionalidades:**
- Adaptación rápida a nuevos símbolos con 2-5 datos
- Transferencia de conocimiento entre símbolos similares
- Perfiles de símbolo persistentes
- Meta-training con multiple tasks
- Gradientes de adaptación por contexto

**Impacto:** Nuevos símbolos tardan mucho en obtener buenas predicciones.

---

### 5. ❌ probabilistic-model-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** MEDIA  
**Descripción:** Genera distribuciones de probabilidad en lugar de predicciones puntuales.

**Funcionalidades:**
- Escenarios con probabilidades (crash, caída fuerte, subida leve, rally, etc.)
- Intervalos de confianza (50%, 80%, 95%)
- Calibración basada en errores históricos
- Métricas: expected value, median, mode, std
- Skew analysis (bullish/bearish/neutral)

**Impacto:** Los usuarios solo ven un número, no la incertidumbre real.

---

### 6. ❌ factor-correlation-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** MEDIA  
**Descripción:** Modela interacciones entre factores.

**Funcionalidades:**
- Matriz de correlación entre los 11 factores
- Detección de sinergias (factores que funcionan mejor juntos)
- Detección de redundancias (factores que dan misma info)
- Coherence bonus / Conflict penalty
- Ajuste automático de confianza

**Impacto:** No se detectan conflictos ni sinergias entre factores.

---

### 7. ❌ temporal-cross-validation-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** MEDIA  
**Descripción:** Walk-forward validation para detectar overfitting.

**Funcionalidades:**
- Entrenamiento solo con datos del pasado
- Validación con datos "futuros"
- Métricas de overfit score y stability score
- Out-of-sample testing
- Reporte de degradación

**Impacto:** No se puede medir si el modelo está overfitting.

---

### 8. ❌ feature-engineering-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** MEDIA  
**Descripción:** Crea features derivados automáticamente.

**Features derivados que genera:**
- RSI/MACD/Volume Divergence
- Momentum Exhaustion, Trend Strength
- Earnings Proximity Risk
- Signal Coherence, Bull/Bear Balance
- Mean Reversion Signal
- Sector Momentum, Market Breadth
- Volatility Regime/Trend

**Impacto:** El modelo solo usa los 11 factores base, perdiendo información valiosa.

---

### 9. ❌ ml-automation-service.ts
**Estado:** PARCIALMENTE en backend  
**Criticidad:** MEDIA  
**Descripción:** Orquesta todo el ciclo ML automático.

**Funcionalidades:**
- Verificación automática cada 6 horas
- Entrenamiento cuando hay nuevas predicciones
- Exportación para Python
- Sincronización con servidor Python
- Limpieza de predicciones antiguas

**Nota:** El backend tiene `python-training.service.ts` pero no tiene automatización periódica ni verificación automática.

---

### 10. ❌ ml-metrics-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** BAJA-MEDIA  
**Descripción:** Métricas avanzadas de ML (Precision, Recall, F1, etc.)

---

### 11. ❌ symbol-weights-service.ts
**Estado:** NO MIGRADO  
**Criticidad:** BAJA-MEDIA  
**Descripción:** Pesos específicos por símbolo basados en historial.

---

## ✅ SERVICIOS COMPLETAMENTE MIGRADOS

| Servicio Original | Servicio Backend | Estado |
|-------------------|------------------|--------|
| prediction-calculator.ts | prediction/calculator.service.ts | ✅ MIGRADO (muy completo) |
| accuracy-predictor-service.ts | prediction/accuracy-predictor.service.ts | ✅ MIGRADO |
| asset-adjustment-service.ts | prediction/asset-adjustment.service.ts | ✅ MIGRADO |
| confidence-calibration-service.ts | prediction/confidence-calibration.service.ts | ✅ MIGRADO |
| ensemble-service.ts | prediction/ensemble.service.ts | ✅ MIGRADO |
| uncertainty-analysis-service.ts | prediction/uncertainty-analysis.service.ts | ✅ MIGRADO |
| competitors-service.ts | external/competitors.service.ts | ✅ MIGRADO |
| corporate-events-service.ts | external/corporate-events.service.ts | ✅ MIGRADO |
| cot-report-service.ts | external/cot-report.service.ts | ✅ MIGRADO |
| dark-pools-service.ts | external/dark-pools.service.ts | ✅ MIGRADO |
| etf-flows-service.ts | external/etf-flows.service.ts | ✅ MIGRADO |
| expectations-service.ts | external/expectations.service.ts | ✅ MIGRADO |
| fear-greed-service.ts | external/fear-greed.service.ts | ✅ MIGRADO |
| company-financials-service.ts | external/financials.service.ts | ✅ MIGRADO |
| finviz-service.ts | external/finviz.service.ts | ✅ MIGRADO |
| forex-analysis-service.ts | external/forex.service.ts | ✅ MIGRADO |
| institutional-investors-service.ts | external/institutional.service.ts | ✅ MIGRADO |
| macro-economic-service.ts | external/macro.service.ts | ✅ MIGRADO |
| market-regime-service.ts | external/market-regime.service.ts | ✅ MIGRADO |
| news-service.ts | external/news.service.ts | ✅ MIGRADO |
| options-service.ts | external/options.service.ts | ✅ MIGRADO |
| seasonality-service.ts | external/seasonality.service.ts | ✅ MIGRADO |
| sentiment-service.ts | external/sentiment.service.ts | ✅ MIGRADO |
| technical-indicators-service.ts | external/technical.service.ts | ✅ MIGRADO |
| vix-service.ts | external/vix.service.ts | ✅ MIGRADO |
| yahoo-finance-service.ts / yahoo-v8-service.ts | external/yahoo.service.ts | ✅ MIGRADO (consolidado) |

---

## ⚠️ SERVICIOS PARCIALMENTE MIGRADOS

| Servicio Original | Estado Actual | Falta |
|-------------------|---------------|-------|
| prediction-tracking-service.ts | Repositorio predictions | Falta verificación automática |
| training-cache-service.ts | Repositorio training | Falta lógica de cache |
| weight-optimizer-service.ts | python-training.service.ts | Solo delega a Python, no entrena en Node |
| ml-automation-service.ts | python-training.service.ts | Falta automatización periódica |
| market-data-enricher-service.ts | prediction.controller.ts | Integrado en controller |
| accuracy-predictor-service.ts | prediction/accuracy-predictor.service.ts | Track record parcial |

---

## 🔄 SERVICIOS FRONTEND-ONLY (No deben migrarse)

Estos servicios dependen de React Native, AsyncStorage, o son específicos de UI:

| Servicio | Razón |
|----------|-------|
| gemini-service.ts | LLM en frontend (se queda ahí) |
| message-parser-service.ts | Parsing de mensajes para chat UI |
| market-data-service.ts | Wrapper para UI móvil |
| favorites-service.ts | AsyncStorage - UI only |
| training-cache-service.ts | AsyncStorage - local cache |
| currency-service.ts | Conversión UI |
| market-hours-service.ts | Helpers de horario para UI |
| cors-proxy.ts | Solo necesario en frontend web |
| rapidapi-yahoo-service.ts | Alternativa para RN (backend usa directo) |
| symbol-lookup-service.ts | Ya integrado en yahoo.service.ts |
| stocktwits-service.ts | Integrado en sentiment.service.ts |
| reddit-service.ts | Experimental, no productivo |

---

## 🗑️ SERVICIOS OBSOLETOS (No migrar)

| Servicio | Razón |
|----------|-------|
| yahoo-crumb-service.ts | Ya no necesario, consolidado en yahoo.service.ts |
| yahoo-v8-service.ts | Consolidado en yahoo.service.ts |
| fred-api-service.ts | Sin API key, no funcional |
| economic-indicators-service.ts | Duplicado de macro.service.ts |
| regulatory-events-service.ts | Datos no disponibles |

---

## 📈 COMPARACIÓN: prediction-calculator.ts vs calculator.service.ts

### calculator.service.ts (Backend) INCLUYE:

✅ Los 11 factores con scores (-100 a +100)  
✅ Pesos por timeframe (intraday/swing/long)  
✅ Ajuste de pesos por volatilidad  
✅ Scale factor dinámico basado en confianza  
✅ Asset adjustment (TSLA, NVDA, crypto)  
✅ Track record adjustment (nuevo)  
✅ Target price adjustment para swing/long  
✅ Límites de cambio máximo  
✅ Asset groups con configuraciones específicas  
✅ Learned weights desde base de datos  

### prediction-calculator.ts (Original) TENÍA ADEMÁS:

⚠️ Integración con Dark Pool, COT, ETF Flows enriqueciendo institutional  
⚠️ Fear & Greed enriqueciendo sentiment  
⚠️ Expectations mejoradas con más detalle  
⚠️ Auditoría más detallada con URLs de fuentes  
⚠️ Expected accuracy basado en historial  
⚠️ Corporate events integrados  

**Conclusión:** El calculator del backend está muy completo pero le falta enriquecer institutional y sentiment con datos adicionales.

---

## 🎯 RECOMENDACIONES DE PRIORIDAD

### PRIORIDAD ALTA (Migrar en próxima iteración):

1. **adaptive-weights-service.ts** → Permite adaptación rápida sin esperar batch
2. **weight-optimizer-service.ts** → Backup si Python no está disponible
3. **ml-automation-service.ts** → Automatizar verificación y entrenamiento

### PRIORIDAD MEDIA:

4. **factor-correlation-service.ts** → Mejora calidad de confianza
5. **reinforcement-learning-service.ts** → Aprende cuándo NO predecir
6. **meta-learning-service.ts** → Mejora predicciones para símbolos nuevos
7. **temporal-cross-validation-service.ts** → Detecta overfitting

### PRIORIDAD BAJA:

8. **probabilistic-model-service.ts** → Nice to have para UI avanzada
9. **feature-engineering-service.ts** → Features derivados opcionales
10. **ml-metrics-service.ts** → Métricas avanzadas de reporting

---

## 📝 NOTAS FINALES

### Lo que el backend hace MEJOR:
- Base de datos PostgreSQL/SQLite con Prisma (persistencia real)
- Python training service para ML pesado
- Track record service (nuevo, no existía)
- Estructura modular externa/prediction bien organizada

### Lo que FALTA migrar del frontend:
- Todo el sistema de ML online/adaptativo
- Capacidad de entrenar sin Python
- Features derivados automáticos
- Detección de overfitting
- Sistema RL para saber cuándo predecir

### Arquitectura Recomendada:
```
Backend Node.js
├── prediction/ (calculadoras, ajustes) ✅ LISTO
├── external/ (datos de mercado) ✅ LISTO
├── ml/
│   ├── adaptive-weights.service.ts ❌ FALTA
│   ├── weight-optimizer.service.ts ❌ FALTA
│   ├── factor-correlation.service.ts ❌ FALTA
│   ├── cross-validation.service.ts ❌ FALTA
│   ├── reinforcement-learning.service.ts ❌ FALTA (opcional)
│   └── meta-learning.service.ts ❌ FALTA (opcional)
├── repositories/ ✅ LISTO
└── controllers/ ✅ LISTO

Python ML Server (puerto 8765)
├── neural_network_trainer.py ✅ LISTO
└── server.py ✅ LISTO
```

---

*Reporte generado automáticamente el 28 de diciembre de 2025*
