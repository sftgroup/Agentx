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

## 6. 决策树

```
第三方要什么？
├─ 用户有钱包，直接链上订阅           → B3（现状即可，无需任何新建设）
├─ 用户无钱包，需法币订阅             → B1 中间人模式（第三方自建法币结算）
│     └─ 若第三方要求我们托管法币      → A1 法币订阅门卫（需 Gateway 开发）
├─ AI Agent 自主按次调用，稳定币计费   → B2 x402 桥接（第三方自开 402 端点）
│     └─ 若要求我们原生 402            → A2 x402 按次通道（需 Gateway 开发）
└─ 不确定                             → 先 B1/B3（零改动），需求明确后再评估 A1/A2
```

## 7. 结论

- **平台分成在链上已全自动**（escrow + `platformFeeBps` 拆分），第三方集成不需要额外分成机制
- **法币/x402 是结算层的可选扩展**，访问控制始终在 Gateway，可叠加、可共存、不影响链上订阅
- **第三方集成的推荐路径**：B1 中间人模式（零改动）；原生法币（A1）仅在出现明确 C 端无钱包需求时实施
