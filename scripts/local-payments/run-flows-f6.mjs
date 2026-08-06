// run-flows-f6.mjs — P3 stablecoin rail (EIP-3009) end-to-end against the
// local Gateway (requires infra from run.sh + MockUSDC deployed):
//
//   F6  stablecoin — rails discovery advertises the stablecoin accept; the
//       payer signs an EIP-3009 transferWithAuthorization (6-decimal mUSDC),
//       anyone submits it, the gateway verifies the Transfer event and credits
//       the per-asset balance in atomic units.
//
// Deps: viem + @agentxv2/payments from the respective node_modules.
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'

const requireG = createRequire('/home/ubuntu/Agentx/gateway/package.json')
const { createWalletClient, http, defineChain, parseAbi } = requireG('viem')
const { privateKeyToAccount } = requireG('viem/accounts')
const requireP = createRequire('/home/ubuntu/Agentx/payments/package.json')
const { PaymentsClient, buildEIP3009Message, recoverEIP3009Signer } = requireP('@agentxv2/payments')

// ── Configuration ──────────────────────────────────────────────────────────
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3091').replace(/\/$/, '')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAY_TO = process.env.X402_PAY_TO || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const USDC = process.env.USDC_ASSET || '0x0000000000000000000000000000000000000000'
const USDC_DOMAIN_NAME = process.env.STABLECOIN_DOMAIN_NAME || 'Mock USD Coin'
const PRICE_ATOMIC = process.env.STABLECOIN_PRICE_WEI || '1000000' // 1 mUSDC, 6 decimals
const CHAIN_ID = 11155111

const account = privateKeyToAccount(PRIVATE_KEY)
const localChain = defineChain({
  id: CHAIN_ID,
  name: 'anvil-local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
})
const walletClient = createWalletClient({ account, chain: localChain, transport: http(ANVIL_RPC) })
const client = new PaymentsClient({ baseUrl: GATEWAY_URL })

const USDC_ABI = parseAbi([
  'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
  'function balanceOf(address) view returns (uint256)',
])

let failures = 0
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!cond) failures += 1
}

console.log(`Gateway:   ${GATEWAY_URL}`)
console.log(`USDC:      ${USDC} (6 decimals, 1 unit = 1e6 atomic)`)
console.log(`Payer:     ${account.address} (anvil #0)`)

// ── F6a: rails discovery advertises the stablecoin ─────────────────────────
console.log('\n=== F6a: /api/v1/payments/info advertises stablecoin ===')
const info = await client.info()
check('stablecoin rail enabled', info.rails?.stablecoin === true, `rails.stablecoin=${info.rails?.stablecoin}`)
check('advertised asset matches deployment', info.stablecoin?.asset?.toLowerCase() === USDC.toLowerCase(), `asset=${info.stablecoin?.asset}`)
check('advertised chain matches', info.stablecoin?.chain === 'sepolia', `chain=${info.stablecoin?.chain}`)

// x402 challenge must now include the stablecoin accept
const echo = `${GATEWAY_URL}/api/v1/x402/echo`
const challenge = await client.quote(echo)
const stblAccept = challenge?.challenge?.accepts?.find((a) => a.scheme === 'exact' && a.asset?.toLowerCase() === USDC.toLowerCase())
check('challenge offers stablecoin exact accept', Boolean(stblAccept), `accepts=${(challenge?.challenge?.accepts ?? []).map((a) => `${a.scheme}:${a.asset?.slice(0, 6)}`).join(',')}`)
check('stablecoin accept carries 6-decimal price', stblAccept && stblAccept.amount === PRICE_ATOMIC, `amount=${stblAccept?.amount}`)

// ── F6b: EIP-3009 transferWithAuthorization (facilitator submits) ──────────
console.log('\n=== F6b: EIP-3009 transferWithAuthorization → credited at 6 decimals ===')
const nonce = `0x${randomBytes(32).toString('hex')}`
const auth = {
  from: account.address,
  to: PAY_TO,
  value: BigInt(PRICE_ATOMIC),
  validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
  nonce,
}
const { domain, types, primaryType, message } = buildEIP3009Message(auth, CHAIN_ID, USDC, USDC_DOMAIN_NAME)
const rawSig = await walletClient.signTypedData({ domain, types, primaryType, message, account })
const r = `0x${rawSig.slice(2, 66)}`
const s = `0x${rawSig.slice(66, 130)}`
const v = Number.parseInt(rawSig.slice(130, 132), 16)

// Defense in depth: the module must recover the signer before submission
const recovered = await recoverEIP3009Signer(auth, CHAIN_ID, USDC, USDC_DOMAIN_NAME, { v, r, s })
check('module recovers the authorizer (== from)', recovered?.toLowerCase() === account.address.toLowerCase(), `signer=${recovered}`)

const txHash = await walletClient.writeContract({
  address: USDC,
  abi: USDC_ABI,
  functionName: 'transferWithAuthorization',
  args: [account.address, PAY_TO, BigInt(PRICE_ATOMIC), 0n, BigInt(Math.floor(Date.now() / 1000) + 3600), nonce, v, r, s],
  account,
  chain: undefined,
})
check('transferWithAuthorization submitted', Boolean(txHash), `tx=${txHash.slice(0, 12)}…`)

// The host ledger (x402_balances) accumulates across the whole harness (x402
// subscription + MPP deposit + stablecoin credits share one row), so assert
// incrementally: balance = before + exactly one price.
const before = await (await fetch(`${GATEWAY_URL}/api/v1/x402/balance?address=${account.address}`)).json()
const beforeWei = BigInt(before.balanceWei ?? '0')
const verified = await client.verify(txHash, 'sepolia')
check('verify credits exactly 1 mUSDC (6-decimal atomic)', verified.verified === true && verified.creditedWei === PRICE_ATOMIC,
  `creditedWei=${verified.creditedWei}`)
check('payer matches the authorizer', verified.payer?.toLowerCase() === account.address.toLowerCase(), `payer=${verified.payer}`)
check('per-asset balance reflects the credit', BigInt(verified.balanceWei) === beforeWei + BigInt(PRICE_ATOMIC),
  `balanceWei=${verified.balanceWei} (before ${beforeWei} + ${PRICE_ATOMIC})`)

// ── F6c: idempotency — replaying the same tx credits nothing ───────────────
console.log('\n=== F6c: idempotent replay ===')
const replay = await client.verify(txHash, 'sepolia')
check('same txHash re-verify keeps balance unchanged', replay.verified === true && BigInt(replay.balanceWei) === beforeWei + BigInt(PRICE_ATOMIC),
  `balanceWei=${replay.balanceWei}`)

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n==============================================')
console.log(failures === 0
  ? 'F6 ALL PASSED ✅  — 稳定币 EIP-3009 按 6 位精度入账'
  : `${failures} check(s) FAILED ❌`)
console.log('==============================================')
process.exit(failures === 0 ? 0 : 1)
