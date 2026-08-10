// run-flows-f7.mjs — P4 period rail (authorization-based subscription) against
// the local Gateway (requires infra from run.sh + MockUSDC deployed).
//
//   F7  period — the payer signs an EIP-3009 transferWithAuthorization funding
//       `periodPrice × periods` USDC to the platform wallet, then creates the
//       authorization via POST /api/v1/payments/period/authorize (self-hosted
//       rail, R17.5 — @0xinfrax/payments@0.1.2 removed the x402 `period` accept
//       that used to create authorizations). Each period boundary then charges
//       one period WITHOUT any re-signing until the authorization drains.
//
// Deps: viem + @agentxv2/payments from the respective node_modules.
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'

const requireG = createRequire('/home/ubuntu/Agentx/gateway/package.json')
const { createWalletClient, http, defineChain, parseAbi } = requireG('viem')
const { privateKeyToAccount } = requireG('viem/accounts')
const requireP = createRequire('/home/ubuntu/Agentx/payments/package.json')
const { buildEIP3009Message } = requireP('@agentxv2/payments')

// ── Configuration ──────────────────────────────────────────────────────────
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3091').replace(/\/$/, '')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAY_TO = process.env.X402_PAY_TO || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const USDC = process.env.USDC_ASSET || '0x0000000000000000000000000000000000000000'
const USDC_DOMAIN_NAME = process.env.STABLECOIN_DOMAIN_NAME || 'Mock USD Coin'
const CHAIN_ID = 11155111
const PERIOD_PRICE = BigInt(process.env.PERIOD_PRICE_WEI || '1000000') // 1 mUSDC per period (6 decimals)
const MAX_PERIODS = Number(process.env.PERIOD_MAX_PERIODS || '12')
const PERIODS = 3 // periods funded by this test (≤ maxPeriods)

const account = privateKeyToAccount(PRIVATE_KEY)
const localChain = defineChain({
  id: CHAIN_ID,
  name: 'anvil-local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
})
const walletClient = createWalletClient({ account, chain: localChain, transport: http(ANVIL_RPC) })

const USDC_ABI = parseAbi([
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
])

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

console.log(`Gateway:      ${GATEWAY_URL}`)
console.log(`USDC:         ${USDC}  payee=${PAY_TO}  period price=${PERIOD_PRICE} (6 decimals)  max=${MAX_PERIODS}  funding ${PERIODS} periods`)

// ── F7a: fund n periods (EIP-3009 USDC) ────────────────────────────────────
console.log('\n=== F7a: EIP-3009 USDC funding tx ===')
const amount = PERIOD_PRICE * BigInt(PERIODS)

const nonce = `0x${randomBytes(32).toString('hex')}`
const auth = {
  from: account.address,
  to: PAY_TO,
  value: amount,
  validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
  nonce,
}
const { domain: adomain, types: atypes, primaryType: aprim, message: amessage } = buildEIP3009Message(auth, CHAIN_ID, USDC, USDC_DOMAIN_NAME)
const aSig = await walletClient.signTypedData({ domain: adomain, types: atypes, primaryType: aprim, message: amessage, account })
const ar = `0x${aSig.slice(2, 66)}`
const as = `0x${aSig.slice(66, 130)}`
const av = Number.parseInt(aSig.slice(130, 132), 16)
const txHash = await walletClient.writeContract({
  address: USDC,
  abi: USDC_ABI,
  functionName: 'transferWithAuthorization',
  args: [account.address, PAY_TO, amount, 0n, BigInt(Math.floor(Date.now() / 1000) + 3600), nonce, av, ar, as],
  account,
  chain: undefined,
})
check('EIP-3009 funding tx sent', Boolean(txHash), `tx=${txHash.slice(0, 12)}… value=${amount}`)

// ── F7b: create the authorization (self-hosted authorize endpoint) ─────────
console.log('\n=== F7b: POST /api/v1/payments/period/authorize ===')
const created = await gw('/api/v1/payments/period/authorize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    payer: account.address,
    txHash,
    amountWei: amount.toString(),
    periodPriceWei: PERIOD_PRICE.toString(),
    periods: PERIODS,
    asset: USDC,
    chain: 'sepolia',
  }),
})
const AUTH_ID = `auth:${txHash.toLowerCase()}`
check('authorization committed', created.status === 200 && created.body.authorizationId === AUTH_ID && created.body.status === 'active',
  `status=${created.status} id=${created.body.authorizationId}`)
check('remaining = funded amount', created.body.remainingWei === amount.toString(), `remaining=${created.body.remainingWei}`)
check('periods echoed', created.body.periods === PERIODS, `periods=${created.body.periods}`)

// ── F7c: authorization committed + period charges drain without re-signing ──
console.log('\n=== F7c: authorization lifecycle (charge without re-signing) ===')
const authRes = await gw(`/api/v1/payments/period/authorization?authorizationId=${encodeURIComponent(AUTH_ID)}`)
check('authorization readable', authRes.status === 200 && authRes.body.status === 'active', `status=${authRes.status}`)

// Charge 3 periods — all without any new signature
for (let i = 1; i <= PERIODS; i += 1) {
  const charged = await gw('/api/v1/payments/period/charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorizationId: AUTH_ID }),
  })
  const expectedRemaining = (amount - PERIOD_PRICE * BigInt(i)).toString()
  const renewed = i < PERIODS
  check(`period #${i} charged without signing`, charged.status === 200 && charged.body.renewed === renewed && charged.body.remainingWei === expectedRemaining,
    `renewed=${charged.body.renewed} remaining=${charged.body.remainingWei}`)
}

// ── F7d: exhaustion — no more funds → charge rejected ──────────────────────
console.log('\n=== F7d: exhaustion ===')
const exhausted = await gw('/api/v1/payments/period/charge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ authorizationId: AUTH_ID }),
})
check('extra charge → error', exhausted.status >= 400, `status=${exhausted.status} error=${exhausted.body.error}`)
const finalAuth = await gw(`/api/v1/payments/period/authorization?authorizationId=${encodeURIComponent(AUTH_ID)}`)
check('authorization marked exhausted', finalAuth.body.status === 'exhausted', `status=${finalAuth.body.status}`)

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n==============================================')
console.log(failures === 0
  ? 'F7 ALL PASSED ✅  — period 授权制：一次 EIP-3009 预授权 → authorize 建授权，n 期无重签自动扣费'
  : `${failures} check(s) FAILED ❌`)
console.log('==============================================')
process.exit(failures === 0 ? 0 : 1)
