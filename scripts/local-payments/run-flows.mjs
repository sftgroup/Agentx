// run-flows.mjs — exercise all three subscription payment rails end-to-end
// against a locally running Gateway (scripts/local-payments/run.sh):
//
//   Flow 1  chain  — on-chain escrow payment via the SDK SubscriptionManager
//   Flow 2  fiat   — Stripe checkout via a local mock Stripe + signed webhooks
//   Flow 3  x402   — native-token period payment, auto-funded + verified by the Gateway
//
// Each flow finishes by asking the Gateway's unified access-control endpoint
// (/api/v1/chain/check-subscription) whether the subscriber has access.
//
// Deps: viem + @agentxv2/sdk are loaded from the Gateway's node_modules
// (createRequire), so run this from anywhere after the Gateway deps are installed.
import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'

const requireG = createRequire('/home/ubuntu/Agentx/gateway/package.json')
const { createPublicClient, createWalletClient, http, defineChain } = requireG('viem')
// viem 2.55+ keeps account helpers under the `viem/accounts` subpath
const { privateKeyToAccount } = requireG('viem/accounts')
const { SubscriptionManager, SubscriptionPayments } = requireG('@agentxv2/sdk')

// ── Configuration ──────────────────────────────────────────────────────────
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3091').replace(/\/$/, '')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545'
// anvil account #0 (deterministic dev account, funded with 10_000 ETH)
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
// anvil account #1 — the platform wallet that x402 payments go to
const PAY_TO = process.env.X402_PAY_TO || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const SUBSCRIPTION_MANAGER = process.env.SUBSCRIPTION_MANAGER
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_localmocktest'
const AGENT_ID = 1
const PLAN_ID = 1
const CHAIN = 'sepolia' // local anvil is wired to the Gateway's "sepolia" chain slot

if (!SUBSCRIPTION_MANAGER) {
  console.error('SUBSCRIPTION_MANAGER env var is required (address deployed by DeployLocal.s.sol)')
  process.exit(2)
}

// ── Clients ────────────────────────────────────────────────────────────────
const account = privateKeyToAccount(PRIVATE_KEY)
// Local anvil mapped onto the Gateway's "sepolia" chain slot (id 11155111).
// The chain must be attached to the WalletClient so SDK x402 auto-funding
// (which calls sendTransaction without a chain argument) can estimate gas.
const localChain = defineChain({
  id: 11155111,
  name: 'anvil-local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
})
const walletClient = createWalletClient({ account, chain: localChain, transport: http(ANVIL_RPC) })
const publicClient = createPublicClient({ transport: http(ANVIL_RPC) })
const subscriber = account.address

const subscriptionManager = new SubscriptionManager({
  contractAddress: SUBSCRIPTION_MANAGER,
  publicClient,
  walletClient,
})
const payments = new SubscriptionPayments({
  gatewayUrl: GATEWAY_URL,
  subscriptionManager,
  walletClient,
  chain: CHAIN,
})

let failures = 0
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!cond) failures += 1
}
const gw = async (path, init) => {
  const r = await fetch(`${GATEWAY_URL}${path}`, init)
  const body = await r.json().catch(() => ({}))
  return { status: r.status, body }
}
const hasAccess = () =>
  gw(`/api/v1/chain/check-subscription?chain=${CHAIN}&subscriber=${subscriber}&agentId=${AGENT_ID}`)

console.log(`Gateway:      ${GATEWAY_URL}`)
console.log(`Anvil RPC:    ${ANVIL_RPC}`)
console.log(`Subscriber:   ${subscriber} (anvil #0)`)
console.log(`Pay-to:       ${PAY_TO} (anvil #1, x402 rail)`)
console.log(`SM contract:  ${SUBSCRIPTION_MANAGER}`)

// ── Flow 1: chain ──────────────────────────────────────────────────────────
console.log('\n=== Flow 1: chain (on-chain wallet payment via escrow) ===')
const chainRes = await payments.pay({ method: 'chain', planId: PLAN_ID, agentId: AGENT_ID })
check('on-chain subscription created', chainRes.method === 'chain' && chainRes.subscriptionId > 0,
  `subscriptionId=${chainRes.subscriptionId} tx=${chainRes.txHash.slice(0, 12)}…`)
const c1 = await hasAccess()
check('gateway unified access = true', c1.body.active === true, `active=${c1.body.active} (chain=${c1.body.chain})`)

// ── Flow 2: fiat (Stripe card via mock Stripe) ─────────────────────────────
console.log('\n=== Flow 2: fiat (Stripe card, auto-priced from plan, no wallet needed) ===')
const fiatRes = await payments.pay({
  method: 'fiat',
  planId: PLAN_ID,
  agentId: AGENT_ID,
  subscriber,
  period: 'month',
})
check('checkout session returned by gateway+mock stripe', fiatRes.method === 'fiat' && fiatRes.redirect, fiatRes.sessionUrl)

// Mock Stripe encodes session/subscription/amount in the checkout URL so the
// simulated webhook events are fully deterministic.
const parts = /\/checkout\/([^/]+)\/([^/]+)\/([^/]+)/.exec(fiatRes.sessionUrl)
const [sessionId, subId, amount] = parts ? parts.slice(1) : []
check('parsed simulated session', Boolean(sessionId && subId), `session=${sessionId} subscription=${subId} amount=${amount}`)

// Simulate the Stripe events the Gateway webhook consumes (signed with the
// configured webhook secret, exactly as Stripe would).
const future = Math.floor(Date.now() / 1000) + 30 * 86_400 // +30 days
const events = [
  { type: 'checkout.session.completed', data: { object: { client_reference_id: `${subscriber}|${AGENT_ID}|${PLAN_ID}`, subscription: subId, amount_total: Number(amount), currency: 'usd' } } },
  { type: 'invoice.paid', data: { object: { id: 'in_local_1', subscription: subId, amount_paid: Number(amount), currency: 'usd', lines: { data: [{ period: { end: future } }] } } } },
]
for (const event of events) {
  const payload = JSON.stringify(event)
  const t = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')
  const r = await gw('/api/v1/fiat/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
    body: payload,
  })
  check(`webhook ${event.type} accepted (sig verified)`, r.status === 200, `status=${r.status}`)
}

const fs = await gw(`/api/v1/fiat/status?subscriber=${subscriber}&agentId=${AGENT_ID}`)
check('gateway fiat/status = active', fs.body.active === true, `active=${fs.body.active} provider=${fs.body.subscription?.provider}`)
const c2 = await hasAccess()
check('gateway unified access = true', c2.body.active === true, `active=${c2.body.active}`)

// ── Flow 3: x402 (native-token period payment) ─────────────────────────────
console.log('\n=== Flow 3: x402 (native-token period payment, auto-funded + verified) ===')
const x402Res = await payments.pay({ method: 'x402', planId: PLAN_ID, agentId: AGENT_ID, subscriber, period: 'month' })
check('x402 subscription registered by gateway', x402Res.method === 'x402' && x402Res.subscriptionId > 0,
  `subscriptionId=${x402Res.subscriptionId} tx=${x402Res.txHash.slice(0, 12)}… creditedWei=${x402Res.creditedWei}`)
const c3 = await hasAccess()
check('gateway unified access = true', c3.body.active === true, `active=${c3.body.active}`)

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n==============================================')
console.log(failures === 0
  ? 'ALL FLOWS PASSED ✅  — 三种支付方式（chain / fiat / x402）本地完整链路均通过'
  : `${failures} check(s) FAILED ❌`)
console.log('==============================================')
process.exit(failures === 0 ? 0 : 1)
