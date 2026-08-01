// AgentX Gateway — Agent MCP Route
// Exposes individual Agent skills as MCP tools at /mcp/agent/:id
// Existing /mcp endpoint (29 platform tools) is unchanged.
//
// tools/call executes the skill DIRECTLY (no LLM re-decision):
//   - skill.execution.type === 'mcp'   → POST to skill's own MCP endpoint
//   - skill.execution.type === 'http'  → POST to skill's HTTP endpoint
//   - otherwise                        → error (open skill, no remote executor)

import { Router, Request, Response } from 'express'
import { config } from '../config'
import { ethers } from 'ethers'

const router = Router()

// ── Agent Skill → MCP Tool conversion ─────────────────────────────────────

interface MCPToolDef {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

interface RawSkill {
  name: string
  description?: string
  inputSchema?: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  execution?: {
    type?: 'mcp' | 'http'
    endpoint?: string
    toolName?: string
    [k: string]: unknown
  }
}

/**
 * Convert a raw agent skill definition to MCP tool format.
 * Skills are stored in agent payload as: { name, description, inputSchema, ... }
 */
function skillToMCPTool(skill: RawSkill): MCPToolDef {
  const inputSchema = skill.inputSchema || { type: 'object', properties: {} }
  return {
    name: skill.name || 'unnamed_skill',
    description: skill.description || `Execute ${skill.name} skill`,
    inputSchema: {
      type: 'object',
      properties: inputSchema.properties || {},
      required: inputSchema.required || [],
    },
  }
}

// ── Agent context loading (simplified — uses on-chain tokenURI) ──────────

interface AgentSkills {
  agentId: number
  skills: MCPToolDef[]
  rawSkills: RawSkill[]
  tenantId: string  // agent owner wallet
}

// Cached provider and contract — created once, reused globally
let cachedProvider: ethers.JsonRpcProvider | null = null
let cachedContract: ethers.Contract | null = null

function getProvider(): ethers.JsonRpcProvider {
  if (!cachedProvider) cachedProvider = new ethers.JsonRpcProvider(config.rpcUrl)
  return cachedProvider
}

function getIdentityContract(): ethers.Contract {
  if (!cachedContract) {
    cachedContract = new ethers.Contract(
      config.identityRegistry,
      ['function tokenURI(uint256) view returns (string)',
       'function ownerOf(uint256) view returns (address)'],
      getProvider()
    )
  }
  return cachedContract
}

async function loadAgentSkills(agentId: number): Promise<AgentSkills | null> {
  try {
    const identityRegistry = getIdentityContract()

    const exists = await identityRegistry.ownerOf(agentId).catch(() => null)
    if (!exists) return null

    const tokenURI: string = await identityRegistry.tokenURI(agentId)

    // If tokenURI is an IPFS URL, fetch the metadata
    let metadata: any = {}
    if (tokenURI.startsWith('ipfs://')) {
      const cid = tokenURI.replace('ipfs://', '')
      const res = await fetch(`https://ipfs.io/ipfs/${cid}`)
      metadata = await res.json()
    } else if (tokenURI.startsWith('https://')) {
      const res = await fetch(tokenURI)
      metadata = await res.json()
    }

    // Skills are stored in metadata.attributes or metadata.skills
    const rawSkills: RawSkill[] = Array.isArray(metadata.skills)
      ? metadata.skills
      : Array.isArray(metadata.attributes?.skills)
        ? metadata.attributes.skills
        : []
    const skills = rawSkills.map(skillToMCPTool)

    return { agentId, skills, rawSkills, tenantId: exists }
  } catch (err) {
    console.error(`[Agent-MCP] Failed to load agent ${agentId}:`, (err as Error).message)
    return null
  }
}

// ── MCP Router ────────────────────────────────────────────────────────────

router.post('/:agentId', async (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body
  const agentId = parseInt(req.params.agentId)

  if (isNaN(agentId)) {
    res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32602, message: 'Invalid agent ID' } })
    return
  }

  if (jsonrpc !== '2.0') {
    res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' } })
    return
  }

  try {
    switch (method) {
      case 'tools/list': {
        const agent = await loadAgentSkills(agentId)
        if (!agent) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Agent ${agentId} not found` } })
          return
        }

        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: agent.skills.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        })
        return
      }

      case 'tools/call': {
        const toolName = params?.name as string
        const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>

        if (!toolName) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params: missing tool "name"' } })
          return
        }

        // Load agent to find the skill definition (with execution config)
        const agent = await loadAgentSkills(agentId)
        if (!agent) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Agent ${agentId} not found` } })
          return
        }

        const skill = agent.rawSkills.find(s => s.name === toolName)
        if (!skill) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Tool "${toolName}" not found on agent ${agentId}` } })
          return
        }

        // Execute the skill directly — no LLM re-decision
        let resultText: string
        try {
          resultText = await executeSkill(skill, toolArgs)
        } catch (err) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: (err as Error).message } })
          return
        }

        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: resultText }],
          },
        })
        return
      }

      case 'initialize':
        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: `agentx-agent-${agentId}`, version: '0.1.0' },
          },
        })
        return

      default:
        res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
        return
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Agent-MCP] Error:`, message)
    res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message } })
  }
})

// ── Direct skill execution ────────────────────────────────────────────────

/**
 * Execute a skill directly (no LLM re-decision).
 *   - execution.type === 'mcp'  → POST JSON-RPC tools/call to skill's endpoint
 *   - execution.type === 'http' → POST to skill's HTTP endpoint
 *   - otherwise                 → fall back to Conversation Service AgentLoop
 */
async function executeSkill(skill: RawSkill, toolArgs: Record<string, unknown>): Promise<string> {
  const exec = skill.execution

  if (exec?.type === 'mcp' && exec.endpoint) {
    const toolName = exec.toolName || skill.name
    const res = await fetch(exec.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: toolArgs },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      throw new Error(`Skill "${skill.name}" failed (HTTP ${res.status})`)
    }

    const data = await res.json() as {
      result?: { content?: { type: string; text?: string }[] }
      error?: { message: string }
    }
    if (data.error) {
      throw new Error(data.error.message)
    }

    const content = data.result?.content
    if (content?.[0]?.type === 'text' && content[0].text) {
      return content[0].text
    }
    return JSON.stringify(data.result ?? data)
  }

  if (exec?.type === 'http' && exec.endpoint) {
    const res = await fetch(exec.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolArgs),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      throw new Error(`Skill "${skill.name}" failed (HTTP ${res.status})`)
    }
    return await res.text()
  }

  // No execution config — open skill has no remote executor
  throw new Error(`Skill "${skill.name}" has no execution config (execution.type must be "mcp" or "http")`)
}

export default router
