// app/user/chat/[agentId]/page.tsx — Chat with Agent (AgentLoop + Multi-Tenant SaaS)
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { SubscriptionGuard } from '@/components/guard/SubscriptionGuard'
import { ToolCallBubble } from '@/components/chat/ToolCallBubble'
import { useAccount } from 'wagmi'
import { useAgentDetail } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentRunner } from '@agentxv2/sdk/react'
import { AgentLoop, GatewayProvider, OpenAIProvider, createLLMProvider } from '@agentxv2/sdk'
import type { AgentRunContext, RunnableSkill, ToolCallStart, ToolCallResult, AgentLoopResult } from '@agentxv2/sdk'
import { useGatewayAuth } from '@/hooks/useGatewayAuth'
import type { GatewayContext } from '@/hooks/useGatewayAuth'
import { Send, Brain, AlertCircle, Sparkles, ArrowLeft, Loader2, Trash2, Square, Wrench } from 'lucide-react'
import Link from 'next/link'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  toolError?: string
  toolStatus?: 'pending' | 'done' | 'error'
  toolDurationMs?: number
}

interface ModelOption {
  id: string
  provider: string
  model: string
  label?: string
  source: 'platform' | 'tenant_owned'
  tenantKeyId?: string
}

const HISTORY_KEY_PREFIX = 'agentx-chat-history-'

export default function ChatPage() {
  const params = useParams()
  const { isConnected } = useAccount()
  const agentId = Number(params.agentId)
  const historyKey = `${HISTORY_KEY_PREFIX}${agentId}`

  const gatewayUrl = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || ''

  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [thinkingText, setThinkingText] = useState<string>('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<AgentLoop | null>(null)
  const assistantMessageIdRef = useRef<string>('')

  const { data: agent, isLoading: isLoadingAgent } = useAgentDetail(agentId)
  const { ctx, isLoading: isLoadingCtx, error: ctxError } = useAgentRunner({ agentId })
  const { isAuthenticated: isGatewayAuth, context: gatewayCtx } = useGatewayAuth(gatewayUrl)

  // ── Chat history persistence ─────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyKey)
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [historyKey])

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(historyKey, JSON.stringify(messages.slice(-100)))
      } catch { /* ignore */ }
    }
  }, [messages, historyKey])

  const clearHistory = useCallback(() => {
    setMessages([])
    localStorage.removeItem(historyKey)
  }, [historyKey])

  // ── Auto-scroll ──────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinkingText])

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
          setModelOptions([{
            id: active.id,
            provider: active.provider,
            model: active.model,
            label: active.name,
            source: 'tenant_owned',
          }])
          setSelectedModel({
            id: active.id,
            provider: active.provider,
            model: active.model,
            label: active.name,
            source: 'tenant_owned',
          })
        }
      } catch { /* ignore */ }
    }
  }, [gatewayUrl, gatewayCtx])

  // ── Send message with AgentLoop ──────────────────────────────────────

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isLoading || !ctx) return
    if (!selectedModel && !gatewayUrl) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    const userInput = inputMessage
    setInputMessage('')
    setIsLoading(true)
    setThinkingText('')

    assistantMessageIdRef.current = ''

    try {
      let llmProvider

      if (gatewayUrl && gatewayCtx) {
        llmProvider = new GatewayProvider({
          gatewayUrl,
          accessToken: gatewayCtx.accessToken,
          keySource: selectedModel?.source === 'platform' ? 'platform' : 'tenant_owned',
          tenantKeyId: selectedModel?.tenantKeyId,
          model: selectedModel?.model,
        })
      } else {
        const savedConfigs = JSON.parse(localStorage.getItem('aiConfigs') || '[]') as {
          id: string; endpoint: string; apiKey: string; model: string; temperature: number; maxTokens: number; isActive: boolean
        }[]
        const active = savedConfigs.find(c => c.isActive) || savedConfigs[0]
        if (active) {
          llmProvider = new OpenAIProvider({
            apiKey: active.apiKey,
            endpoint: active.endpoint,
            model: active.model,
            temperature: active.temperature,
            maxTokens: active.maxTokens,
          })
        }
      }

      if (!llmProvider) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'No AI model configured. Please add an API key in Settings.',
          timestamp: Date.now(),
        }])
        setIsLoading(false)
        return
      }

      const loopCtx = {
        agentId: ctx.agentId,
        prompt: ctx.prompt,
        skills: ctx.skills,
        model: selectedModel?.model,
      }

      const loop = new AgentLoop({
        ctx: loopCtx,
        llmProvider,
        maxIterations: 5,
        timeoutMs: 120_000,

        onTextDelta: (delta) => {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.id === assistantMessageIdRef.current) {
              const updated = [...prev]
              updated[updated.length - 1] = { ...last, content: last.content + delta }
              return updated
            }
            const id = (Date.now() + Math.random()).toString()
            assistantMessageIdRef.current = id
            return [...prev, { id, role: 'assistant', content: delta, timestamp: Date.now() }]
          })
        },

        onToolCall: (call: ToolCallStart) => {
          setMessages(prev => [...prev, {
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
          setMessages(prev => {
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

        onThinking: (msg: string) => {
          setThinkingText(msg)
        },

        onComplete: (_result: AgentLoopResult) => {
        },

        onError: (error: Error) => {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Loop error: ${error.message}`,
            timestamp: Date.now(),
          }])
        },
      })

      loopRef.current = loop

      const historyForLoop = messages.slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }))

      await loop.run(userInput, historyForLoop)
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      }])
    } finally {
      setIsLoading(false)
      setThinkingText('')
      loopRef.current = null
    }
  }, [inputMessage, isLoading, ctx, selectedModel, gatewayUrl, gatewayCtx, messages])

  const handleStop = useCallback(() => {
    loopRef.current?.abort()
  }, [])

  // ── Render helpers ───────────────────────────────────────────────────

  const renderMessage = (msg: Message) => {
    if (msg.role === 'tool_call' || msg.role === 'tool_result') {
      return (
        <ToolCallBubble
          key={msg.id}
          toolName={msg.toolName || 'unknown'}
          input={msg.toolInput}
          result={msg.toolResult}
          error={msg.toolError}
          status={msg.toolStatus || 'pending'}
          durationMs={msg.toolDurationMs}
        />
      )
    }

    return (
      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-2xl rounded-2xl px-4 py-3 ${
          msg.role === 'user'
            ? 'bg-accent-purple/20 border border-accent-purple/20'
            : 'bg-white/5 border border-white/5'
        }`}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content || '...'}</div>
          <div className="text-xs mt-2 opacity-40">{new Date(msg.timestamp).toLocaleTimeString()}</div>
        </div>
      </div>
    )
  }

  const selectedLabel = selectedModel
    ? (selectedModel.label || selectedModel.model)
    : 'Select model'

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
                  {ctx ? '🔐 E2E Encrypted' : isLoadingCtx ? 'Decrypting...' : agent?.metadata?.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {messages.length > 0 && (
                <button onClick={clearHistory} className="btn-secondary text-xs py-1.5 px-2" title="Clear history">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {modelOptions.length > 0 && (
                <div className="relative">
                  <button onClick={() => setShowModelSelector(!showModelSelector)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 text-sm text-text-secondary hover:text-text-primary transition-colors max-w-[200px]">
                    <Brain className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{selectedLabel}</span>
                  </button>
                  {showModelSelector && (
                    <div className="absolute top-full right-0 mt-2 glass-card p-2 w-72 z-50 max-h-80 overflow-y-auto">
                      {gatewayUrl && modelOptions.some(m => m.source === 'platform') && (
                        <>
                          <div className="text-xs font-medium text-text-muted px-2 py-1">Platform Models</div>
                          {modelOptions.filter(m => m.source === 'platform').map(m => (
                            <button key={m.id} onClick={() => { setSelectedModel(m); setShowModelSelector(false) }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors ${selectedModel?.id === m.id ? 'bg-accent-purple/10 text-accent-purple' : ''}`}>
                              <div className="font-medium">{m.model}</div>
                              <div className="text-xs text-text-muted">{m.provider}</div>
                            </button>
                          ))}
                          {modelOptions.some(m => m.source === 'tenant_owned') && (
                            <div className="border-t border-white/5 my-1" />
                          )}
                        </>
                      )}
                      {modelOptions.filter(m => m.source === 'tenant_owned').map(m => (
                        <button key={m.id} onClick={() => { setSelectedModel(m); setShowModelSelector(false) }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors ${selectedModel?.id === m.id ? 'bg-accent-purple/10 text-accent-purple' : ''}`}>
                          <div className="font-medium">{m.label || m.model}</div>
                          <div className="text-xs text-text-muted">{m.provider} · 🔑 Own Key</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
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
              messages.map(msg => renderMessage(msg))
            )}
            {isLoading && !thinkingText && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 bg-white/5 border border-white/5 text-text-muted text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 animate-pulse" /> Thinking...
                </div>
              </div>
            )}
            {thinkingText && (
              <div className="flex justify-center">
                <span className="text-xs text-text-muted bg-white/5 rounded-full px-3 py-1">{thinkingText}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-5 border-t border-white/5">
            <div className="flex gap-3">
              <input type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder={selectedModel ? 'Type your message...' : 'Select a model to start chatting...'}
                className="flex-1 px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40 focus:bg-white/8 transition-colors placeholder:text-text-muted"
                disabled={isLoading || (!selectedModel && !gatewayUrl)} />
              {isLoading ? (
                <button onClick={handleStop}
                  className="px-5 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 rounded-xl transition-colors">
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={handleSendMessage} disabled={!inputMessage.trim() || !selectedModel}
                  className="px-5 py-3 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-30 text-white rounded-xl transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
              {selectedModel ? (
                <span className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {selectedModel.source === 'platform' ? 'Platform' : 'Own Key'} · {selectedModel.model}
                </span>
              ) : <span>Select a model above</span>}
              <span className="flex items-center gap-3">
                {messages.length > 0 && <span>{messages.length} messages</span>}
                {isGatewayAuth && gatewayCtx?.plan && (
                  <span className="text-accent-cyan">
                    {gatewayCtx.usageToday.total_tokens.toLocaleString()} / {(gatewayCtx.plan.quota_daily || 0).toLocaleString()} tokens
                  </span>
                )}
                {ctx && <span className="text-accent-purple">🔐 E2E</span>}
              </span>
            </div>
          </div>
        </div>
    </SubscriptionGuard>
    </AppLayout>
  )
}
