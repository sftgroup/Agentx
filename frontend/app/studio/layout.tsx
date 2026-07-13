// app/studio/layout.tsx — Studio shell with Provider + step indicator
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { StudioProvider } from '@/components/studio/StudioContext'
import { StepIndicator } from '@/components/studio/StepIndicator'
import { StudioHeader } from '@/components/studio/StudioHeader'
import { useCurrentStep } from '@/components/studio/stepFromPath'

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const step = useCurrentStep()

  return (
    <StudioProvider>
      <AppLayout>
        <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">
          <StudioHeader />
          <StepIndicator current={step} />
          {children}
        </div>
      </AppLayout>
    </StudioProvider>
  )
}
