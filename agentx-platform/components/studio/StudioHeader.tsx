// components/studio/StudioHeader.tsx
'use client'

import { Sparkles } from 'lucide-react'

export function StudioHeader() {
  return (
    <div>
      <h1 className="heading-md flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-accent-purple" />
        </div>
        Agent Studio
      </h1>
      <p className="body text-text-secondary mt-1">Create, encrypt, and publish your AI Agent on-chain</p>
    </div>
  )
}
