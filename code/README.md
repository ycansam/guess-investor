# Guess Investor - App React Native

**Última actualización:** 22 de enero de 2026  
**Versión:** 1.5.0

Aplicación móvil de predicción de inversiones construida con [Expo](https://expo.dev) y React Native.

## 🆕 Novedades v1.5.0

- **Classifier Learning**: El sistema ML aprende de predicciones verificadas
- **UI Simplificada**: Eliminados selectores de categorías (Tech USA, Crypto, España)
- **factorBreakdown Fix**: Los datos de factores se guardan correctamente para entrenamiento
- **Multiplicadores Dinámicos**: Ajuste automático de pesos por grupo de activo

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
│   ├── TrackingStatsCard.tsx    # Estadísticas de tracking
│   └── _shared/             # Componentes compartidos
├── services/                # Servicios y lógica
│   ├── api-client.ts        # Cliente API del backend
│   ├── ai-service.ts        # Servicio de predicciones IA
│   ├── market-data-service.ts   # Datos de mercado
│   ├── training-cache-service.ts # Cache de predicciones
│   └── favorites-service-v2.ts  # Gestión de favoritos
├── store/                   # Estado global (Zustand)
│   └── prediction-store.ts
├── types/                   # Tipos TypeScript
└── config/                  # Configuración
    └── learned_weights.json # Pesos aprendidos
```

## 📱 Pestañas

| Tab | Descripción |
|-----|-------------|
| **Predicciones** | Lista de activos con predicciones, filtros de ordenamiento y timeframe |
| **Favoritos** | Activos guardados para acceso rápido |
| **Tendencias** | Top gainers, losers y rachas del mercado |

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

## 📚 Más Información

- [Expo documentation](https://docs.expo.dev/)
- [Backend README](../backend/README.md)
- [Python ML README](../python/README.md)
- [Proyecto principal](../README.md)
