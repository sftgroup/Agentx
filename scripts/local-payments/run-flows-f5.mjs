// run-flows-f5.mjs — P2 MPP payment channels end-to-end against the local
// Gateway (requires infra from run.sh: anvil + gateway on 3091):
//
//   F5  MPP session — open (deposit tx) → voucher (cumulative, signature
//       reuse) → auto-settle on threshold → manual settle → close (refund)
//
// Deps: viem + @agentxv2/payments from the respective node_modules.
import { createRequire } from 'node:module'

const requireG = createRequire('/home/ubuntu/Agentx/gateway/package.json')
const { createWalletClient, http, defineChain, keccak256, encodePacked } = requireG('viem')
const { privateKeyToAccount } = requireG('viem/accounts')
const requireP = createRequire('/home/ubuntu/Agentx/payments/package.json')
const { MPPClient, buildVoucherMessage, MPP_DOMAIN_NAME, MPP_DOMAIN_VERSION } = requireP('@agentxv2/payments')

// ── Configuration ──────────────────────────────────────────────────────────
const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://127.0.0.1:3091').replace(/\/$/, '')
const ANVIL_RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545'
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAY_TO = process.env.X402_PAY_TO || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const MPP_DOMAIN = process.env.MPP_DOMAIN || PAY_TO // EIP-712 verifyingContract
const CHAIN_ID = 11155111

const DEPOSIT = 10000000000000000000n // 10 native
const V1 = 1000000000000000000n // 1 native
const V2 = 2000000000000000000n // 2 native
const SALT = `0x${'01'.repeat(32)}` // bytes32

const account = privateKeyToAccount(PRIVATE_KEY)
const localChain = defineChain({
  id: CHAIN_ID,
  name: 'anvil-local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
})
const walletClient = createWalletClient({ account, chain: localChain, transport: http(ANVIL_RPC) })
const mpp = new MPPClient({ baseUrl: GATEWAY_URL })

let failures = 0
const check = (name, cond, detail) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name} — ${detail}`)
  if (!cond) failures += 1
}

const signVoucher = async (channelId, cumulativeAmount) => {
  const { domain, types, primaryType, message } = buildVoucherMessage({ channelId, cumulativeAmount: cumulativeAmount.toString() }, CHAIN_ID, MPP_DOMAIN)
  return walletClient.signTypedData({ domain, types, primaryType, message, account })
}

console.log(`Gateway:      ${GATEWAY_URL}`)
console.log(`MPP domain:   ${MPP_DOMAIN}`)
console.log(`Payer:        ${account.address} (anvil #0)`)

// ── F5a: open — fund the platform wallet and open a channel ────────────────
console.log('\n=== F5a: MPP open (deposit tx → channel) ===')
const depositTx = await walletClient.sendTransaction({ to: PAY_TO, value: DEPOSIT, account, chain: undefined })
check('deposit tx sent', Boolean(depositTx), `tx=${depositTx.slice(0, 12)}…`)
const opened = await mpp.open({ payer: account.address, depositWei: DEPOSIT.toString(), salt: SALT, txHash: depositTx, chain: 'sepolia' })
check('open → channelId + deposit', Boolean(opened.channelId) && opened.depositWei === DEPOSIT.toString(), `deposit=${opened.depositWei}`)

// channelId must match keccak256(abi.encodePacked(payer, payee, asset, salt, chainId))
const expectedChannel = keccak256(
  encodePacked(
    ['address', 'address', 'address', 'bytes32', 'uint256'],
    [account.address, PAY_TO, '0x0000000000000000000000000000000000000000', SALT, BigInt(CHAIN_ID)]
  )
)
check('channelId matches the deterministic formula', opened.channelId === expectedChannel, `channel=${opened.channelId.slice(0, 18)}…`)
const CH = opened.channelId

// ── F5b: vouchers — sign cumulative amounts ────────────────────────────────
console.log('\n=== F5b: MPP vouchers (cumulative, monotonic) ===')
const sig1 = await signVoucher(CH, V1)
const v1 = await mpp.voucher({ channelId: CH, cumulativeAmount: V1.toString(), signature: sig1 })
check('voucher#1 accepted (mode=sign)', v1.accepted === true && v1.mode === 'sign', `mode=${v1.mode}`)

const sig2 = await signVoucher(CH, V2)
const v2 = await mpp.voucher({ channelId: CH, cumulativeAmount: V2.toString(), signature: sig2 })
check('voucher#2 accepted (mode=sign)', v2.accepted === true && v2.mode === 'sign', `mode=${v2.mode}`)

// Replay the exact same (cum, sig) → idempotent reuse
const reuse = await mpp.voucher({ channelId: CH, cumulativeAmount: V2.toString(), signature: sig2 })
check('same voucher replay → mode=reuse (idempotent)', reuse.accepted === true && reuse.mode === 'reuse', `mode=${reuse.mode}`)

// ── F5c: auto-settle — threshold crossed during voucher ────────────────────
console.log('\n=== F5c: auto-settle + manual settle ===')
const after = await mpp.session(CH)
check('auto-settle deducted consumption on voucher', BigInt(after.spentWei) === V2, `spent=${after.spentWei} (threshold 1 native, cum 2 native)`)

// Everything is already settled → manual settle consumes nothing
const settled = await mpp.settle(CH)
check('manual settle consumes nothing pending', BigInt(settled.consumedWei) === 0n, `consumed=${settled.consumedWei}`)

// ── F5d: close — refund = deposit − spent ──────────────────────────────────
console.log('\n=== F5d: MPP close (refund = deposit − spent) ===')
const closed = await mpp.close(CH)
check('close returns spent + refund', BigInt(closed.spentWei) === V2 && BigInt(closed.refundWei) === DEPOSIT - V2,
  `spent=${closed.spentWei} refund=${closed.refundWei} (expect ${(DEPOSIT - V2).toString()})`)
const state = await mpp.session(CH)
check('session marked closed', state.status === 'closed', `status=${state.status}`)

// ── F5e: negative paths ────────────────────────────────────────────────────
console.log('\n=== F5e: MPP negative paths ===')
const badSig = await mpp.voucher({ channelId: CH, cumulativeAmount: V1.toString(), signature: sig2 }).then(() => 'accepted').catch((e) => String(e?.message ?? e))
check('wrong signature on closed channel → rejected', !badSig.includes('accepted'), `res=${badSig.slice(0, 60)}`)
const low = await mpp.voucher({ channelId: CH, cumulativeAmount: '1', signature: sig1 }).then(() => 'accepted').catch((e) => String(e?.message ?? e))
check('non-monotonic voucher → rejected', !low.includes('accepted'), `res=${low.slice(0, 60)}`)

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n==============================================')
console.log(failures === 0
  ? 'F5 ALL PASSED ✅  — MPP session 全流程（open/voucher/reuse/auto-settle/close）'
  : `${failures} check(s) FAILED ❌`)
console.log('==============================================')
process.exit(failures === 0 ? 0 : 1)
