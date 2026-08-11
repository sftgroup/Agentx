// ---------------------------------------------------------------------------
// AgentX — KeyManageCard (R19.2)
// ---------------------------------------------------------------------------
// Platform API-key management for the B-end console. Keys are stored only as
// SHA-256 hashes (R19.1) and shown exactly once at issuance — this card is the
// recovery path: rotating mints a fresh agentx_ key and instantly kills the
// old one (api_key_hash replaced, plaintext cleared).
// ---------------------------------------------------------------------------
'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Copy, KeyRound, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { GATEWAY_URL } from '@/lib/gateway'

function copy(text: string, done: (v: boolean) => void) {
  navigator.clipboard?.writeText(text)
    .then(() => { done(true); setTimeout(() => done(false), 2000) })
    .catch(() => {})
}

export function KeyManageCard({ accessToken }: { accessToken: string }) {
  const [rotating, setRotating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const rotate = async () => {
    setRotating(true)
    setError(null)
    setNewKey(null)
    setSaved(false)
    try {
      const res = await fetch(`${GATEWAY_URL}/api/v1/tenant/rotate-key`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json() as { api_key?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Key rotation failed')
      setNewKey(data.api_key!)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Key rotation failed')
    } finally {
      setRotating(false)
    }
  }

  return (
    <div className="glass-card p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent-purple" /> Platform API key
        </h3>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> SHA-256 hashed
        </span>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {newKey ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-black/40 border border-white/10 p-3 font-mono text-sm break-all text-accent-cyan">
            {newKey}
          </div>
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-start gap-2 text-xs text-yellow-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Old key is now invalid.</strong> This new key is shown only once — copy it now.
              Gateway calls keep using the <span className="font-mono">X-Api-Key</span> header.
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => copy(newKey, setCopied)}
              className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy new key'}
            </button>
            <button
              onClick={() => setSaved(true)}
              disabled={saved}
              className="btn-secondary flex-1 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {saved ? 'Saved' : 'I have saved it'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Your key is stored as a fingerprint and was shown once at sign-up. If you lost it, rotate
            to mint a replacement — the previous key stops working immediately.
          </p>
          <button
            onClick={rotate}
            disabled={rotating}
            className="btn-secondary text-sm py-2.5 px-4 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {rotating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {rotating ? 'Rotating…' : 'Rotate key'}
          </button>
        </div>
      )}
    </div>
  )
}
