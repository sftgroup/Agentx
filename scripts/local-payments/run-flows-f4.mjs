// run-flows-f4.mjs — x402 v2 protocol end-to-end against the local Gateway
// (requires the infra from run.sh: anvil + gateway on 3091):
//
//   Flow 4  x402 v2 — PAYMENT-REQUIRED challenge → fund + EIP-712 sign →
//             replay with PAYMENT-SIGNATURE → 200 + PAYMENT-RESPONSE
//
// Also verifies scheme enforcement (exact amount mismatch → 402, upto within
// [price, cap] → 200) and that garbage proofs are rejected.
//
// Deps: viem is loaded from the Gateway's node_modules; the x402 protocol
// helpers are loaded from @agentxv2/payments (module dist).
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'

const requireG = createRequire('/home/ubuntu/Agentx/gateway/package.json')
const { createWalletClient, http, defineChain } = requireG('viem')
const { privateKeyToAccount } = requireG('viem/accounts')
const requireP = createRequire('/home/ubuntu/Agentx/payments/package.json')
const {
  X402Client,
  encodeHeader,
  decodeHeader,
  buildPaymentMessage,
  X402PaymentRequired,
  X402PaymentResponse,
} = requireP('@agentxv2/payments')

// ── Configuration ──────────────────────────────────────────────────────────
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3091').replace(/\/$/, '')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAY_TO = process.env.X402_PAY_TO || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const CHAIN_ID = 11155111
const PRICE_WEI = BigInt(process.env.X402_PRICE_WEI || '1000000000000000')
const ECHO = `${GATEWAY_URL}/api/v1/x402/echo`

const account = privateKeyToAccount(PRIVATE_KEY)
const localChain = defineChain({
  id: CHAIN_ID,
  name: 'anvil-local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
})
const walletClient = createWalletClient({ account, chain: localChain, transport: http(ANVIL_RPC) })
const client = new X402Client({ baseUrl: GATEWAY_URL })

let failures = 0
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!cond) failures += 1
}

const NATIVE = '0x0000000000000000000000000000000000000000'
// Build a signed PaymentPayload for the given challenge + scheme.
const buildSignedPayload = async (challenge, { scheme = 'exact', amount } = {}) => {
  // exact/upto target the native accept; stablecoin/period accepts also exist
  // when those rails are enabled (F4 only exercises native exact/upto).
  const accept = challenge.accepts.find((a) => a.scheme === scheme && a.asset.toLowerCase() === NATIVE)
  if (!accept) throw new Error(`scheme ${scheme} not offered`)
  const signed = { ...accept, amount: (amount ?? BigInt(accept.amount)).toString() }
  const payload = {
    x402Version: 2,
    accepted: signed,
    payload: {
      method: 'GET',
      url: ECHO,
      salt: `0x${randomBytes(32).toString('hex')}`,
      txHash: await walletClient.sendTransaction({ to: signed.payTo, value: BigInt(signed.amount), account, chain: undefined }),
    },
    signature: '',
  }
  const { domain, types, primaryType, message } = buildPaymentMessage(payload)
  payload.signature = await walletClient.signTypedData({ domain, types, primaryType, message, account })
  return payload
}

const rawGet = async (headers = {}) => {
  const resp = await fetch(ECHO, { headers })
  return {
    status: resp.status,
    body: await resp.json().catch(() => null),
    headers: Object.fromEntries(resp.headers.entries()),
  }
}

console.log(`Gateway:      ${GATEWAY_URL}`)
console.log(`Echo endpoint:${ECHO}`)
console.log(`Pay-to:       ${PAY_TO} (anvil #1)`)
console.log(`Price:        ${PRICE_WEI} wei`)

// ── F4a: unauthenticated → 402 + PAYMENT-REQUIRED challenge ───────────────
console.log('\n=== F4a: bare request → 402 PAYMENT-REQUIRED (v2) ===')
const bare = await rawGet()
check('status is 402', bare.status === 402, `status=${bare.status}`)
check('has payment-required header', Boolean(bare.headers['payment-required']), 'header present')
let challenge
try {
  challenge = decodeHeader(bare.headers['payment-required'])
} catch (err) {
  check('challenge decodes', false, String(err))
  challenge = null
}
if (challenge) {
  check('challenge is v2', challenge.x402Version === 2, `x402Version=${challenge.x402Version}`)
  check('challenge has resource', challenge.resource === '/api/v1/x402/echo', `resource=${challenge.resource}`)
  const schemes = challenge.accepts.map((a) => a.scheme).join(',')
  const hasNativeExact = challenge.accepts.some((a) => a.scheme === 'exact' && a.asset.toLowerCase() === NATIVE)
  const hasUpto = challenge.accepts.some((a) => a.scheme === 'upto')
  check('offers native exact + upto', hasNativeExact && hasUpto, `accepts=[${schemes}]`)
  check('accepts carry CAIP-2 network + payTo', challenge.accepts.every((a) => a.network === `eip155:${CHAIN_ID}` && a.payTo.toLowerCase() === PAY_TO.toLowerCase()), 'network/payTo ok')
}

// ── F4b: exact payment → fund + sign + replay → 200 + PAYMENT-RESPONSE ─────
console.log('\n=== F4b: exact payment (fund → EIP-712 → replay) ===')
const exactPayload = await buildSignedPayload(challenge, { scheme: 'exact' })
const exactHeader = encodeHeader(exactPayload)
const exact = await rawGet({ 'payment-signature': exactHeader })
check('replay status is 200', exact.status === 200, `status=${exact.status}`)
check('has payment-response receipt', Boolean(exact.headers['payment-response']), 'header present')
const receipt = exact.headers['payment-response'] ? decodeHeader(exact.headers['payment-response']) : null
check('receipt says success', receipt?.status === 'success', `status=${receipt?.status}`)
check('receipt settles the exact amount', receipt && BigInt(receipt.settledAmount) === PRICE_WEI, `settledAmount=${receipt?.settledAmount}`)
check('receipt echoes payer', receipt?.payer.toLowerCase() === account.address.toLowerCase(), `payer=${receipt?.payer}`)

// ── F4c: upto payment (2×price, within cap) → 200 ──────────────────────────
console.log('\n=== F4c: upto payment (2× price, within [price, cap]) ===')
const uptoPayload = await buildSignedPayload(challenge, { scheme: 'upto', amount: PRICE_WEI * 2n })
const upto = await rawGet({ 'payment-signature': encodeHeader(uptoPayload) })
check('upto replay status is 200', upto.status === 200, `status=${upto.status}`)
const uptoReceipt = upto.headers['payment-response'] ? decodeHeader(upto.headers['payment-response']) : null
check('upto settles the chosen amount', uptoReceipt && BigInt(uptoReceipt.settledAmount) === PRICE_WEI * 2n, `settledAmount=${uptoReceipt?.settledAmount}`)

// ── F4d: scheme enforcement — exact amount ≠ price → rejected ──────────────
console.log('\n=== F4d: tampered scheme/amount rejected ===')
const badExactPayload = await buildSignedPayload(challenge, { scheme: 'exact', amount: PRICE_WEI * 2n })
const badExact = await rawGet({ 'payment-signature': encodeHeader(badExactPayload) })
check('wrong exact amount → 402', badExact.status === 402, `status=${badExact.status}`)

// ── F4e: garbage proof → rejected ───────────────────────────────────────────
console.log('\n=== F4e: garbage / malformed proof rejected ===')
const garbage = await rawGet({ 'payment-signature': 'not-base64!!!' })
check('garbage → 402', garbage.status === 402, `status=${garbage.status}`)
const empty = await rawGet({ 'payment-signature': '' })
check('empty signature header → 402', empty.status === 402, `status=${empty.status}`)

// ── F4f: X402Client.pay() full-client path ─────────────────────────────────
console.log('\n=== F4f: X402Client.pay() full-client path ===')
const payOut = await client.pay({ url: ECHO, walletClient, account, scheme: 'exact' })
check('client pay status is 200', payOut.status === 200, `status=${payOut.status}`)
check('client received payment-response', payOut.paymentResponse?.status === 'success', `status=${payOut.paymentResponse?.status}`)

// ── F4g: quote endpoint (server-side challenge fetch) ──────────────────────
console.log('\n=== F4g: GET /api/v1/x402/quote ===')
const q = await fetch(`${GATEWAY_URL}/api/v1/x402/quote?url=${encodeURIComponent(ECHO)}`)
const qBody = await q.json()
check('quote returns challenge', q.status === 200 && qBody.free === false && qBody.challenge?.x402Version === 2, `free=${qBody.free} v=${qBody.challenge?.x402Version}`)

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n==============================================')
console.log(failures === 0
  ? 'F4 ALL PASSED ✅  — x402 v2 exact/upto 全流程通过'
  : `${failures} check(s) FAILED ❌`)
console.log('==============================================')
process.exit(failures === 0 ? 0 : 1)
