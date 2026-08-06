// app/marketplace/skills/page.tsx — Skills Marketplace
// Browse approved skill templates, submit new skills, my skills (JWT required)
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useGatewayAuth } from '@/hooks/useGatewayAuth'
import { Wrench, Search, Plus, CheckCircle, Clock, XCircle, Filter, Upload } from 'lucide-react'
import { GATEWAY_URL_OPTIONAL as gatewayUrl } from '@/lib/gateway'

interface SkillItem {
  id: number
  name: string
  description: string
  category: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  usageCount: number
  status: string
  publisher: string
  createdAt: string
}

const CATEGORIES = ['all', 'defi', 'nft', 'security', 'data', 'utility', 'trading', 'governance']

export default function SkillsPage() {
  const { isAuthenticated, context } = useGatewayAuth(gatewayUrl)

  const [skills, setSkills] = useState<SkillItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [showSubmit, setShowSubmit] = useState(false)
  const [showMySkills, setShowMySkills] = useState(false)

  // Submit form
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formCategory, setFormCategory] = useState('utility')
  const [formInputSchema, setFormInputSchema] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  // My skills
  const [mySkills, setMySkills] = useState<SkillItem[]>([])
  const [loadingMySkills, setLoadingMySkills] = useState(false)

  // Fetch approved skills
  const fetchSkills = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (category && category !== 'all') params.set('category', category)
      const url = `${gatewayUrl}/api/v1/skills${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setSkills(data.skills || [])
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err)
    } finally {
      setIsLoading(false)
    }
  }, [gatewayUrl, category])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  // Fetch my skills
  const fetchMySkills = useCallback(async () => {
    if (!isAuthenticated || !context?.accessToken) return
    setLoadingMySkills(true)
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/skills/my`, {
        headers: { 'Authorization': `Bearer ${context.accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMySkills(data.skills || [])
      }
    } catch { /* ignore */ }
    finally { setLoadingMySkills(false) }
  }, [gatewayUrl, isAuthenticated, context])

  useEffect(() => {
    if (showMySkills) fetchMySkills()
  }, [showMySkills, fetchMySkills])

  // Submit skill
  const handleSubmit = async () => {
    if (!formName || !formDesc || !formCategory || !formInputSchema) {
      setSubmitError('All fields are required')
      return
    }

    let parsedSchema: Record<string, unknown>
    try {
      parsedSchema = JSON.parse(formInputSchema)
    } catch {
      setSubmitError('Input schema must be valid JSON')
      return
    }

    if (!isAuthenticated || !context?.accessToken) {
      setSubmitError('Please connect your wallet first')
      return
    }

    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')

    try {
      const res = await fetch(`${gatewayUrl}/api/v1/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.accessToken}`,
        },
        body: JSON.stringify({
          name: formName,
          description: formDesc,
          category: formCategory,
          inputSchema: parsedSchema,
        }),
      })

      if (res.ok) {
        setSubmitSuccess('Skill submitted for review!')
        setFormName('')
        setFormDesc('')
        setFormInputSchema('')
        setTimeout(() => { setShowSubmit(false); setSubmitSuccess('') }, 2000)
      } else {
        const err = await res.json()
        setSubmitError(err.error || 'Failed to submit')
      }
    } catch (err) {
      setSubmitError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  // Filter
  const filtered = skills.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
      case 'pending': return <Clock className="w-3.5 h-3.5 text-yellow-400" />
      case 'rejected': return <XCircle className="w-3.5 h-3.5 text-red-400" />
      default: return null
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="heading-md mb-2">Skills Marketplace</h1>
            <p className="body text-text-secondary">Pre-built skill templates for your AI agents</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowMySkills(!showMySkills); setShowSubmit(false) }}
              className={`btn-secondary text-sm ${showMySkills ? 'bg-accent-cyan/10 border-accent-cyan/20' : ''}`}>
              {showMySkills ? 'Browsing' : 'My Skills'}
            </button>
            <button
              onClick={() => { setShowSubmit(!showSubmit); setShowMySkills(false) }}
              className="btn-primary text-sm flex items-center gap-2">
              <Upload className="w-4 h-4" /> Submit Skill
            </button>
          </div>
        </div>

        {/* Submit Form */}
        {showSubmit && (
          <div className="glass-card p-6 rounded-2xl mb-8">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-accent-cyan" /> Submit a New Skill
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-text-muted block mb-1">Name</label>
                <input value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. swap_tokens"
                  className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Category</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40">
                  {CATEGORIES.filter(c => c !== 'all').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-text-muted block mb-1">Description</label>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                placeholder="What does this skill do?"
                rows={2}
                className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
            </div>
            <div className="mb-4">
              <label className="text-xs text-text-muted block mb-1">Input Schema (JSON)</label>
              <textarea value={formInputSchema} onChange={e => setFormInputSchema(e.target.value)}
                placeholder='{"type":"object","properties":{"tokenIn":{"type":"string"},"tokenOut":{"type":"string"},"amount":{"type":"string"}},"required":["tokenIn","tokenOut","amount"]}'
                rows={4}
                className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-sm font-mono focus:outline-none focus:border-accent-purple/40" />
            </div>
            {submitError && <p className="text-red-400 text-sm mb-3">{submitError}</p>}
            {submitSuccess && <p className="text-green-400 text-sm mb-3">{submitSuccess}</p>}
            <button onClick={handleSubmit} disabled={submitting}
              className="btn-primary text-sm">
              {submitting ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        )}

        {/* Filters */}
        {!showMySkills && (
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-accent-purple/40" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors ${category === c ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30' : 'bg-white/5 text-text-muted border border-white/5 hover:text-text-secondary'}`}>
                  {c === 'all' ? 'All' : c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* My Skills */}
        {showMySkills ? (
          <div>
            {loadingMySkills ? (
              <div className="text-center py-12 text-text-muted">Loading...</div>
            ) : mySkills.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-2xl">
                <Wrench className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary mb-2">No skills submitted yet</p>
                <button onClick={() => { setShowSubmit(true); setShowMySkills(false) }}
                  className="btn-primary text-sm">Submit Your First Skill</button>
              </div>
            ) : (
              <div className="space-y-3">
                {mySkills.map(s => (
                  <div key={s.id} className="glass-card p-4 rounded-xl flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm truncate">{s.name}</h4>
                        <span className="flex items-center gap-1 text-xs">
                          {statusIcon(s.status)} {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-1 line-clamp-2">{s.description}</p>
                      <p className="text-xs text-text-muted mt-1">{s.category} · {new Date(s.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Skill List */
          <div>
            {isLoading ? (
              <div className="text-center py-12 text-text-muted">Loading skills...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-2xl">
                <Wrench className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No skills found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(s => (
                  <div key={s.id} className="glass-card-hover p-5 rounded-xl cursor-pointer group">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-semibold text-sm">{s.name}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent-cyan/5 border border-accent-cyan/10 text-accent-cyan">{s.category}</span>
                    </div>
                    <p className="text-xs text-text-muted mb-3 line-clamp-2">{s.description}</p>
                    <div className="flex items-center gap-4 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-green-400/60" />
                        {s.usageCount} uses
                      </span>
                      <span className="truncate">{s.publisher?.slice(0, 6)}...{s.publisher?.slice(-4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
