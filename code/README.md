# Guess Investor - App React Native

**Última actualización:** 8 de febrero de 2026  
**Versión:** 1.6.0

Aplicación móvil de predicción de inversiones construida con [Expo](https://expo.dev) y React Native.

## 🆕 Novedades v1.6.0

### 📊 UX Desktop
- **Paginación desktop**: Carga 42 activos por página (grid 3x14)
- **Filtrado inteligente**: Los activos sin datos de precio válido no se muestran
- **Scroll infinito mejorado**: Debounce de 300ms y throttling optimizado
- **Footer informativo**: Muestra progreso de carga (ej: 42/523)

### 🧠 ML Diagnostics
- **Classifier samples actualizados**: Commodity muestra 107 muestras (antes 15)
- **Mejor detección**: 50+ commodity ETFs detectados correctamente

## 🆕 Novedades v2.0.0

- **Risk Filter UI**: Muestra advertencias de abstención
- **14 Factores**: 8 tradicionales + 6 intradía (trend, technical, sentiment, news, macro, forex, institutional, financials, intradayTrend, optionsFlow, volumeProfile, divergences, volatilityIV, marketBreadth)
- **Intervalos de Confianza**: Visualización de CI 50/80/95%
- **Commodity ETFs**: Detección automática y sincronización con futuro base
- **Forex mejorado**: 50+ exchanges con indicadores de riesgo

> **Eliminados**: Seasonality, Competitors, Expectations (ruido sin valor predictivo)

## 🚀 Get Started

1. Instalar dependencias

   ```bash
   npm install
   ```

2. Iniciar el backend primero

   ```bash
   cd ../backend
   npm run dev
   ```

3. (Opcional) Iniciar Python ML Server

   ```bash
   cd ../python
   python server.py
   ```

4. Iniciar la app

   ```bash
   npm start
   ```

## 📁 Estructura

```
code/
├── app/                     # Pantallas (file-based routing)
│   ├── _layout.tsx          # Layout principal
│   ├── index.tsx            # Home con tabs
│   └── asset/               # Página de detalle de activo
├── components/              # Componentes organizados por feature
│   ├── home/                # Componentes de la pantalla principal
│   │   ├── market-predictions/  # Lista de activos con predicciones
│   │   ├── favorites-list/      # Lista de favoritos
│   │   └── tab-bar/             # Barra de pestañas
│   ├── prediction-card/     # Tarjeta de predicción
│   ├── predictions-list/    # Lista de predicciones
│   ├── top-trends/          # Tendencias del mercado
│   ├── ml-diagnostics-modal/    # Diagnóstico de ML
│   ├── risk-filter/         # Visualización Risk Filter
│   └── _shared/             # Componentes compartidos
├── services/                # Servicios y lógica
│   ├── api-client.ts        # Cliente API del backend
│   ├── ai-service.ts        # Servicio de predicciones IA
│   ├── market-data-service.ts   # Datos de mercado
│   └── favorites-service-v2.ts  # Gestión de favoritos
├── store/                   # Estado global (Zustand)
│   └── prediction-store.ts
├── types/                   # Tipos TypeScript
└── config/                  # Configuración
```

## 📱 Pestañas

| Tab | Descripción |
|-----|-------------|
| **Predicciones** | Lista de activos con predicciones y filtros |
| **Favoritos** | Activos guardados para acceso rápido |
| **Tendencias** | Top gainers, losers y rachas del mercado |

## 🎯 Datos de Predicción

La app muestra para cada activo:

- **Dirección**: UP / DOWN / NEUTRAL con emoji
- **Cambio esperado**: Porcentaje predicho
- **Confianza**: 0-100% con color coding
- **Recomendación**: strong_buy, buy, hold, sell, etc.
- **Risk Filter**: Advertencia si shouldAbstain=true
- **Factor Breakdown**: Puntuación de cada factor
- **Intervalos de confianza**: 50%, 80%, 95%

## 🔗 Conexión con Backend

La app se conecta al backend en `http://localhost:3001` para:
- Obtener predicciones con ensemble de 7 modelos
- Buscar activos y cotizaciones
- Gestionar favoritos
- Verificar predicciones
- Obtener estadísticas de ML

## 🛠️ Desarrollo

```bash
# Iniciar en modo desarrollo
npm start

# Build para Android
npx expo build:android

# Build para iOS
npx expo build:ios
```

## 📊 Timeframes

| Timeframe | Descripción |
|-----------|-------------|
| **Intraday** | Predicción para cierre del día |
| **Swing** | 2-7 días |
| **Long** | >7 días |

# Build para iOS
npx expo build:ios
```

## 📚 Más Información

- [Expo documentation](https://docs.expo.dev/)
- [Backend README](../backend/README.md)
- [Python ML README](../python/README.md)
- [Proyecto principal](../README.md)
