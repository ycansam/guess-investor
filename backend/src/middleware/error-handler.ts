import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

// Error personalizado para la API
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Errores comunes
export const NotFoundError = (resource: string) => 
  new ApiError(404, `${resource} not found`);

export const BadRequestError = (message: string) => 
  new ApiError(400, message);

export const UnauthorizedError = (message = 'Unauthorized') => 
  new ApiError(401, message);

// Middleware de manejo de errores
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[Error] ${err.message}`, err.stack);

  // Error de validación Zod
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Error de API personalizado
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details,
    });
    return;
  }

  // Error genérico
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

// Wrapper para async handlers (evita try-catch en cada controller)
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
