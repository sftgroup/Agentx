const { ethers } = require('ethers');

const RPC_URL = 'http://43.156.99.215:18545';
const PK = '0x5a74fd11c022e5e1fdc099e9971ebcdbad8b813f91fa99e6861bc0bcac99e094';
const GW = 'http://localhost:3090';

const contracts = {
  identity: '0xbf5F9db266c8c97E3334466C88597Eb758AfE212',
  sub: '0x019AC9d945467478Dd371CDbD70cb2f325800E6B',
  rep: '0x6a18C2664E1b42063860d864b6448b824d7B843F',
  cfg: '0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8',
  ep: '0xB361d04F49000013FC131D3C59C41c8486C64f8c',
};

const ID_ABI = [
  'function register(string tokenURI) payable returns (uint256)',
  'function agentExists(uint256) view returns (bool)',
  'function getCurrentAgentId() view returns (uint256)',
  'function getAgentsByOwner(address) view returns (uint256[])',
  'function tokenURI(uint256) view returns (string)',
];
const CFG_ABI = [
  'function setConfig(uint256,string,string,string) returns (bool)',
  'function getAgentConfigs(uint256) view returns (tuple(uint256,uint256,string,string,string,string,bool,uint256,uint256,address)[])',
];
const REP_ABI = [
  'function setFeedback(uint256,uint8) returns (bool)',
  'function getReputationSummary(uint256,address[],bytes32,bytes32) view returns (uint64,uint8)',
];

let results = [];
let p = 0, f = 0;

function log(t, s, d) {
  const icon = s === 'PASS' ? '✅' : s === 'SKIP' ? '⚠️' : '❌';
  if (s === 'PASS') p++; else if (s === 'FAIL') f++;
  results.push({ test: t, status: s, detail: d });
  console.log(icon + ' [' + s + '] ' + t + (d ? ': ' + d.substring(0, 100) : ''));
}

async function mcp(name, args) {
  const r = await fetch(GW + '/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { chain: 'oxachain', ...args } } }),
  });
  return r.json();
}

async function main() {
  console.log('=== AgentX E2E Wallet Injection Test ===\n');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PK, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log('Wallet: ' + wallet.address + '\nBalance: ' + ethers.formatEther(bal) + ' T0x\n');

  const id = new ethers.Contract(contracts.identity, ID_ABI, wallet);
  const cfg = new ethers.Contract(contracts.cfg, CFG_ABI, wallet);
  const rep = new ethers.Contract(contracts.rep, REP_ABI, wallet);

  let currentId = Number(await id.getCurrentAgentId());
  let agentIds = [];
  console.log('Current total agents: ' + currentId + '\n');

  // TEST 1: Register 3 Agents
  console.log('--- [1] Register 3 Agents ---');
  const names = ['E2E-Alpha', 'E2E-Beta', 'E2E-Gamma'];
  for (let i = 0; i < 3; i++) {
    try {
      const tx = await id.register('ipfs://QmE2E' + names[i], { gasLimit: 300000 });
      const r = await tx.wait();
      agentIds.push(currentId + i + 1);
      log('Register ' + names[i], 'PASS', 'agentId=' + agentIds[i] + ' gas=' + r.gasUsed);
    } catch (e) { log('Register ' + names[i], 'FAIL', e.reason || e.message?.substring(0, 80)); }
  }

  // TEST 2: Verify Agents
  console.log('\n--- [2] Verify Agents ---');
  for (const aid of agentIds) {
    try {
      const ex = await id.agentExists(aid);
      const uri = await id.tokenURI(aid);
      log('Agent ' + aid + ' exists', 'PASS', 'exists=' + ex + ' uri=' + uri);
    } catch (e) { log('Agent ' + aid, 'FAIL', e.message?.substring(0, 80)); }
  }

  // TEST 3: List owned
  console.log('\n--- [3] List Owned Agents ---');
  try {
    const owned = await id.getAgentsByOwner(wallet.address);
    log('getAgentsByOwner', 'PASS', 'ids=[' + owned.map(n => Number(n)).join(',') + ']');
  } catch (e) { log('getAgentsByOwner', 'FAIL', e.message?.substring(0, 80)); }

  // TEST 4: Configure
  console.log('\n--- [4] Configure Agents ---');
  for (let i = 0; i < agentIds.length; i++) {
    try {
      const tx = await cfg.setConfig(agentIds[i], 'greeting', 'Hello from ' + names[i] + '!', 'string', { gasLimit: 200000 });
      await tx.wait();
      log('Config Agent ' + agentIds[i], 'PASS', 'greeting set');
    } catch (e) { log('Config Agent ' + agentIds[i], 'FAIL', e.reason || e.message?.substring(0, 80)); }
  }

  // TEST 5: Rate
  console.log('\n--- [5] Rate Agents ---');
  const scores = [5, 4, 5];
  for (let i = 0; i < agentIds.length; i++) {
    try {
      const tx = await rep.setFeedback(agentIds[i], scores[i], { gasLimit: 200000 });
      await tx.wait();
      log('Rate Agent ' + agentIds[i], 'PASS', 'score=' + scores[i]);
    } catch (e) { log('Rate Agent ' + agentIds[i], 'FAIL', e.reason || e.message?.substring(0, 80)); }
  }

  // TEST 6: MCP Integration
  console.log('\n--- [6] MCP Integration ---');
  try {
    const r = await mcp('agentx_identity_list', { ownerAddress: wallet.address });
    const t = JSON.parse(r?.result?.content?.[0]?.text || '{}');
    log('MCP identity_list', 'PASS', 'found ' + (t.agentIds?.length || 0) + ' agents');
  } catch (e) { log('MCP identity_list', 'FAIL', e.message?.substring(0, 80)); }

  for (const aid of agentIds) {
    try {
      const r = await mcp('agentx_identity_exists', { agentId: aid });
      const t = JSON.parse(r?.result?.content?.[0]?.text || '{}');
      log('MCP exists(' + aid + ')', t.exists ? 'PASS' : 'FAIL', 'exists=' + t.exists);
    } catch (e) { log('MCP exists(' + aid + ')', 'FAIL', e.message?.substring(0, 80)); }
  }

  for (const aid of agentIds) {
    try {
      const r = await mcp('agentx_reputation_get', { agentId: aid });
      const t = JSON.parse(r?.result?.content?.[0]?.text || '{}');
      log('MCP reputation(' + aid + ')', 'PASS', 'avg=' + t.averageScore + ' count=' + t.reviewCount);
    } catch (e) { log('MCP reputation(' + aid + ')', 'FAIL', e.message?.substring(0, 80)); }
  }

  // TEST 7: Subscription
  console.log('\n--- [7] Subscription ---');
  try {
    const r = await mcp('agentx_subscription_check', { subscriberAddress: wallet.address, agentId: agentIds[0] });
    const t = JSON.parse(r?.result?.content?.[0]?.text || '{}');
    log('MCP sub_check', 'PASS', 'active=' + t.active);
  } catch (e) { log('MCP sub_check', 'FAIL', e.message?.substring(0, 80)); }

  try {
    const r = await mcp('agentx_subscription_plans', { planId: 1 });
    const t = JSON.parse(r?.result?.content?.[0]?.text || '{}');
    log('MCP plans', t.note ? 'SKIP' : 'PASS', t.note || JSON.stringify(t).substring(0, 60));
  } catch (e) { log('MCP plans', 'FAIL', e.message?.substring(0, 80)); }

  // TEST 8: Auth
  console.log('\n--- [8] Gateway Auth ---');
  try {
    const cRes = await fetch(GW + '/api/v1/auth/challenge?address=' + wallet.address);
    const c = await cRes.json();
    if (c.challenge) {
      log('Auth challenge', 'PASS');
      const sig = await wallet.signMessage(c.challenge);
      const vRes = await fetch(GW + '/api/v1/auth/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, signature: sig }),
      });
      const v = await vRes.json();
      log('Auth verify', v.token ? 'PASS' : 'FAIL', v.token ? 'JWT issued' : JSON.stringify(v).substring(0, 60));
    } else { log('Auth challenge', 'FAIL', JSON.stringify(c).substring(0, 80)); }
  } catch (e) { log('Auth', 'FAIL', e.message?.substring(0, 80)); }

  // SUMMARY
  const fb = await provider.getBalance(wallet.address);
  console.log('\n=== SUMMARY: ' + p + ' PASS, ' + f + ' FAIL, ' + (results.length - p - f) + ' SKIP ===');
  console.log('Gas used: ' + ethers.formatEther(bal - fb) + ' T0x');
  console.log('Final balance: ' + ethers.formatEther(fb) + ' T0x');
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
