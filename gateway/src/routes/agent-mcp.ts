// AgentX Gateway — Agent MCP Route
// Exposes individual Agent skills as MCP tools at /mcp/agent/:id
// Existing /mcp endpoint (29 platform tools) is unchanged.

import { Router, Request, Response } from 'express'
import { getConversationProxy } from '../services/conversation-proxy'
import { config } from '../config'
import { ethers } from 'ethers'

const router = Router()

// ── Agent Skill → MCP Tool conversion ─────────────────────────────────────

interface MCPToolDef {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

/**
 * Convert a raw agent skill definition to MCP tool format.
 * Skills are stored in agent payload as: { name, description, inputSchema, ... }
 */
function skillToMCPTool(skill: Record<string, unknown>): MCPToolDef {
  const inputSchema = (skill.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} }
  return {
    name: (skill.name as string) || 'unnamed_skill',
    description: (skill.description as string) || `Execute ${skill.name} skill`,
    inputSchema: {
      type: 'object',
      properties: (inputSchema.properties as Record<string, unknown>) || {},
      required: (inputSchema.required as string[]) || [],
    },
  }
}

// ── Agent context loading (simplified — uses on-chain tokenURI) ──────────

interface AgentSkills {
  agentId: number
  skills: MCPToolDef[]
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
    const rawSkills = metadata.skills || metadata.attributes?.skills || []
    const skills = Array.isArray(rawSkills) ? rawSkills.map(skillToMCPTool) : []

    return { agentId, skills, tenantId: exists }
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

        // Forward to Conversation Service
        const proxy = getConversationProxy()
        const upstream = await proxy.streamRun({
          agentId,
          message: `Execute tool: ${toolName}\nArguments: ${JSON.stringify(toolArgs)}`,
          tenantAddress: (req as any).user?.address || 'mcp-caller',
          enableMemory: false,
        })

        if (!upstream.ok) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Conversation service error' } })
          return
        }

        // Read SSE stream and collect result
        const reader = upstream.body?.getReader()
        if (!reader) {
          res.json({ jsonrpc: '2.0', id, result: { content: [] } })
          return
        }

        const decoder = new TextDecoder()
        let resultText = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            // Parse SSE events and collect text/tool_result
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6))
                  if (event.type === 'text') resultText += event.content
                  if (event.type === 'tool_result') resultText += JSON.stringify(event.toolResult)
                  if (event.type === 'done') {
                    // Final result
                  }
                } catch {}
              }
            }
          }
        } finally {
          reader.releaseLock()
        }

        res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: resultText || 'Tool executed successfully' }],
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

export default router
