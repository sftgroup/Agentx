// AgentX Conversation Service — Tool Executor
// Generic remote tool execution: MCP JSON-RPC, HTTP, and Gateway-internal calls.

export interface ToolCallResult {
  success: boolean
  data?: unknown
  error?: string
  durationMs: number
}

export class ToolExecutor {
  constructor(
    private readonly gatewayInternalUrl: string = 'http://localhost:3090',
  ) {}

  /** Execute a tool via MCP JSON-RPC 2.0 protocol */
  async executeMCP(
    endpoint: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const start = Date.now()

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    const elapsed = Date.now() - start

    if (!res.ok) {
      throw new Error(`MCP tool "${toolName}" failed (HTTP ${res.status}, ${elapsed}ms)`)
    }

    const data = await res.json() as MCPResponse
    if (data.error) {
      throw new Error(`MCP error [${data.error.code}]: ${data.error.message}`)
    }

    return this.extractContent(data.result)
  }

  /** Extract human-readable content from MCP tool result */
  private extractContent(result?: MCPResult): unknown {
    const content = result?.content
    if (!content || content.length === 0) return result ?? null

    const first = content[0]
    if (first.type === 'text' && first.text) {
      try {
        return JSON.parse(first.text)
      } catch {
        return first.text
      }
    }
    return content
  }
}

interface MCPResponse {
  result?: MCPResult
  error?: { code: number; message: string }
}

interface MCPResult {
  content?: { type: string; text?: string }[]
  [key: string]: unknown
}
