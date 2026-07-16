// ---------------------------------------------------------------------------
// @agentx/sdk — AgentLoop Module
// ---------------------------------------------------------------------------

export { AgentLoop } from './loop'
export { ToolExecutor } from './executor'
export { buildTools, buildSystemPrompt } from './tool-builder'
export {
  buildPlatformTools,
  executePlatformTool,
  wrapPlatformToolsAsSkills,
  getAllPlatformToolNames,
} from './platform-tools'
export type { PlatformToolDef, PlatformToolContext } from './platform-tools'
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
