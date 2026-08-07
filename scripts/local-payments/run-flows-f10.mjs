// run-flows-f10.mjs — P5 unified endpoint (/api/v1/payments) end-to-end
// against a running Gateway (scripts/local-payments/run.sh harness):
//
//   F10a  info        → rails discovery + x402 pricing/payTo/network
//   F10b  fiat        → unified create (auto-priced) + signed webhook → access
//   F10c  chain       → unified create → payment intent recorded
//   F10d  x402        → on-chain fund + unified create (txHash) → subscription
//   F10e  verify      → unified verify → credited + balance
//   F10f  access      → unified access check → active (fiat/x402 rails)
//   F10g  quote       → x402 v2 challenge (same-origin) + SSRF guard
//   F10h  errors      → bad method / bad signature / missing params → 4xx
//   F10i  client      → PaymentsClient (verify/access/info/quote) paths
//
// Deps: viem from the Gateway node_modules, @agentxv2/payments from the
// module's own node_modules (createRequire).
import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'

const requireG = createRequire('/home/ubuntu/Agentx/gateway/package.json')
const { createWalletClient, http, defineChain } = requireG('viem')
const { privateKeyToAccount } = requireG('viem/accounts')
const requireP = createRequire('/home/ubuntu/Agentx/payments/package.json')
const { PaymentsClient } = requireP('@agentxv2/payments')

// ── Configuration ──────────────────────────────────────────────────────────
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3091').replace(/\/$/, '')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAY_TO = process.env.X402_PAY_TO || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_localmocktest'
const CHAIN = 'sepolia'
const AGENT_ID = 1
const PLAN_ID = 1
const PLAN_PRICE_WEI = 1000000000000000000n // plan#1 price set by DeployLocal.s.sol
const X402_PRICE_WEI = process.env.X402_PRICE_WEI || '1000000000000000' // per-request unit price

const account = privateKeyToAccount(PRIVATE_KEY)
const localChain = defineChain({
  id: 11155111,
  name: 'anvil-local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
})
const walletClient = createWalletClient({ account, chain: localChain, transport: http(ANVIL_RPC) })
const subscriber = account.address

const client = new PaymentsClient({ baseUrl: GATEWAY_URL })

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
const signedWebhook = (event) => {
  const payload = JSON.stringify(event)
  const t = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')
  return { payload, signature: `t=${t},v1=${sig}` }
}

console.log(`Gateway:  ${GATEWAY_URL}`)
console.log(`Anvil:    ${ANVIL_RPC}`)
console.log(`Sub:      ${subscriber} (anvil #0)`)
console.log(`Pay-to:   ${PAY_TO} (anvil #1)`)
console.log(`Agent:    ${AGENT_ID}  Plan: ${PLAN_ID}  Price: ${PLAN_PRICE_WEI.toString()} wei`)

// ── F10a: rails discovery ──────────────────────────────────────────────────
console.log('\n=== F10a: GET /api/v1/payments/info (rails discovery) ===')
const info = await gw('/api/v1/payments/info')
check('status 200', info.status === 200, `status=${info.status}`)
check('all three rails enabled', info.body.rails?.fiat?.enabled === true && info.body.rails?.chain?.enabled === true && info.body.rails?.x402?.enabled === true,
  `fiat=${info.body.rails?.fiat?.enabled} chain=${info.body.rails?.chain?.enabled} x402=${info.body.rails?.x402?.enabled}`)
check('x402 price = per-request unit price', info.body.x402?.priceWei === X402_PRICE_WEI, `priceWei=${info.body.x402?.priceWei}`)
check('x402 payTo + network', info.body.x402?.payTo?.toLowerCase() === PAY_TO.toLowerCase() && info.body.x402?.network?.startsWith('eip155:'), `payTo=${info.body.x402?.payTo} network=${info.body.x402?.network}`)

// ── F10b: fiat through the unified endpoint ────────────────────────────────
console.log('\n=== F10b: POST /api/v1/payments (fiat, auto-priced) + webhook ===')
const fiat = await gw('/api/v1/payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'fiat', subscriber, agentId: AGENT_ID, planId: PLAN_ID, period: 'month', chain: CHAIN }),
})
check('fiat create → redirect session', fiat.status === 200 && fiat.body.redirect === true && fiat.body.paymentId,
  `paymentId=${fiat.body.paymentId} status=${fiat.status}`)
const parts = /\/checkout\/([^/]+)\/([^/]+)\/([^/]+)/.exec(String(fiat.body.url ?? ''))
const [sessionId, subId, amount] = parts ? parts.slice(1) : []
check('session parsed', Boolean(sessionId && subId), `session=${sessionId} sub=${subId} amount=${amount}`)

const future = Math.floor(Date.now() / 1000) + 30 * 86_400
const webhookEvents = [
  { type: 'checkout.session.completed', data: { object: { client_reference_id: `${subscriber}|${AGENT_ID}|${PLAN_ID}`, subscription: subId, amount_total: Number(amount), currency: 'usd' } } },
  { type: 'invoice.paid', data: { object: { id: 'in_f10_1', subscription: subId, amount_paid: Number(amount), currency: 'usd', lines: { data: [{ period: { end: future } }] } } } },
]
for (const event of webhookEvents) {
  const { payload, signature } = signedWebhook(event)
  const r = await gw('/api/v1/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body: payload,
  })
  check(`webhook ${event.type} → 200`, r.status === 200, `status=${r.status}`)
}

// ── F10c: chain intent through the unified endpoint ────────────────────────
console.log('\n=== F10c: POST /api/v1/payments (chain intent) ===')
const chainRes = await gw('/api/v1/payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'chain', subscriber, agentId: AGENT_ID, planId: PLAN_ID, chain: CHAIN }),
})
check('chain intent recorded', chainRes.status === 200 && chainRes.body.method === 'chain' && chainRes.body.paymentId?.startsWith('pi_'),
  `paymentId=${chainRes.body.paymentId}`)

// ── F10d: x402 through the unified endpoint (real on-chain fund) ───────────
console.log('\n=== F10d: POST /api/v1/payments (x402 subscription) ===')
const txHash = await walletClient.sendTransaction({ to: PAY_TO, value: PLAN_PRICE_WEI, chain: undefined })
check('on-chain fund tx sent', Boolean(txHash), `tx=${txHash.slice(0, 12)}…`)
const x402Res = await gw('/api/v1/payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'x402', subscriber, agentId: AGENT_ID, planId: PLAN_ID, txHash, chain: CHAIN }),
})
check('x402 subscription registered', x402Res.status === 200 && x402Res.body.subscriptionId > 0,
  `subscriptionId=${x402Res.body.subscriptionId} creditedWei=${x402Res.body.creditedWei} status=${x402Res.status}`)
check('credited exactly the plan price', x402Res.body.creditedWei === PLAN_PRICE_WEI.toString(), `creditedWei=${x402Res.body.creditedWei}`)

// ── F10e: unified verify ───────────────────────────────────────────────────
console.log('\n=== F10e: POST /api/v1/payments/verify ===')
const ver = await gw('/api/v1/payments/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ txHash, chain: CHAIN }),
})
check('verify → credited', ver.status === 200 && ver.body.verified === true && ver.body.payer?.toLowerCase() === subscriber.toLowerCase(),
  `payer=${ver.body.payer} creditedWei=${ver.body.creditedWei}`)
check('balance reflects credit', BigInt(ver.body.balanceWei ?? '0') >= PLAN_PRICE_WEI, `balanceWei=${ver.body.balanceWei}`)

// ── F10f: unified access ───────────────────────────────────────────────────
console.log('\n=== F10f: GET /api/v1/payments/access (unified) ===')
const acc = await gw(`/api/v1/payments/access?subscriber=${subscriber}&agentId=${AGENT_ID}&chain=${CHAIN}`)
check('access → active (fiat/x402 rails)', acc.status === 200 && acc.body.active === true, `active=${acc.body.active}`)

// ── F10g: quote (same-origin challenge + SSRF guard) ───────────────────────
console.log('\n=== F10g: GET /api/v1/payments/quote ===')
const echoUrl = `${GATEWAY_URL}/api/v1/x402/echo`
const q = await gw(`/api/v1/payments/quote?url=${encodeURIComponent(echoUrl)}`)
check('quote → v2 challenge', q.status === 200 && q.body.free === false && q.body.challenge?.x402Version === 2,
  `free=${q.body.free} v=${q.body.challenge?.x402Version}`)
check('challenge offers exact+upto', Array.isArray(q.body.challenge?.accepts) && q.body.challenge.accepts.some(a => a.scheme === 'exact') && q.body.challenge.accepts.some(a => a.scheme === 'upto'),
  `schemes=${q.body.challenge?.accepts?.map(a => a.scheme).join(',')}`)
const ssrf = await gw(`/api/v1/payments/quote?url=${encodeURIComponent('http://example.com')}`)
check('external url rejected (SSRF guard)', ssrf.status === 400, `status=${ssrf.status} error=${ssrf.body.error}`)

// ── F10h: error paths ──────────────────────────────────────────────────────
console.log('\n=== F10h: error paths (4xx) ===')
const badMethod = await gw('/api/v1/payments', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'crypto', subscriber }),
})
check('unknown method → 400', badMethod.status === 400, `status=${badMethod.status}`)
const badSig = await gw('/api/v1/payments/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
  body: '{"type":"checkout.session.completed","data":{"object":{}}}',
})
check('bad webhook signature → 400', badSig.status === 400, `status=${badSig.status}`)
const noTx = await gw('/api/v1/payments/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
})
check('verify without txHash → 400', noTx.status === 400, `status=${noTx.status}`)
const noAcc = await gw('/api/v1/payments/access')
check('access without params → 400', noAcc.status === 400, `status=${noAcc.status}`)

// ── F10i: PaymentsClient paths ─────────────────────────────────────────────
console.log('\n=== F10i: PaymentsClient (verify/access/info/quote) ===')
try {
  const info2 = await client.info()
  check('client.info rails', info2.rails?.fiat?.enabled === true && info2.x402?.enabled === true, `x402=${info2.x402?.enabled}`)
} catch (e) {
  check('client.info rails', false, (e?.message ?? String(e)))
}
try {
  const acc2 = await client.access(subscriber, AGENT_ID, CHAIN)
  check('client.access → active', acc2.active === true, `active=${acc2.active}`)
} catch (e) {
  check('client.access → active', false, (e?.message ?? String(e)))
}
try {
  const ver2 = await client.verify(txHash, CHAIN)
  check('client.verify → credited', ver2.verified === true, `creditedWei=${ver2.creditedWei}`)
} catch (e) {
  check('client.verify → credited', false, (e?.message ?? String(e)))
}
try {
  const q2 = await client.quote(echoUrl)
  check('client.quote → challenge', q2.free === false && q2.challenge?.x402Version === 2, `free=${q2.free}`)
} catch (e) {
  check('client.quote → challenge', false, (e?.message ?? String(e)))
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n==============================================')
console.log(failures === 0
  ? 'F10 ALL PASSED ✅  — 统一端点 /api/v1/payments 全链路通过'
  : `${failures} check(s) FAILED ❌`)
console.log('==============================================')
process.exit(failures === 0 ? 0 : 1)
