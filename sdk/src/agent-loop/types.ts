// ---------------------------------------------------------------------------
// @agentx/sdk — AgentLoop Type Definitions
// ---------------------------------------------------------------------------
// Core types for the ReAct-style agent loop engine.
// The loop enables LLMs to autonomously: Think → Call Tools → Observe → Repeat
// ---------------------------------------------------------------------------

import type { RunnableSkill } from '../agent/agent-runner'

// ── LLM Message ─────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: LLMToolCall[]
}

export interface LLMToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// ── Tool Definition (LLM function-calling format) ──────────────────────────

export interface OpenAIToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// ── LLM Provider Interface ─────────────────────────────────────────────────

export interface ChatRequest {
  model: string
  messages: LLMMessage[]
  tools?: OpenAIToolDef[]
  temperature?: number
  maxTokens?: number
}

export type ChatStreamEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call_start'; callId: string; name: string }
  | { type: 'tool_call_delta'; callId: string; arguments: string }
  | { type: 'done'; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }
  | { type: 'error'; error: Error }

export interface LLMProvider {
  chatStream(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent>
}

// ── AgentLoop Configuration ─────────────────────────────────────────────────

export interface AgentLoopConfig {
  ctx: LoopRunContext
  llmProvider: LLMProvider
  maxIterations?: number
  timeoutMs?: number
  onTextDelta?: (delta: string) => void
  onToolCall?: (call: ToolCallStart) => void
  onToolResult?: (result: ToolCallResult) => void
  onThinking?: (message: string) => void
  onComplete?: (result: AgentLoopResult) => void
  onError?: (error: Error) => void
}

export interface LoopRunContext {
  agentId: number
  prompt: string
  skills: RunnableSkill[]
  model?: string
  temperature?: number
  maxTokens?: number
}

// ── Tool Call Records ───────────────────────────────────────────────────────

export interface ToolCallStart {
  callId: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolCallResult {
  callId: string
  name: string
  result: unknown
  error?: string
  durationMs: number
}

export interface ToolCallRecord {
  callId: string
  name: string
  arguments: Record<string, unknown>
  result: unknown
  error?: string
  durationMs: number
}

// ── AgentLoop Result ────────────────────────────────────────────────────────

export interface AgentLoopResult {
  finalText: string
  toolCalls: ToolCallRecord[]
  totalIterations: number
  totalDuration: number
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
