# Sistema de Precisión Mejorado 🎯

## Problema Original

Antes, el sistema solo verificaba si acertaste la **dirección** (subir/bajar):
- ✅ Predices +3%, sube +0.2% → **CORRECTO** ❌ (pero muy impreciso)
- ✅ Predices +3%, sube +2.9% → **CORRECTO** ✅ (muy preciso)

Ambos casos se consideraban igual de correctos, pero claramente el segundo es mucho mejor.

## Nueva Solución: Accuracy Score

Ahora calculamos un **Accuracy Score (0-100)** que combina:

### 1. Dirección Correcta (50 puntos)
- ✅ Dirección correcta = 50 puntos
- ❌ Dirección incorrecta = 0 puntos

### 2. Precisión del Cambio (50 puntos)
Se calcula qué % del cambio predicho se cumplió realmente:

```typescript
// Ejemplo 1: Predijo +3%, subió +2.8%
fulfillmentRatio = 2.8 / 3.0 = 93.33%
changeScore = 93.33% * 50 = 46.67 puntos
accuracyScore = 50 + 46.67 = 96.67/100 → EXCELLENT 🎯

// Ejemplo 2: Predijo +3%, subió +0.2%
fulfillmentRatio = 0.2 / 3.0 = 6.67%
changeScore = 6.67% * 50 = 3.33 puntos
accuracyScore = 50 + 3.33 = 53.33/100 → GOOD 👍

// Ejemplo 3: Predijo +3%, bajó -1%
directionScore = 0 (dirección incorrecta)
changeScore = 0
accuracyScore = 0/100 → FAILED ❌
```

### Penalización por Exceso
Si el cambio real es mucho mayor que el predicho (>150%), se penaliza:

```typescript
// Predijo +3%, subió +6%
fulfillmentRatio = 6.0 / 3.0 = 200%
// Se penaliza porque es muy impreciso
accuracyScore = max(0, 100 - (2.0 - 1) * 50) = 50/100 → GOOD 👍
```

## Clasificación de Calidad

| Score | Calidad | Emoji | Significado |
|-------|---------|-------|-------------|
| 75-100 | Excellent 🎯 | 🎯 | Dirección correcta + cambio muy preciso |
| 50-74 | Good 👍 | 👍 | Dirección correcta pero cambio impreciso |
| 25-49 | Poor ⚠️ | ⚠️ | Dirección correcta pero muy impreciso, o neutral |
| 0-24 | Failed ❌ | ❌ | Dirección incorrecta o totalmente errado |

## Ejemplos Reales

### Caso 1: Predicción Excelente
```
Predicho: AAPL +2.5% en 1 día
Real: AAPL +2.3% en 1 día
→ Dirección: ✅ (50 pts)
→ Precisión: 92% (46 pts)
→ Score: 96/100 🎯 EXCELLENT
```

### Caso 2: Predicción Buena
```
Predicho: TSLA +5% en 1 semana
Real: TSLA +1.8% en 1 semana
→ Dirección: ✅ (50 pts)
→ Precisión: 36% (18 pts)
→ Score: 68/100 👍 GOOD
```

### Caso 3: Predicción Pobre
```
Predicho: BTC +8% en 1 día
Real: BTC +0.5% en 1 día
→ Dirección: ✅ (50 pts)
→ Precisión: 6.25% (3 pts)
→ Score: 53/100 ⚠️ POOR (técnicamente good pero al borde)
```

### Caso 4: Predicción Fallida
```
Predicho: NVDA +4% en 1 día
Real: NVDA -2% en 1 día
→ Dirección: ❌ (0 pts)
→ Precisión: 0% (0 pts)
→ Score: 0/100 ❌ FAILED
```

## Nuevas Métricas en UI

### Panel de Calidad
Muestra distribución de predicciones:
- 🎯 Excelentes (>75%)
- 👍 Buenas (50-75%)
- ⚠️ Pobres (25-50%)
- ❌ Fallidas (<25%)

### Score Promedio
Muestra el score promedio de todas las predicciones verificadas.

### Historial Individual
Cada predicción muestra:
- Cambio predicho vs real
- Score numérico con color
- Emoji de calidad

## Impacto en el Aprendizaje

Este sistema permite:
1. **Evaluar mejor la IA**: No basta con acertar la dirección
2. **Optimizar factores**: Identificar qué factores mejoran la precisión del %
3. **Ajustar confianza**: Correlacionar confianza con accuracy score
4. **Mejorar estrategia**: Las predicciones "pobres" indican que algo falla en el cálculo

## Próximos Pasos

- [x] ~~Usar `accuracyScore` para ajustar pesos de factores~~ ✅ Implementado en `weight-optimizer-service.ts`
- [x] ~~Penalizar más las predicciones "poor" en el entrenamiento~~ ✅ Poor +25%, Failed +50% penalización extra
- [x] ~~Ajustar pesos según volatilidad del activo~~ ✅ Implementado en `prediction-calculator.ts`
- [x] ~~Crear modelo ML que prediga el accuracy esperado~~ ✅ Implementado en `accuracy-predictor-service.ts`
- [x] ~~Ajustar timeframes según la precisión histórica~~ ✅ Sugerencia de mejor timeframe por símbolo

## Implementación de Accuracy Score en ML (v2.1)

### Función de Pérdida Mejorada

La función de pérdida ahora incluye 4 componentes:

```typescript
// En weight-optimizer-service.ts
LOSS_ALPHA = 0.35  // Dirección correcta
LOSS_BETA = 0.25   // Precisión de magnitud
LOSS_GAMMA = 0.10  // Rango min-max
LOSS_DELTA = 0.30  // Accuracy Score (NUEVO)
```

### Penalización por Calidad

```typescript
// Predicciones failed (<25 accuracy): +50% penalización
if (pred.predictionQuality === 'failed') {
  accuracyLoss = accuracyLoss * 1.5;
}
// Predicciones poor (25-50 accuracy): +25% penalización
else if (pred.predictionQuality === 'poor') {
  accuracyLoss = accuracyLoss * 1.25;
}
```

### Ajuste por Volatilidad

Los pesos se ajustan dinámicamente según la volatilidad del activo:

| Volatilidad | Técnico/Sentiment | Fundamentales |
|-------------|-------------------|---------------|
| Baja (<20%) | ↓ Reducido | ↑ Aumentado |
| Media (20-50%) | Normal | Normal |
| Alta (>50%) | ↑ Aumentado | ↓ Reducido |

Ejemplo para Bitcoin (volatilidad 70%):
- `technical`: peso x1.5
- `sentiment`: peso x1.4
- `financials`: peso x0.5

Ejemplo para Coca-Cola (volatilidad 15%):
- `technical`: peso x0.7
- `institutional`: peso x1.4
- `financials`: peso x1.5

## Predicción de Accuracy Esperado (v2.2)

### ¿Qué hace?

Cuando haces una predicción, ahora el sistema te dice:
- **"Accuracy esperado: 65%"** - Basado en predicciones similares del pasado
- **"Probabilidad de acertar dirección: 72%"** - Historial de acierto en dirección
- **"Sugerencia: usar timeframe swing"** - Si otro timeframe funciona mejor

### Cómo funciona

El servicio `accuracy-predictor-service.ts` construye un modelo basado en:

1. **Por símbolo** (peso más alto):
   - ¿Cómo ha funcionado el sistema con AAPL en el pasado?
   
2. **Por combinación timeframe + volatilidad**:
   - ¿Cómo funcionan predicciones de swing + alta volatilidad?
   
3. **Por confianza**:
   - ¿Las predicciones con 70-79% de confianza aciertan más?
   
4. **Por tipo de activo**:
   - ¿Las predicciones de crypto son menos precisas que stocks?

### Ejemplo de uso

```typescript
// El resultado ahora incluye:
{
  expectedAccuracy: {
    score: 62,           // Esperamos 62% de accuracy
    quality: 'good',     // Clasificación esperada
    directionProbability: 68,  // 68% probabilidad de acertar dirección
    confidence: 'medium',      // Confianza en esta estimación
    basedOnSamples: 45,        // Basado en 45 predicciones históricas
    explanation: "Basado en historial de AAPL (45 predicciones)",
    suggestedTimeframe: "swing"  // ¡Mejor usar swing para este símbolo!
  }
}
```

### Mejor Timeframe por Símbolo

El sistema aprende qué timeframe funciona mejor para cada activo:

| Símbolo | Mejor Timeframe | Accuracy Histórico |
|---------|-----------------|-------------------|
| AAPL | swing | 71% |
| BTC-USD | intraday | 58% |
| MSFT | longterm | 74% |

Cuando pides predicción de 1 día para AAPL pero el sistema sabe que swing funciona mejor, te lo sugiere.
