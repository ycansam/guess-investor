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

- [ ] Usar `accuracyScore` para ajustar pesos de factores
- [ ] Penalizar más las predicciones "poor" en el entrenamiento
- [ ] Crear modelo ML que prediga el accuracy esperado
- [ ] Ajustar timeframes según la precisión histórica
