// e2e/onchain/subscribe.cjs — create/verify on-chain subscription for agent 1
//
// The C-end chat UI (C147/C148) is guarded by SubscriptionGuard: it requires the
// wallet to hold an ACTIVE on-chain subscription (SubscriptionManager.hasActiveSubscription)
// in addition to the fiat plan. This script creates that fixture for the test wallet.
//
// Usage:
//   node e2e/onchain/subscribe.cjs          # read-only state check
//   node e2e/onchain/subscribe.cjs --run    # create subscription (pays 0.001 OXA)
//
// Prereq: TLS tunnel to the OXA RPC (see e2e/.env.example) + e2e/.env with TEST_WALLET_PK.
'use strict';
const { ethers } = require('ethers');
const L = require('../lib/provider.cjs');
const { config, rpc, wallet } = L;

const MANAGER = '0x019AC9d945467478Dd371CDbD70cb2f325800E6B';
const AGENT_ID = 1;                                   // UI-audit agent
const PLAN_ID = 40;                                   // SubscriptionManager plan for agent 1
const PRICE_WEI = 1000000000000000n;                  // 0.001 OXA, native
const RUN = process.argv.includes('--run');

const iface = new ethers.Interface([
  'function subscribe(uint256 planId) payable returns (uint256 subscriptionId)',
  'function hasActiveSubscription(address subscriber, uint256 agentId) view returns (bool)',
  'function getUserSubscriptions(address user) view returns (uint256[])',
]);

async function state() {
  const active = await rpc('eth_call', [{ to: MANAGER, data: iface.encodeFunctionData('hasActiveSubscription', [config.account, AGENT_ID]) }, 'latest']);
  const subs = await rpc('eth_call', [{ to: MANAGER, data: iface.encodeFunctionData('getUserSubscriptions', [config.account]) }, 'latest']);
  return {
    active: iface.decodeFunctionResult('hasActiveSubscription', active)[0],
    subs: iface.decodeFunctionResult('getUserSubscriptions', subs)[0].map(String),
  };
}

(async () => {
  if (!wallet) throw new Error('TEST_WALLET_PK not set — see e2e/.env.example');
  console.log('account:', config.account);
  console.log('chainId:', await rpc('eth_chainId', []));

  const s0 = await state();
  console.log(`hasActiveSubscription(${config.account}, ${AGENT_ID}):`, s0.active);
  console.log('getUserSubscriptions:', JSON.stringify(s0.subs));
  if (s0.active) { console.log('ALREADY_ACTIVE — no action needed'); process.exit(0); }
  if (!RUN) { console.log('INACTIVE — re-run with --run to subscribe (pays 0.001 OXA)'); process.exit(1); }

  const bal = BigInt(await rpc('eth_getBalance', [config.account, 'latest']));
  console.log('balance:', ethers.formatEther(bal), 'OXA (need', ethers.formatEther(PRICE_WEI) + ')');
  if (bal < PRICE_WEI + 10000000000000000n) throw new Error('BALANCE_TOO_LOW — fund the test wallet');

  const nonce = parseInt(await rpc('eth_getTransactionCount', [config.account, 'latest']), 16);
  const gasPrice = await rpc('eth_gasPrice', []);
  const tx = {
    to: MANAGER,
    value: '0x' + PRICE_WEI.toString(16),
    data: iface.encodeFunctionData('subscribe', [PLAN_ID]),
    nonce,
    gasPrice,
    gasLimit: '0x100000',
    chainId: config.chainId,
    type: 0,
  };
  const signed = await wallet.signTransaction(tx);
  console.log(`sending subscribe(${PLAN_ID}) value=0.001 OXA ...`);
  const hash = await rpc('eth_sendRawTransaction', [signed]);
  console.log('tx hash:', hash);

  let rcpt = null;
  for (let i = 0; i < 30 && !rcpt; i++) {
    await new Promise(r => setTimeout(r, 2000));
    rcpt = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
  }
  console.log('receipt:', rcpt ? `status=${parseInt(rcpt.status, 16)} block=${parseInt(rcpt.blockNumber, 16)}` : 'NOT_FOUND');

  const s1 = await state();
  console.log('AFTER hasActiveSubscription:', s1.active, 'subs:', JSON.stringify(s1.subs));
  process.exit(s1.active ? 0 : 1);
})().catch(e => { console.error('FATAL', String(e.message || e).slice(0, 300)); process.exit(2); });
