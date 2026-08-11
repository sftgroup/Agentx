// ---------------------------------------------------------------------------
// AgentX Gateway — Developer Application Routes (R13)
// ---------------------------------------------------------------------------
// R19.5 (D-1): the manual application flow is retired. B-end onboarding is now
// fully self-service: wallet sign-in at the /b console auto-provisions a
// kind='partner' tenant with a hashed API key (R19.1). This endpoint stays as
// a 410 so old callers get an explicit redirect signal instead of a silent 404.
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'

const router = Router()

// Public — no auth required. Deprecated since R19.5 (D-1).
router.post('/apply', (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'The application flow is retired. Use wallet self-service at /b (POST /api/v1/auth/verify with intent="partner") to create your business tenant and receive an API key instantly.',
    redirect: '/b',
  })
})

export default router
