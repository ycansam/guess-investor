# Guess Investor Backend

API REST para el servicio de predicción de inversiones.

## 🚀 Quick Start

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Generar cliente Prisma
npm run db:generate

# Crear base de datos (SQLite)
npm run db:push

# Iniciar en desarrollo
npm run dev
```

El servidor estará en `http://localhost:3001`

## 📁 Estructura

```
backend/
├── src/
│   ├── config/          # Configuración
│   ├── controllers/     # Handlers de endpoints
│   ├── middleware/      # Error handling, logging
│   ├── models/          # Tipos TypeScript + Zod schemas
│   ├── repositories/    # Acceso a datos (Prisma)
│   ├── routes/          # Definición de rutas
│   ├── services/        # Lógica de negocio
│   │   └── external/    # APIs externas (Yahoo, etc.)
│   └── app.ts           # Entry point
├── prisma/
│   └── schema.prisma    # Schema de base de datos
└── package.json
```

## 📡 API Endpoints

### Assets
```
GET  /api/assets/search?q=AAPL     # Buscar activos
GET  /api/assets/:symbol/quote      # Cotización actual
GET  /api/assets/:symbol/history    # Datos históricos
```

### Favorites
```
GET    /api/favorites               # Listar favoritos
POST   /api/favorites               # Añadir favorito
DELETE /api/favorites/:symbol       # Eliminar favorito
GET    /api/favorites/:symbol/check # Verificar si es favorito
PUT    /api/favorites/reorder       # Reordenar favoritos
```

### Predictions
```
POST   /api/predictions             # Crear predicción
GET    /api/predictions/:id         # Obtener predicción
GET    /api/predictions/symbol/:sym # Predicciones por símbolo
GET    /api/predictions/pending     # Pendientes de verificar
POST   /api/predictions/:id/verify  # Verificar predicción
GET    /api/predictions/stats       # Estadísticas
```

### Health
```
GET    /api/health                  # Estado del servidor
```

## 🔧 Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo con hot reload |
| `npm run build` | Compilar TypeScript |
| `npm start` | Ejecutar build |
| `npm run db:generate` | Generar cliente Prisma |
| `npm run db:push` | Aplicar schema a DB |
| `npm run db:migrate` | Crear migración |
| `npm run db:studio` | UI de Prisma |

## 🗄️ Base de Datos

- **Desarrollo**: SQLite (`./dev.db`)
- **Producción**: PostgreSQL

### Modelos principales:
- `Prediction` - Predicciones generadas
- `Favorite` - Activos favoritos
- `LearnedWeights` - Pesos del sistema ML
- `AssetAdjustment` - Ajustes por activo
- `MarketDataCache` - Cache de datos de mercado

## 🔐 Variables de Entorno

```env
NODE_ENV=development
PORT=3001
DATABASE_URL="file:./dev.db"
FRONTEND_URL=http://localhost:8081
RAPIDAPI_KEY=opcional
FRED_API_KEY=opcional
```
