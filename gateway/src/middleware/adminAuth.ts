// ---------------------------------------------------------------------------
// AgentX Gateway — Admin Auth Middleware
// ---------------------------------------------------------------------------
// Simple shared-secret auth for admin routes.
// Pass via Authorization: Bearer <ADMIN_KEY> or X-Admin-Key header.
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express'

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_KEY

  if (!adminKey) {
    res.status(500).json({ error: 'Admin key not configured on server' })
    return
  }

  const authHeader = req.headers.authorization
  const xAdminKey = req.headers['x-admin-key'] as string | undefined

  let token: string | undefined
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else if (xAdminKey) {
    token = xAdminKey
  }

  if (!token || token !== adminKey) {
    res.status(401).json({ error: 'Unauthorized: invalid admin key' })
    return
  }

  next()
}
