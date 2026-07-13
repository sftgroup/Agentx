// ---------------------------------------------------------------------------
// @agentx/sdk — IPFS Fetcher
// ---------------------------------------------------------------------------
// Multi-gateway IPFS fetcher with in-memory cache, deduplication, and
// automatic fallback.  Compatible with the EncryptedPayload wire format.
// ---------------------------------------------------------------------------

import type { EncryptedPayload } from '../core/types'

// ── Types ───────────────────────────────────────────────────────────────────

export interface IPFSFetcherConfig {
  /** Primary IPFS gateway (default: ipfs.io) */
  gateway?: string
  /** Fallback gateways in order of preference */
  fallbackGateways?: string[]
  /** Request timeout in ms (default: 10_000) */
  timeoutMs?: number
  /** Max cached entries (LRU-like eviction, default: 200) */
  maxCache?: number
}

type CacheEntry<T> = {
  data: T
  timestamp: number
}

// ── Implementation ─────────────────────────────────────────────────────────

export class IPFSFetcher {
  private gateway: string
  private fallbackGateways: string[]
  private timeoutMs: number

  private cache = new Map<string, CacheEntry<unknown>>()
  private maxCache: number
  private pending = new Map<string, Promise<unknown>>()
  private failed = new Set<string>()

  constructor(config: IPFSFetcherConfig = {}) {
    this.gateway = config.gateway ?? 'ipfs.io'
    this.fallbackGateways = config.fallbackGateways ?? [
      'gateway.pinata.cloud',
      'dweb.link',
      'cf-ipfs.com',
    ]
    this.timeoutMs = config.timeoutMs ?? 10_000
    this.maxCache = config.maxCache ?? 200
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Fetch JSON from a single IPFS CID. */
  async fetchJSON<T = unknown>(cid: string): Promise<T> {
    const cached = this.cache.get(cid)
    if (cached) return cached.data as T

    if (this.failed.has(cid)) throw new Error(`CID ${cid} previously failed`)

    const pending = this.pending.get(cid)
    if (pending) return pending as Promise<T>

    const promise = this._doFetch<T>(cid)
    this.pending.set(cid, promise)

    try {
      const data = await promise
      this._cacheSet(cid, data)
      return data
    } catch (e) {
      this.failed.add(cid)
      throw e
    } finally {
      this.pending.delete(cid)
    }
  }

  /** Fetch encrypted agent payload (validates algorithm). */
  async fetchEncryptedPayload(cid: string): Promise<EncryptedPayload> {
    const raw = await this.fetchJSON<Record<string, unknown>>(cid)
    if (!raw.encrypted || raw.algorithm !== 'AES-256-GCM' || typeof raw.data !== 'string') {
      throw new Error(`Invalid EncryptedPayload at CID ${cid}`)
    }
    return raw as unknown as EncryptedPayload
  }

  /** Batch fetch multiple CIDs with concurrency control. */
  async fetchBatch<T = unknown>(cids: string[], concurrency = 5): Promise<Map<string, T>> {
    const results = new Map<string, T>()
    const unique = [...new Set(cids)].filter(c => this.isValidCID(c))

    for (let i = 0; i < unique.length; i += concurrency) {
      const batch = unique.slice(i, i + concurrency)
      const settled = await Promise.allSettled(
        batch.map(cid => this.fetchJSON<T>(cid))
      )
      settled.forEach((r, j) => {
        if (r.status === 'fulfilled') results.set(batch[j]!, r.value)
      })
      if (i + concurrency < unique.length) {
        await new Promise(r => setTimeout(r, 200))
      }
    }
    return results
  }

  /** Check if a string looks like a valid IPFS CID. */
  isValidCID(cid: string): boolean {
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,}|[A-Za-z0-9+/]{46,})$/.test(cid)
  }

  /** Clear cache (optionally for a specific CID). */
  clearCache(cid?: string): void {
    if (cid) {
      this.cache.delete(cid)
    } else {
      this.cache.clear()
    }
    this.failed.clear()
  }

  /** Number of cached entries. */
  get cacheSize(): number {
    return this.cache.size
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async _doFetch<T>(cid: string): Promise<T> {
    if (!this.isValidCID(cid)) throw new Error(`Invalid CID: ${cid}`)

    // Try primary gateway
    try {
      return await this._fetchFrom(cid, this.gateway, this.timeoutMs)
    } catch {
      // fall through to alternatives
    }

    // Try fallback gateways
    for (const gw of this.fallbackGateways) {
      try {
        return await this._fetchFrom(cid, gw, this.timeoutMs)
      } catch {
        // try next
      }
    }

    throw new Error(`All IPFS gateways failed for CID ${cid}`)
  }

  private async _fetchFrom<T>(cid: string, gateway: string, timeoutMs: number): Promise<T> {
    const url = `https://${gateway}/ipfs/${cid}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  }

  private _cacheSet(cid: string, data: unknown): void {
    this.cache.set(cid, { data, timestamp: Date.now() })
    // Simple LRU-like eviction
    if (this.cache.size > this.maxCache) {
      const oldest = [...this.cache.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0]
      if (oldest) this.cache.delete(oldest[0])
    }
  }
}

/** Singleton-friendly default instance. */
export const defaultIPFSFetcher = new IPFSFetcher()
