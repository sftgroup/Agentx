// app/user/chat/[agentId]/page.tsx — Chat with Agent (Glassmorphism Dark)
'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAccount } from 'wagmi'
import { useAgentDetail } from '@/hooks/aimarket/useAgentRegistry'
import { useReputation } from '@/components/agent/hooks/useReputation'
import { useUserSubscriptions } from '@/hooks/user/useUserSubscriptions'
import { Send, Brain, Star, AlertCircle, Settings, MessageSquare, Clock, CreditCard, ChevronDown, Check, Sparkles, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  toolName?: string
  toolArgs?: any
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

interface MCPConfig {
  server_url: string
  type: string
  tools: string[]
  supported_chains: string[]
  version: string
}

interface MCPTool {
  name: string
  description: string
  inputSchema: any
}

function parseStringToArray(str: string): string[] {
  if (Array.isArray(str)) return str
  if (typeof str !== 'string') return []
  try { return JSON.parse(str) } catch {
    return str.split(',').map(item => item.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')).filter(item => item.length > 0)
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

export default function ChatPage() {
  const params = useParams()
  const { isConnected } = useAccount()
  const agentId = Number(params.agentId)

  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<AIConfig | null>(null)
  const [aiConfigs, setAiConfigs] = useState<AIConfig[]>([])
  const [mcpConfig, setMcpConfig] = useState<MCPConfig | null>(null)
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([])
  const [isMcpConnected, setIsMcpConnected] = useState(false)
  const [isLoadingMcp, setIsLoadingMcp] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { data: agent, isLoading: isLoadingAgent } = useAgentDetail(agentId)
  const { subscriptions } = useUserSubscriptions()
  const { giveFeedback, isGivingFeedback } = useReputation()

  const userSubscription = subscriptions?.find(sub => Number(sub.agentId) === agentId && sub.isActive === true)

  // Load AI configs
  useEffect(() => {
    const savedConfigs = localStorage.getItem('aiConfigs')
    if (savedConfigs) {
      const configs = JSON.parse(savedConfigs)
      setAiConfigs(configs)
      const activeConfig = configs.find((c: AIConfig) => c.isActive) || configs[0]
      setSelectedConfig(activeConfig)
    }
  }, [])

  // Scroll to bottom
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // MCP tool detection
  const shouldUseMcpTool = (message: string): { useTool: boolean; toolName?: string; args?: any } => {
    if (!mcpTools.length) return { useTool: false }
    const lower = message.toLowerCase()
    const addrMatch = message.match(/0x[a-fA-F0-9]{40}/)
    const chainMatch = /(eth|bsc|base|以太坊|币安|base)/i.exec(message)
    let chain = 'eth'
    if (chainMatch) {
      if (chainMatch[0].includes('bsc') || chainMatch[0].includes('币安')) chain = 'bsc'
      else if (chainMatch[0].includes('base')) chain = 'base'
    }
    if ((lower.includes('balance') || lower.includes('余额')) && addrMatch) return { useTool: true, toolName: 'get_balance', args: { address: addrMatch[0], chain } }
    if (lower.includes('gas') || lower.includes('手续费')) return { useTool: true, toolName: 'get_gas_price', args: { chain } }
    return { useTool: false }
  }

  const callMcpTool = async (toolName: string, args: any): Promise<string> => {
    if (!mcpConfig) throw new Error('MCP not configured')
    const res = await fetch(mcpConfig.server_url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: toolName, arguments: args } })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.result?.content?.[0]?.text || 'Tool executed'
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !userSubscription || !selectedConfig) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: inputMessage, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInputMessage('')
    setIsLoading(true)
    try {
      const toolCheck = shouldUseMcpTool(inputMessage)
      if (toolCheck.useTool && toolCheck.toolName) {
        const result = await callMcpTool(toolCheck.toolName, toolCheck.args)
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'tool', content: result, timestamp: new Date(), toolName: toolCheck.toolName, toolArgs: toolCheck.args }])
      } else {
        const res = await fetch(selectedConfig.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${selectedConfig.apiKey}` },
          body: JSON.stringify({ model: selectedConfig.model, messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })), temperature: selectedConfig.temperature, max_tokens: selectedConfig.maxTokens })
        })
        const data = await res.json()
        const reply = data.choices?.[0]?.message?.content || 'No response'
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: reply, timestamp: new Date() }])
      }
      if (messages.length >= 2) setShowRating(true)
    } catch (error) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: `Error: ${getErrorMessage(error)}`, timestamp: new Date() }])
    } finally { setIsLoading(false) }
  }

  const handleSelectModel = (config: AIConfig) => {
    setSelectedConfig(config); setShowModelSelector(false)
    const updated = aiConfigs.map(c => ({ ...c, isActive: c.id === config.id }))
    setAiConfigs(updated); localStorage.setItem('aiConfigs', JSON.stringify(updated))
  }

  // Guard states
  if (!isConnected) {
    return <AppLayout><div className="max-w-4xl mx-auto text-center py-20"><AlertCircle className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" /><h2 className="heading-md mb-3">Connect Wallet Required</h2><p className="body text-text-muted">Connect your wallet to chat with this Agent.</p></div></AppLayout>
  }
  if (isLoadingAgent) {
    return <AppLayout><div className="max-w-4xl mx-auto text-center py-20"><Brain className="w-8 h-8 text-text-muted animate-spin mx-auto mb-4" /></div></AppLayout>
  }
  if (!agent) {
    return <AppLayout><div className="max-w-4xl mx-auto text-center py-20"><AlertCircle className="w-16 h-16 text-red-400/40 mx-auto mb-4" /><h2 className="heading-md mb-3">Agent Not Found</h2><Link href="/marketplace" className="btn-primary inline-block mt-4">Back to Marketplace</Link></div></AppLayout>
  }
  if (!userSubscription) {
    return <AppLayout><div className="max-w-4xl mx-auto text-center py-20"><CreditCard className="w-16 h-16 text-accent-purple/40 mx-auto mb-4" /><h2 className="heading-md mb-3">Subscription Required</h2><p className="body text-text-muted mb-6">Subscribe to chat with this Agent.</p><div className="flex gap-4 justify-center"><Link href={`/marketplace/agent/${agentId}`} className="btn-primary">View Plans</Link><Link href="/marketplace" className="btn-secondary">Browse Others</Link></div></div></AppLayout>
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto h-[calc(100vh-5rem)] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/user/dashboard" className="text-text-muted hover:text-text-secondary transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-accent-purple" />
            </div>
            <div>
              <h1 className="font-semibold">{agent?.metadata?.name || `Agent #${agentId}`}</h1>
              <p className="text-xs text-text-muted">{agent?.metadata?.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Model selector */}
            <div className="relative">
              <button onClick={() => setShowModelSelector(!showModelSelector)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 text-sm text-text-secondary hover:text-text-primary transition-colors">
                <Brain className="w-4 h-4" /> {selectedConfig?.name || 'Select Model'} <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showModelSelector && (
                <div className="absolute top-full right-0 mt-2 glass-card p-2 w-64 z-50">
                  {aiConfigs.map(cfg => (
                    <button key={cfg.id} onClick={() => handleSelectModel(cfg)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors ${selectedConfig?.id === cfg.id ? 'bg-accent-purple/10 text-accent-purple' : ''}`}>
                      <div className="font-medium">{cfg.name}</div>
                      <div className="text-xs text-text-muted">{cfg.model} · {cfg.provider}</div>
                    </button>
                  ))}
                  {aiConfigs.length === 0 && <Link href="/user/settings" className="block px-3 py-2 text-sm text-accent-purple hover:bg-accent-purple/5 rounded-lg">Configure API →</Link>}
                </div>
              )}
            </div>
            <Link href="/user/settings" className="btn-secondary text-xs py-1.5 px-3"><Settings className="w-3.5 h-3.5" /> API</Link>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-accent-purple/10 flex items-center justify-center mx-auto mb-4"><Brain className="w-8 h-8 text-accent-purple" /></div>
              <h3 className="text-xl font-semibold mb-2">Start the Conversation</h3>
              <p className="body text-text-secondary mb-6">Chat with {agent?.metadata?.name}</p>
              {isMcpConnected && (
                <div className="glass-card-hover p-4 max-w-md mx-auto rounded-xl text-left">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-accent-cyan"><Sparkles className="w-4 h-4" /> Available Tools</div>
                  <div className="flex flex-wrap gap-2">{mcpTools.slice(0,6).map(t => (
                    <span key={t.name} className="text-xs px-2 py-1 rounded-full bg-accent-cyan/5 border border-accent-cyan/10 text-accent-cyan">{t.name}</span>
                  ))}</div>
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
                  {msg.role === 'tool' && <div className="text-xs font-medium mb-1 opacity-60">{msg.toolName}</div>}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                  <div className="text-xs mt-2 opacity-40">{msg.timestamp.toLocaleTimeString()}</div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-white/5 border border-white/5 text-text-muted text-sm flex items-center gap-2"><Brain className="w-4 h-4 animate-pulse" /> Thinking...</div>
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
              disabled={isLoading || !userSubscription || !selectedConfig} />
            <button onClick={handleSendMessage} disabled={!inputMessage.trim() || isLoading || !userSubscription || !selectedConfig}
              className="px-5 py-3 bg-accent-purple hover:bg-accent-purple/90 disabled:opacity-30 text-white rounded-xl transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
            {selectedConfig ? <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /> {selectedConfig.name} · {selectedConfig.model}</span> : <span>⚠ No model selected</span>}
            <span>Temperature: {selectedConfig?.temperature || 'N/A'}</span>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
