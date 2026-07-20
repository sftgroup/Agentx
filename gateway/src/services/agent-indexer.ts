// ---------------------------------------------------------------------------
// AgentX Gateway — Agent Indexer (reads chain → stores in PostgreSQL)
// ---------------------------------------------------------------------------
// Syncs agent metadata from IdentityRegistry (ERC-721) into the agents table.
// Handles: IPFS CIDs, base64 data URIs, and malformed tokenURIs.
// ---------------------------------------------------------------------------

import { ethers } from 'ethers'
import { getPool } from '../lib/db'
import { config } from '../config'

const IDENTITY_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]

// Parse base64 data URI tokenURI → JSON metadata object
function parseTokenURIToJSON(tokenURI: string): Record<string, unknown> | null {
  if (!tokenURI) return null
  if (tokenURI.startsWith('ipfs://')) return null

  const match = tokenURI.match(/^data:application\/json;base64,(.+)$/i)
  if (!match) return null

  // Clean up malformed base64: trim everything after the last "==" padding
  let b64 = match[1]
  const lastDoubleEq = b64.lastIndexOf('==')
  if (lastDoubleEq > 0 && lastDoubleEq < b64.length - 2) {
    b64 = b64.substring(0, lastDoubleEq + 2)
  }

  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8')
    // Try JSON parse first
    try {
      return JSON.parse(decoded)
    } catch {
      // Unterminated JSON (contract bug): append missing closing quotes/braces
      let fixed = decoded
      // Count unclosed quotes
      const quoteCount = (fixed.match(/"/g) || []).length
      if (quoteCount % 2 !== 0) fixed += '"'
      // Count unclosed braces
      const openBraces = (fixed.match(/\{/g) || []).length
      const closeBraces = (fixed.match(/\}/g) || []).length
      for (let i = closeBraces; i < openBraces; i++) fixed += '}'
      try { return JSON.parse(fixed) } catch { /* ok */ }
    }
    // Regex fallback
    const nameM = decoded.match(/"name"\s*:\s*"([^"]*)/)
    if (nameM) return { name: nameM[1] }
    return null
  } catch { return null }
}

// Extract CID from IPFS tokenURI
function extractCID(tokenURI: string): string | null {
  if (!tokenURI) return null
  if (tokenURI.startsWith('ipfs://')) return tokenURI.replace('ipfs://', '').split('/')[0]
  const match = tokenURI.match(/\/ipfs\/([^/?#]+)/)
  if (match) return match[1]
  return null
}

export async function syncAgents(): Promise<{ synced: number; total: number }> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrlOxaChain)
  const contract = new ethers.Contract(config.identityRegistryOxaChain, IDENTITY_ABI, provider)
  const pool = getPool()

  let synced = 0
  let consecutiveMisses = 0
  const MAX_MISSES = 8
  const BATCH_SIZE = 10

  for (let batchStart = 1; consecutiveMisses < MAX_MISSES; batchStart += BATCH_SIZE) {
    const batchIds: number[] = []
    for (let i = batchStart; i < batchStart + BATCH_SIZE && consecutiveMisses < MAX_MISSES; i++) {
      batchIds.push(i)
    }

    const results = await Promise.allSettled(
      batchIds.map(async (id) => {
        const [tokenURI, owner] = await Promise.all([
          contract.tokenURI(id).catch(() => null),
          contract.ownerOf(id).catch(() => null),
        ])

        if (!tokenURI) {
          consecutiveMisses++
          return null
        }

        consecutiveMisses = 0
        const parsed = parseTokenURIToJSON(tokenURI)

        const name = (parsed?.name as string) || `Agent ${id}`
        const description = (parsed?.description as string) || ''
        const tags = Array.isArray(parsed?.tags) ? parsed.tags.map(String) : []
        const capabilities = Array.isArray(parsed?.capabilities) ? parsed.capabilities.map(String) : []

        await pool.query(
          `INSERT INTO agents (id, owner, name, description, tags, capabilities, token_uri, metadata_json, synced_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
           ON CONFLICT (id) DO UPDATE SET
             owner = EXCLUDED.owner,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             tags = EXCLUDED.tags,
             capabilities = EXCLUDED.capabilities,
             token_uri = EXCLUDED.token_uri,
             metadata_json = EXCLUDED.metadata_json,
             synced_at = NOW(),
             updated_at = NOW()`,
          [id, owner || '', name, description, tags, capabilities, tokenURI, JSON.stringify(parsed || {})]
        )

        return { id, name, owner }
      })
    )

    synced += results.filter(r => r.status === 'fulfilled' && r.value !== null).length

    if (consecutiveMisses >= MAX_MISSES) break
  }

  return { synced, total: synced }
}
