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

  // Case 1: IPFS — not resolved here, returned as-is
  if (tokenURI.startsWith('ipfs://')) return null

  // Case 2: base64 data URI
  const match = tokenURI.match(/^data:application\/json;base64,(.+)$/i)
  if (match) {
    try {
      let decoded = Buffer.from(match[1], 'base64').toString('utf-8')
      // Handle trailing garbage bytes: find last valid JSON }
      const lastBrace = decoded.lastIndexOf('}')
      if (lastBrace > 0 && lastBrace < decoded.length - 1) {
        decoded = decoded.substring(0, lastBrace + 1)
      }
      return JSON.parse(decoded)
    } catch {
      return null
    }
  }

  return null
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
