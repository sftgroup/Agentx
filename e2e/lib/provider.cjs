// e2e/lib/provider.cjs — shared wallet-injection + OXA tunnel + connect helpers
//
// Single source of truth for driving the C-end UI with an injected test wallet:
//  - JSON-RPC over the TLS tunnel to rpc-oxa (localhost -> remote RPC)
//  - window.ethereum provider injection (MetaMask-like) with real signing
//  - deterministic localStorage connect + modal-click fallback
//  - PASS/FAIL/SKIP logger + console/pageerror harness
//
// Config comes from process.env (or e2e/.env). See .env.example.
'use strict';
const { ethers } = require('ethers');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

// ── tiny .env loader (no external dep) ─────────────────────────────────────
function loadEnv(dir) {
  try {
    const p = path.join(dir, '.env');
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch { /* ignore */ }
}
loadEnv(__dirname + '/..');

const config = {
  site: process.env.SITE || 'https://agentx.0xainet.top',
  rpcTunnelHost: process.env.RPC_TUNNEL_HOST || '127.0.0.1',
  rpcTunnelPort: Number(process.env.RPC_TUNNEL_PORT || 19506),
  rpcHost: process.env.RPC_HOST || 'rpc-oxa.0xainet.top',
  rpcUrl: process.env.RPC_URL || 'https://rpc-oxa.0xainet.top',
  pk: process.env.TEST_WALLET_PK || '',
  account: (process.env.TEST_ACCOUNT || '').toLowerCase(),
  chainId: Number(process.env.TEST_CHAIN_ID || 19505),
  chainIdHex: '0x' + (Number(process.env.TEST_CHAIN_ID || 19505)).toString(16),
  chrome: process.env.CHROME_PATH || '',
  shotsDir: process.env.SHOTS_DIR || (__dirname + '/../shots'),
  fontDir: process.env.FONT_CONFIG_DIR || '',
};

const wallet = config.pk ? new ethers.Wallet(config.pk) : null;

// Font rendering env (CJK glyphs) — optional
if (config.fontDir) {
  process.env.FONTCONFIG_FILE = path.join(config.fontDir, 'fonts.conf');
  process.env.FONTCONFIG_PATH = config.fontDir;
}
// Chromium shared-lib deps (e.g. bundled libstdc++/fontconfig in CI) — optional
if (process.env.CHROMIUM_LD_LIBRARY_PATH) {
  process.env.LD_LIBRARY_PATH = process.env.CHROMIUM_LD_LIBRARY_PATH;
}

function rpcRaw(body) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(
      { host: config.rpcTunnelHost, port: config.rpcTunnelPort, servername: config.rpcHost, rejectUnauthorized: false },
      () => {
        sock.write('POST / HTTP/1.1\r\nHost: ' + config.rpcHost + '\r\nContent-Type: application/json\r\nContent-Length: '
          + Buffer.byteLength(body) + '\r\nConnection: close\r\n\r\n' + body);
      });
    let data = '';
    sock.on('data', d => (data += d));
    sock.on('end', () => { const i = data.indexOf('\r\n\r\n'); resolve(i >= 0 ? data.slice(i + 4) : data); });
    sock.on('error', reject);
  });
}
async function rpc(method, params) {
  const body = await rpcRaw(JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }));
  let j; try { j = JSON.parse(body); } catch { throw new Error('RPC parse fail: ' + body.slice(0, 120)); }
  if (j.error) throw new Error('RPC ' + method + ': ' + (j.error.message || JSON.stringify(j.error)).slice(0, 200));
  return j.result;
}

// ── logger ─────────────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, skipped = 0;
function log(status, name, detail) {
  if (status === 'PASS') passed++; else if (status === 'FAIL') failed++; else skipped++;
  results.push({ status, name, detail });
  console.log(`${status === 'PASS' ? '✅' : status === 'SKIP' ? '⚠️' : '❌'} [${status}] ${name}${detail ? ' — ' + detail.slice(0, 200) : ''}`);
}
function summary() {
  console.log(`\n===== ${passed} PASS / ${failed} FAIL / ${skipped} SKIP =====`);
  process.exit(failed > 0 ? 1 : 0);
}

// ── browser context with injected provider ────────────────────────────────
async function makeContext(browser, viewport = { width: 1440, height: 900 }) {
  if (!wallet) throw new Error('TEST_WALLET_PK not set — see e2e/.env.example');
  const context = await browser.newContext({ viewport });
  await context.exposeFunction('__pwRpc', async (method, params) => rpc(method, params || []));
  await context.exposeFunction('__pwSign', async (msg) => {
    if (typeof msg === 'string' && msg.startsWith('0x')) return wallet.signMessage(ethers.getBytes(msg));
    return wallet.signMessage(String(msg));
  });
  await context.exposeFunction('__pwSignTyped', async (jsonStr) => {
    const td = JSON.parse(jsonStr);
    return wallet.signTypedData(td.domain, td.types, td.message);
  });
  await context.addInitScript(({ account, chainHex }) => {
    const loadConnected = () => localStorage.getItem('__pwConnected') === '1';
    const setConnected = (v) => { localStorage.setItem('__pwConnected', v ? '1' : '0'); };
    const eth = {
      isMetaMask: true,
      isConnected: () => loadConnected(),
      get selectedAddress() { return loadConnected() ? account : null; },
      chainId: chainHex,
      networkVersion: '19505',
      request: async ({ method, params = [] }) => {
        switch (method) {
          case 'eth_requestAccounts': setConnected(true); return [account];
          case 'eth_accounts': return loadConnected() ? [account] : [];
          case 'eth_chainId': return chainHex;
          case 'net_version': return '19505';
          case 'personal_sign':
          case 'eth_sign':
            if (window.__pwRejectNextSign === true) { window.__pwRejectNextSign = false; throw { code: 4001, message: 'User rejected the request.' }; }
            return await window.__pwSign(params[0]);
          case 'eth_signTypedData':
          case 'eth_signTypedData_v4':
            if (window.__pwRejectNextSign === true) { window.__pwRejectNextSign = false; throw { code: 4001, message: 'User rejected the request.' }; }
            return await window.__pwSignTyped(params[1]);
          case 'wallet_switchEthereumChain':
          case 'wallet_addEthereumChain':
            return null;
          case 'wallet_requestPermissions':
            return [{ parentCapability: 'eth_accounts' }];
          default:
            return await window.__pwRpc(method, params);
        }
      },
      on: () => {}, removeListener: () => {}, removeAllListeners: () => {},
      emit: () => {}, _events: {},
    };
    window.ethereum = eth;
    window.__pwRejectNextSign = false;
  }, { account: config.account, chainHex: config.chainIdHex });

  await context.route('**/*', async (route) => {
    try {
      const url = route.request().url();
      if (url.startsWith(config.rpcUrl)) {
        try {
          const body = await rpcRaw(route.request().postData() || '[]');
          await route.fulfill({ status: 200, contentType: 'application/json', body });
        } catch (e) {
          await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'tunnel: ' + e.message } }) });
        }
      } else {
        await route.continue();
      }
    } catch (e) { /* ignore */ }
  });
  return context;
}

// ── console/pageerror harness ──────────────────────────────────────────────
function attachHarness(page) {
  const state = { consoleErrors: [], pageErrors: [], api: {} };
  page.on('console', (m) => { if (m.type() === 'error') state.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => state.pageErrors.push(String(e)));
  page.on('response', (res) => {
    const m = res.url().match(/\/api\/v1\/([a-z-]+)/);
    if (m) state.api[m[1]] = (state.api[m[1]] || 0) + 1;
  });
  return state;
}
function jsErrorCheck(label, state, opts = {}) {
  const realConsole = state.consoleErrors.filter(e => !/favicon|walletconnect|net::|Failed to load resource|ERR_CONNECTION_RESET/.test(e));
  const non418 = state.pageErrors.filter(e => !/#418/.test(e) && !/#423/.test(e) && !/#425/.test(e));
  const ok = realConsole.length === 0 && non418.length === 0;
  log(ok ? 'PASS' : 'FAIL', label, `console=${realConsole.length} pageerror=${state.pageErrors.length}`);
  if (realConsole.length) console.log('    console errors:', realConsole.slice(0, 4));
  if (non418.length) console.log('    page errors:', non418.slice(0, 4));
}

// ── wallet connect helpers ─────────────────────────────────────────────────
const addrShown = async (page) => {
  try {
    return await page.waitForFunction((addr) => {
      const t = document.body.innerText.toLowerCase();
      return t.includes(addr.slice(0, 6).toLowerCase());
    }, config.account, { timeout: 20000 });
  } catch { return false; }
};

async function connectWalletFirst(page, label) {
  await page.waitForTimeout(1500);
  let ok = false;
  // Deterministic path: flag wallet connected in localStorage, then reload so wagmi
  // auto-reconnects (eth_requestAccounts returns the account on mount).
  await page.evaluate(() => localStorage.setItem('__pwConnected', '1')).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(3000);
  ok = await addrShown(page);
  // Fallback: manual modal-click flow
  if (!ok) {
    const btn = page.getByRole('button', { name: /Connect Wallet/i }).first();
    try { await btn.waitFor({ timeout: 15000 }); } catch {}
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      await page.waitForTimeout(1200);
      await btn.click().catch(() => {});
      await page.waitForTimeout(1000);
      const opt = page.locator('button:has-text("Injected")').first().or(page.locator('button:has-text("MetaMask")').first());
      if (await opt.count()) {
        await opt.first().click().catch(() => {});
        await page.waitForTimeout(2500);
        ok = await addrShown(page);
      }
    }
  }
  log(ok ? 'PASS' : 'SKIP', label + ' 连接钱包', ok ? '已注入连接（地址出现）' : '连接未生效');
  await page.waitForTimeout(2500);
  return ok;
}

const WAIT_MSG = async (page, re, timeout = 30000) => {
  try { await page.waitForFunction((r) => new RegExp(r, 'i').test(document.body.innerText), re, { timeout }); return true; }
  catch { return false; }
};

module.exports = {
  config, rpc, rpcRaw, wallet, log, summary, results,
  makeContext, attachHarness, jsErrorCheck, connectWalletFirst, addrShown, WAIT_MSG,
};
