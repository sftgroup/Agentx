# 支付与第三方集成架构（Payment Architecture）

> 讨论 AgentX 的订阅结算体系：现状（链上全自动）、法币/x402 扩展评估、第三方集成结合模式与平台分成处理。
> 更新：2026-08-05

---

## 1. 核心模型：订阅 = 结算层 + 访问控制层

AgentX 当前将两层层层绑定在链上，但两者可以解耦、分别替换：

```
结算层       SubscriptionManager v2（escrow 托管 / platformFeeBps 平台费 / ETH+ERC20 / trial）
访问控制层   Gateway（校验订阅状态 → 放行 agent-runs / MCP / 租户 API）
```

法币 / x402 只替换或叠加**结算层**；访问控制始终由 Gateway 完成。因此可以在**不改链上合约**的前提下扩展支付方式。

---

## 2. 现状：链上订阅与自动分成

### 2.1 订阅流

1. Agent 创建套餐：`createPlan(agentId, price, period, payToken?, trialDays?)`（SDK / 合约）
2. 用户（钱包）订阅：`subscribe(planId)` → 付款进 **escrow 托管**
3. 试用期结束后：`releaseFunds(subscriptionId)` 释放资金
4. 取消：试用窗口内全退；之后取消无退款

### 2.2 平台分成 — 链上合约全自动（无需任何线下/链下逻辑）

`_releaseToCreator`（[SubscriptionManager.sol#L347-L392](https://github.com/sftgroup/Agentx/blob/main/contracts/src/SubscriptionManager.sol)）：

```
platformCut   = amountPaid * platformFeeBps / 10000   // 生产 = 250 bps = 2.5%
creatorAmount = amountPaid - platformCut              // 直接付给 creator
platformFeesCollected[token] += platformCut           // 平台累计，可随时 withdrawPlatformFees
```

- 无论**谁**订阅（终端用户直付 / 第三方批发订阅），资金都进 escrow，释放时按同一规则自动分成
- 第三方促成订阅但**完全不碰资金、不处理分成**——分成由合约执行
- 释放前提：`block.timestamp >= trialEndsAt`（试用期结束）

> 含义：**"第三方订阅走 SDK，平台分成怎么处理"的答案 = 无需处理，链上合约自动完成**。第三方只是促成一笔标准链上订阅。

---

## 3. x402 与法币概览

| | 法币订阅（Stripe 类） | x402（按次微支付） |
|---|---|---|
| 模型 | 周期性订阅，SaaS 化 | **按请求付费**，无订阅无账户 |
| 协议 | 支付网关 webhook | HTTP 402 + `x-price`/`x-pay-to`/`x-network` 头，稳定币链上结算 |
| 适用 | C 端用户（无钱包） | AI Agent 自主调用、微支付（$0.001 级） |
| 与 MCP | — | 天然组合（MCP server 收费中间件） |
| 生态 | 成熟 | 2026.7 Linux Foundation 正式运营（Visa/Stripe/Amazon 等 40 家） |

---

## 4. 问题 A：AgentX 是否原生接受法币 / x402？

**可以，两条低侵入路径（均不改链上合约）：**

### A1 法币订阅门卫（订阅模型法币化）

```
最终用户 ──信用卡/支付宝──► Stripe 订阅 ──webhook──► fiat_subscriptions 表
                                                          │
Gateway 访问控制中间件：链上订阅 OR 法币订阅 任一有效 → 放行
```

- 新增：`fiat_subscriptions` / `fiat_payouts` 表 + Stripe webhook + 访问控制中间件扩展 + 前端支付 UI
- **分成**：法币结算与链上独立——webhook 收款后按平台费率拆（可复用 `platformFeeBps` 数值）：平台留成 → creator 记应收（链上钱包打款或法币打款账户）
- 适用：无钱包 C 端订阅；**解决"用户没钱包"的唯一现实路径**

### A2 x402 按次通道（按次模型补通道）

```
AI Agent ──请求──► Gateway 付费端点 ──(无订阅)──► HTTP 402 + x-price/x-pay-to
AI Agent ──X-PAYMENT──► 校验链上付款 ──► 记账/额度 → 放行
```

- 新增：402 中间件 + 额度账本 + 平台收款钱包（收款稳定币进平台钱包，后续链上结算或记账）
- **分成**：收款集中到平台钱包 → 结算时按比例拆给 creator（链下记账，定期打款）
- 适用：无订阅的 AI Agent 自主调用；与链上订阅**并存**

**评估**：短期需求不足，两方案均为"有真实需求再上"。优先级 A1 > A2（C 端无钱包是更现实痛点）。

---

## 5. 问题 B：第三方集成结合模式（AgentX 原生不支持法币/x402 时）

### B1 中间人两层结算模式（推荐，零改动）

```
第三方平台（SaaS）
 ├─ 面向终端用户：法币订阅 / x402 按次计费（第三方自建，AgentX 无感知）
 └─ 面向 AgentX：
     ① 批发订阅：第三方服务器钱包，SDK `subscribe` 链上计划（可订阅多个 plan）
     ② 访问代理：用户请求 → 第三方后端 → Gateway（X-Api-Key 租户）→ agent-runs / MCP
```

- **批发→零售**：第三方把链上订阅当批发额度，零售给无钱包用户（法币）或 AI 客户（x402）
- **分成**：① 链上自动分成不变（合约按 `platformFeeBps` 分给 creator + 平台）；② 第三方零售价差是第三方自己的商业行为，与 AgentX 分成无关
- 现有支撑：Gateway 租户 `X-Api-Key`（agent-runs / tenant 工具）、SDK `createPlan`/`subscribe`、BYOK 透传（`X-Llm-Model`）
- **唯一门槛**：第三方需持有链上钱包做批发订阅

### B2 x402 桥接（第三方自开 402 端点）

- 第三方把自己的 API 端点（代理 AgentX）挂 x402 中间件：收到 USDC → 内部调 Gateway
- AgentX 完全无感知；分成同 B1（链上自动）

### B3 直接链上直付（最简单）

- 终端用户直接用钱包 + SDK 订阅 AgentX 链上计划——本来就是标准流程，无"结合"问题
- 适合已持有钱包的用户；B1 是为"无钱包用户"服务的补充

---

## 6. 渠道分成（Referral / Affiliate）— 分成给引荐平台且可追溯

**场景**：A 平台引导其用户订阅 AgentX 链上计划，AgentX 应把部分平台费分成给 A 平台（渠道费），且每笔分成可追溯、可对账。

### 6.1 方案对比

| | 方案 1：链上原生（改合约） | 方案 2：链下归因（推荐） |
|---|---|---|
| 做法 | `subscribe(planId, referrer)` + `channelFeesCollected[token][channel]` | DB 归因表 + 平台费让利 + 链上事件对账 |
| 追溯 | 链上最强 | 链上事件哈希（txHash/blockNumber）+ DB 记录，可审计 |
| 成本 | 新部署合约 + SDK/MCP/前端全链路升级 | 仅 Gateway 新增表 + 接口 |
| 上线 | 重，现有合约已生产 | 轻，可立即实施 |

**结论**：渠道归因本质是运营数据（谁带来的用户），链下记录 + 订阅事件溯源已满足"可追溯"；**推荐方案 2**。

### 6.2 分成规则（平台费让利，不动 creator 收入）

```
链上自动（不变）：creator 97.5% + 平台 2.5%（platformFeeBps=250）
渠道让利（链下）  ：平台从自己的 2.5% 中，按渠道 share_bps 分给 A 平台
                   例：A 平台 share_bps=125 → A 得订阅额 ×1.25%，平台实得 ×1.25%
```

- **不削减 creator 收入**（creator 仍拿 97.5%）
- 渠道费来自平台费，比例按渠道单独配置（`channels.share_bps`）

### 6.3 归因与追溯设计（Gateway 新增）

```
A 平台 ──链接(带 ?ref=CHANNEL_ID)──► 用户 ──subscribe(planId)──► 链上 escrow
                                        │
                    前端上报 /api/v1/channel/attribute（subscriber, agentId, channelId）
                                        │
                    channel_attributions 表（UNIQUE(subscriber, agent_id, channel_id) 防重复）
                                        │ 对账
                    GET /api/v1/channel/report?channelId=&from=&to=
                    → 每笔：subscriber / amountPaid / txHash / blockNumber / 应得分成
```

**表设计**（`007_channel_attributions.sql`，风格对齐 006）：

```sql
-- 渠道配置（分成比例/收款地址）
CREATE TABLE IF NOT EXISTS channels (
  id         VARCHAR(64) PRIMARY KEY,      -- A 平台标识
  name       TEXT NOT NULL,
  share_bps  INTEGER NOT NULL DEFAULT 0,   -- 平台费让利（相对订阅额，如 125 = 1.25%）
  wallet     TEXT,                          -- 链上打款地址
  active     BOOLEAN NOT NULL DEFAULT true
);

-- 订阅 → 渠道归因（可追溯：每行绑定链上事件）
CREATE TABLE IF NOT EXISTS channel_attributions (
  id            SERIAL PRIMARY KEY,
  subscriber    TEXT NOT NULL,             -- 订阅钱包地址
  agent_id      INTEGER NOT NULL,
  plan_id       INTEGER,
  channel_id    VARCHAR(64) NOT NULL REFERENCES channels(id),
  source        TEXT,                       -- 链接/二维码/API 渠道来源
  amount_paid   TEXT,                       -- wei 字符串（对齐 subscription_plans 风格）
  tx_hash       TEXT,                       -- Subscribed 事件 txHash（链上溯源）
  block_number  INTEGER,
  expires_at    BIGINT,
  settled       BOOLEAN NOT NULL DEFAULT false,  -- 是否已结算给渠道
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscriber, agent_id, channel_id)      -- 防重复归因
);
CREATE INDEX IF NOT EXISTS idx_channel_attributions_channel ON channel_attributions(channel_id);
```

**接口**（Gateway）：
- `POST /api/v1/channel/attribute` — 前端订阅流程上报归因（subscriber, agentId, channelId, txHash）
- `GET /api/v1/channel/report` — 渠道对账报表（该渠道全部归因订阅 + amountPaid + 应得分成 = `amountPaid × share_bps / 10000`）
- 结算：AgentX 从 `platformFeesCollected` 提取后按报表链上打款渠道钱包，标记 `settled=true`

**可选增强（自动对账）**：indexer 增加 Subscribed 事件 watcher，把订阅记录落 `subscription_events` 表，与归因表按 `(subscriber, agent_id)` join 自动核对金额/txHash——当前未落库，属增量建设。

### 6.4 场景闭环

- A 平台用户订阅 → 链上 escrow → `releaseFunds` 自动分成（creator + 平台）→ 平台按归因表让利给 A 平台
- 追溯链路：`channel_attributions.tx_hash` → explorer 验证真实订阅 → 对账报表可审计

---

## 7. 决策树

```
第三方要什么？
├─ 用户有钱包，直接链上订阅           → B3（现状即可，无需任何新建设）
├─ 用户无钱包，需法币订阅             → B1 中间人模式（第三方自建法币结算）
│     └─ 若第三方要求我们托管法币      → A1 法币订阅门卫（需 Gateway 开发）
├─ AI Agent 自主按次调用，稳定币计费   → B2 x402 桥接（第三方自开 402 端点）
│     └─ 若要求我们原生 402            → A2 x402 按次通道（需 Gateway 开发）
├─ 引荐用户订阅，要渠道分成且可追溯    → §6 链下归因（channels + channel_attributions）
│     └─ 若要链上原生 referrer         → 改合约（成本高，暂不建议）
└─ 不确定                             → 先 B1/B3（零改动），需求明确后再评估
```

## 8. 结论

- **平台分成在链上已全自动**（escrow + `platformFeeBps` 拆分），第三方集成不需要额外分成机制
- **法币/x402 是结算层的可选扩展**，访问控制始终在 Gateway，可叠加、可共存、不影响链上订阅
- **第三方集成的推荐路径**：B1 中间人模式（零改动）；原生法币（A1）仅在出现明确 C 端无钱包需求时实施
- **渠道分成**：走 §6 链下归因（平台费让利 + DB 归因 + 链上事件对账），可追溯、可审计，不动 creator 收入

## 9. 实现状态（2026-08-05 已上线）

三项方案的技术层已在 Gateway 落地（commit `5d04895`），生产已部署：

| 方案 | 交付物 | 状态 |
| --- | --- | --- |
| §6 渠道归因 | migration `007_channel_attributions`、`POST /api/v1/channel/attribute`、`GET /api/v1/channel/report`、前端 subscribe 成功后经 `?ref=` 上报 | ✅ 生产可用（归因幂等，分成=amountPaid×shareBps/10000） |
| A1 法币订阅 | migration `008_fiat_subscriptions`、`POST /api/v1/fiat/checkout`、`POST /api/v1/fiat/webhook`（HMAC 验签）、`GET /api/v1/fiat/status` | ⏸ 代码已上线，惰性生效：未配 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` 时 checkout/webhook 返回 503 |
| A2 x402 | migration `009_x402`、`POST /api/v1/agent/runs` 402 门卫、`GET/POST /api/v1/x402/info\|verify\|balance\|paywall`、`X-PAYMENT` 头验证 + 余额账本 | ⏸ 代码已上线，惰性生效：未设 `X402_ENABLED=true` + `X402_PAY_TO` 时放行，不改变现有行为 |

**启用前置条件**（外部依赖，非代码问题）：
- 渠道归因：向 `channels` 表插入渠道配置（id/name/share_bps/wallet）即可，无外部依赖
- 法币：需要 Stripe 商户账号 + 合规主体，配置两个密钥并到 Stripe 后台注册 webhook
- x402：需要稳定币/原生代币结算通道与收款钱包地址，配置 `X402_ENABLED` + `X402_PAY_TO`
