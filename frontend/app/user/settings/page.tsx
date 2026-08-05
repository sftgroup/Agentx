// app/user/settings/page.tsx — API Settings (Glassmorphism Dark)
// Own LLM keys are stored encrypted server-side via the Gateway (POST /tenant/keys)
// and used by the SSE chat pipeline (resolved server-side, never exposed to the browser).
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Settings, Plus, Trash2, Check, X, Zap, Key, Copy, Eye, EyeOff, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAccount, useWalletClient } from 'wagmi'
import { useGatewayAuth } from '@/hooks/useGatewayAuth'

// Preset OpenAI-compatible providers (endpoint base, no /chat/completions suffix).
// Users may also pick "custom" and enter their own endpoint + model.
interface ProviderPreset {
  id: string
  name: string
  endpoint: string
  models: string[]
}

const PROVIDERS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'moonshot', name: 'Moonshot (Kimi)', endpoint: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-k2-0905-preview'] },
  { id: 'zhipu', name: 'Zhipu GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash', 'glm-4-air'] },
  { id: 'siliconflow', name: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'] },
  { id: 'ollama', name: 'Ollama (local)', endpoint: 'http://localhost:11434/v1', models: ['llama3.1'] },
  { id: 'custom', name: 'Custom', endpoint: '', models: [] },
]

const GATEWAY = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || ''

export default function SettingsPage() {
  const { isConnected } = useAccount()
  const { accessToken, isAuthenticated, context, refreshContext } = useGatewayAuth(GATEWAY)

  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Own key CRUD ────────────────────────────────────────────────────
  const deleteKey = async (id: string) => {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/tenant/keys/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Delete failed')
      await refreshContext()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const validateKey = async (id: string) => {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/tenant/keys/${id}/validate`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Validate failed')
      await refreshContext()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const addKey = async (input: { provider: string; endpoint: string; api_key: string; model: string; label?: string }) => {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`${GATEWAY}/api/v1/tenant/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(input),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Add failed')
      await refreshContext()
      return true
    } catch (e: any) {
      setError(e.message)
      return false
    } finally { setBusy(false) }
  }

  const ownKeys = context?.ownKeys || []

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="heading-md flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center">
                <Settings className="w-5 h-5 text-accent-purple" />
              </div>API Settings
            </h1>
            <p className="body text-text-secondary mt-1">Configure your own LLM API keys or use the platform's managed models</p>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setError(null) }}
            disabled={!isAuthenticated}
            className="btn-primary text-sm py-2 disabled:opacity-30"
          >
            <Plus className="w-4 h-4" /> Add Key
          </button>
        </div>

        {!isConnected && (
          <div className="glass-card p-6 text-sm text-text-muted flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Connect your wallet to manage your own LLM API keys.
          </div>
        )}

        {error && (
          <div className="glass-card p-4 text-sm text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Platform API Key ─────────────────────────────────────── */}
        <PlatformApiKey />

        {/* ── Own LLM Keys (server-stored BYOK) ───────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
            <ShieldCheck className="w-4 h-4 text-accent-cyan" /> Own LLM Keys
            <span className="text-xs font-normal text-text-muted">encrypted at rest · resolved server-side · never exposed to the browser</span>
          </div>

          {ownKeys.length === 0 && !showForm ? (
            <div className="glass-card p-8 text-center">
              <Zap className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-30" />
              <p className="text-sm text-text-secondary">No own LLM keys yet. Add one to chat with your own API key (highest priority) or use platform models on paid plans.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ownKeys.map(k => (
                <div key={k.id} className="glass-card glass-card-hover p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 text-accent-cyan" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {k.label || `${k.provider} key`}
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${k.is_active ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}
                        >
                          {k.is_active ? 'active' : 'inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-text-muted truncate">{k.provider} · {k.model} · {k.endpoint?.replace(/^https?:\/\//, '')}</div>
                      {k.last_validated && <div className="text-[11px] text-text-muted">validated {new Date(k.last_validated).toLocaleString()}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => validateKey(k.id)} disabled={busy} className="text-xs px-2 py-1 rounded-lg bg-white/5 text-text-muted hover:text-accent-cyan transition-colors disabled:opacity-30">
                      Validate
                    </button>
                    <button onClick={() => deleteKey(k.id)} disabled={busy} className="text-text-muted hover:text-red-400 transition-colors disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showForm && isAuthenticated && (
            <KeyForm
              busy={busy}
              onSubmit={async (input) => {
                const ok = await addKey(input)
                if (ok) setShowForm(false)
              }}
              onCancel={() => setShowForm(false)}
            />
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// ── Add-key form with preset providers ─────────────────────────────────────

function KeyForm({ busy, onSubmit, onCancel }: {
  busy: boolean
  onSubmit: (input: { provider: string; endpoint: string; api_key: string; model: string; label?: string }) => Promise<void>
  onCancel: () => void
}) {
  const [provider, setProvider] = useState(PROVIDERS[0]!.id)
  const [endpoint, setEndpoint] = useState(PROVIDERS[0]!.endpoint)
  const [model, setModel] = useState(PROVIDERS[0]!.models[0]!)
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState('')
  const [customModel, setCustomModel] = useState('')

  const preset = PROVIDERS.find(p => p.id === provider)!

  const applyProvider = (id: string) => {
    setProvider(id)
    const p = PROVIDERS.find(x => x.id === id)!
    setEndpoint(p.endpoint)
    setModel(p.models[0] || '')
    setCustomModel('')
  }

  const resolvedModel = provider === 'custom' ? customModel.trim() : model

  const handleSubmit = async () => {
    if (!apiKey.trim() || !endpoint.trim() || !resolvedModel) return
    await onSubmit({
      provider,
      endpoint: endpoint.trim(),
      api_key: apiKey.trim(),
      model: resolvedModel,
      label: label.trim() || undefined,
    })
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <h2 className="text-lg font-semibold">Add Own LLM Key</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Provider</label>
          <select
            value={provider}
            onChange={e => applyProvider(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors"
          >
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Label (optional)</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. My DeepSeek key"
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm text-text-secondary mb-1.5 block">Endpoint (OpenAI-compatible base URL)</label>
          <input
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors font-mono"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm text-text-secondary mb-1.5 block">Model</label>
          {provider === 'custom' ? (
            <input
              value={customModel}
              onChange={e => setCustomModel(e.target.value)}
              placeholder="e.g. my-model-v1"
              className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors font-mono"
            />
          ) : (
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors"
            >
              {preset.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm text-text-secondary mb-1.5 block">API Key</label>
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            type="password"
            placeholder="sk-..."
            className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40 transition-colors font-mono"
          />
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={busy || !apiKey.trim() || !resolvedModel} className="btn-primary text-sm px-6 py-2 disabled:opacity-30">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm px-6 py-2"><X className="w-4 h-4" /> Cancel</button>
      </div>
    </div>
  )
}

// ── Platform API Key (existing) ────────────────────────────────────────────

function PlatformApiKey() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)

  const gatewayUrl = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || ''

  const fetchApiKey = useCallback(async () => {
    if (!gatewayUrl || !isConnected || !address || !walletClient) return
    setLoading(true)
    setError(null)
    try {
      // Step 1: Auth via wallet signature
      const challengeRes = await fetch(`${gatewayUrl}/api/v1/auth/challenge?address=${address}`)
      const { challenge } = await challengeRes.json()
      const signature = await walletClient.signMessage({
        account: walletClient.account!,
        message: challenge,
      })
      const verifyRes = await fetch(`${gatewayUrl}/api/v1/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          signature,
          timestamp: Math.floor(Date.now() / 1000),
          nonce: challenge.split(':').pop(),
        }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Auth failed')

      // Step 2: Fetch API key
      const keyRes = await fetch(`${gatewayUrl}/api/v1/auth/api-key`, {
        headers: { Authorization: `Bearer ${verifyData.access_token}` },
      })
      const keyData = await keyRes.json()
      if (!keyRes.ok) throw new Error(keyData.error || 'Failed to fetch API key')

      setApiKey(keyData.api_key)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API key')
    } finally {
      setLoading(false)
    }
  }, [gatewayUrl, isConnected, address, walletClient])

  useEffect(() => {
    if (isConnected && !apiKey) fetchApiKey()
  }, [isConnected, fetchApiKey, apiKey])

  const copyToClipboard = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConnected) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center"><Key className="w-5 h-5 text-accent-cyan" /></div>
          <div>
            <h2 className="font-semibold">Platform API Key</h2>
            <p className="text-xs text-text-muted">Connect wallet to view your AgentX API key</p>
          </div>
        </div>
        <p className="text-sm text-text-muted">Sign in with your wallet to access your API key for programmatic API calls.</p>
      </div>
    )
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 flex items-center justify-center"><Key className="w-5 h-5 text-accent-cyan" /></div>
        <div>
          <h2 className="font-semibold">Platform API Key</h2>
          <p className="text-xs text-text-muted">Use this key to authenticate API requests without wallet signature</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading API key...
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchApiKey} className="btn-secondary text-sm py-1.5">Retry</button>
        </div>
      ) : apiKey ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2.5 bg-white/5 border border-white/5 rounded-lg text-sm font-mono select-all break-all">
              {showKey ? apiKey : apiKey.slice(0, 12) + '•'.repeat(28)}
            </code>
            <button
              onClick={() => setShowKey(!showKey)}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-muted"
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={copyToClipboard}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-text-muted"
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-xs text-text-muted bg-white/3 rounded-lg p-3 space-y-1">
            <p className="font-medium text-text-secondary mb-1">Usage</p>
            <code className="block">curl -H "X-Api-Key: {apiKey.slice(0, 12)}..." {gatewayUrl}/api/v1/agent/runs</code>
          </div>
        </div>
      ) : (
        <button onClick={fetchApiKey} className="btn-primary text-sm py-2"><Key className="w-4 h-4" /> Generate API Key</button>
      )}
    </div>
  )
}
