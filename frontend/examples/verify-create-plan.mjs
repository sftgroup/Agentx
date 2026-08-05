// examples/verify-create-plan.mjs
// On-chain verification: create a small test subscription plan on OxaChain L1
// with the local test wallet, then read it back. Run from the frontend/ dir
// (resolves @agentxv2/sdk + viem from its node_modules):
//   node examples/verify-create-plan.mjs
import { createPublicClient, createWalletClient, http, defineChain, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SubscriptionManager } from '@agentxv2/sdk'
import fs from 'fs'

const oxa = defineChain({
  id: 19505,
  name: 'OxaChain L1',
  nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-oxa.0xainet.top'] } },
})
const SUBSCRIPTION_MANAGER = '0x019AC9d945467478Dd371CDbD70cb2f325800E6B'
const ZERO = '0x0000000000000000000000000000000000000000'

const pk = fs.readFileSync('/home/ubuntu/Agentx/.env.local', 'utf8')
  .match(/TEST_WALLET_PRIVATE_KEY=(.+)/)[1].trim()
const account = privateKeyToAccount(pk)

const publicClient = createPublicClient({ chain: oxa, transport: http() })
const walletClient = createWalletClient({ account, chain: oxa, transport: http() })
const manager = new SubscriptionManager({
  contractAddress: SUBSCRIPTION_MANAGER,
  publicClient,
  walletClient,
})

// 1. Balance check
const balance = await publicClient.getBalance({ address: account.address })
console.log(`[verify] wallet ${account.address} balance = ${Number(balance) / 1e18} OXA`)
if (balance === 0n) {
  console.log('[verify] FAIL: wallet has no OXA — fund it first to pay gas')
  process.exit(1)
}

// 2. Create a small test plan (0.001 OXA / month, no trial)
const res = await manager.createPlan({
  agentId: 1,
  price: parseEther('0.001'),
  period: 'month',
  payToken: ZERO,
  trialDays: 0,
})
console.log(`[verify] createPlan → planId=${res.planId} tx=${res.txHash}`)

// 3. Read back from chain and confirm period mapping + fields
const plan = await manager.getPlan(res.planId)
const show = (p) => JSON.stringify(p, (k, v) => typeof v === 'bigint' ? v.toString() : v)
console.log('[verify] on-chain plan:', show(plan))
if (plan.period !== 'month' || !plan.active || plan.agentId !== 1) {
  console.log('[verify] FAIL: plan fields unexpected')
  process.exit(1)
}
console.log('[verify] PASS: plan created on-chain with period="month"')
