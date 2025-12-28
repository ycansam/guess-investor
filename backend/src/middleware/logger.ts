import morgan from 'morgan';
import { config } from '../config/index.js';

// Formato de log personalizado
const format = config.isDev
  ? 'dev'
  : ':remote-addr - :method :url :status :res[content-length] - :response-time ms';

export const requestLogger = morgan(format);

// Logger simple para servicios
export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    if (config.isDev) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
};
