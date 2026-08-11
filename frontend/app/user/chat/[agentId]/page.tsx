// app/user/chat/[agentId]/page.tsx — Chat with Agent (SSE Streaming + AgentLoop fallback)
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { SubscriptionGuard } from '@/components/guard/SubscriptionGuard'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { TaskCard } from '@/components/chat/TaskCard'
import { useAgentDetail } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentRunner } from '@agentxv2/sdk/react'
import { AgentLoop, OpenAIProvider } from '@agentxv2/sdk'
import type { RunnableSkill, ToolCallStart, ToolCallResult } from '@agentxv2/sdk'
import { useGatewayAuth } from '@/hooks/useGatewayAuth'
import { useAgentChat, type ChatMessage, type OnChainApprovalPayload } from '@/hooks/useAgentChat'
import { OnchainApprovalModal } from '@/components/a2a/OnchainApprovalModal'
import { Send, Brain, AlertCircle, ArrowLeft, ArrowRight, Loader2, Trash2, Square, Wrench, Terminal } from 'lucide-react'
import Link from 'next/link'
import { ModelOption, HISTORY_KEY_PREFIX, llmApiKeyFromLocalStorage } from './chat-utils'
import { GATEWAY_URL_OPTIONAL as gatewayUrl } from '@/lib/gateway'

export default function ChatPage() {
  const params = useParams()
  const agentId = Number(params.agentId)
  const historyKey = `${HISTORY_KEY_PREFIX}${agentId}`

  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [useSseStreaming, setUseSseStreaming] = useState(true) // SSE via Gateway (primary) or AgentLoop (fallback)
  const [clarification, setClarification] = useState<string | null>(null) // pending clarifying question from Conversation Service
  const [clarificationAnswer, setClarificationAnswer] = useState('')
  const [onchainApproval, setOnchainApproval] = useState<OnChainApprovalPayload | null>(null) // pending on-chain delegation approval
  const [quotaExceeded, setQuotaExceeded] = useState(false) // R19.4 (G8): daily quota exhausted → upgrade CTA

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<AgentLoop | null>(null)
  const assistantRef = useRef('')

  const { data: agent, isLoading: isLoadingAgent } = useAgentDetail(agentId)
  const { ctx, isLoading: isLoadingCtx, error: ctxError } = useAgentRunner({ agentId })
  const { isAuthenticated: isGatewayAuth, context: gatewayCtx } = useGatewayAuth(gatewayUrl)

  // SSE streaming hook (now also sessions+tasks parallel mode, R1)
  const {
    messages: sseMessages,
    thinkingText: sseThinking,
    isStreaming: isSseStreaming,
    sendMessage: sendSseMessage,
    stopStreaming: stopSse,
    clearMessages: clearSseMessages,
    setMessages: setSseMessages,
    tasks,
    parallelEnabled,
    initSession: initChatSession,
    cancelTask: cancelChatTask,
  } = useAgentChat()

  // ── Chat history persistence ─────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyKey)
      if (saved && useSseStreaming) setSseMessages(JSON.parse(saved) as ChatMessage[])
    } catch { /* ignore */ }
  }, [historyKey, useSseStreaming])

  useEffect(() => {
    if (sseMessages.length > 0 && useSseStreaming) {
      try {
        localStorage.setItem(historyKey, JSON.stringify(sseMessages.slice(-100)))
      } catch { /* ignore */ }
    }
  }, [sseMessages, historyKey, useSseStreaming])

  const clearHistory = useCallback(() => {
    clearSseMessages()
    localStorage.removeItem(historyKey)
  }, [historyKey, clearSseMessages])

  // ── Auto-scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sseMessages, sseThinking])

  // ── Build model options from gateway or localStorage ─────────────────
  useEffect(() => {
    if (gatewayUrl && gatewayCtx) {
      const options: ModelOption[] = []

      if (gatewayCtx.plan?.platform_models) {
        for (const m of gatewayCtx.plan.platform_models) {
          options.push({
            id: `platform-${m.provider}-${m.model}`,
            provider: m.provider,
            model: m.model,
            label: `${m.model} (Platform)`,
            source: 'platform',
          })
        }
      }

      for (const k of gatewayCtx.ownKeys || []) {
        options.push({
          id: `byok-${k.id}`,
          provider: k.provider,
          model: k.model,
          label: k.label || `${k.model} (Own Key)`,
          source: 'tenant_owned',
          tenantKeyId: k.id,
        })
      }

      setModelOptions(options)
      if (options.length > 0 && !selectedModel) {
        setSelectedModel(options[0]!)
      }
    } else if (!gatewayUrl) {
      try {
        const savedConfigs = JSON.parse(localStorage.getItem('aiConfigs') || '[]') as {
          id: string; name: string; provider: string; endpoint: string
          apiKey: string; model: string; temperature: number; maxTokens: number; isActive: boolean
        }[]
        if (savedConfigs.length > 0) {
          const active = savedConfigs.find(c => c.isActive) || savedConfigs[0]
          const opts = [{
            id: active.id,
            provider: active.provider,
            model: active.model,
            label: active.name,
            source: 'tenant_owned' as const,
          }]
          setModelOptions(opts)
          setSelectedModel(opts[0]!)
          setUseSseStreaming(false)
        }
      } catch { /* ignore */ }
    }
  }, [gatewayUrl, gatewayCtx])

  // ── Init chat session (R1): capability probe (P9) + session/task restore ──
  const sessionKey = gatewayCtx?.tenant?.wallet_address
    ? `agentx-chat-session-${agentId}-${gatewayCtx.tenant.wallet_address.toLowerCase()}`
    : undefined

  useEffect(() => {
    if (!gatewayUrl || !gatewayCtx || !sessionKey) return
    initChatSession({
      agentId,
      gatewayUrl,
      accessToken: gatewayCtx.accessToken,
      sessionKey,
      enableMemory: true,
      onError: (e) => console.warn('[chat] session init:', e),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayUrl, gatewayCtx, sessionKey, agentId])

  const handleCancelTask = useCallback(async (taskId: string) => {
    await cancelChatTask(taskId)
  }, [cancelChatTask])

  // ── Send message ──────────────────────────────────────────────────────
  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isLoading) return
    if (!ctx && !useSseStreaming) return
    if (!selectedModel && !useSseStreaming) return

    const userInput = inputMessage
    setInputMessage('')
    setIsLoading(true)

    try {
      // Primary: SSE streaming via Gateway
      if (useSseStreaming && gatewayUrl && gatewayCtx) {
        const history = sseMessages.slice(-20)
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

        await sendSseMessage(userInput, {
          agentId,
          gatewayUrl,
          accessToken: gatewayCtx.accessToken,
          // BYOK: prefer the tenant's stored key (resolved server-side by the Gateway);
          // fall back to an ephemeral header key for stateless BYOK mode.
          tenantKeyId: selectedModel?.source === 'tenant_owned' ? selectedModel.tenantKeyId : undefined,
          llmApiKey: selectedModel?.source === 'tenant_owned' && !selectedModel.tenantKeyId ? llmApiKeyFromLocalStorage() : undefined,
          enableMemory: true,
          onComplete: (usage) => {
            // Optional: track usage
          },
          onClarification: (question) => setClarification(question),
          onOnchainApproval: (approval) => setOnchainApproval(approval),
        }, history)
        return
      }

      // Fallback: direct AgentLoop (offline / no Gateway)
      if (!ctx) return

      let llmProvider
      const savedConfigs = JSON.parse(localStorage.getItem('aiConfigs') || '[]') as {
        id: string; endpoint: string; apiKey: string; model: string; temperature: number; maxTokens: number; isActive: boolean
      }[]
      const active = savedConfigs.find((c: any) => c.isActive) || savedConfigs[0]
      if (active) {
        llmProvider = new OpenAIProvider({
          apiKey: active.apiKey,
          endpoint: active.endpoint,
          model: active.model,
          temperature: active.temperature,
          maxTokens: active.maxTokens,
        })
      }

      if (!llmProvider) {
        setSseMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'No AI model configured. Please add an API key in Settings.',
          timestamp: Date.now(),
        }])
        return
      }

      const loop = new AgentLoop({
        ctx: { agentId: ctx.agentId, prompt: ctx.prompt, skills: ctx.skills, model: selectedModel?.model },
        llmProvider,
        maxIterations: 5,

        onTextDelta: (delta) => {
          setSseMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.id === assistantRef.current) {
              const updated = [...prev]
              updated[updated.length - 1] = { ...last, content: last.content + delta }
              return updated
            }
            const id = `asst-${Date.now()}`
            assistantRef.current = id
            return [...prev, { id, role: 'assistant', content: delta, timestamp: Date.now() }]
          })
        },

        onToolCall: (call: ToolCallStart) => {
          setSseMessages(prev => [...prev, {
            id: `${call.callId}-call`,
            role: 'tool_call',
            content: `Calling ${call.name}...`,
            timestamp: Date.now(),
            toolName: call.name,
            toolInput: call.arguments,
            toolStatus: 'pending',
          }])
        },

        onToolResult: (result: ToolCallResult) => {
          setSseMessages(prev => {
            const updated = [...prev]
            const idx = updated.findIndex(m => m.id === `${result.callId}-call`)
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                role: 'tool_result' as const,
                content: result.error ? `Error: ${result.error}` : 'Tool result received',
                toolStatus: result.error ? 'error' : 'done',
                toolResult: result.result,
                toolError: result.error,
                toolDurationMs: result.durationMs,
              }
            }
            return updated
          })
        },

        onError: (error: Error) => {
          if (/quota|exceed/i.test(error.message)) setQuotaExceeded(true) // R19.4 (G8)
          setSseMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Error: ${error.message}`,
            timestamp: Date.now(),
          }])
        },
      })

      loopRef.current = loop
      const history = sseMessages.slice(-20)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      await loop.run(userInput, history)
    } catch (error) {
      if (/quota|exceed/i.test(error instanceof Error ? error.message : '')) setQuotaExceeded(true) // R19.4 (G8)
      setSseMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      }])
    } finally {
      setIsLoading(false)
      loopRef.current = null
    }
  }, [inputMessage, isLoading, ctx, selectedModel, gatewayUrl, gatewayCtx, sseMessages, useSseStreaming, agentId, sendSseMessage])

  const handleStop = useCallback(() => {
    if (useSseStreaming) stopSse()
    else loopRef.current?.abort()
  }, [useSseStreaming, stopSse])

  // Re-send the user's answer to the clarification question as a follow-up.
  // The Conversation Service restarts the run with the answer in context.
  const handleClarificationSubmit = useCallback(async () => {
    const question = clarification
    const answer = clarificationAnswer.trim()
    if (!question || !answer || !gatewayCtx) return
    setClarification(null)
    setClarificationAnswer('')
    setIsLoading(true)
    try {
      const history = sseMessages.slice(-20)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      await sendSseMessage(`${question}\n我的回答：${answer}`, {
        agentId,
        gatewayUrl,
        accessToken: gatewayCtx.accessToken,
        enableMemory: true,
        onClarification: (q) => setClarification(q),
      }, history)
    } catch {
      setClarification(question)
    } finally {
      setIsLoading(false)
    }
  }, [clarification, clarificationAnswer, gatewayCtx, sseMessages, gatewayUrl, agentId, sendSseMessage])

  const isLoadingState = isLoading || isSseStreaming
  const currentThinking = sseThinking
  const displayMessages = sseMessages

  // ── Loading states ───────────────────────────────────────────────────
  if (isLoadingAgent) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-center py-20">
          <Brain className="w-8 h-8 text-text-muted animate-spin mx-auto mb-4" />
        </div>
      </AppLayout>
    )
  }

  if (!agent) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-center py-20">
          <AlertCircle className="w-16 h-16 text-red-400/40 mx-auto mb-4" />
          <h2 className="heading-md mb-3">Agent Not Found</h2>
          <Link href="/marketplace" className="btn-primary inline-block mt-4">Back to Marketplace</Link>
        </div>
      </AppLayout>
    )
  }

  const skills = ctx?.skills ?? []

  return (
    <AppLayout>
    <SubscriptionGuard agentId={agentId}>
        <div className="max-w-6xl mx-auto h-[calc(100vh-5rem)] flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <Link href="/user/dashboard" className="text-text-muted hover:text-text-secondary transition-colors flex-shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                <Brain className="w-5 h-5 text-accent-purple" />
              </div>
              <div className="min-w-0">
                <h1 className="font-semibold truncate">
                  {isLoadingCtx
                    ? <Loader2 className="w-4 h-4 animate-spin inline" />
                    : agent?.metadata?.name || `Agent #${agentId}`}
                </h1>
                <p className="text-xs text-text-muted truncate">
                  {useSseStreaming ? '⚡ SSE Streaming' : ctx ? '🔐 E2E Encrypted (Direct)' : isLoadingCtx ? 'Decrypting...' : agent?.metadata?.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/a2a" className="btn-secondary text-xs py-1.5 px-2" title="A2A orchestration tasks">
                <Terminal className="w-3.5 h-3.5" />
              </Link>
              {displayMessages.length > 0 && (
                <button onClick={clearHistory} className="btn-secondary text-xs py-1.5 px-2" title="Clear history">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <ModelSelector
                options={modelOptions}
                selected={selectedModel}
                open={showModelSelector}
                onToggle={() => setShowModelSelector(!showModelSelector)}
                onSelect={(m) => { setSelectedModel(m); setShowModelSelector(false) }}
              />
            </div>
          </div>

          {/* R19.4 (G8): daily quota exhausted → upgrade / BYOK CTA */}
          {quotaExceeded && (
            <div className="mx-6 mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-yellow-300">Daily quota exceeded</div>
                  <p className="text-xs text-text-muted mt-0.5">Your plan&apos;s daily token quota is exhausted.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/user/billing" className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5">
                  Upgrade plan <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <button
                  onClick={() => setQuotaExceeded(false)}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {tasks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-muted">Parallel Tasks</span>
                  <span className={`text-[11px] ${parallelEnabled === false ? 'text-text-muted' : 'text-accent-cyan'}`}>
                    {parallelEnabled === false ? 'single-turn only' : 'multi-task enabled'}
                  </span>
                </div>
                <div className="space-y-2">
                  {[...tasks].reverse().slice(0, 20).map(t => (
                    <TaskCard key={t.id} task={t} onCancel={handleCancelTask} />
                  ))}
                </div>
              </div>
            )}
            {displayMessages.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-accent-purple/10 flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-8 h-8 text-accent-purple" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Start the Conversation</h3>
                <p className="body text-text-secondary mb-6">Chat with {agent?.metadata?.name}</p>
                {skills.length > 0 && (
                  <div className="glass-card-hover p-4 max-w-md mx-auto rounded-xl text-left">
                    <div className="flex items-center gap-2 mb-2 text-sm font-medium text-accent-cyan">
                      <Wrench className="w-4 h-4" /> Agent Skills
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {skills.slice(0, 6).map((s: RunnableSkill) => (
                        <span key={s.name} className="text-xs px-2 py-1 rounded-full bg-accent-cyan/5 border border-accent-cyan/10 text-accent-cyan">{s.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {ctxError && (
                  <div className="mt-4 p-4 max-w-md mx-auto rounded-xl bg-red-400/5 border border-red-400/10">
                    <p className="text-xs text-red-400">Decryption warning: {ctxError.message}</p>
                    <p className="text-xs text-text-muted mt-1">Chat may be limited. Check your subscription.</p>
                  </div>
                )}
              </div>
            ) : (
              displayMessages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            {isLoadingState && !currentThinking && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 bg-white/5 border border-white/5 text-text-muted text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 animate-pulse" /> Thinking...
                </div>
              </div>
            )}
            {currentThinking && (
              <div className="flex justify-center">
                <span className="text-xs text-text-muted bg-white/5 rounded-full px-3 py-1">{currentThinking}</span>
              </div>
            )}
            {clarification && (
              <div className="flex justify-start">
                <div className="max-w-2xl rounded-2xl px-4 py-3 bg-accent-cyan/10 border border-accent-cyan/20">
                  <div className="text-sm font-medium text-accent-cyan mb-1">Clarification needed</div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed mb-3">{clarification}</div>
                  <div className="flex gap-2">
                    <input value={clarificationAnswer} onChange={e => setClarificationAnswer(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleClarificationSubmit()}
                      placeholder="Type your answer..."
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-accent-cyan/40 placeholder:text-text-muted" />
                    <button onClick={handleClarificationSubmit} disabled={!clarificationAnswer.trim()}
                      className="px-4 py-2 bg-accent-cyan/20 hover:bg-accent-cyan/30 text-accent-cyan rounded-lg text-sm transition-colors disabled:opacity-30">
                      Answer
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-5 border-t border-white/5">
            <div className="flex gap-3">
              <input type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder={useSseStreaming ? 'Type your message... (⚡ SSE Streaming)' : selectedModel ? 'Type your message...' : 'Select a model to start chatting...'}
                className="flex-1 px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40 focus:bg-white/8 transition-colors placeholder:text-text-muted"
                disabled={isLoadingState || (!selectedModel && !useSseStreaming)} />
              {isLoadingState ? (
                <button onClick={handleStop}
                  className="px-5 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl transition-colors">
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={handleSendMessage} disabled={!inputMessage.trim() || (useSseStreaming ? false : !selectedModel)}
                  className="px-5 py-3 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-30 text-white rounded-xl transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
              {useSseStreaming ? (
                <span className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${parallelEnabled === false ? 'bg-amber-400' : 'bg-green-400'}`} />
                  {parallelEnabled === false ? 'Single-turn streaming' : 'Parallel tasks'} · Memory enabled
                </span>
              ) : selectedModel ? (
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {selectedModel.source === 'platform' ? 'Platform' : 'Own Key'} · {selectedModel.model}
                </span>
              ) : <span>Select a model above</span>}
              <span className="flex items-center gap-3">
                {displayMessages.length > 0 && <span>{displayMessages.length} messages</span>}
                {isGatewayAuth && gatewayCtx?.plan && (
                  <span className="text-accent-cyan">
                    {gatewayCtx.usageToday.total_tokens.toLocaleString()} / {(gatewayCtx.plan.quota_daily || 0).toLocaleString()} tokens
                  </span>
                )}
                {ctx && !useSseStreaming && <span className="text-accent-purple">🔐 E2E</span>}
              </span>
            </div>
          </div>
        </div>
    </SubscriptionGuard>
    {onchainApproval && (
      <OnchainApprovalModal
        approval={onchainApproval}
        gatewayUrl={gatewayUrl}
        onClose={() => setOnchainApproval(null)}
      />
    )}
    </AppLayout>
  )
}
