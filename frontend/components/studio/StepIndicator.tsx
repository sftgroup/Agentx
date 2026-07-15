// components/studio/StepIndicator.tsx — Shared step nav bar
'use client'

import { Sparkles, Hexagon, Zap, Shield, Check } from 'lucide-react'

const STEPS = [
  { id: 1, label: 'Basics', icon: Hexagon },
  { id: 2, label: 'Skills', icon: Zap },
  { id: 3, label: 'Encrypt', icon: Shield },
  { id: 4, label: 'Publish', icon: Check },
]

interface Props { current: number }

export function StepIndicator({ current }: Props) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              current === s.id ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/20' :
              current > s.id ? 'text-text-muted' : 'text-text-muted opacity-60'
            }`}>
              <s.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-8 h-px ${current > s.id ? 'bg-accent-purple/30' : 'bg-white/5'}`} />}
          </div>
        ))}
      </div>
    </div>
  )
}
