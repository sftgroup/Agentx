// ---------------------------------------------------------------------------
// AgentX — X402WalletCard (R19.2)
// ---------------------------------------------------------------------------
// Pay-per-request balance panel for the B-end console. Shows the on-ledger
// x402 balance (x402_balances), the pay-to wallet and per-request price, and
// lets the tenant top up by sending native token to the platform wallet and
// verifying the tx (POST /x402/verify credits the balance).
// ---------------------------------------------------------------------------
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Address, WalletClient } from 'viem'
import { AlertTriangle, ArrowDownToLine, Check, Loader2, Wallet, Zap } from 'lucide-react'
import { GATEWAY_URL } from '@/lib/gateway'

interface X402Info {
  enabled: boolean
  priceWei: string
  payTo: string
  network: string
  chain: string
}

function weiToToken(wei: string): string {
  const n = Number(wei || 0) / 1e18
  return n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(3) : n.toFixed(6)
}

export function X402WalletCard({ address, walletClient }: {
  address: string
  walletClient?: WalletClient
}) {
  const [info, setInfo] = useState<X402Info | null>(null)
  const [balance, setBalance] = useState('0')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const infoRes = await fetch(`${GATEWAY_URL}/api/v1/x402/info`)
      const infoData = await infoRes.json() as X402Info
      setInfo(infoData)
      if (address) {
        const bRes = await fetch(`${GATEWAY_URL}/api/v1/x402/balance?address=${address}`)
        const bData = await bRes.json() as { balanceWei?: string }
        setBalance(bData.balanceWei ?? '0')
      }
    } catch {
      setInfo(null)
    }
  }, [address])

  useEffect(() => { load() }, [load])

  const topUp = async () => {
    if (!walletClient || !info?.payTo) return
    const token = Number(amount || 0)
    if (!Number.isFinite(token) || token <= 0) {
      setError('Enter a positive amount')
      return
    }
    setBusy(true)
    setError(null)
    setTxHash(null)
    try {
      const value = BigInt(Math.round(token * 1e18))
      const hash = await walletClient.sendTransaction({
        to: info.payTo as Address,
        value,
        chain: undefined,
        account: walletClient.account!,
      })
      const vRes = await fetch(`${GATEWAY_URL}/api/v1/x402/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: hash, chain: info.chain }),
      })
      const vData = await vRes.json() as { balanceWei?: string; error?: string }
      if (!vRes.ok) throw new Error(vData.error || 'Verification failed')
      setBalance(vData.balanceWei ?? balance)
      setAmount('')
      setTxHash(hash)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up failed')
    } finally {
      setBusy(false)
    }
  }

  const priceToken = info ? weiToToken(info.priceWei) : '0'
  const priceCents = info && Number(info.priceWei) > 0 ? (Number(info.priceWei) / 1e18) * 100 : null

  return (
    <div className="glass-card p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Wallet className="w-4 h-4 text-accent-cyan" /> x402 wallet
        </h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${info?.enabled ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
          {info?.enabled ? 'enabled' : 'disabled'}
        </span>
      </div>

      {!info?.enabled ? (
        <p className="text-sm text-text-muted">
          The x402 pay-per-request rail is not enabled on this Gateway yet (X402_ENABLED / X402_PAY_TO).
        </p>
      ) : (
        <div className="space-y-4">
          {/* Balance + price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 p-4">
              <div className="text-[11px] text-text-muted uppercase tracking-wider">Balance</div>
              <div className="font-mono text-lg text-accent-cyan mt-1">{weiToToken(balance)}</div>
              <div className="text-[11px] text-text-muted mt-0.5">native token</div>
            </div>
            <div className="rounded-xl bg-white/5 p-4">
              <div className="text-[11px] text-text-muted uppercase tracking-wider">Per request</div>
              <div className="font-mono text-lg text-text-primary mt-1">{priceToken}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{priceCents ? `≈ $${(priceCents / 100).toFixed(4)}` : 'native token'}</div>
            </div>
          </div>

          {/* Pay-to wallet */}
          <div className="text-xs text-text-muted">
            <div className="mb-1">Pay-to wallet <span className="font-mono text-accent-cyan break-all">{info.payTo}</span></div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-accent-cyan" />
              Top-ups also cover A2A pay-per-call access (balance-mode x402).
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* Top-up */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              min={0}
              step="any"
              placeholder="Amount (native token)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className="flex-1 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:border-accent-cyan/40 disabled:opacity-50"
            />
            <button
              onClick={topUp}
              disabled={busy || !walletClient}
              className="btn-primary text-sm py-2.5 px-4 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
              {busy ? 'Sending…' : 'Top up'}
            </button>
          </div>

          {txHash && (
            <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-xs text-green-400 flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Balance credited. Tx <span className="font-mono break-all">{txHash}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
