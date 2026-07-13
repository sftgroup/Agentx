// app/user/chat/[agentId]/page.tsx — Chat with Agent (SDK + Persistence + MCP)
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { SubscriptionGuard } from '@/components/guard/SubscriptionGuard'
import { useAccount } from 'wagmi'
import { useAgentDetail } from '@/hooks/aimarket/useAgentRegistry'
import { useAgentRunner } from '@agentxv2/sdk/react'
import type { AgentRunContext, RunnableSkill } from '@agentxv2/sdk'
import { Send, Brain, AlertCircle, Settings, Sparkles, ArrowLeft, Loader2, Download, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  toolName?: string
}

interface AIConfig {
  id: string
  name: string
  provider: string
  endpoint: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  isActive: boolean
}

const HISTORY_KEY_PREFIX = 'agentx-chat-history-'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

export default function ChatPage() {
  const params = useParams()
  const { isConnected } = useAccount()
  const agentId = Number(params.agentId)
  const historyKey = `${HISTORY_KEY_PREFIX}${agentId}`

  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<AIConfig | null>(null)
  const [aiConfigs, setAiConfigs] = useState<AIConfig[]>([])
  const [showModelSelector, setShowModelSelector] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { data: agent, isLoading: isLoadingAgent } = useAgentDetail(agentId)
  const { ctx, isLoading: isLoadingCtx, error: ctxError } = useAgentRunner({ agentId })

  // ── P2 #15: Restore chat history from localStorage ─────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyKey)
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* ignore corrupt data */ }
  }, [historyKey])

  // ── P2 #15: Persist on every change ─────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(historyKey, JSON.stringify(messages.slice(-100)))
      } catch { /* quota exceeded? */ }
    }
  }, [messages, historyKey])

  const clearHistory = useCallback(() => {
    setMessages([])
    localStorage.removeItem(historyKey)
  }, [historyKey])

  // ── AI configs ─────────────────────────────────────────────────────

  useEffect(() => {
    const savedConfigs = localStorage.getItem('aiConfigs')
    if (savedConfigs) {
      const configs = JSON.parse(savedConfigs)
      setAiConfigs(configs)
      const activeConfig = configs.find((c: AIConfig) => c.isActive) || configs[0]
      setSelectedConfig(activeConfig)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── P2 #13: MCP tool call via SkillDef.execute ──────────────────────

  const findSkill = useCallback(
    (message: string): RunnableSkill | null => {
      if (!ctx?.skills?.length) return null
      const lower = message.toLowerCase()
      for (const skill of ctx.skills) {
        const name = skill.name.toLowerCase()
        const desc = skill.description.toLowerCase()
        if (
          lower.includes(name) ||
          desc.split(/\s+/).some((w: string) => w.length > 2 && lower.includes(w))
        ) {
          return skill
        }
      }
      return null
    },
    [ctx]
  )

  // ── Send message handler ───────────────────────────────────────────

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isLoading) return
    if (!selectedConfig) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setInputMessage('')
    setIsLoading(true)

    try {
      const skill = findSkill(inputMessage)
      if (skill) {
        const result = await skill.execute({ query: inputMessage })
        const toolMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'tool',
          content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          timestamp: Date.now(),
          toolName: skill.name,
        }
        setMessages(prev => [...prev, toolMsg])
        setIsLoading(false)
        return
      }

      const systemPrompt = ctx?.prompt ?? ''
      const llmMessages = [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        ...messages.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: inputMessage },
      ]

      const res = await fetch(selectedConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: selectedConfig.model,
          messages: llmMessages,
          temperature: selectedConfig.temperature,
          max_tokens: selectedConfig.maxTokens,
        }),
      })

      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || 'No response'

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
        },
      ])
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${getErrorMessage(error)}`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [inputMessage, isLoading, selectedConfig, messages, ctx, findSkill])

  // ── Loading states ─────────────────────────────────────────────────

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
    <SubscriptionGuard agentId={agentId}>
      <AppLayout>
        <div className="max-w-6xl mx-auto h-[calc(100vh-5rem)] flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/user/dashboard" className="text-text-muted hover:text-text-secondary transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-accent-purple" />
              </div>
              <div>
                <h1 className="font-semibold">
                  {agent?.metadata?.name || isLoadingCtx ? <Loader2 className="w-4 h-4 animate-spin inline" /> : agent?.metadata?.name || `Agent #${agentId}`}
                </h1>
                <p className="text-xs text-text-muted">
                  {ctx ? '🔐 E2E Encrypted' : isLoadingCtx ? 'Decrypting...' : agent?.metadata?.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button onClick={clearHistory} className="btn-secondary text-xs py-1.5 px-2" title="Clear history">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {selectedConfig && (
                <div className="relative">
                  <button onClick={() => setShowModelSelector(!showModelSelector)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 text-sm text-text-secondary hover:text-text-primary transition-colors">
                    <Brain className="w-4 h-4" /> {selectedConfig.name}
                  </button>
                  {showModelSelector && (
                    <div className="absolute top-full right-0 mt-2 glass-card p-2 w-64 z-50">
                      {aiConfigs.map(cfg => (
                        <button key={cfg.id} onClick={() => {
                          setSelectedConfig(cfg); setShowModelSelector(false)
                          const updated = aiConfigs.map(c => ({ ...c, isActive: c.id === cfg.id }))
                          setAiConfigs(updated); localStorage.setItem('aiConfigs', JSON.stringify(updated))
                        }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors ${selectedConfig.id === cfg.id ? 'bg-accent-purple/10 text-accent-purple' : ''}`}>
                          <div className="font-medium">{cfg.name}</div>
                          <div className="text-xs text-text-muted">{cfg.model} · {cfg.provider}</div>
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
                      <Sparkles className="w-4 h-4" /> Agent Skills
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
              messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-2xl rounded-2xl px-4 py-3 ${
                    msg.role === 'user' ? 'bg-accent-purple/20 border border-accent-purple/20' :
                    msg.role === 'tool' ? 'bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan' :
                    'bg-white/5 border border-white/5'
                  }`}>
                    {msg.role === 'tool' && <div className="text-xs font-medium mb-1 opacity-60">🔧 {msg.toolName}</div>}
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                    <div className="text-xs mt-2 opacity-40">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3 bg-white/5 border border-white/5 text-text-muted text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 animate-pulse" /> Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-5 border-t border-white/5">
            <div className="flex gap-3">
              <input type="text" value={inputMessage} onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-sm focus:outline-none focus:border-accent-purple/40 focus:bg-white/8 transition-colors placeholder:text-text-muted"
                disabled={isLoading || !selectedConfig} />
              <button onClick={handleSendMessage} disabled={!inputMessage.trim() || isLoading || !selectedConfig}
                className="px-5 py-3 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-30 text-white rounded-xl transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
              {selectedConfig ? (
                <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /> {selectedConfig.name} · {selectedConfig.model}</span>
              ) : <span>⚠ No model selected</span>}
              <span className="flex items-center gap-3">
                {messages.length > 0 && <span>{messages.length} messages saved</span>}
                {ctx && <span className="text-accent-purple">🔐 E2E Encrypted</span>}
              </span>
            </div>
          </div>
        </div>
      </AppLayout>
    </SubscriptionGuard>
  )
}
