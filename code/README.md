# Guess Investor - App React Native

**Última actualización:** 15 de enero de 2026

Aplicación móvil de predicción de inversiones construida con [Expo](https://expo.dev) y React Native.

## 🆕 Novedades v1.6.0

- **Multi-Timeframe**: Soporte completo para predicciones Intraday, Swing (7d) y Long (30d)
- **Vista de Tendencias**: Nueva página con análisis de mercado
- **Modal de Predicciones**: Vista detallada de predicciones activas
- **Clasificador Mejorado**: Sistema de bonus para predicciones

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
│   ├── _layout.tsx          # Layout principal con tabs
│   ├── index.tsx            # Tab de predicciones
│   ├── explore.tsx          # Explorar activos
│   ├── favorites.tsx        # Gestión de favoritos
│   └── profile.tsx          # Perfil y estadísticas
├── components/              # Componentes reutilizables
│   ├── AddInvestmentForm.tsx
│   ├── PredictionCard.tsx
│   └── ...
├── services/                # Servicios y lógica
│   ├── api.service.ts       # Cliente API del backend
│   ├── yahoo.service.ts     # Yahoo Finance
│   └── ...
├── store/                   # Estado global (Zustand)
│   └── investmentStore.ts
├── types/                   # Tipos TypeScript
└── utils/                   # Utilidades
```

## 📱 Pantallas

| Tab | Descripción |
|-----|-------------|
| **Predicciones** | Lista de predicciones activas con favoritos primero |
| **Explorar** | Buscar y explorar +120 activos |
| **Favoritos** | Gestionar activos favoritos |
| **Perfil** | Estadísticas y configuración |

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
