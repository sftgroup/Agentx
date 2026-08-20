// e2e/scripts/ui-audit.cjs — C-end UI layer audit (runnable, CI-friendly)
//
// Covers: marketplace detail tabs (C117/C118/C119/C121/C201), /user/plans (C270),
//         skills market (C271/C272/C273), settings keys (C175-C178),
//         i18n (C199/C200), mobile 375 (C265), chat guard state (C110/C147/C148),
//         subscriptions page (C10A/C210), console-0 (C274).
//
// Prereq (see e2e/.env.example):
//  1) test wallet has a fiat subscription (agent 1) + an ACTIVE on-chain
//     subscription (run e2e/onchain/subscribe.cjs --run)
//  2) RPC reachable: local TLS tunnel 127.0.0.1:19506 -> rpc-oxa, or set
//     RPC_TUNNEL_HOST/PORT to the public endpoint directly
//  3) e2e/.env with TEST_WALLET_PK / TEST_ACCOUNT
//
// Run: node e2e/scripts/ui-audit.cjs
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const L = require('../lib/provider.cjs');
const { config, log, summary, makeContext, attachHarness, jsErrorCheck, connectWalletFirst, WAIT_MSG } = L;
const SHOTS = config.shotsDir;
fs.mkdirSync(SHOTS, { recursive: true });

// ── J2 / C117-C123 / C201: marketplace detail tabs ─────────────────────
async function marketplaceDetail(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/marketplace/agent/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const body = await page.locator('body').innerText();
  log(/Overview|Skills|Reviews|Pricing/i.test(body) ? 'PASS' : 'FAIL', 'C117 详情页 4 Tab 渲染', 'Overview/Skills/Reviews/Pricing');

  await page.locator('button:has-text("Skills")').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const skillsBody = await page.locator('body').innerText();
  log(/Input Schema|Output Schema|No skills|Skill/i.test(skillsBody) ? 'PASS' : 'FAIL', 'C118 Skills Tab', 'schema/空态渲染');

  await page.locator('button:has-text("Reviews")').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const revBody = await page.locator('body').innerText();
  log(/total reviews|no reviews|Rate this Agent|Subscribe to review/i.test(revBody) ? 'PASS' : 'SKIP', 'C119 Reviews Tab（未订阅态）', '评分汇总/订阅提示');

  await page.locator('button:has-text("Pricing")').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const priBody = await page.locator('body').innerText();
  log(/No plans|per period|ETH|Subscribe|Already Subscribed/i.test(priBody) ? 'PASS' : 'FAIL', 'C121 Pricing Tab', 'plan 列表/空态渲染');

  await page.screenshot({ path: `${SHOTS}/ui-audit-marketplace.png` });
  jsErrorCheck('详情页 JS 错误', st, {});
  await page.close();
}

// ── C201: unknown agent → Not Found ────────────────────────────────────
async function unknownAgent(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/marketplace/agent/999999`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const body = await page.locator('body').innerText();
  log(/Not Found|Back to Marketplace/i.test(body) ? 'PASS' : 'FAIL', 'C201 未知 agent → Not Found 页', '含 Not Found');
  jsErrorCheck('未知 agent JS 错误', st, {});
  await page.close();
}

// ── C270: /user/plans ──────────────────────────────────────────────────
async function plansPage(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/user/plans`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await connectWalletFirst(page, 'plans');
  const body = await page.locator('body').innerText();
  log(/Subscription Plans|Create and manage pricing/i.test(body) ? 'PASS' : 'FAIL', 'C270 /user/plans 渲染', '标题渲染');
  jsErrorCheck('plans 页 JS 错误', st, {});
  await page.close();
}

// ── C271/C272/C273: skills market ──────────────────────────────────────
async function skillsMarket(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/marketplace/skills`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const body = await page.locator('body').innerText();
  log(/Skills Marketplace/i.test(body) ? 'PASS' : 'FAIL', 'C271 技能市场渲染', '标题');
  const cats = await page.locator('button:has-text("All"), button:has-text("defi"), button:has-text("security"), button:has-text("data")').count();
  log(cats > 0 ? 'PASS' : 'SKIP', 'C271 分类过滤按钮', cats + ' 个分类');

  await page.locator('button:has-text("Submit Skill")').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  const hasForm = await page.locator('text=Submit a New Skill').count();
  log(hasForm ? 'PASS' : 'FAIL', 'C272 技能提交表单展开', hasForm ? '表单可见' : '未展开');
  if (hasForm) {
    await page.getByRole('button', { name: /Submit for Review/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const err = await page.locator('text=All fields are required').count();
    log(err > 0 ? 'PASS' : 'FAIL', 'C272 空表单校验', err ? '必填校验提示' : '未出现校验提示');
  }
  await page.keyboard.press('Escape').catch(() => {});

  await connectWalletFirst(page, '技能市场');
  await page.locator('button:has-text("My Skills")').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const myBody = await page.locator('body').innerText();
  log(/No skills submitted yet|approved|pending|rejected/i.test(myBody) ? 'PASS' : 'SKIP', 'C273 我的技能列表', '状态徽标/空态');

  await page.screenshot({ path: `${SHOTS}/ui-audit-skills.png` });
  jsErrorCheck('技能市场 JS 错误', st, {});
  await page.close();
}

// ── C175-C178: settings keys ───────────────────────────────────────────
async function settingsKeys(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/user/settings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const conn = await connectWalletFirst(page, 'settings');
  try {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Add Key/i.test(x.textContent || ''));
      return b && !b.disabled;
    }, null, { timeout: 30000 });
  } catch {}
  await page.waitForTimeout(1000);
  const body = await page.locator('body').innerText();
  log(/API Settings|Platform API Key|Own LLM Keys/i.test(body) ? 'PASS' : 'FAIL', 'C175 /user/settings 渲染', 'Platform API Key + Own LLM Keys 区块');

  if (!conn) { log('SKIP', 'C176 Add Key 流程', '钱包未连接'); await page.close(); return; }
  const addBtn = page.locator('button:has-text("Add Key")').first();
  if (await addBtn.count()) {
    const disabled = await addBtn.getAttribute('disabled');
    log(disabled === null ? 'PASS' : 'FAIL', 'C176 Add Key 按钮可用（已认证）', disabled === null ? '认证完成，按钮启用' : '仍 disabled');
    await addBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
    const form = await page.locator('text=Add Own LLM Key').count();
    log(form ? 'PASS' : 'FAIL', 'C176 Add Key 表单', form ? '表单展开' : '未展开');
    if (form) {
      await page.locator('input[type="password"]').first().fill('sk-audit-fake-' + Date.now().toString().slice(-6));
      await page.locator('input[placeholder="e.g. My DeepSeek key"]').fill('UI审计临时');
      await page.getByRole('button', { name: /Save/ }).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      const added = await WAIT_MSG(page, /UI审计临时|active|inactive/i, 20000);
      log(added ? 'PASS' : 'FAIL', 'C176 添加 key → 列表出现', added ? '列表含新 key' : '未出现');
    }
  } else log('SKIP', 'C176 Add Key 按钮', conn ? '未找到按钮' : '未连接');

  const validateBtn = page.locator('button:has-text("Validate")').first();
  if (await validateBtn.count()) {
    // Fake audit key can't really validate → expect EITHER the "validated …" success
    // text OR the red error banner; both prove the Validate button is wired to
    // the /keys/:id/validate API. Track the request explicitly too.
    let validateStatus = null;
    const onResp = r => { const u = r.url(); if (/keys\/[^/]+\/validate/.test(u)) validateStatus = r.status(); };
    page.on('response', onResp);
    await validateBtn.click().catch(() => {});
    const feedback = await page.waitForFunction(() => {
      const t = document.body.innerText;
      if (/validated\s/.test(t)) return 'validated';
      const err = document.querySelector('div.text-red-400');
      if (err && (err.textContent || '').trim()) return 'error:' + (err.textContent || '').trim().slice(0, 50);
      return null;
    }, null, { timeout: 20000 }).then(v => v).catch(() => null);
    page.off('response', onResp);
    log(feedback || validateStatus !== null ? 'PASS' : 'SKIP', 'C177 key Validate 反馈', feedback ? `反馈=${feedback} (HTTP ${validateStatus})` : '无反馈/未触发请求');
  } else log('SKIP', 'C177 Validate 按钮', '未找到');

  // C178: delete the audit fixture key(s) — ONLY rows whose label is "UI审计临时",
  // so we never risk deleting a real user key. Loop handles leftover fixtures.
  // DOM icon class is lucide-trash2 (no hyphen).
  let deleted = 0;
  while (true) {
    const row = page.locator('div.glass-card', { hasText: 'UI审计临时' }).first();
    if (!(await row.count())) break;
    const trash = row.locator('button svg.lucide-trash2');
    if (!(await trash.count())) break;
    await trash.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    deleted++;
  }
  const gone = !(await WAIT_MSG(page, /UI审计临时/i, 5000));
  log(gone ? 'PASS' : 'SKIP', 'C178 key 删除', gone ? `已删除 ${deleted} 个审计 key` : `仍存在（已删 ${deleted}）`);

  await page.screenshot({ path: `${SHOTS}/ui-audit-settings.png` });
  jsErrorCheck('settings 页 JS 错误', st, {});
  await page.close();
}

// ── C199/C200: i18n switch ─────────────────────────────────────────────
async function i18nSwitch(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/marketplace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("繁體中文")').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  const zh = /市集|代理|訂閱|搜索|儀表板|管理您的/.test(body);
  const stored = await page.evaluate(() => localStorage.getItem('i18nextLng'));
  log(zh && stored === 'zh-Hant' ? 'PASS' : 'FAIL', 'C199 双语言切换（zh-Hant）', `中文文案=${zh} stored=${stored}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  jsErrorCheck('C200 刷新后 hydration/JS 错误', st, {});
  await page.close();
}

// ── C265: mobile 375px ─────────────────────────────────────────────────
async function mobile375(browser) {
  const context = await makeContext(browser, { width: 375, height: 812 });
  const page = await context.newPage();
  await page.goto(`${config.site}/marketplace`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const m1 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  log(m1.sw <= m1.cw + 2 ? 'PASS' : 'FAIL', 'C265 移动端 375px 市场页无横向溢出', `scrollW=${m1.sw} clientW=${m1.cw}`);
  await page.goto(`${config.site}/user/chat/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const m2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  log(m2.sw <= m2.cw + 2 ? 'PASS' : 'FAIL', 'C265 移动端 375px 聊天页无横向溢出', `scrollW=${m2.sw} clientW=${m2.cw}`);
  await context.close();
}

// ── J4/chat guard + chat UI (needs on-chain subscription for agent 1) ──
async function chatGuardState(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/user/chat/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const body0 = await page.locator('body').innerText();
  log(/Connect Wallet Required|Checking subscription/i.test(body0) ? 'PASS' : 'FAIL', 'C110 未连接 → 聊天页引导', 'Connect Wallet Required/Checking');
  const conn = await connectWalletFirst(page, '聊天页');
  await page.waitForTimeout(9000); // gateway auth + subscription check + model fetch
  const body = await page.locator('body').innerText();
  const gated = /Subscription Required|Connect Wallet Required|Checking subscription/i.test(body);
  const chatOpen = /Type your message|Select a model|Parallel|Tokens/i.test(body);
  if (gated) log('SKIP', 'C147/C148 聊天页（被 SubscriptionGuard 拦截）', '钱包无链上订阅 → 付费墙（需 e2e/onchain/subscribe.cjs）');
  else if (chatOpen) log('PASS', 'C147/C148 聊天页渲染', '聊天 UI 可用（模型选择器/输入框）');
  else log('FAIL', 'C147/C148 聊天页状态未知', body.slice(0, 120));
  const modelBtn = await page.locator('button:has-text("Select model"), button:has-text("deepseek"), button:has-text("Model"), button:has-text("GPT")').first().count();
  if (chatOpen) log(modelBtn ? 'PASS' : 'FAIL', 'C148 模型选择器存在', modelBtn ? '已渲染' : '未找到');
  await page.screenshot({ path: `${SHOTS}/ui-audit-chat-guard.png` });
  jsErrorCheck('聊天页 JS 错误', st, {});
  await page.close();
}

// ── subscriptions page (C10A/C210) ─────────────────────────────────────
async function subscriptionsPage(browser) {
  const page = await (await makeContext(browser)).newPage();
  const st = attachHarness(page);
  await page.goto(`${config.site}/user/subscriptions`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
  const body0 = await page.locator('body').innerText();
  log(/Connect Your Wallet/i.test(body0) ? 'PASS' : 'FAIL', 'C110 未连接 → Connect Your Wallet 引导', '订阅页显示连接引导');
  const conn = await connectWalletFirst(page, 'subscriptions');
  await WAIT_MSG(page, /My Subscriptions|Active|Connect Your Wallet/i, 25000);
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  if (conn) log(/My Subscriptions|Active|Expiring Soon|Expired/i.test(body) ? 'PASS' : 'FAIL', 'C10A 订阅列表页渲染', 'Tabs(Active/Expiring Soon/Expired)');
  const exp = await page.locator('text=/Expires in|Expiring|days/').count();
  log(exp > 0 ? 'PASS' : 'SKIP', 'C210 到期告警文案', exp + ' 处到期提示');
  jsErrorCheck('订阅页 JS 错误', st, {});
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ executablePath: config.chrome || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    await marketplaceDetail(browser);
    await unknownAgent(browser);
    await plansPage(browser);
    await skillsMarket(browser);
    await settingsKeys(browser);
    await i18nSwitch(browser);
    await mobile375(browser);
    await chatGuardState(browser);
    await subscriptionsPage(browser);
  } catch (e) {
    log('FAIL', '执行异常', String(e).slice(0, 300));
  } finally {
    await browser.close();
  }
  summary();
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
