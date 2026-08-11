// ---------------------------------------------------------------------------
// AgentX Gateway — Auth Middleware
// ---------------------------------------------------------------------------
// EIP-191 wallet signature auth + JWT + auto tenant creation.
// ---------------------------------------------------------------------------

import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { ethers } from 'ethers'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { getPool } from '../lib/db'
import { getRedis } from './rate-limiter'

export interface TenantContext {
  id: string
  walletAddress: string
  planId: string
  planSlug: string
  quotaDaily: number
  quotaUsed: number
  rateLimitRpm: number
  maxConcurrent: number
  status: string
  /** R14: tenant category — 'user' (registered) | 'partner' (B-end integration) */
  kind: string
  /** P9: tenant-level override for parallel tasks (NULL = inherit plan.features.parallel_tasks) */
  allowParallelTasks: boolean | null
  /** P9: plan.features JSONB — contains parallel_tasks capability bit */
  planFeatures: Record<string, unknown> | null
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext
    }
  }
}

interface Challenge {
  address: string
  timestamp: number
  nonce: string
}

// Challenge TTL in seconds (matches the 5-minute window)
const CHALLENGE_TTL_SEC = 5 * 60

// ── API key issuance & hashing (R19.1, D8/T2) ─────────────────────────────
// New keys are stored ONLY as SHA-256 digests (api_key_hash) and returned to
// the caller exactly once at issuance. Legacy plaintext keys (tenants.api_key)
// remain readable and keep working via the fallback match in apiKeyAuth.
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

function generateApiKey(): string {
  return 'agentx_' + crypto.randomBytes(16).toString('hex')
}

// ── Shared tenant loading (single source of truth for SQL + row mapping) ──
// Used by verifyChallenge (by wallet), authMiddleware (by JWT tenant id) and
// apiKeyAuth (by api_key). Must always include t.kind ('user' | 'partner'),
// allow_parallel_tasks and plan.features (P9 capability bits for parallel tasks).
const TENANT_SELECT_COLUMNS = `t.id, t.wallet_address, t.status, t.api_key, t.api_key_hash,
        t.quota_daily, t.quota_used, t.rate_limit_rpm, t.max_concurrent,
        t.kind, t.allow_parallel_tasks,
        p.id as plan_id, p.slug as plan_slug, p.features as plan_features`

async function queryTenant(where: string, params: unknown[]): Promise<any> {
  const { rows } = await getPool().query(
    `SELECT ${TENANT_SELECT_COLUMNS}
     FROM tenants t
     LEFT JOIN plans p ON t.plan_id = p.id
     WHERE ${where}`,
    params
  )
  return rows[0] ?? null
}

function rowToTenant(row: any): TenantContext {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    planId: row.plan_id || '',
    planSlug: row.plan_slug || 'free',
    quotaDaily: row.quota_daily,
    quotaUsed: row.quota_used,
    rateLimitRpm: row.rate_limit_rpm,
    maxConcurrent: row.max_concurrent,
    status: row.status,
    kind: row.kind ?? 'user',
    allowParallelTasks: row.allow_parallel_tasks ?? null,
    planFeatures: row.plan_features ?? null,
  }
}

/**
 * Store a challenge in Redis so it works across PM2 cluster workers.
 * Falls back to an in-memory Map when Redis is unavailable (single-process dev).
 */
const fallbackMap = new Map<string, Challenge>()

function challengeKey(address: string): string {
  return `auth:challenge:${address}`
}

async function saveChallenge(address: string, challenge: Challenge): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.setex(challengeKey(address), CHALLENGE_TTL_SEC, JSON.stringify(challenge))
  } else {
    fallbackMap.set(address, challenge)
  }
}

async function loadChallenge(address: string): Promise<Challenge | undefined> {
  const r = getRedis()
  if (r) {
    const raw = await r.get(challengeKey(address))
    if (raw) return JSON.parse(raw) as Challenge
    return undefined
  }
  return fallbackMap.get(address)
}

async function deleteChallenge(address: string): Promise<void> {
  const r = getRedis()
  if (r) {
    await r.del(challengeKey(address))
  } else {
    fallbackMap.delete(address)
  }
}

export async function getChallenge(req: Request, res: Response): Promise<void> {
  const address = (req.query.address as string || '').toLowerCase()
  if (!address) {
    res.status(400).json({ error: 'Missing wallet address' })
    return
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(16).toString('hex')
  const message = `agentx:auth:${timestamp}:${nonce}`

  await saveChallenge(address, { address, timestamp, nonce })

  res.json({ challenge: message, timestamp, nonce })
}

export async function verifyChallenge(req: Request, res: Response): Promise<void> {
  const { wallet_address, signature, timestamp, nonce, intent } = req.body
  // R19.1: intent='partner' provisions a B-end tenant (kind='partner') on first
  // sign-in. Registered users (C-end) omit intent. Existing tenants keep their
  // original kind regardless of intent — one wallet maps to one tenant (T3).
  const wantPartner = intent === 'partner'

  if (!wallet_address || !signature) {
    res.status(400).json({ error: 'Missing wallet_address or signature' })
    return
  }

  const address = wallet_address.toLowerCase()
  const challenge = await loadChallenge(address)

  if (!challenge || challenge.nonce !== nonce) {
    res.status(401).json({ error: 'Challenge expired or not found. Please request a new challenge.' })
    return
  }

  const expectedMessage = `agentx:auth:${timestamp}:${nonce}`
  let recovered: string
  try {
    recovered = ethers.verifyMessage(expectedMessage, signature).toLowerCase()
  } catch {
    res.status(401).json({ error: 'Invalid signature' })
    return
  }

  if (recovered !== address) {
    res.status(401).json({ error: 'Signature does not match wallet address' })
    return
  }

  await deleteChallenge(address)

  const pool = getPool()
  let tenant: TenantContext | null = null
  let apiKey: string | null = null
  let isNew = false

  const row = await queryTenant('LOWER(t.wallet_address) = $1', [address])

  if (row) {
    if (row.status === 'suspended') {
      res.status(403).json({ error: 'Account suspended' })
      return
    }
    // Legacy tenants without any key get a new hashed key issued exactly once.
    // Hashed-key tenants (api_key NULL, api_key_hash set) never receive a key again.
    if (!row.api_key && !row.api_key_hash) {
      apiKey = generateApiKey()
      await pool.query(
        `UPDATE tenants SET api_key_hash = $1, api_key = NULL WHERE id = $2`,
        [hashApiKey(apiKey), row.id]
      )
      isNew = true
    } else {
      apiKey = row.api_key || null
    }
    tenant = rowToTenant(row)
    ;(tenant as any).apiKey = apiKey
  } else if (wantPartner) {
    // R19.1 B-end self-service: no free plan (D10/T3) — plan_id NULL, quota 0.
    // Platform LLM stays unusable until the tenant subscribes (R19.3).
    apiKey = generateApiKey()
    const inserted = await pool.query(
      `INSERT INTO tenants (wallet_address, kind, plan_id, quota_daily, rate_limit_rpm, max_concurrent, api_key_hash)
       VALUES ($1, 'partner', NULL, 0, 5, 1, $2)
       RETURNING id`,
      [address, hashApiKey(apiKey)]
    )
    tenant = {
      id: inserted.rows[0].id,
      walletAddress: address,
      planId: '',
      planSlug: '',
      quotaDaily: 0,
      quotaUsed: 0,
      rateLimitRpm: 5,
      maxConcurrent: 1,
      status: 'active',
      kind: 'partner',
      allowParallelTasks: null,
      planFeatures: null,
    }
    ;(tenant as any).apiKey = apiKey
    isNew = true
  } else {
    const freePlan = await pool.query(`SELECT id, features FROM plans WHERE slug = 'free' LIMIT 1`)
    const planId = freePlan.rows[0]?.id || null
    apiKey = generateApiKey()

    const inserted = await pool.query(
      `INSERT INTO tenants (wallet_address, kind, plan_id, quota_daily, rate_limit_rpm, max_concurrent, api_key_hash)
       VALUES ($1, 'user', $2, 0, 5, 1, $3)
       RETURNING id`,
      [address, planId, hashApiKey(apiKey)]
    )
    tenant = {
      id: inserted.rows[0].id,
      walletAddress: address,
      planId: planId || '',
      planSlug: 'free',
      quotaDaily: 0,
      quotaUsed: 0,
      rateLimitRpm: 5,
      maxConcurrent: 1,
      status: 'active',
      kind: 'user',
      allowParallelTasks: null,
      planFeatures: freePlan.rows[0]?.features ?? null,
    }
    // Return api_key on first registration only
    ;(tenant as any).apiKey = apiKey
    isNew = true
  }

  const token = jwt.sign(
    { tenantId: tenant.id, walletAddress: tenant.walletAddress },
    config.jwtSecret,
    { expiresIn: config.sessionTtlSec }
  )

  res.json({
    access_token: token,
    expires_in: config.sessionTtlSec,
    tenant,
    api_key: apiKey,
    is_new: isNew,
  })
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Already authenticated via X-Api-Key
  if (req.tenant) {
    next()
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  let decoded: { tenantId: string; walletAddress: string }
  try {
    decoded = jwt.verify(token, config.jwtSecret) as typeof decoded
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  try {
    const row = await queryTenant('t.id = $1', [decoded.tenantId])
    if (!row) {
      res.status(401).json({ error: 'Tenant not found' })
      return
    }
    if (row.status === 'suspended') {
      res.status(403).json({ error: 'Account suspended' })
      return
    }
    req.tenant = rowToTenant(row)
    next()
  } catch (err) {
    next(err)
  }
}

// ── API Key retrieval ──────────────────────────────────────────────────

export async function getApiKey(req: Request, res: Response): Promise<void> {
  if (!req.tenant) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const pool = getPool()
  const result = await pool.query(
    `SELECT api_key FROM tenants WHERE id = $1`,
    [req.tenant.id]
  )

  if (result.rows.length === 0 || !result.rows[0].api_key) {
    // R19.1: hashed-key tenants never store plaintext — the key is shown once
    // at issuance. A rotation endpoint (R19.2 panel) will be the recovery path.
    res.status(404).json({ error: 'API key not found (hashed keys are shown once at issuance)' })
    return
  }

  res.json({ api_key: result.rows[0].api_key })
}

// ── X-Api-Key authentication (alternative to JWT) ──────────────────────

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string
  if (!apiKey) {
    // No API key header → let JWT auth handle it
    next()
    return
  }

  // R19.1: match the SHA-256 digest first (new keys), fall back to the legacy
  // plaintext column (pre-migration tenants).
  queryTenant('t.api_key_hash = $1 OR t.api_key = $2', [hashApiKey(apiKey), apiKey])
    .then(row => {
      if (!row) {
        res.status(401).json({ error: 'Invalid API key' })
        return
      }
      if (row.status === 'suspended') {
        res.status(403).json({ error: 'Account suspended' })
        return
      }
      req.tenant = rowToTenant(row)
      next()
    })
    .catch(err => {
      next(err)
    })
}
