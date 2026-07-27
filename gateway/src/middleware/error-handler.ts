// ---------------------------------------------------------------------------
// AgentX Gateway — Unified Error Handler
// ---------------------------------------------------------------------------
// AppError hierarchy + global Express error middleware.
// Replaces scattered res.status(500).json({ error: err.message }) patterns.
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express'

// ── Error Classes ────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly expose: boolean

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', expose = false) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.expose = expose
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST', true)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED', true)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN', true)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND', true)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, 'CONFLICT', true)
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'TOO_MANY_REQUESTS', true)
  }
}

// ── Global Error Handler Middleware ───────────────────────────────────────

/**
 * Centralized Express error handler.
 * - AppError subclasses → use their statusCode + expose message
 * - Unknown errors → 500 with safe message (no leak)
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: err.expose ? err.message : 'Internal server error',
      code: err.code,
    }
    // Attach details only in development
    if (process.env.NODE_ENV === 'development' && !err.expose) {
      body.detail = err.message
    }
    res.status(err.statusCode).json(body)
    return
  }

  // Unknown / unexpected error — never leak message to client
  console.error('[Gateway Error]', err)
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' ? { detail: err.message } : {}),
  })
}

/**
 * Async route wrapper — catches thrown errors and forwards them to next().
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}
