// ---------------------------------------------------------------------------
// AgentX Gateway — MCP Server (Model Context Protocol)
// ---------------------------------------------------------------------------
// Standard MCP JSON-RPC 2.0 endpoint. Supports dual-chain (Sepolia + OxaChain L1).
//   POST /mcp
//     tools/list  → all AgentX platform tools (definitions in mcp-tools.ts)
//     tools/call  → params.name + params.arguments.{chain:"sepolia"|"oxachain"}
//                   (execution logic in mcp-executor.ts)
//     initialize  → handshake
//
// Claude Desktop config:
//   { "mcpServers": { "agentx": { "url": "http://43.159.60.46:3090/mcp" } } }
// ---------------------------------------------------------------------------

import { Router, Request, Response } from 'express'
import { MCP_TOOLS } from './mcp-tools'
import { executeToolCall } from './mcp-executor'

const router = Router()

// ── MCP Router ──────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { jsonrpc, id, method, params } = req.body

  if (jsonrpc !== '2.0') {
    res.status(400).json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' } })
    return
  }

  try {
    switch (method) {
      case 'tools/list': {
        const tools = MCP_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
        res.json({ jsonrpc: '2.0', id, result: { tools } })
        return
      }

      case 'tools/call': {
        const toolName = params?.name as string
        const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>

        if (!toolName) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid params: missing tool "name"' } })
          return
        }

        if (!MCP_TOOLS.some(t => t.name === toolName)) {
          res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${toolName}` } })
          return
        }

        const result = await executeToolCall(toolName, toolArgs)
        res.json({
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: result && typeof result === 'object' && 'error' in result,
          },
        })
        return
      }

      case 'initialize':
        res.json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'agentx-gateway', version: '0.2.0' }, capabilities: { tools: {} } } })
        return

      case 'notifications/initialized':
        res.json({ jsonrpc: '2.0', id, result: {} })
        return

      default:
        res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: `Internal error: ${msg}` } })
  }
})

export default router
export { MCP_TOOLS }
