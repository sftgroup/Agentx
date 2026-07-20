// ---------------------------------------------------------------------------
// @agentx/sdk — IPFS Uploader
// ---------------------------------------------------------------------------
// Lightweight IPFS upload via Pinata REST API (JWT auth) or custom endpoint.
// Zero extra deps — works in browser, Node, edge with native fetch.
// ---------------------------------------------------------------------------

import type { EncryptedPayload } from '../core/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface IPFSUploaderConfig {
  /** Pinata JWT token. Required for Pinata uploads. */
  pinataJwt?: string
  /** Custom IPFS API endpoint. Falls back to Pinata if not set. */
  customEndpoint?: string
  /** Custom API key for non-Pinata endpoints */
  customApiKey?: string
  /** Gateway URL for building access URLs (default: ipfs.io) */
  gatewayUrl?: string
  /** Request timeout in ms (default: 30_000) */
  timeoutMs?: number
  /** Pinata group ID for organizing pinned files */
  pinataGroupId?: string
  /** Metadata name prefix for pinned files */
  namePrefix?: string
}

export interface IPFSUploadResult {
  /** IPFS CID (Content Identifier) */
  cid: string
  /** Full IPFS gateway URL */
  url: string
  /** Raw response from the upload endpoint */
  raw: Record<string, unknown>
}

// ── Implementation ─────────────────────────────────────────────────────────

export class IPFSUploader {
  private pinataJwt: string | null
  private customEndpoint: string | null
  private customApiKey: string | null
  private gatewayUrl: string
  private timeoutMs: number
  private pinataGroupId: string | null
  private namePrefix: string

  private static readonly PINATA_JSON_API = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'
  private static readonly PINATA_FILE_API = 'https://api.pinata.cloud/pinning/pinFileToIPFS'

  constructor(config: IPFSUploaderConfig = {}) {
    this.pinataJwt = config.pinataJwt ?? null
    this.customEndpoint = config.customEndpoint ?? null
    this.customApiKey = config.customApiKey ?? null
    this.gatewayUrl = config.gatewayUrl ?? 'https://ipfs.io'
    this.timeoutMs = config.timeoutMs ?? 30_000
    this.pinataGroupId = config.pinataGroupId ?? null
    this.namePrefix = config.namePrefix ?? 'agentx-'
  }

  isConfigured(): boolean {
    if (this.customEndpoint) return true
    return !!this.pinataJwt
  }

  // ── JSON Upload ───────────────────────────────────────────────────────

  /**
   * Upload JSON-serializable data to IPFS.
   *
   * @param data       Any JSON-serializable value
   * @param metadata   Optional name / keyvalues for Pinata metadata
   */
  async uploadJSON(
    data: unknown,
    metadata?: { name?: string; keyvalues?: Record<string, string> }
  ): Promise<IPFSUploadResult> {
    const endpoint = this.customEndpoint ?? IPFSUploader.PINATA_JSON_API

    const body: Record<string, unknown> = {
      pinataContent: data,
      pinataMetadata: {
        name: this.namePrefix + (metadata?.name ?? `json-${Date.now()}`),
        keyvalues: metadata?.keyvalues ?? {},
      },
    }

    if (this.pinataGroupId) {
      ;(body.pinataMetadata as Record<string, unknown>).groupId = this.pinataGroupId
    }

    return this._doFetch(endpoint, body)
  }

  // ── File Upload ───────────────────────────────────────────────────────

  /**
   * Upload a file / Blob / Buffer / Uint8Array / string to IPFS.
   */
  async uploadFile(
    content: Blob | Buffer | Uint8Array | string,
    fileName?: string,
    mimeType?: string
  ): Promise<IPFSUploadResult> {
    const endpoint = this.customEndpoint ?? IPFSUploader.PINATA_FILE_API

    const formData = new FormData()

    const blobPart = (
      content instanceof Blob ? content
      : typeof Buffer !== 'undefined' && Buffer.isBuffer(content) ? new Uint8Array(content)
      : content instanceof Uint8Array ? content
      : content // string
    ) as BlobPart

    const blob = new Blob([blobPart], { type: mimeType ?? 'application/octet-stream' })

    formData.append('file', blob, fileName ?? `file-${Date.now()}`)

    const metadata = JSON.stringify({
      name: this.namePrefix + (fileName ?? `file-${Date.now()}`),
      ...(this.pinataGroupId ? { groupId: this.pinataGroupId } : {}),
    })
    formData.append('pinataMetadata', metadata)

    return this._doFetch(endpoint, formData)
  }

  // ── Encrypted Payload Upload (AgentX specific) ────────────────────────

  /**
   * Upload an encrypted agent payload to IPFS.
   * This is the primary method used by Agent Studio publish flow.
   */
  async uploadEncryptedPayload(
    payload: EncryptedPayload,
    agentName?: string
  ): Promise<IPFSUploadResult> {
    return this.uploadJSON(payload, { name: agentName ?? 'agent-payload' })
  }

  // ── Convenience ──────────────────────────────────────────────────────────

  async uploadString(content: string, name?: string): Promise<IPFSUploadResult> {
    return this.uploadJSON({ content }, { name: name ?? 'string-data' })
  }

  /** Build a public access URL from a CID. */
  getUrl(cid: string): string {
    return `${this.gatewayUrl}/ipfs/${cid}`
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async _doFetch(
    url: string,
    body: BodyInit | Record<string, unknown>
  ): Promise<IPFSUploadResult> {
    const headers: Record<string, string> = {}

    if (url === IPFSUploader.PINATA_JSON_API || url === IPFSUploader.PINATA_FILE_API) {
      if (!this.pinataJwt) throw new Error('Pinata JWT is not configured')
      headers['Authorization'] = `Bearer ${this.pinataJwt}`
    } else if (this.customApiKey) {
      headers['Authorization'] = `Bearer ${this.customApiKey}`
    }

    if (!(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
      // eslint-disable-next-line no-param-reassign
      body = JSON.stringify(body)
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body as BodyInit,
      signal: AbortSignal.timeout?.(this.timeoutMs),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`IPFS upload failed: HTTP ${res.status} — ${errText.slice(0, 200)}`)
    }

    const raw = (await res.json()) as Record<string, unknown>

    const cid = (raw.IpfsHash as string) || (raw.cid as string) || (raw.Hash as string)
    if (!cid || typeof cid !== 'string') throw new Error('Upload succeeded but no CID returned')

    return { cid, url: this.getUrl(cid), raw }
  }
}

/** Shared default instance (unconfigured until pinataJwt is set). */
export const defaultIPFSUploader = new IPFSUploader()
