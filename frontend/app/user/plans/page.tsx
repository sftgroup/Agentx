// app/user/plans/page.tsx — Subscription plan management for agent creators
// Entry point for the (previously unmounted) SubscriptionManager, so users can
// create new on-chain subscription plans from the web UI.
'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { SubscriptionManager } from '@/components/agent/dashboard/SubscriptionManager'
import { CreditCard } from 'lucide-react'

export default function PlansPage() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">
        <div>
          <h1 className="heading-md flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-purple/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-accent-purple" /></div>
            Subscription Plans
          </h1>
          <p className="body text-text-secondary mt-1">Create and manage pricing plans for your agents.</p>
        </div>
        <SubscriptionManager />
      </div>
    </AppLayout>
  )
}
