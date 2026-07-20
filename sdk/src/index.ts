// ---------------------------------------------------------------------------
// agentx-protocol — Main Entry
// ---------------------------------------------------------------------------
// AgentX: Decentralized AI Agent Platform SDK
//
//   Agent = Prompt + Skills[] + MCP
//
// Quick start:
//   import { AgentRunner } from 'agentx-protocol'
//
//   const runner = new AgentRunner({ reader, wallet })
//   const ctx = await runner.useAgent(42)
//   // ctx.prompt → inject as LLM system prompt
//   // ctx.skills → inject as LLM tools
//
// Modules:
//   agentx-protocol/core         — Types, AES-256-GCM + ECIES crypto
//   agentx-protocol/registry     — Agent registration & discovery
//   agentx-protocol/subscription  — Subscription purchase + AgentX402 gate
//   agentx-protocol/a2a          — Agent-to-Agent protocol
//   agentx-protocol/react        — React hooks (useAgent, etc.)
// ---------------------------------------------------------------------------

export * from './core'
export * from './agent'
export * from './agent-loop'
export * from './llm'
export * from './registry'
export * from './subscription'
export * from './a2a'
export * from './mcp'
export * from './reputation'
export * from './config'
export * from './endpoint'
export * from './configuration'
export * from './ipfs'
export * from './react'
