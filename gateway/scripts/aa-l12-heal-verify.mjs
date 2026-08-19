// 临时：L12 自愈链路生产验证 v2（修正 isModuleInstalled 探测后全闭环）
// 阶段1：账户干净 → enable（无残留，直接 digest）→ eth_sign → confirm#1 → receiptSuccess
// 阶段2：模块已安装 → enable 应命中 needsSessionRevoke → eth_sign(disable) → revoke
// 阶段3：已卸载 → enable（digest）→ eth_sign → confirm#2 → receiptSuccess
import { ethers } from 'ethers'
import { privateKeyToAccount } from 'viem/accounts'
import fs from 'fs'

const env = fs.readFileSync('/home/ubuntu/Agentx/gateway/.env', 'utf8')
const pk = (env.match(/^AA_DEPLOYER_PRIVATE_KEY=(.*)$/m) || [])[1]?.trim()
const GW = 'https://agentx.0xainet.top/api/v1'
const wallet = new ethers.Wallet(pk)
const signer = privateKeyToAccount(pk)

const addr = wallet.address.toLowerCase()
const expected = '0xd8e2cf33e9784dc521d7d7f5fbb4a690be502812'
if (addr !== expected) { console.log('FATAL: deployer key is not the test wallet'); process.exit(1) }

const post = (path, body, token) => fetch(`${GW}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }))

const ch = await (await fetch(`${GW}/auth/challenge?address=${addr}`)).json()
const sig0 = await wallet.signMessage(ch.challenge)
const vr = await (await fetch(`${GW}/auth/verify`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ wallet_address: addr, signature: sig0, timestamp: ch.timestamp, nonce: ch.nonce }),
})).json()
if (!vr.access_token) { console.log('AUTH FAILED:', JSON.stringify(vr)); process.exit(1) }
const token = vr.access_token
console.log('[0] auth ok')

const ENABLE_BODY = { agentId: 30, planId: 18, subscriptionId: 27, planPriceWei: '1000000000000000' }

async function enableAndConfirm(step, expectResidue) {
  const en = await post('/billing/auto-renew/enable', ENABLE_BODY, token)
  console.log(`[${step}] enable:`, en.status, JSON.stringify(en.json).slice(0, 220))
  if (expectResidue) {
    if (en.json?.needsSessionRevoke !== true || !en.json?.disableUserOpHash) {
      console.log(`FATAL: expected needsSessionRevoke at ${step}`); process.exit(1)
    }
    return en.json
  }
  if (!en.json?.digest || en.json?.needsSessionRevoke) {
    console.log(`FATAL: expected fresh digest at ${step}`); process.exit(1)
  }
  const sig = await signer.sign({ hash: en.json.digest })
  const cf = await post('/billing/auto-renew/confirm', { agentId: 30, planId: 18, ownerSignature: sig }, token)
  console.log(`[${step}] confirm:`, cf.status, JSON.stringify(cf.json))
  if (!cf.json?.receiptSuccess) { console.log(`FATAL: confirm not receiptSuccess at ${step}`); process.exit(1) }
  return en.json
}

// 阶段1：账户应干净（上次 revoke 已卸载）→ 直接 enable + confirm
await enableAndConfirm(1, false)

// 阶段2：模块已安装 → 修正后的探测应命中残留 → revoke
const res = await enableAndConfirm(2, true)
const revokeSig = await signer.sign({ hash: res.disableUserOpHash })
const rv = await post('/billing/auto-renew/revoke', {
  agentId: 30, planId: 18,
  disableUserOpHash: res.disableUserOpHash, ownerSignature: revokeSig,
  accountAddress: res.accountAddress, sessionId: res.disableSessionId,
}, token)
console.log('[3] revoke:', rv.status, JSON.stringify(rv.json))
if (!rv.json?.revoked) { console.log('FATAL: revoke not confirmed'); process.exit(1) }

// 阶段3：已卸载 → 直接 enable + confirm
await enableAndConfirm(4, false)

console.log('\nL12_HEAL_VERIFY_PASS: clean→confirm→residue-detect→revoke→clean→confirm all OK')
