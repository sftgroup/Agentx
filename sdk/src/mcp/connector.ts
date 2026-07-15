// ---------------------------------------------------------------------------
// @agentx/sdk — MCP Connector
// ---------------------------------------------------------------------------
// Minimal MCP (Model Context Protocol) client for HTTP/SSE transports.
// Used by AgentRunner for Closed Skill remote execution.
// ---------------------------------------------------------------------------

import type { McpConnection } from '../core/types'

// ── Types ───────────────────────────────────────────────────────────────────

export interface MCPTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface MCPCallResult {
  content: { type: string; text?: string; data?: string }[]
  isError?: boolean
}

export interface MCPConnectorConfig {
  /** MCP server base URL */
  url: string
  /** Transport type */
  transport?: 'http' | 'sse'
  /** Auth header value (e.g. "Bearer xxx") */
  authHeader?: string
  /** Request timeout in ms (default: 30_000) */
  timeoutMs?: number
  /** Optional: subscriber address for subscription-gated MCP servers */
  subscriberAddress?: string
  /** Optional: wallet signature for authentication */
  signature?: string
  timestamp?: number
}

// ── MCP Connector ──────────────────────────────────────────────────────────

export class MCPConnector {
  private config: MCPConnectorConfig

  constructor(config: MCPConnectorConfig) {
    this.config = { timeoutMs: 30_000, transport: 'http', ...config }
  }

  /** Create from an Agent's McpConnection. */
  static fromAgent(mcp: McpConnection, opts?: Partial<MCPConnectorConfig>): MCPConnector {
    return new MCPConnector({
      url: mcp.url ?? '',
      transport: mcp.type === 'sse' ? 'sse' : 'http',
      authHeader: mcp.authHeader,
      ...opts,
    })
  }

  // ── Tool Discovery ───────────────────────────────────────────────────────

  /** List available tools from the MCP server. */
  async listTools(): Promise<MCPTool[]> {
    const res = await this._request('tools/list', {})
    return (res.tools ?? []) as MCPTool[]
  }

  // ── Tool Execution ───────────────────────────────────────────────────────

  /** Call a tool on the MCP server. */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPCallResult> {
    return this._request('tools/call', { name, arguments: args }) as unknown as Promise<MCPCallResult>
  }

  // ── Resources (optional) ─────────────────────────────────────────────────

  async listResources(): Promise<unknown[]> {
    const res = await this._request('resources/list', {})
    return (res.resources ?? []) as unknown[]
  }

  async readResource(uri: string): Promise<unknown> {
    return this._request('resources/read', { uri })
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async _request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.authHeader) {
      headers['Authorization'] = this.config.authHeader
    }
    if (this.config.subscriberAddress) {
      headers['X-Subscriber-Address'] = this.config.subscriberAddress
    }
    if (this.config.signature) {
      headers['X-Signature'] = this.config.signature
    }
    if (this.config.timestamp) {
      headers['X-Timestamp'] = String(this.config.timestamp)
    }

    const res = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
    })

    if (!res.ok) {
      throw new Error(`MCP request failed: HTTP ${res.status}`)
    }

    const data = await res.json() as { result?: Record<string, unknown>; error?: { message: string } }
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`)
    }
    return data.result ?? {}
  }
}
