// components/studio/EncryptProgress.tsx — Publish progress indicator
'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Loader2, Lock, Upload, FileCheck, FileSignature } from 'lucide-react'

export type EncryptStep = 'encrypt' | 'ipfs' | 'sign' | 'confirm'

interface Props {
  activeStep?: EncryptStep
  className?: string
}

const STEPS: { id: EncryptStep; label: string; icon: typeof CheckCircle }[] = [
  { id: 'encrypt', label: 'Encrypt Payload', icon: Lock },
  { id: 'ipfs', label: 'Upload to IPFS', icon: Upload },
  { id: 'sign', label: 'Sign Transaction', icon: FileSignature },
  { id: 'confirm', label: 'On-Chain Confirmation', icon: FileCheck },
]

const stepIndex: Record<EncryptStep, number> = { encrypt: 0, ipfs: 1, sign: 2, confirm: 3 }

export function EncryptProgress({ activeStep = 'encrypt', className = '' }: Props) {
  const currentIdx = stepIndex[activeStep]

  return (
    <div className={`${className}`}>
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx
          const isActive = i === currentIdx
          const isPending = i > currentIdx

          return (
            <div key={step.id} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                isDone ? 'bg-green-400/15 text-green-400' :
                isActive ? 'bg-accent-purple/15 text-accent-purple animate-pulse' :
                'bg-white/5 text-text-muted'
              }`}>
                {isDone ? <CheckCircle className="w-4 h-4" /> :
                 isActive ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 <step.icon className="w-4 h-4 opacity-40" />}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${isDone ? 'text-green-400' : isActive ? 'text-text-primary' : 'text-text-muted'}`}>
                  {step.label}
                </div>
                {isActive && (
                  <div className="h-1 mt-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-accent-purple rounded-full animate-progress-bar" style={{ width: '60%' }} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
