/**
 * Guess Investor Backend
 * API REST para predicción de inversiones
 */

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { prisma } from './config/database.js';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger, requestLogger } from './middleware/logger.js';
import { apiRoutes } from './routes/index.js';

const app = express();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Seguridad
app.use(helmet());

// CORS
app.use(cors({
  origin: config.isDev ? '*' : config.frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(requestLogger);

// ============================================================================
// ROUTES
// ============================================================================

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Guess Investor API',
    version: '1.0.0',
    status: 'running',
    docs: '/api/health',
  });
});

// API routes
app.use('/api', apiRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Error handler
app.use(errorHandler);

// ============================================================================
// START SERVER
// ============================================================================

async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('📦 Database connected');

    // Start server
    app.listen(config.port, () => {
      logger.info(`🚀 Server running on http://localhost:${config.port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 Frontend URL: ${config.frontendUrl}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

start();

export default app;
