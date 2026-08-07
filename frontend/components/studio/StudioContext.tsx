// components/studio/StudioContext.tsx — Shared state for Studio sub-routes
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { useOnChainAgentRegistry as useAgentRegistry } from '@/components/agent/hooks/useAgentRegistry'
import { packAgentForPublish, encryptPayload, generateAesKey } from '@agentxv2/sdk/core'
import type { AgentPayload, AgentPrivatePayload, EncryptedPayload, PackResult } from '@agentxv2/sdk/core'
import { makeEmptyForm, type AgentForm } from './types'

interface StudioCtx {
  form: AgentForm
  setForm: (f: AgentForm | ((prev: AgentForm) => AgentForm)) => void
  fieldErrors: Record<string, string>
  setFieldErrors: (e: Record<string, string>) => void
  publishing: boolean
  error: string | null
  txHash: string | null
  ipfsHash: string | null
  isConnected: boolean
  isConfirming: boolean
  publish: () => Promise<void>
  addSkill: () => void
  updateSkill: (i: number, field: string, value: string) => void
  removeSkill: (i: number) => void
}

const StudioCtx = createContext<StudioCtx | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount()
  const { registerAgentWithMetadata, isConfirming } = useAgentRegistry()

  const [form, setForm] = useState<AgentForm>(makeEmptyForm())
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [ipfsHash, setIpfsHash] = useState<string | null>(null)

  const addSkill = () => setForm(prev => ({ ...prev, skills: [...prev.skills, { name: '', description: '', endpoint: '' }] }))
  const updateSkill = (i: number, field: string, value: string) => {
    setForm(prev => {
      const skills = [...prev.skills]
      skills[i] = { ...skills[i], [field]: value }
      return { ...prev, skills }
    })
  }
  const removeSkill = (i: number) => setForm(prev => ({ ...prev, skills: prev.skills.filter((_, idx) => idx !== i) }))

  const publish = useCallback(async () => {
    console.log('[Studio] publish() called, isConnected:', isConnected, 'form.name:', form.name)
    setPublishing(true); setError(null)
    try {
      const tagList = form.tags
      console.log('[Studio] tagList:', tagList, 'skills:', form.skills.length)

      const agentPayload: AgentPayload = {
        name: form.name,
        description: form.description,
        prompt: form.prompt,
        version: '1.0.0',
        tags: tagList,
        category: (form.category || 'other') as AgentPayload['category'],
        capabilities: ['chat', 'mcp'],
        supportedTasks: ['conversation', 'data-analysis'],
        communicationProtocol: 'mcp',
        authenticationMethod: 'ecdsa',
        pricing: {
          type: form.pricingType === 'subscription' ? 'subscription' as const : 'pay_per_use' as const,
          currency: 'ETH',
          amount: form.price || '0',
        },
        skills: form.skills.map(s => ({
          name: s.name,
          description: s.description,
          version: '1.0.0',
          inputSchema: { type: 'object' as const, properties: {} },
          execution: undefined,
        })),
        mcp: { type: 'http' as const, url: '' },
      }

      const privatePayload: AgentPrivatePayload = {
        prompt: agentPayload.prompt,
        skills: agentPayload.skills,
        mcp: agentPayload.mcp,
      }
      const aesKey = generateAesKey()
      const encrypted: EncryptedPayload = encryptPayload(privatePayload, aesKey)
      packAgentForPublish(agentPayload, '', aesKey)

      // 加密负载上传到 IPFS（经服务端代理，Pinata JWT 由服务端持有，浏览器不接触密钥）
      let cid: string
      try {
        const res = await fetch('/api/ipfs/upload-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encrypted_data: encrypted.data,
            metadata: {
              name: form.name, description: form.description,
              tags: tagList,
              category: form.category || 'other',
              pricing: { type: form.pricingType, amount: form.price || '0', currency: 'ETH' },
              version: '1.0.0',
            },
            schema_version: 'agentx/v2',
          })
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error || `IPFS 上传失败: HTTP ${res.status}`)
        }
        const data = (await res.json()) as { IpfsHash?: string }
        if (!data.IpfsHash) throw new Error('IPFS 返回数据缺少 CID')
        cid = data.IpfsHash
      } catch (err) {
        console.warn('IPFS 上传失败，降级为 data URI 发布:', err)
        cid = `local-${Date.now()}`
      }
      setIpfsHash(cid)

      const tokenURI = cid.startsWith('local-')
        ? `data:application/json,${encodeURIComponent(encrypted.data)}`
        : `https://indigo-peaceful-mackerel-164.mypinata.cloud/ipfs/${cid}`

      const metadataPairs = [
        { key: 'name', value: `0x${Buffer.from(form.name, 'utf8').toString('hex')}` },
        { key: 'description', value: `0x${Buffer.from(form.description, 'utf8').toString('hex')}` },
        { key: 'category', value: `0x${Buffer.from(form.category || 'other', 'utf8').toString('hex')}` },
        { key: 'pricing_type', value: `0x${Buffer.from(form.pricingType, 'utf8').toString('hex')}` },
        { key: 'price_wei', value: `0x${Buffer.from(String(Math.floor(Number(form.price || '0') * 1e18)), 'utf8').toString('hex')}` },
        { key: 'aes_key_hex', value: `0x${aesKey}` },
      ]
      if (tagList.length > 0) {
        metadataPairs.push({ key: 'tags', value: `0x${Buffer.from(tagList.join(','), 'utf8').toString('hex')}` })
      }

      const hash = await registerAgentWithMetadata(tokenURI, metadataPairs)
      if (hash) setTxHash(hash)
    } catch (e: any) {
      setError(e.message || 'Publish failed')
    } finally { setPublishing(false) }
  }, [form, registerAgentWithMetadata])

  return (
    <StudioCtx.Provider value={{
      form, setForm, fieldErrors, setFieldErrors,
      publishing, error, txHash, ipfsHash,
      isConnected, isConfirming,
      publish, addSkill, updateSkill, removeSkill,
    }}>
      {children}
    </StudioCtx.Provider>
  )
}

export function useStudio(): StudioCtx {
  const ctx = useContext(StudioCtx)
  if (!ctx) throw new Error('useStudio must be used inside <StudioProvider>')
  return ctx
}
