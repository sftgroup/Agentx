// ---------------------------------------------------------------------------
// @agentx/sdk — AgentLoop Module
// ---------------------------------------------------------------------------

export { AgentLoop } from './loop'
export { ToolExecutor } from './executor'
export { ContextCompactor } from './context-compactor'
export { FactExtractor } from './fact-extractor'
export { LoopTraceEmitter } from './trace-emitter'
export { buildTools, buildSystemPrompt } from './tool-builder'
export {
  buildPlatformTools,
  executePlatformTool,
  wrapPlatformToolsAsSkills,
  getAllPlatformToolNames,
} from './platform-tools/index'
export type { PlatformToolDef, PlatformToolContext } from './platform-tools/index'
export { A2ADaemon } from './a2a-daemon'
export type { A2ADaemonConfig, A2ATaskResult } from './a2a-daemon'
export type {
  LLMMessage,
  LLMToolCall,
  OpenAIToolDef,
  ChatRequest,
  ChatStreamEvent,
  LLMProvider,
  AgentLoopConfig,
  LoopRunContext,
  ToolCallStart,
  ToolCallResult,
  ToolCallRecord,
  AgentLoopResult,
} from './types'
