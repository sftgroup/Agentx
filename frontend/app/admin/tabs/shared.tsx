// Shared helpers for admin tabs (split from app/admin/page.tsx, R7)
'use client'

export const GATEWAY = process.env.NEXT_PUBLIC_AGENTX_GATEWAY_URL || 'http://localhost:3090'

export const fmtWei = (w?: string | number | null) =>
  w === null || w === undefined ? '—' : Number(w) / 1e18 > 0 && Number(w) / 1e18 < 0.0001
    ? (Number(w) / 1e18).toExponential(2)
    : (Number(w) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })

export const fmtCents = (c?: string | number | null) =>
  c === null || c === undefined ? '—' : '$' + (Number(c) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })

export const StatusDot = ({ ok }: { ok: boolean }) => <span className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
