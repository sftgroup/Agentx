// app/studio/encrypt/page.tsx — Step 3: Encrypt & Configure
'use client'

import { Shield, Key } from 'lucide-react'
import { useStudio } from '@/components/studio/StudioContext'
import { StepNav } from '@/components/studio/StepNav'

export default function EncryptPage() {
  const { form, setForm, fieldErrors } = useStudio()

  return (
    <>
      <div className="glass-card p-6 space-y-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent-purple" /> Encrypt & Configure
        </h2>
        <p className="text-sm text-text-muted">
          Your Agent payload will be AES-256-GCM encrypted via @agentx/sdk, uploaded to IPFS, and the decryption key stored on-chain.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">Pricing Model</label>
            <div className="flex gap-3">
              {[{ value: 'subscription', label: 'Subscription' }, { value: 'per-use', label: 'Per-Use' }].map(opt => (
                <button key={opt.value}
                  onClick={() => setForm({...form, pricingType: opt.value as 'subscription' | 'per-use'})}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    form.pricingType === opt.value
                      ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/20'
                      : 'bg-white/3 border-white/5 text-text-muted hover:text-text-secondary'
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1.5 block">
              {form.pricingType === 'subscription' ? 'Monthly Price (ETH) *' : 'Price per Use (ETH) *'}
            </label>
            <input value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="0.01"
              className={`w-full px-4 py-2.5 bg-white/5 border rounded-xl text-sm focus:outline-none transition-colors ${fieldErrors.price ? 'border-red-400/40' : 'border-white/5 focus:border-accent-purple/40'}`} />
            {fieldErrors.price && <p className="text-xs text-red-400 mt-1">{fieldErrors.price}</p>}
          </div>
          <div className="p-4 rounded-xl bg-accent-purple/5 border border-accent-purple/10">
            <div className="flex items-center gap-2 text-sm font-medium text-accent-purple mb-2">
              <Key className="w-4 h-4" /> SDK Encryption Pipeline
            </div>
            <div className="text-xs text-text-muted space-y-1">
              <p>1. <code className="text-accent-cyan">packAgentForPublish()</code> — serialize prompt + skills + metadata</p>
              <p>2. <code className="text-accent-cyan">encryptPayload()</code> — AES-256-GCM encrypt (NIST standard)</p>
              <p>3. Ciphertext → upload to IPFS via Pinata</p>
              <p>4. AES key → stored on-chain as NFT metadata</p>
              <p>5. Agent NFT minted via <code className="text-accent-cyan">registerWithMetadata()</code></p>
            </div>
          </div>
        </div>
      </div>
      <StepNav step={3} />
    </>
  )
}
