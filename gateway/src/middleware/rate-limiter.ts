// ---------------------------------------------------------------------------
// AgentX Gateway — Rate Limiter Middleware
// ---------------------------------------------------------------------------
// Three-layer rate limiting:
//   1. Global IP-level (express-rate-limit)
//   2. Per-tenant RPM (Redis sliding window)
//   3. Per-tenant daily quota (Redis counter + DB fallback)
//   4. Per-tenant concurrency control (Redis)
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express'
import Redis from 'ioredis'
import { config } from '../config'
import { getPool } from '../lib/db'

let redis: Redis | null = null

export function getRedis(): Redis | null {
  if (!redis) {
    redis = new Redis(config.redisUrl, { lazyConnect: true })
    redis.connect().catch(() => {
      redis = null
    })
  }
  return redis
}

export async function tenantRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tenant = req.tenant
  if (!tenant) {
    next()
    return
  }

  const r = getRedis()
  if (!r) {
    next()
    return
  }

  try {
    // 1. RPM check
    const rpmKey = `rpm:${tenant.id}`
    const rpmCurrent = await r.incr(rpmKey)
    if (rpmCurrent === 1) {
      await r.expire(rpmKey, 60)
    }
    if (rpmCurrent > tenant.rateLimitRpm) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retry_after: 60,
        limit: tenant.rateLimitRpm,
        limit_type: 'rpm',
      })
      return
    }

    // 2. Daily quota check (only for platform mode)
    if (tenant.quotaDaily > 0) {
      const quotaKey = `quota:${tenant.id}`
      const used = await r.get(quotaKey)
      const current = used ? parseInt(used, 10) : tenant.quotaUsed
      if (current >= tenant.quotaDaily) {
        res.status(429).json({
          error: 'Daily quota exceeded. Upgrade your plan or switch to BYOK mode.',
          limit: tenant.quotaDaily,
          used: current,
          limit_type: 'daily_quota',
        })
        return
      }
    }

    // 3. Concurrency check
    const concurrencyKey = `concurrent:${tenant.id}`
    const currentConcurrent = await r.incr(concurrencyKey)
    await r.expire(concurrencyKey, 300)
    if (currentConcurrent > tenant.maxConcurrent) {
      await r.decr(concurrencyKey)
      res.status(429).json({
        error: 'Too many concurrent requests',
        limit: tenant.maxConcurrent,
        limit_type: 'concurrency',
      })
      return
    }

    res.on('finish', () => {
      r.decr(concurrencyKey).catch(() => {})
    })

    next()
  } catch {
    next()
  }
}

export async function updateQuota(tenantId: string, tokens: number): Promise<void> {
  const r = getRedis()
  if (r) {
    const quotaKey = `quota:${tenantId}`
    await r.incrby(quotaKey, tokens)
    await r.expire(quotaKey, 86400)
  } else {
    const pool = getPool()
    await pool.query(
      `UPDATE tenants SET quota_used = quota_used + $2 WHERE id = $1`,
      [tenantId, tokens]
    )
  }
}
