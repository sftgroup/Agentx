// e2e/scripts/chat.cjs — J5 chat deep: connect, open chat, send a real message, await SSE reply
//
// Requires the test wallet to hold an ACTIVE on-chain subscription for agent 1:
//   node e2e/onchain/subscribe.cjs   (creates it)
//
// Run: node e2e/scripts/chat.cjs
'use strict';
const { chromium } = require('playwright-core');
const L = require('../lib/provider.cjs');
const { config, log, summary, makeContext, connectWalletFirst, addrShown } = L;

(async () => {
  const browser = await chromium.launch({ executablePath: config.chrome || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await (await makeContext(browser)).newPage();
  const pageErrs = [];
  const taskCalls = [];
  page.on('pageerror', e => pageErrs.push(String(e).slice(0, 150)));
  page.on('response', async r => { const u = r.url(); if (/sessions|\/tasks|completions|agent-runs/.test(u)) taskCalls.push(r.status() + ' ' + u.replace(config.site, '').slice(0, 70)); });

  try {
    await page.goto(`${config.site}/user/chat/1`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const body0 = await page.locator('body').innerText().catch(() => '');
    log(/Connect Wallet Required|Checking subscription/i.test(body0) ? 'PASS' : 'FAIL', 'C110 未连接 → 聊天页引导', 'Connect Wallet Required/Checking');

    const conn = await connectWalletFirst(page, '聊天页');
    await page.waitForTimeout(9000);
    const body = await page.locator('body').innerText().catch(() => '');
    const gated = /Subscription Required|Connect Wallet Required|Checking subscription/i.test(body);
    const chatOpen = /Type your message|Select a model|Parallel|Tokens|New Chat/i.test(body);
    log(gated ? 'SKIP' : chatOpen ? 'PASS' : 'FAIL', 'C147/C148 聊天页渲染', gated ? '付费墙（缺链上订阅）' : chatOpen ? '聊天 UI 可用' : body.slice(0, 100));
    const modelBtn = await page.locator('button:has-text("Select model"), button:has-text("deepseek"), button:has-text("Model"), button:has-text("GPT")').first().count();
    if (chatOpen) log(modelBtn ? 'PASS' : 'FAIL', 'C148 模型选择器存在', modelBtn ? '已渲染' : '未找到');
    if (!chatOpen) { await page.screenshot({ path: `${config.shotsDir}/chat-gated.png` }); return; }

    // send a real message
    const input = page.locator('textarea, input[placeholder*="message"], input[placeholder*="Type"]').first();
    log((await input.count()) ? 'PASS' : 'FAIL', 'C147 输入框存在', 'textarea/input 已渲染');
    await input.fill('say hello in one line');
    await page.waitForTimeout(800);
    const send = page.locator('button[aria-label*="Send"], button svg.lucide-send, button:has-text("Send")').first();
    if (await send.count()) await send.click().catch(async () => { await page.keyboard.press('Enter').catch(() => {}); });
    else await page.keyboard.press('Enter').catch(() => {});
    log('PASS', 'C147 发送消息', '已提交');

    // Wait for a REAL assistant reply: a non-empty bubble rendered AFTER the user
    // message (avoids false-matching UI chrome like "Parallel tasks · Memory enabled").
    const reply = await page.waitForFunction(() => {
      const nodes = [...document.querySelectorAll('div.whitespace-pre-wrap')];
      const userMsg = nodes.find(n => /say hello in one line/.test(n.textContent || ''));
      if (!userMsg) return false;
      return nodes.slice(nodes.indexOf(userMsg) + 1).some(n => (n.textContent || '').trim().length > 3);
    }, null, { timeout: 120000 }).then(() => true).catch(() => false);
    log(reply ? 'PASS' : 'FAIL', 'C147 收到助手回复（SSE）', reply ? '用户消息后出现非空助手气泡' : '超时未收到真实回复');
    if (reply) {
      const b = await page.locator('body').innerText().catch(() => '');
      const idx = b.indexOf('say hello in one line');
      console.log('    回复片段:', idx >= 0 ? b.slice(idx, idx + 220).replace(/\n/g, ' | ') : '?');
    }
    await page.waitForTimeout(1500);
    console.log('    task API:', JSON.stringify(taskCalls.slice(0, 6)));
    console.log('    page errors:', pageErrs.length ? pageErrs.slice(0, 3) : 'none');
    await page.screenshot({ path: `${config.shotsDir}/chat-deep.png` });
  } finally {
    await browser.close();
  }
  summary();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(2); });
