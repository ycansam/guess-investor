# 🧠 Sistema de IA que Aprende Sobre Sí Misma

Este documento describe cómo la IA de Guess Investor aprende de sus propios errores y mejora con el tiempo.

## Arquitectura del Sistema de Aprendizaje

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CICLO DE APRENDIZAJE                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. PREDICCIÓN          2. ESPERA              3. VERIFICACIÓN         4. APRENDIZAJE
┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ Usuario pide │──────▶│ Predicción   │──────▶│ Fecha cumple │──────▶│ ML aprende   │
│ predicción   │       │ guardada     │       │ se verifica  │       │ de errores   │
└──────────────┘       └──────────────┘       └──────────────┘       └──────────────┘
       │                                              │                      │
       │                                              ▼                      │
       │                                      ┌──────────────┐               │
       │                                      │ Se calcula   │               │
       │                                      │ accuracyScore│               │
       │                                      └──────────────┘               │
       │                                                                     │
       ◀─────────────────────────────────────────────────────────────────────┘
                              Próxima predicción usa pesos mejorados
```

## Componentes del Sistema ML

### 1. 📊 Tracking Service (`prediction-tracking-service.ts`)

Registra TODAS las predicciones:
- Símbolo, fecha de predicción, fecha objetivo
- Precio inicial, predicción (%, rango)
- Factor scores usados
- Confianza calculada
- Volatilidad del activo

```typescript
interface TrackedPrediction {
  id: string;
  symbol: string;
  predictedChange: number;        // % predicho
  actualChange?: number;          // % real (cuando se verifica)
  directionCorrect?: boolean;     // ¿Acertó subida/bajada?
  accuracyScore?: number;         // 0-100, qué tan preciso fue
  predictionQuality?: 'excellent' | 'good' | 'poor' | 'failed';
  volatilityCategory?: 'low' | 'medium' | 'high';
  factorScores: Record<string, number>;
}
```

### 2. ⚖️ Weight Optimizer (`weight-optimizer-service.ts`)

Optimiza los pesos de los 11 factores de análisis usando **descenso de gradiente con momentum**.

#### 11 Factores de Análisis
| Factor | Descripción |
|--------|-------------|
| `trend` | Tendencia de precio (SMA, EMA) |
| `technical` | Indicadores técnicos (RSI, MACD, Bollinger) |
| `sentiment` | Sentimiento del mercado |
| `news` | Impacto de noticias recientes |
| `macro` | Condiciones macroeconómicas |
| `competitors` | Rendimiento del sector |
| `forex` | Impacto de divisas (si aplica) |
| `institutional` | Flujo institucional |
| `seasonality` | Patrones estacionales |
| `financials` | Métricas fundamentales |
| `expectations` | Expectativas de earnings/eventos |

#### Pesos por Timeframe
El sistema mantiene pesos **separados** para cada tipo de predicción:

| Timeframe | Rango | Características |
|-----------|-------|-----------------|
| `intraday` | ≤1 día | Técnico/sentiment dominan |
| `swing` | 2-7 días | Balance técnico/fundamental |
| `long` | >7 días | Fundamentales dominan |

#### Pesos por Volatilidad
**NUEVO:** También ajusta pesos según la volatilidad del activo:

| Categoría | Volatilidad | Activos típicos | Ajuste |
|-----------|-------------|-----------------|--------|
| `low` | <20% | Utilities, Bonds, Mega caps | Prioriza fundamentales |
| `medium` | 20-50% | Mayoría de stocks | Pesos balanceados |
| `high` | >50% | Crypto, Growth, Small caps | Prioriza técnico/momentum |

### 3. 📈 Accuracy Predictor (`accuracy-predictor-service.ts`)

Predice el accuracy esperado de una NUEVA predicción basándose en historial:

```typescript
interface ExpectedAccuracy {
  expectedScore: number;           // 0-100
  expectedQuality: 'excellent' | 'good' | 'poor' | 'failed';
  directionProbability: number;    // % de acertar dirección
  confidence: 'high' | 'medium' | 'low';
  suggestedTimeframe?: string;     // Mejor timeframe para este activo
}
```

#### Fuentes de datos del modelo:
- Por nivel de confianza (buckets de 10%)
- Por timeframe
- Por tipo de activo (stock, crypto, etf)
- Por volatilidad
- Por símbolo específico
- Combinaciones (timeframe + volatilidad)

## Función de Pérdida (Loss Function)

```
L = α × L_direction + β × L_magnitude + γ × L_range + δ × L_accuracy
```

| Componente | Peso | Descripción |
|------------|------|-------------|
| `L_direction` | α = 0.35 | ¿Acertó la dirección (subida/bajada)? |
| `L_magnitude` | β = 0.25 | ¿Qué tan lejos estuvo el % predicho? |
| `L_range` | γ = 0.10 | ¿El precio cayó dentro del rango min-max? |
| `L_accuracy` | δ = 0.30 | Basado en accuracyScore (0-100) |

### Penalizaciones adicionales:
- **Predicciones "failed"** (<25% accuracy): +50% pérdida
- **Predicciones "poor"** (25-50% accuracy): +25% pérdida

## Algoritmo de Entrenamiento

### Descenso de Gradiente con Momentum

```python
# Hiperparámetros
LEARNING_RATE = 0.01
MOMENTUM = 0.9
EPOCHS = 100
EARLY_STOPPING_PATIENCE = 10

# Para cada época:
for epoch in range(EPOCHS):
    # 1. Calcular gradientes numéricos
    for factor in FACTORS:
        gradient = (loss(w + ε) - loss(w - ε)) / (2ε)
    
    # 2. Actualizar velocidad (momentum)
    velocity = MOMENTUM * velocity - LEARNING_RATE * gradient
    
    # 3. Actualizar peso
    weight += velocity
    
    # 4. Normalizar (suma = 1.0) y aplicar límites [0.01, 0.40]
    weights = clip_and_normalize(weights)
    
    # 5. Early stopping si no mejora
    if no_improvement_for(EARLY_STOPPING_PATIENCE):
        break
```

### Límites de Pesos

| Límite | Valor | Propósito |
|--------|-------|-----------|
| `WEIGHT_MIN` | 0.01 | Ningún factor se ignora completamente |
| `WEIGHT_MAX` | 0.40 | Ningún factor domina demasiado |
| Suma total | 1.00 | Siempre normalizado |

## Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. NUEVA PREDICCIÓN                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Usuario solicita predicción de AAPL para 5 días]                          │
│                                                                             │
│  → Cargar pesos aprendidos (si existen)                                     │
│  → Obtener datos: precio, técnicos, sentimiento, noticias...                │
│  → Calcular score de cada factor (0-100)                                    │
│  → Aplicar pesos según timeframe (swing) y volatilidad (medium)             │
│  → Calcular predicción ponderada                                            │
│  → Consultar Accuracy Predictor → "Expected: 65%, Direction: 72%"           │
│  → Registrar en tracking con todos los datos                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (5 días después)
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. VERIFICACIÓN AUTOMÁTICA                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [App verifica predicciones cuya fecha objetivo ha pasado]                  │
│                                                                             │
│  → Obtener precio actual de AAPL                                            │
│  → Calcular cambio real: +2.3%                                              │
│  → Predicción fue: +3.5%                                                    │
│                                                                             │
│  → ¿Dirección correcta? ✓ (ambos positivos)                                 │
│  → ¿Dentro del rango? ✓                                                     │
│  → Calcular accuracyScore:                                                  │
│      - Base por dirección: 50 puntos                                        │
│      - Precisión del %: (1 - |3.5-2.3|/3.5) × 50 = 32.9 puntos              │
│      - Total: 82.9% → "excellent"                                           │
│                                                                             │
│  → Guardar resultado verificado                                             │
│  → Reconstruir modelo de accuracy predictor                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (cuando hay ≥10 nuevas verificaciones)
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. ENTRENAMIENTO ML                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  → Cargar todas las predicciones verificadas                                │
│  → Agrupar por timeframe (intraday/swing/long)                              │
│  → Agrupar por volatilidad (low/medium/high)                                │
│                                                                             │
│  → Para cada grupo:                                                         │
│      - Calcular pérdida actual                                              │
│      - Ejecutar descenso de gradiente                                       │
│      - Ajustar pesos de factores                                            │
│                                                                             │
│  → Guardar pesos aprendidos                                                 │
│  → Log: "Loss: 0.42 → 0.31 (-26% mejora)"                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. PRÓXIMAS PREDICCIONES                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Las nuevas predicciones usan los pesos optimizados automáticamente         │
│                                                                             │
│  Ejemplo de ajuste aprendido:                                               │
│  - Si el factor "news" ha sido poco predictivo para crypto:                 │
│      news: 0.18 → 0.12                                                      │
│  - Si "technical" ha sido muy preciso para intraday:                        │
│      technical: 0.25 → 0.32                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Sistema de Estabilidad

El sistema tiene fases de madurez basadas en predicciones verificadas:

| Fase | Verificadas | Estado | Impacto de Reset |
|------|-------------|--------|------------------|
| 🌱 Inicial | 0-4 | Recopilando datos | Sin impacto |
| 📚 Aprendiendo | 5-14 | Patrones básicos | Bajo |
| 🔧 Desarrollando | 15-29 | Mejorando precisión | Moderado |
| ✅ Estable | 30-49 | Sistema fiable | Alto |
| 🏆 Maduro | 50+ | Máximo rendimiento | Muy alto |

## Archivos de Datos

### AsyncStorage (React Native)

| Clave | Contenido |
|-------|-----------|
| `prediction-tracking` | Todas las predicciones (pending + verified) |
| `learned-weights` | Pesos optimizados por timeframe |
| `accuracy-predictor-model` | Modelo de predicción de accuracy |
| `ml-training-history` | Historial de entrenamientos |
| `asset-classifications` | Clasificación de activos por tipo |

### Python (Opcional - Entrenamiento Avanzado)

| Archivo | Ubicación | Contenido |
|---------|-----------|-----------|
| `predictions_data.json` | `python/data/` | Predicciones exportadas |
| `verified_predictions.json` | `python/data/` | Solo verificadas |
| `learned_weights.json` | `code/config/` | Pesos entrenados |
| `training_log.json` | `python/data/` | Log de entrenamiento |

## Cuándo Resetear vs Mantener

### ❌ NO resetear cuando:
- Ajustas parámetros de función de pérdida
- Añades nuevos indicadores técnicos
- Mejoras la obtención de datos
- Cambios de UI/UX

### ✅ SÍ considerar resetear cuando:
- Cambias fundamentalmente cómo se calcula `accuracyScore`
- Corriges un bug que corrompía datos
- Tienes <20 predicciones verificadas
- Los datos históricos ya no son representativos

## Ejemplo de Evolución de Pesos

```
Después de 50 predicciones verificadas de crypto (alta volatilidad):

ANTES (pesos por defecto):
  technical: 0.32
  trend: 0.28
  sentiment: 0.18
  news: 0.12
  macro: 0.02
  ...

DESPUÉS (pesos aprendidos):
  technical: 0.38  ↑ (+0.06) - Muy predictivo para crypto
  trend: 0.31      ↑ (+0.03) - Momentum importa
  sentiment: 0.15  ↓ (-0.03) - Menos confiable
  news: 0.08       ↓ (-0.04) - Demasiado ruido
  macro: 0.01      ↓ (-0.01) - Casi irrelevante
  ...

Resultado: Pérdida -23% (de 0.45 a 0.35)
Dirección correcta: 52% → 68%
```

## Comandos Útiles

### Ver estado del sistema ML (en app)
1. Abrir modal "📊 Tracking de Predicciones"
2. Ver sección "🧠 Estabilidad del Sistema ML"

### Resetear todo (si es necesario)
1. En el modal de Tracking
2. Scroll hasta "⚠️ Zona de Peligro"
3. Pulsar "🗑️ Resetear Todo" → Confirmar

### Entrenar manualmente (opcional)
```bash
cd python
python main.py --epochs 200 --verbose
```

## Métricas de Éxito

El sistema es "exitoso" cuando:

| Métrica | Objetivo | Descripción |
|---------|----------|-------------|
| Dirección correcta | >60% | Acierta si sube o baja |
| Accuracy Score medio | >50% | Precisión del % predicho |
| Predicciones "excellent" | >20% | Score >75% |
| Predicciones "failed" | <15% | Score <25% |

---

## 🚀 ROADMAP: Mejoras para Perfeccionar la IA

### Estado Actual vs Ideal

```
ACTUAL                                    IDEAL
─────────────────────────────────────────────────────────────────
✅ 11 factores de análisis               ⬜ 15+ factores especializados
✅ Pesos por timeframe                   ⬜ Pesos por activo individual
✅ Pesos por volatilidad                 ⬜ Pesos adaptativos en tiempo real
✅ Accuracy predictor básico             ⬜ Modelo probabilístico completo
✅ Descenso de gradiente                 ⬜ Ensemble de algoritmos
⬜ Sin análisis de correlaciones         ⬜ Detección de regímenes de mercado
⬜ Sin backtesting automático            ⬜ Walk-forward validation
⬜ Sin feature engineering               ⬜ Auto-feature discovery
```

---

### 🔴 PRIORIDAD ALTA - Mejoras Críticas

#### 1. **Meta-Learning: Aprender Cuándo NO Predecir**
> Actual: La IA siempre intenta predecir
> Problema: Algunas condiciones son impredecibles (earnings inminentes, alta incertidumbre)

```typescript
// NUEVO: Sistema de "skip prediction"
interface PredictionDecision {
  shouldPredict: boolean;
  confidence: number;
  reason?: string; // "Alta incertidumbre por earnings en 2 días"
}

// Entrenar modelo para aprender patrones de CUÁNDO falló
// Si históricamente falla antes de earnings → aprender a NO predecir
```

**Implementación:**
1. Añadir `uncertaintyIndicators` a TrackedPrediction
2. Trackear qué condiciones llevaron a predicciones fallidas
3. Crear `PredictionViabilityModel` que aprenda a decir "no sé"

---

#### 2. **Regímenes de Mercado (Market Regimes)**
> Actual: Usa mismos pesos en bull market y crash
> Problema: Los factores cambian de importancia según el contexto

```
RÉGIMEN           FACTORES DOMINANTES
─────────────────────────────────────
Bull tranquilo    Fundamentales + Técnico
Bull eufórico     Momentum + Sentiment (ignora fundamentales)
Bear panic        VIX + Put/Call + Institucional
Lateral/Choppy    Técnico (soporte/resistencia)
Recovery          Institucional + Macro
```

**Implementación:**
1. Crear `MarketRegimeDetector` usando VIX, volatilidad, amplitud
2. Tener pesos separados por régimen (no solo por timeframe)
3. El ML aprende: "En pánico, el factor X tiene peso 0.4, pero en bull solo 0.1"

---

#### 3. **Aprendizaje por Símbolo Individual**
> Actual: Pesos globales por timeframe/volatilidad
> Problema: AAPL y TSLA se comportan muy diferente aunque ambos son "large_cap"

**Implementación:**
1. Para símbolos con ≥10 predicciones verificadas, aprender pesos específicos
2. Blend: 70% pesos del símbolo + 30% pesos del grupo
3. Transferir conocimiento: "TSLA se parece más a crypto que a large_cap estable"

```typescript
interface SymbolWeights {
  symbol: string;
  weights: Record<Factor, number>;
  confidence: number; // Basado en cantidad de samples
  similarTo: string[]; // Otros símbolos con comportamiento similar
}
```

---

#### 4. **Calibración de Confianza (Confidence Calibration)**
> Actual: Confianza 70% no significa 70% de acierto real
> Problema: La IA dice "70% confianza" pero acierta solo 55%

**Implementación:**
1. Trackear: "Cuando dije 70-79% confianza, ¿cuántas veces acerté?"
2. Crear tabla de calibración:
   ```
   Confianza reportada → Accuracy real
   90-100%            → 72%
   80-89%             → 65%
   70-79%             → 58%
   60-69%             → 52%
   ```
3. Ajustar confianza mostrada para reflejar realidad
4. O mejor: entrenar modelo para que confianza = accuracy real

---

#### 5. **Ensemble de Modelos**
> Actual: Un solo modelo con pesos ponderados
> Problema: Un modelo puede tener bias sistemáticos

**Implementación:**
```
Modelo 1: Pesos optimizados (actual)
Modelo 2: Pesos especializados por sector
Modelo 3: Modelo de momentum puro
Modelo 4: Modelo de reversión a la media

Predicción final = Weighted average basado en accuracy histórico de cada modelo
```

---

### 🟡 PRIORIDAD MEDIA - Mejoras Importantes

#### 6. **Detección de Anomalías**
- Identificar cuando los datos de entrada son anómalos
- Reducir confianza automáticamente si hay datos sospechosos
- Alertar si el mercado está actuando "fuera de lo normal"

#### 7. **Time-Decay en Entrenamiento**
> Actual: Todas las predicciones pesan igual
> Problema: El mercado de 2023 es más relevante que el de 2022

```python
# Dar más peso a predicciones recientes
sample_weight = exp(-days_old / 180)  # Half-life de 6 meses
```

#### 8. **Cross-Validation Temporal**
> Actual: Entrena con todos los datos
> Problema: Puede haber overfitting

**Implementación:**
1. Walk-forward validation: entrenar solo con datos pasados
2. Nunca usar datos "del futuro" para validar
3. Métricas de out-of-sample performance

#### 9. **Feature Engineering Automático**
Crear nuevos features derivados:
- `RSI_divergence`: RSI subiendo pero precio bajando
- `momentum_exhaustion`: Volumen cayendo en rally
- `earnings_proximity_risk`: Riesgo basado en cercanía a earnings
- `sector_rotation_signal`: El sector está recibiendo flujos?

#### 10. **Correlaciones Entre Factores**
> Actual: Factores se tratan como independientes
> Problema: Si técnico Y sentiment son bullish, es más fuerte que la suma

```typescript
// Interacciones entre factores
if (technical > 70 && sentiment > 70) {
  coherenceBonus = 15; // Más confiable cuando coinciden
}
if (technical > 70 && sentiment < 30) {
  conflictPenalty = 20; // Señales mixtas = menos confiable
}
```

---

### 🟢 PRIORIDAD BAJA - Nice to Have

#### 11. **Explicabilidad Mejorada (XAI)**
- Mostrar "Por qué" la IA predijo lo que predijo
- Destacar qué factores fueron decisivos
- Generar texto explicativo natural

#### 12. **Benchmarking Automático**
- Comparar performance vs buy-and-hold
- Comparar vs predicción "siempre neutral"
- Tracking de alpha generado

#### 13. **Alertas Inteligentes**
- Notificar cuando una predicción está por cumplirse
- Alertar si el precio se mueve contra la predicción
- Sugerir revisar predicción si cambian condiciones

#### 14. **Multi-Timeframe Coherence**
- Si predigo +5% en 7 días, la predicción a 3 días debería ser consistente
- Penalizar predicciones que se contradicen entre timeframes

#### 15. **Adversarial Testing**
- Buscar casos donde la IA falla sistemáticamente
- "¿Qué tipo de activos/condiciones causan más fallos?"
- Auto-generar test cases difíciles

---

## 📋 Checklist de Implementación

### Fase 1: Fundamentos (Hacer primero)
- [x] **Meta-learning para uncertainty** ✅ (Diciembre 2024)
  - [x] Añadir `uncertaintyScore` a predicciones
  - [x] Trackear condiciones que causan fallos
  - [x] Implementar "no predict" cuando uncertainty > threshold
  
  **Implementación:**
  - `uncertainty-analysis-service.ts`: Detecta condiciones de alta incertidumbre
  - Factores analizados: earnings inminentes, volatilidad extrema, datos incompletos, señales contradictorias, régimen de mercado
  - Threshold: >70% incertidumbre = "No recomendado predecir"
  - UI: Banner de advertencia en PredictionCard cuando uncertainty ≥50%
  
- [ ] **Calibración de confianza**
  - [ ] Añadir tracking de calibración por bucket de confianza
  - [ ] Mostrar "accuracy real" junto a confianza
  - [ ] Crear calibrationModel que ajuste confianza

- [ ] **Time-decay en entrenamiento**
  - [ ] Modificar `computeLoss` para incluir peso temporal
  - [ ] Dar más peso a predicciones recientes

### Fase 2: Especialización (Después de tener datos)
- [ ] **Pesos por símbolo**
  - [ ] Crear SymbolWeightsService
  - [ ] Blend con pesos globales
  - [ ] Transferencia entre símbolos similares

- [ ] **Market regime detection**
  - [ ] Implementar MarketRegimeDetector
  - [ ] Crear pesos separados por régimen
  - [ ] Entrenar con datos históricos etiquetados

### Fase 3: Avanzado (Optimización)
- [ ] **Ensemble de modelos**
- [ ] **Cross-validation temporal**
- [ ] **Feature engineering automático**
- [ ] **Correlaciones entre factores**

---

## 📊 Métricas para Tracking de Mejoras

Antes de implementar cada mejora, establecer baseline:

| Métrica | Actual | Objetivo | Cómo medir |
|---------|--------|----------|------------|
| Direction accuracy | ?% | 65% | % predicciones con dirección correcta |
| Calibration error | ?% | <5% | |confianza - accuracy real| promedio |
| Avg accuracy score | ?% | 60% | Promedio de accuracyScore |
| Excellent rate | ?% | 25% | % predicciones con score >75 |
| Failed rate | ?% | <10% | % predicciones con score <25 |
| Sharpe ratio (simulado) | ? | >1.0 | Si siguieras las predicciones |

---

## 💡 Ideas Experimentales

### Neural Network en Python
Para cuando haya suficientes datos (>500 predicciones):
```python
# Red neuronal simple para predicción
model = Sequential([
    Dense(32, activation='relu', input_shape=(11,)),  # 11 factores
    Dropout(0.3),
    Dense(16, activation='relu'),
    Dense(1, activation='sigmoid')  # Probabilidad de subida
])
```

### Reinforcement Learning
- Tratar cada predicción como una "acción"
- Reward = accuracyScore de la predicción
- Aprender política óptima de cuándo/cómo predecir

### Attention Mechanism
- "¿A qué factor debería prestar más atención para ESTE activo AHORA?"
- Pesos dinámicos basados en contexto actual

---

*Última actualización: Diciembre 2024*

