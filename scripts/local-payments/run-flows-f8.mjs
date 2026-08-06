// run-flows-f8.mjs — P4 a2a-pay (paymentId two-phase) against the local
// Gateway (requires infra from run.sh):
//
//   F8  a2a — phase 1 creates a payment intent (paymentId + amount + payee);
//       the payer funds the platform wallet on-chain; phase 2 verifies the tx
//       and credits the balance. No HTTP 402 negotiation involved.
//
// Deps: viem + @agentxv2/payments from the respective node_modules.
import { createRequire } from 'node:module'

const requireG = createRequire('/home/ubuntu/Agentx/gateway/package.json')
const { createWalletClient, http, defineChain } = requireG('viem')
const { privateKeyToAccount } = requireG('viem/accounts')
const requireP = createRequire('/home/ubuntu/Agentx/payments/package.json')
const { A2AClient } = requireP('@agentxv2/payments')

// ── Configuration ──────────────────────────────────────────────────────────
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3091').replace(/\/$/, '')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAY_TO = process.env.X402_PAY_TO || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const CHAIN_ID = 11155111
const AMOUNT = 1000000000000000000n // 1 native

const account = privateKeyToAccount(PRIVATE_KEY)
const localChain = defineChain({
  id: CHAIN_ID,
  name: 'anvil-local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
})
const walletClient = createWalletClient({ account, chain: localChain, transport: http(ANVIL_RPC) })
const a2a = new A2AClient({ baseUrl: GATEWAY_URL })

let failures = 0
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!cond) failures += 1
}

console.log(`Gateway:   ${GATEWAY_URL}`)
console.log(`Payer:     ${account.address}  Payee: ${PAY_TO}`)

// ── F8a: phase 1 — create the payment intent ───────────────────────────────
console.log('\n=== F8a: POST /api/v1/payments/a2a (create intent) ===')
const created = await a2a.create({ payer: account.address, amountWei: AMOUNT.toString(), chain: 'sepolia' })
check('paymentId returned (a2a_ prefix)', Boolean(created.paymentId) && created.paymentId.startsWith('a2a_'), `paymentId=${created.paymentId}`)
check('amount echoes back', created.amountWei === AMOUNT.toString(), `amount=${created.amountWei}`)
check('payee defaults to the platform wallet', created.payee?.toLowerCase() === PAY_TO.toLowerCase(), `payee=${created.payee}`)

// ── F8b: fund the platform wallet ──────────────────────────────────────────
console.log('\n=== F8b: payer funds the platform wallet ===')
const txHash = await walletClient.sendTransaction({ to: PAY_TO, value: AMOUNT, account, chain: undefined })
check('payment tx sent', Boolean(txHash), `tx=${txHash.slice(0, 12)}…`)

// ── F8c: phase 2 — settle (verify + credit) ────────────────────────────────
console.log('\n=== F8c: POST /api/v1/payments/a2a/settle (verify + credit) ===')
// The payer's ledger balance accumulates across the whole harness (x402
// subscription + MPP deposit), so assert incrementally: +AMOUNT exactly.
const before = await (await fetch(`${GATEWAY_URL}/api/v1/x402/balance?address=${account.address}`)).json()
const beforeWei = BigInt(before.balanceWei ?? '0')
const settled = await a2a.settle({ paymentId: created.paymentId, txHash, chain: 'sepolia' })
check('settle verified the payment', settled.verified === true && settled.paymentId === created.paymentId, `paymentId=${settled.paymentId}`)
check('credited the full amount', settled.creditedWei === AMOUNT.toString(), `creditedWei=${settled.creditedWei}`)
check('payer matches', settled.payer?.toLowerCase() === account.address.toLowerCase(), `payer=${settled.payer}`)
check('balance reflects the credit', BigInt(settled.balanceWei) === beforeWei + AMOUNT, `balanceWei=${settled.balanceWei} (before ${beforeWei} + ${AMOUNT})`)

// ── F8d: settle is idempotent per tx ───────────────────────────────────────
console.log('\n=== F8d: idempotent re-settle ===')
const resettle = await a2a.settle({ paymentId: created.paymentId, txHash, chain: 'sepolia' })
check('re-settle keeps the balance flat', BigInt(resettle.balanceWei) === beforeWei + AMOUNT, `balanceWei=${resettle.balanceWei}`)

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n==============================================')
console.log(failures === 0
  ? 'F8 ALL PASSED ✅  — a2a-pay paymentId 两阶段（create → pay → settle）'
  : `${failures} check(s) FAILED ❌`)
console.log('==============================================')
process.exit(failures === 0 ? 0 : 1)
