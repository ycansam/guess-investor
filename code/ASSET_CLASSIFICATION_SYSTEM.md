# Sistema de Clasificación Automática de Activos 🎯

## Problema Resuelto

**Antes**: El sistema trataba igual a todos los activos, sin considerar que Bitcoin (muy volátil, crypto 24/7) requiere estrategias diferentes que Amazon (más estable, largo plazo).

**Ahora**: El sistema analiza automáticamente cada activo y recomienda el timeframe óptimo (intraday/swing/longterm) basándose en:
- Volatilidad histórica
- Tipo de activo (crypto/stock/ETF)
- Patrones de precio
- **Performance histórica de predicciones**

---

## Funcionamiento

### 1. Análisis Automático de Activos

Cuando analizas un activo, el sistema calcula:

#### Métricas de Volatilidad
```typescript
volatility30d: 2.5%        // Desviación estándar de cambios diarios
avgDailyChange: 1.8%       // Cambio promedio absoluto
maxDailySwing: 5.2%        // Máximo movimiento en un día
```

#### Patrones de Comportamiento
```typescript
trendStrength: 70/100      // Qué tan bien sigue tendencias
meanReversion: 45/100      // Tendencia a volver a la media
volumeConsistency: 82/100  // Consistencia del volumen
```

### 2. Scoring de Timeframes

El sistema asigna un score 0-100 a cada timeframe:

```typescript
{
  intraday: 85,   // Bitcoin: alta volatilidad + crypto 24/7
  swing: 60,      // Moderado
  longterm: 30    // Bajo para activos volátiles
}

// vs

{
  intraday: 30,   // Amazon: baja volatilidad
  swing: 60,      // Moderado  
  longterm: 85    // Óptimo para large caps estables
}
```

### 3. Aprendizaje Continuo

Cada vez que se verifica una predicción:
1. Se calcula el `accuracyScore` (0-100)
2. Se actualiza el score aprendido del timeframe:
   ```typescript
   learnedScore = currentScore * 0.7 + newAccuracy * 0.3
   ```
3. El sistema combina características + aprendizaje:
   ```typescript
   finalScore = learned * 0.6 + characteristics * 0.4
   ```

---

## Ejemplo: Bitcoin vs Amazon

### Bitcoin (BTC-USD)

```typescript
// Características detectadas
{
  assetType: 'crypto',
  volatility30d: 4.2,           // ¡Muy alto!
  avgDailyChange: 3.1,
  maxDailySwing: 8.5,
  trendStrength: 55,
  meanReversion: 65              // Tiende a oscilar
}

// Recomendación inicial
recommendedTimeframes: {
  intraday: 80,   // ⭐ Recomendado
  swing: 55,
  longterm: 25
}

// Después de 50 predicciones verificadas
learnedTimeframes: {
  intraday: 72,   // Accuracy real: 72%
  swing: 58,      // Accuracy real: 58%
  longterm: 45    // Accuracy real: 45%
}

// Score final (60% aprendido + 40% características)
finalScore: {
  intraday: 75,   // ⭐⭐ MEJOR OPCIÓN
  swing: 57,
  longterm: 32
}
```

### Amazon (AMZN)

```typescript
// Características detectadas
{
  assetType: 'stock',
  volatility30d: 1.2,           // Bajo
  avgDailyChange: 0.8,
  maxDailySwing: 2.3,
  trendStrength: 75,            // Tendencias fuertes
  meanReversion: 35             // No oscila tanto
}

// Recomendación inicial
recommendedTimeframes: {
  intraday: 30,
  swing: 65,
  longterm: 85    // ⭐ Recomendado
}

// Después de 50 predicciones verificadas
learnedTimeframes: {
  intraday: 45,   // Accuracy real: 45%
  swing: 68,      // Accuracy real: 68%
  longterm: 78    // Accuracy real: 78%
}

// Score final
finalScore: {
  intraday: 36,
  swing: 67,
  longterm: 82    // ⭐⭐ MEJOR OPCIÓN
}
```

---

## UI: Badge de Recomendación

En la lista de activos, verás una estrella ⭐ al lado del nombre cuando el timeframe seleccionado coincide con el recomendado:

```
📊 Bitcoin    ⭐         // Timeframe: Intraday (recomendado)
   BTC        €78,432
                        +2.3%

📦 Amazon              // Timeframe: Intraday (no recomendado)
   AMZN       €156
                        +0.5%
```

Cambia al timeframe "Largo Plazo" y verás la estrella en Amazon en lugar de Bitcoin.

---

## Reglas de Clasificación

### Favorece Intraday si:
- Crypto (24/7 disponible)
- Volatilidad >3%
- Cambio diario >2%
- Mean reversion alto (oscila mucho)
- Max swing >5%

### Favorece Swing si:
- Volatilidad moderada (1.5-3%)
- Tendencias fuertes (>70/100)
- Cambio diario 0.5-2%

### Favorece Largo Plazo si:
- Stock de large cap
- Volatilidad baja (<1.5%)
- Cambio diario <0.5%
- Tendencias estables y consistentes

---

## Impacto en Machine Learning

El sistema de ML puede ahora:

1. **Aprender pesos diferentes por timeframe**
   ```
   Intraday: Technical +30%, Sentiment +25% (reacción rápida)
   Swing: Trend +35%, Technical +20% (momentum)
   Longterm: Financials +30%, Macro +25% (fundamentales)
   ```

2. **Optimizar predicciones por activo**
   - Bitcoin → usar más datos técnicos e intradía
   - Amazon → usar más fundamentales y macro

3. **Detectar timeframes sub-óptimos**
   - Si predictions de Amazon en intraday fallan consistentemente
   - El sistema aprenderá a puntuarlas bajo
   - Y recomendará cambiar a largo plazo

---

## Cómo Usar

### 1. Entrenar con Recomendaciones
```
1. Abre "Predicciones"
2. Selecciona timeframe "Intraday"
3. Busca activos con ⭐ (Bitcoin, cryptos)
4. Haz predicciones
5. Cuando se verifiquen, el sistema aprenderá
```

### 2. Experimentar con Otros Timeframes
```
- Puedes ignorar las recomendaciones
- El sistema aprenderá de todos modos
- Si Amazon funciona mejor en swing, lo detectará
```

### 3. Ver Características
```typescript
// En consola:
const characteristics = await assetClassifierService.analyzeAsset('AAPL');
console.log(characteristics);

// Output:
{
  volatility30d: 1.5,
  recommendedTimeframes: { intraday: 40, swing: 70, longterm: 80 },
  learnedTimeframes: { intraday: 48, swing: 72, longterm: 76 }
}
```

---

## Almacenamiento

Las clasificaciones se guardan en AsyncStorage con cache de 24h:

```typescript
{
  "AAPL": {
    symbol: "AAPL",
    volatility30d: 1.5,
    recommendedTimeframes: {...},
    learnedTimeframes: {...},
    lastUpdated: "2025-12-21T..."
  },
  "BTC-USD": {
    symbol: "BTC-USD",
    volatility30d: 4.2,
    ...
  }
}
```

---

## Próximos Pasos

- [ ] Entrenar modelos ML separados por timeframe
- [ ] Dashboard con accuracy por timeframe y activo
- [ ] Alertas: "Este activo funciona mejor en swing"
- [ ] Sugerencias automáticas: "Prueba BTC en intraday"
- [ ] Análisis de correlación: qué factores pesan más por timeframe

---

## Ejemplo de Uso Completo

```typescript
// 1. Analizar activo
const chars = await assetClassifierService.analyzeAsset('TSLA');

// 2. Obtener recomendación
const recs = await assetClassifierService.getRecommendedTimeframe('TSLA');
console.log(recs);
// [
//   { timeframe: 'swing', score: 75, reason: 'Tendencias 72/100, volatilidad moderada' },
//   { timeframe: 'intraday', score: 65, reason: 'Volatilidad 2.8%, swings diarios' }
// ]

// 3. Hacer predicción en timeframe recomendado
// ... predicción se verifica ...

// 4. Sistema actualiza automáticamente
await assetClassifierService.updateLearnedTimeframe('TSLA', 'swing', 82);

// 5. Próxima vez la recomendación incluye el aprendizaje
const newRecs = await assetClassifierService.getRecommendedTimeframe('TSLA');
// [
//   { timeframe: 'swing', score: 79, reason: 'Accuracy histórica: 82%' }
// ]
```

---

Este sistema permite que la IA aprenda qué tipo de predicciones funcionan mejor para cada activo, en lugar de usar la misma estrategia para todos.
