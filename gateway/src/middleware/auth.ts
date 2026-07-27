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
  const { wallet_address, signature, timestamp, nonce } = req.body

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

  const existing = await pool.query(
    `SELECT t.id, t.wallet_address, t.status,
            t.quota_daily, t.quota_used, t.rate_limit_rpm, t.max_concurrent,
            p.id as plan_id, p.slug as plan_slug
     FROM tenants t
     LEFT JOIN plans p ON t.plan_id = p.id
     WHERE LOWER(t.wallet_address) = $1`,
    [address]
  )

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    if (row.status === 'suspended') {
      res.status(403).json({ error: 'Account suspended' })
      return
    }
    tenant = {
      id: row.id,
      walletAddress: row.wallet_address,
      planId: row.plan_id || '',
      planSlug: row.plan_slug || 'free',
      quotaDaily: row.quota_daily,
      quotaUsed: row.quota_used,
      rateLimitRpm: row.rate_limit_rpm,
      maxConcurrent: row.max_concurrent,
      status: row.status,
    }
  } else {
    const freePlan = await pool.query(`SELECT id FROM plans WHERE slug = 'free' LIMIT 1`)
    const planId = freePlan.rows[0]?.id || null

    const inserted = await pool.query(
      `INSERT INTO tenants (wallet_address, plan_id, quota_daily, rate_limit_rpm, max_concurrent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [address, planId, 0, 5, 1]
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
    }
  }

  const token = jwt.sign(
    { tenantId: tenant.id, walletAddress: tenant.walletAddress },
    config.jwtSecret,
    { expiresIn: config.sessionTtlSec }
  )

  res.json({ access_token: token, expires_in: config.sessionTtlSec, tenant })
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
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

  getPool()
    .query(
      `SELECT t.id, t.wallet_address, t.status,
              t.quota_daily, t.quota_used, t.rate_limit_rpm, t.max_concurrent,
              p.id as plan_id, p.slug as plan_slug
       FROM tenants t
       LEFT JOIN plans p ON t.plan_id = p.id
       WHERE t.id = $1`,
      [decoded.tenantId]
    )
    .then(r => {
      if (r.rows.length === 0) {
        res.status(401).json({ error: 'Tenant not found' })
        return
      }
      const row = r.rows[0]
      if (row.status === 'suspended') {
        res.status(403).json({ error: 'Account suspended' })
        return
      }
      req.tenant = {
        id: row.id,
        walletAddress: row.wallet_address,
        planId: row.plan_id || '',
        planSlug: row.plan_slug || 'free',
        quotaDaily: row.quota_daily,
        quotaUsed: row.quota_used,
        rateLimitRpm: row.rate_limit_rpm,
        maxConcurrent: row.max_concurrent,
        status: row.status,
      }
      next()
    })
    .catch(err => {
      next(err)
    })
}
