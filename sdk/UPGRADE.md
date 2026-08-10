# @agentxv2/sdk Upgrade Guide

## v0.11.1 → v0.11.3（2026-08-10，建议升级）

> 跟随 `@0xinfrax/payments` `^0.1.3`（R17.6）。`SubscriptionPayments` + 协议客户端（MPP/A2A/Period/X402/Payments）**API 签名不变**，HTTP 契约不变，**无需改代码**，仅建议升级依赖。

### 为什么建议升级（尤其 ESM 调用方）

- **0.11.1 的 ESM 构建存在崩溃**：其 `dist/index.mjs` 从 `@0xinfrax/payments` 导入 `A2AClient`，而该导出在引擎 0.1.2 起已移除 → 使用 ESM 构建的调用方启动即报 `Named export 'A2AClient' not found`。
- **0.11.2 修复**：`A2AClient` 改为 SDK 本地实现（签名一致），ESM/CJS 均不再依赖该导出。
- **0.11.3（本次发布）**：引擎升至 `0.1.3`（模块内置恢复 a2a/period rails，AgentX Gateway 已迁移为模块委托），`PAYMENT_VERSION` 对齐 `0.1.3`；`A2AClient` 继续本地实现。

### 迁移动作

- 锁精确版本者：`npm install @agentxv2/sdk@0.11.3`。
- 使用 `^0.10.1` / `^0.11.x` 范围者：`npm install` 即可自动吸收。
- 若曾以 ESM 方式使用 0.11.1，请务必升到 ≥0.11.2（0.11.3 含修复）。
- `PAYMENT_VERSION` 常量由 `0.1.1` → `0.1.3`，仅当调用方断言该版本号时需要同步。

---

## 2026-08-08 — B 端集成 key 能力澄清（文档，无代码变更）

> 无需升级 SDK（npm 未发布新版本）。本说明只澄清**服务端行为**与**调用方最佳实践**，SDK API 完全不变。

### 一个 `agentx_` key 即可，不需要两把 key

- **现状（2026-08-08 起）**：Gateway 对「会话 / 并行任务」的能力判定已统一为 **P9 能力位**（`effective = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true`），对 B 端集成 key（`X-Api-Key: agentx_...`）与注册用户 JWT（`Authorization: Bearer`）**一视同仁**。
- B 端集成 key 不再只限于对话（chat）——创建会话（`createSession`）、提交并行任务（`createTask`）、查询 / 列表 / 取消任务与注册用户**完全等价**（受同一套餐 / 租户能力位约束）。
- 不再存在 `403 PARTNER_TASKS_DISABLED`；能力位为 false 时统一返回 `403 { code: "PARALLEL_TASKS_DISABLED" }`，此时回退单轮 `chat()`。
- 仅两种场景仍需「用户身份」（设计如此，非限制遗漏）：**MCP 通道**的对话 / 任务工具（仅接受注册用户 `access_token`）与 **A2A 上链 / 发布 / 订阅**（用户自己钱包签名、自己付 gas）。

### 调用方请使用自己的 LLM Key 透传（BYOK）

任务 / 对话的 LLM 计费默认走平台兜底 key；平台推荐调用方**透传自己的 LLM key**，计费落在自己账户，三种方式：

| 方式 | SDK 用法 | 说明 |
|---|---|---|
| 无状态透传（最高优先级） | 构造 `ConversationClient({ llmApiKey, llmEndpoint, llmModel })` | 每个请求自动带 `X-Llm-Api-Key` / `X-Llm-Endpoint` / `X-Llm-Model`，key 不落盘 |
| 请求级透传 | `stream({ ..., tenantKeyId })`（v0.8.6 起） | 用已在平台 Settings 保存的租户自有 key，明文不出服务器 |
| HTTP 直接调用 | `X-Llm-Api-Key` 请求头 | 等价 SDK 的 `llmApiKey` |

> 未传任何 LLM key 时走平台兜底 key（DeepSeek / OpenAI 平台配额），受租户配额限制。
>
> ⚠️ **B 端（partner）任务强制 BYOK**（2026-08-08 起）：partner 租户创建任务必须携带 `X-Llm-Api-Key` header / `llmApiKey` / `tenantKeyId` 之一，否则 `400 { code: "LLM_KEY_REQUIRED" }`；对话（chat）与 user 类租户不受此限制。

### 端用户订阅转发（B 端代调，Gateway 2026-08-08）

B 端（partner 租户）请求带 `X-End-User-Id: 0x<钱包地址>`（或 body `endUserId`）时，网关改用该钱包做「拥有 / 订阅」授权检查，通过即放行对话 / 任务——实现「我的最终用户已订阅 → 我可代为对话」。不传或非 `0x` 地址时回退到租户自身授权；端用户记忆隔离不变。

> ⚠️ **`endUserId` 是可选字段，缺省**不会**被拒**（2026-08-08 澄清）：不传时授权主体回退为**租户自身钱包**——注册用户（kind=user）租户钱包即用户钱包，**天然可用**；partner 租户不传 `0x` 端用户钱包则**不代理**（退化为租户自身 `partner-*` 地址，非链地址无法命中链上订阅，链上授权失败时返回 `403 AGENT_ACCESS_DENIED`），但这与「缺 `endUserId` 被拒绝」语义不同——不存在「必须带 endUserId」的强制校验。非 `0x` 的 `endUserId` 仅作记忆隔离，不触发订阅转发。

### B 端 key 与用户 JWT 调用 sessions/tasks 的差异对照

两者在「会话 / 并行任务」能力判定上一致（统一 P9 能力位），其余维度差异如下：

| 维度 | B 端集成 key（`X-Api-Key: agentx_...`，kind=partner） | 用户 JWT（`Authorization: Bearer`，kind=user） |
|---|---|---|
| 会话 / 并行任务（sessions/tasks） | ✅ 可用，受 P9 能力位约束（`403 PARALLEL_TASKS_DISABLED`） | ✅ 同左 |
| 授权主体（谁须「拥有 / 订阅」agent） | partner 租户自身；或 `X-End-User-Id: 0x<钱包>` 转发到端用户钱包 | 用户自己的钱包 |
| 任务 LLM Key | ⚠️ **强制 BYOK**：`X-Llm-Api-Key` header / `llmApiKey` / `tenantKeyId` 三者之一，否则 `400 LLM_KEY_REQUIRED` | 不强制；未传时走平台兜底 key |
| 平台 MCP 对话 / 任务工具（`agentx_gateway_*`） | ❌ 不可用（R14 拒绝 `agentx_` key） | ✅ 可用（`access_token` 必填） |
| A2A 上链 / 发布 / 订阅 | ❌ 需用户钱包签名（平台不持私钥） | ✅ 用户钱包签名，用户自付 gas |
| 订阅状态查询（`GET /api/v1/chain/check-subscription`） | ✅ 可查任意钱包地址 | ✅ 同左 |

> 一句话总结：**`agentx_` key 覆盖 REST 全部对话 + 并行任务（带 BYOK），JWT 额外覆盖 MCP 对话/任务与链上操作**；调用方按自身场景选择，无需两把 key 并存。

### SDK 0.10.1 — per-request `endUserId`（已发布 npm，2026-08-08）

新增（non-breaking，`endUserId` 全程可选）：

- `ConversationChatParams.endUserId?` — `stream({ ..., endUserId })` 作为 `X-End-User-Id` header 发送（覆盖构造级）
- `ConversationCreateTaskParams.endUserId?` — `createTask({ ..., endUserId })`：请求体透传 + 仓库级加固统一以 `X-End-User-Id` header 发送（覆盖构造级；Gateway 优先 header、回退 body，老客户端 body 透传仍兼容）
- `createSession({ ..., endUserId })` 原本已支持（请求体透传）

```ts
// B 端代调：按最终用户订阅授权
const session = await client.createSession({ agentId: 42, endUserId: '0x<user-wallet>' })
const t = await client.createTask({ sessionId: session.id, agentId: 42, message: 'hi', endUserId: '0x<user-wallet>' })
```

### SDK 0.10.2 — createTask `endUserId` header 加固发版（已发布 npm，2026-08-08）

将 0.10.1 发布后的**仓库级加固**正式纳入 npm 版本（纯 patch，无行为变化，调用方零改动）：

- `createTask()` 的 per-request `endUserId` 与 `stream()` 机制完全一致——统一以 `X-End-User-Id` header 发送（覆盖构造级）。0.10.1 的已发布版本走请求体透传（Gateway 优先 header、回退 body），两版行为兼容
- 文档同步：`tenantKeyId` **严格按租户隔离**——Key 轮换 / 切换租户后必须用新 Key 重新调 `POST /api/v1/tenant/keys` 存 BYOK 并更新 `tenantKeyId`，沿用旧租户的 ID 会报 `400 Tenant API key not found or inactive`

### SDK 0.10.3 — exports 暴露 `./package.json`（已发布 npm，2026-08-08）

纯元数据 patch，无行为变化：

- `exports` 新增 `"./package.json": "./package.json"`——此前 `require('@agentxv2/sdk/package.json')` 报 `ERR_PACKAGE_PATH_NOT_EXPORTED`（exports 模式下未列出的子路径全部禁止），现在可直接读取版本：`require('@agentxv2/sdk/package.json').version`
- 对调用方无影响（正常 API 子路径不变）；仅为工具链 / 运维提供版本读取能力

---

## v0.9.6 → v0.10.0 (完整功能版)

### What's New

`0.10.0` is the **complete feature release** — it consolidates the entire 0.9.x line (Agent application categories / unified three-rail payments / sessions & parallel tasks / streaming tool_call fix / typed on-chain approval) into a stable baseline. Released via `npm version minor` (not a patch) to avoid version clutter.

| Feature | Description |
|---------|-------------|
| **Complete release baseline** | Same code as 0.9.6, but published as a minor release to signal the stable, feature-complete SDK baseline. Integrators should pin `@agentxv2/sdk@0.10.0`. |
| **Typed `onchain_approval_required` event** | `ConversationSSEEvent.type` now includes `'onchain_approval_required'`, carrying `approval?: OnChainApprovalRequest { targetAgentId, taskType, inputData }`. Raised when the agent requests an **auditable on-chain A2A delegation** — the **user's own wallet** must submit `createTask` (the user pays the gas and becomes the on-chain client). The platform never pays gas and holds no signing key (`A2A_WORKER_PRIVATE_KEY` removed from the Gateway). |
| **User-wallet-signed on-chain rail** | v0.10.0 gas model: on-chain rail costs are never paid by the platform. When the user explicitly requests audit / settlement, the Conversation Service emits `onchain_approval_required`, the frontend opens a wallet modal, and the user's wallet signs `createTask`. Sub-tasks spawned by the a2a-worker run **off-chain inline** (local negative pseudo taskIds). |
| **No breaking changes** | Everything is additive. 0.9.x consumers can upgrade in place. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.10.0   # or: npm install @agentxv2/sdk (latest = 0.10.0)
```

> The Gateway + Conversation Service must run the matching server release for the user-wallet-signed on-chain orchestration rail (2026-08-08).

---

## v0.9.4 → v0.9.5

### What's New

| Feature | Description |
|---------|-------------|
| **Fix: streaming tool_call parameter deltas dropped** | DeepSeek / OpenAI streaming `tool_calls` chunks only carry an `index` on argument-delta chunks (the first chunk carries the `id`). The SDK previously built `callId` as `tc.id ?? call_${tc.index}`, which stopped matching the `tool_call_start` id on later deltas — so **accumulated tool arguments were silently discarded** and tool calls failed with incomplete/malformed arguments. Both `GatewayProvider` and `OpenAIProvider` now maintain an `index → id` map, so argument deltas attach to the real call id and all parameters are preserved. |
| **No breaking changes** | Pure bug fix. `LLMProvider` stream event contract unchanged. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.9.5   # or: npm install @agentxv2/sdk (latest = 0.9.5)
```

### Related: server-side orchestration layering

No SDK API change, but the Conversation Service now defaults multi-agent orchestration to the **off-chain rail** (`agentx_delegate`, synchronous, zero cost) and only uses the **on-chain rail** (A2A task with `taskId` audit trail) when the user explicitly requests audit / settlement. See the SDK README → *Multi-Agent Orchestration Layering*.

---

## v0.9.3 → v0.9.4

### What's New

| Feature | Description |
|---------|-------------|
| **Agent application categories** | `AgentPayload` gains an optional `category` field typed as `AgentCategory` (one of `AGENT_CATEGORIES` — 13 enums: `operations` / `customer-service` / `sales` / `personal-assistant` / `coding` / `server-monitoring` / `airdrop` / `quant-trading` / `data-analysis` / `content` / `security` / `finance` / `other`). `publishAgent` writes it into the public metadata + on-chain attrs; `getAllAgents()` / `getAgentMetadata()` resolve `category` (tokenURI JSON first, on-chain attrs fallback). The AgentX Studio UI now requires it; Marketplace filters by it. |
| **Payments engine 0.2.2** | `@agentxv2/payments` `^0.2.0` now resolves to **0.2.2** (ownership metadata: `author` / `repository` / `homepage` on the npm package — no code / API change). |
| **No breaking changes** | Everything is additive. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.9.4   # or: npm install @agentxv2/sdk (latest = 0.9.4)
```

The Gateway + Conversation Service must run the matching server release for `category` filtering and the off-chain orchestration tools (`agentx_list_agents` / `agentx_delegate`).

### Publish with a category

```ts
import { publishAgent, AGENT_CATEGORIES } from '@agentxv2/sdk'

const result = await publishAgent({
  agent: {
    name: 'Airdrop Hunter',
    description: 'Monitors and reports new airdrop opportunities on-chain.',
    category: 'airdrop',                    // ← new: application category (AGENT_CATEGORIES value)
    // ... rest of the AgentPayload unchanged
  },
  publicKey,
  uploader,
})
```

### Related: server-side orchestration layering

No SDK API change, but the Conversation Service now defaults multi-agent orchestration to the **off-chain rail** (`agentx_delegate`, synchronous, zero cost) and only uses the **on-chain rail** (A2A task with `taskId` audit trail) when the user explicitly requests audit / settlement. See the SDK README → *Multi-Agent Orchestration Layering*.

## v0.9.2 → v0.9.3

### What's New

| Feature | Description |
|---------|-------------|
| **Generic engine 0.2.0** | `@agentxv2/payments` upgraded to `^0.2.0` — adds **MPP payment channels**, **stablecoin rails (EIP-3009 / Permit2)**, **period authorizations** (one-time N-period pre-authorization, no re-signing) and **a2a-pay** (two-phase paymentId). |
| **New protocol clients re-exported** | `MPPClient` (open/voucher/topUp/settle/close), `A2AClient` (create/settle), `PeriodClient` (charge/authorization), plus `X402Client` / `PaymentsClient`, are now exported from the SDK root for integrators who drive those rails directly. |
| **No breaking changes** | `SubscriptionPayments` API is unchanged (chain / fiat / x402 / hasAccess / fetchX402Info). The new exports are additive. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.9.3   # or: npm install @agentxv2/sdk (latest = 0.9.3)
```

The Gateway you point at must run the matching payments release (MPP/period/a2a endpoints under `/api/v1/payments/mpp/*`, `/api/v1/payments/a2a/*`, `/api/v1/payments/period/*`).

### Drive the new rails

```ts
import { SubscriptionPayments, MPPClient, A2AClient, PeriodClient } from '@agentxv2/sdk'

const base = { baseUrl: 'https://gw.example.com' }
const mpp = new MPPClient(base)          // payment channels
const a2a = new A2AClient(base)          // two-phase paymentId
const period = new PeriodClient(base)    // period authorizations
```

### Engine 0.2.1 — browser / bundler compatibility

`@agentxv2/payments` `^0.2.0` resolves to **0.2.1** (a patch release). It removes every Node built-in module usage (`node:crypto` / `Buffer`) in favour of the **Web Crypto API** (`crypto.randomUUID` / `getRandomValues` / `crypto.subtle` HMAC / pure-base64 helpers) — the engine is now safe to bundle with webpack / Next.js. Previously, the SDK root re-export pulled `node:crypto` into the browser module graph and failed with `UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins`.

- **No SDK API change** — `SubscriptionPayments` and the re-exported protocol clients are unaffected.
- **One 0.2.x internal change**: `StripeAdapter.verifyWebhookSignature()` is now `async` (Web Crypto `subtle` is asynchronous). Direct `StripeAdapter` consumers need `await`; the Gateway's `handleWebhook` already does.
- `PAYMENT_VERSION` stays `'0.2.0'` — the engine API surface did not change between 0.2.0 and 0.2.1.

## v0.8.11 → v0.9.2

### What's New

| Feature | Description |
|---------|-------------|
| **Unified payments endpoint** | `SubscriptionPayments` now talks to the Gateway's unified endpoint `/api/v1/payments` for the **fiat** rail (checkout with auto-pricing), the **x402** rail (native-token period subscription) and the **access** check (`hasAccess()`). Under the hood it uses `PaymentsClient` from the new generic engine [`@agentxv2/payments`](https://www.npmjs.com/package/@agentxv2/payments) (`^0.1.0`, installed automatically as a dependency). |
| **One transport for every rail** | fiat / x402 / access all hit `/api/v1/payments/*`; `chain` still subscribes directly on the `SubscriptionManager` contract (no Gateway needed). `fetchX402Info()` now reads the unified `/api/v1/payments/info` rails-discovery payload. |
| **Decoupled payment engine** | `@agentxv2/payments` is a zero-AgentX-dependency module (chain / Stripe / x402 adapters, PaymentError codes, intent lifecycle, event queue) — the same engine the Gateway itself embeds. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.9.2   # or simply: npm install @agentxv2/sdk (latest = 0.9.2)
```

The Gateway you point at must expose the unified endpoint (`/api/v1/payments`) — upgrade your Gateway to the matching release. The old `/api/v1/fiat/*`, `/api/v1/x402/*` and `/api/v1/chain/check-subscription` endpoints remain for backward compatibility.

### Use Multi-Rail Payments (unchanged API)

```ts
import { SubscriptionManager, SubscriptionPayments } from '@agentxv2/sdk'

const sm = new SubscriptionManager({ contractAddress, publicClient, walletClient })
const payments = new SubscriptionPayments({
  gatewayUrl: 'https://gw.example.com', // required for fiat / x402 rails
  subscriptionManager: sm,              // required for chain rail & x402 auto-funding
  walletClient,
  chain: 'oxachain',
})

// chain rail — on-chain escrow subscription
await payments.pay({ method: 'chain', planId: 1, agentId: 3 })

// fiat rail — returns a Stripe checkout URL (amount auto-priced from the plan)
const { sessionUrl } = await payments.pay({ method: 'fiat', planId: 1, agentId: 3, subscriber: '0xabc' })
window.location.assign(sessionUrl)

// x402 rail — auto-funds the native-token payment, then registers access
await payments.pay({ method: 'x402', planId: 1, agentId: 3, subscriber: '0xabc' })

// unified access check across all rails
const ok = await payments.hasAccess(3, '0xabc')
```

### Breaking Changes

None — `pay()`, `hasAccess()`, `fetchX402Info()` and all result types are unchanged. The only behavioral difference is that fiat / x402 / access requests are routed through `/api/v1/payments` (requires the upgraded Gateway).

## v0.8.9 → v0.9.0 (Browser Control)

### What's New

| Feature | Description |
|---------|-------------|
| **Browser Skill — more actions** | `executeBrowserAction()` gains `hover`, `press` (keyboard events), `select` (SELECT value / checkbox+radio checked), `back` / `forward` (history), `getInfo` (url/title/readyState/viewport/scrollY) |
| **Richer DOM snapshot** | `extractAccessibleDOM()` now annotates `name` / `role` / `aria-label`, form `value` (input/textarea/select), `checked` state for checkbox/radio, and `target` for anchors — the snapshot is actionable for the agent |
| **Async pacing helper** | new `sleep(ms)` export for agent loops that need delays between actions |
| **Better element matching** | `findElement` fallback also matches the `name` attribute, not just text/placeholder/aria-label |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.9.0
```

### Use the extended skills

```ts
import { executeBrowserAction, extractAccessibleDOM, sleep } from '@agentxv2/sdk/skills'

executeBrowserAction({ type: 'hover', description: 'settings menu' })
executeBrowserAction({ type: 'select', selector: '#chain', value: 'oxachain' })
executeBrowserAction({ type: 'press', value: 'Enter' })
executeBrowserAction({ type: 'getInfo' })   // → { url, title, viewport, ... }
await sleep(300)
```

No breaking changes — all additions are new action types / fields; existing calls behave as before.

## v0.8.10 → v0.8.11

### What's New

| Feature | Description |
|---------|-------------|
| **Multi-rail subscription payments** | New `SubscriptionPayments` class — a single entry point for subscribing across all AgentX payment rails: `chain` (on-chain SubscriptionManager, native/ERC20 escrow), `fiat` (Stripe card checkout via the Gateway — no wallet needed), `x402` (native-token period payment verified by the Gateway). `pay({ method, planId, agentId, subscriber, ... })` dispatches to the right rail; `hasAccess()` runs the unified chain-OR-fiat/x402 access check; `fetchX402Info()` discovers the x402 price/pay-to wallet. |
| **Fiat checkout without hardcoded amounts** | `_payFiat()` no longer requires `amountCents` — the Gateway derives the USD amount from the on-chain plan price (`/api/v1/fiat/checkout` with `planId`, priced via `FIAT_TOKEN_USD_PRICE`). Explicit `amountCents` still wins when supplied (backward compatible). |
| **x402 auto-funding** | When no `txHash` is supplied, `pay({ method: 'x402', ... })` automatically sends the native-token payment from a configured `walletClient` (max of plan price / protocol price), then registers the subscription via the Gateway. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.11   # or simply: npm install @agentxv2/sdk (latest = 0.8.11)
```

### Use Multi-Rail Payments

```ts
import { SubscriptionManager, SubscriptionPayments } from '@agentxv2/sdk'

const sm = new SubscriptionManager({ contractAddress, publicClient, walletClient })
const payments = new SubscriptionPayments({
  gatewayUrl: 'https://gw.example.com', // required for fiat / x402 rails
  subscriptionManager: sm,              // required for chain rail & x402 auto-funding
  walletClient,
  chain: 'oxachain',
})

// chain rail — on-chain escrow subscription
await payments.pay({ method: 'chain', planId: 1, agentId: 3 })

// fiat rail — returns a Stripe checkout URL (amount auto-priced from the plan)
const { sessionUrl } = await payments.pay({ method: 'fiat', planId: 1, agentId: 3, subscriber: '0xabc' })
window.location.assign(sessionUrl)

// x402 rail — auto-funds the native-token payment, then registers access
await payments.pay({ method: 'x402', planId: 1, agentId: 3, subscriber: '0xabc' })

// unified access check across all rails
const ok = await payments.hasAccess(3, '0xabc')
```

### Breaking Changes

None — all additions are new exports; `amountCents` became optional (it was previously required, but supplying it still works identically).

## v0.8.9 → v0.8.10

### What's New

| Feature | Description |
|---------|-------------|
| **Master-key crypto helpers** | `encryptWithKey()` / `decryptWithKey()` — AES-256-GCM with wire format `base64(IV[12] ‖ authTag[16] ‖ ciphertext)`, byte-for-byte compatible with the Gateway's legacy at-rest key encryption (`gateway/src/lib/crypto.ts`). Use them to read/write tenant key material stored encrypted with the Gateway master key. New code should prefer `aesEncrypt`/`aesDecrypt` unless data in this layout must be read. |
| **`parseTokenURIJSON` exported** | `import { parseTokenURIJSON } from '@agentxv2/sdk'` — the fault-tolerant tokenURI parser is now public (previously internal to the Gateway indexer / SDK `AgentRegistry`). |
| **`createTask()` raw-string input** | `A2AProtocol.createTask(agentId, taskType, input)` now accepts `input: string \| Record<string, unknown>`. Pass pre-serialized JSON or plain text directly; objects are still JSON-stringified. Fully backward compatible. |
| **Subscription status mapping fix** | `SubscriptionManager.getSubscription()` now maps the on-chain enum (`0=Inactive, 1=Active, 2=Expired, 3=Cancelled`) to the typed `AgentSubscription['status']` correctly. The previous positional array `['active','expired','cancelled','pending']` mislabeled `Inactive` as `active`, `Active` as `expired`, `Expired` as `cancelled`, and `Cancelled` as `pending` — a wrong status on essentially every subscription. Now `pending` / `active` / `expired` / `cancelled` match the contract. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.10   # or simply: npm install @agentxv2/sdk (latest = 0.8.10)
```

### Use Master-Key Crypto

```ts
import { encryptWithKey, decryptWithKey } from '@agentxv2/sdk'

const ciphertext = encryptWithKey(plaintext, masterKeyHex)   // base64(IV ‖ tag ‖ ciphertext)
const plain = decryptWithKey(ciphertext, masterKeyHex)
```

### Breaking Changes

None — all additions are new exports; the `createTask` input type is a widening, and the subscription status fix only corrects values that were previously wrong.

## v0.8.8 → v0.8.9

### What's New

Docs sync only — README Installation now points at **v0.8.8** ("just install to use the sessions & parallel-tasks client"). Same code as 0.8.8.

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.9   # or simply: npm install @agentxv2/sdk (latest = 0.8.9)
```

No breaking changes.

## v0.8.7 → v0.8.8

### What's New

Docs sync only — README updated to v0.8.7 (sessions & parallel tasks section + version history). Same code as 0.8.7.

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.8
```

No breaking changes.

## v0.8.6 → v0.8.7

### What's New

| Feature | Description |
|---------|-------------|
| **Parallel Tasks client** | `ConversationClient` gains session/task APIs: `createSession()`, `createTask()`, `getTask()`, `listTasks()`, `cancelTask()`, `getCapabilities()`. `createTask()` returns immediately with the task row (`status: queued`); execution runs in the background (DeerFlow Thread/Run model). |
| **Integrator capability gate (P9)** | `GET /api/v1/tenant/me` now returns `capabilities.parallel_tasks` + `parallel_tasks_override`. When the effective flag is false (plan feature or tenant override), `createTask()` is rejected with **HTTP 403** `{ error, code: "PARALLEL_TASKS_DISABLED" }` — surfaced as `ConversationTaskError` with `.status`/`.code`. Callers should degrade to single-turn `chat()`. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.7
```

### Use Parallel Tasks

```ts
import { ConversationClient, ConversationTaskError } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({ gatewayUrl: 'https://...', accessToken })

// (optional) check the integrator's capability first
const caps = await client.getCapabilities()
if (!caps.parallelTasks) {
  // tenant/plan disallows multi-task → fall back to single-turn client.chat(...)
}

const session = await client.createSession({ title: 'Audit' })
const task = await client.createTask({
  sessionId: session.id,
  agentId: 42,
  message: 'Analyze this contract',
  enableMemory: false,
})
// task.status === 'queued' — poll getTask() or stream SSE events

try {
  await client.cancelTask(task.id)
} catch (err) {
  if (err instanceof ConversationTaskError && err.code === 'PARALLEL_TASKS_DISABLED') {
    // tenant not allowed to run parallel tasks
  }
}
```

### Breaking Changes

None — all additions are new methods.

## v0.8.0 → v0.8.6

### What's New (0.8.1 → 0.8.6)

| Version | Feature | Description |
|---------|---------|-------------|
| **0.8.6** | **Stored BYOK (`tenantKeyId`)** | `ConversationChatParams` gains `tenantKeyId` — use a tenant-owned API key already saved & AES-encrypted on the Gateway (managed via Settings → Own LLM Keys, backed by `/tenant/keys`). The Gateway resolves the key server-side and injects it as `X-Llm-Api-Key` (priority over request-level headers) — the plaintext key never leaves the server. Complements the stateless `llmApiKey` override (request-level, highest priority). |
| **0.8.5** | Docs sync | Re-published with updated README (same code as 0.8.4). |
| **0.8.4** | Gateway JWT auth + abort + tool_result error | `ConversationClient` supports Gateway JWT auth (`accessToken` → `Authorization: Bearer`, alternative to `apiKey`) and external abort (`stream(params, { signal })`); `tool_result` event gains optional `error` field. |
| **0.8.3** | Install fix | `wagmi` promoted from optional to required peer dependency — directly usable via `npm install @agentxv2/sdk@0.8.3` (no manual `wagmi` install). |
| **0.8.2** | Write-op signing fix | `createPlan()` / `subscribe()` / `releaseFunds()` / `cancel()` resolve the full viem `walletClient.account` instead of a bare address string — local/private-key signers now work (`eth_sendRawTransaction`). |
| **0.8.1** | Fault-tolerant tokenURI | `parseTokenURIJSON()` aligned with Gateway indexer: base64 trailing garbage cleanup, unterminated JSON repair, regex fallback, explicit `ipfs://` handling. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.6
```

### Use Stored BYOK (v0.8.6)

```ts
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
})

// Use a tenant-owned key already saved in Settings → Own LLM Keys
// (plaintext key never leaves the server — Gateway decrypts and injects it)
const result = await client.chat({
  agentId: 42,
  message: 'Analyze this contract',
  tenantKeyId: 'key-01HX...',   // NEW: stored BYOK
})

// Streaming with external abort (v0.8.4) + stored BYOK
const controller = new AbortController()
for await (const event of client.stream(
  { agentId: 42, message: 'hello', tenantKeyId: 'key-01HX...' },
  { signal: controller.signal }
)) {
  if (event.type === 'text') console.log(event.content)
}
```

**LLM key resolution order (current)**:

```
1. tenantKeyId (stored tenant-owned key, server-side) — priority over request headers
2. X-Llm-Api-Key + X-Llm-Endpoint + X-Llm-Model (request-level, stateless BYOK — highest priority)
3. tenant_llm_configs (tenant-persisted key, encrypted storage)
4. OPENAI_API_KEY env (AgentX official key)
5. AgentX Gateway fallback
```

### Breaking Changes

None. 0.8.1 → 0.8.6 are purely additive — existing calls behave as before.

---

## v0.7.5 → v0.8.0

### What's New

| Feature | Description |
|---------|-------------|
| **IdentityRegistry batch query** | `getAllAgents(options)` — batch pull with `fromId`/`toId`/`activeOnly`/`capabilities` filters; `totalAgents()` reads the contract directly (no more binary search); `getAgentMetadata(agentId)` returns structured `{ name, description, encryptedPayloadCid, eciesEncryptedKey, publicPayloadCid, capabilities, skills, isActive }`. |
| **SubscriptionManager writes** | `createPlan()` now returns `planId` parsed from the `PlanCreated` event; `subscribe()` returns `subscriptionId/expiresAt/subscriber` parsed from the `Subscribed` event (previously always `0`). |
| **Typed period enum** | `createPlan({ period })` now only accepts `'day' | 'week' | 'month' | 'year'` (runtime-validated). These are the only values the contract maps to real durations — passing `'monthly'` / `'quarterly'` / `'yearly'` silently created a 30-day plan on-chain. |
| **subscribeToEvents()** | `import { subscribeToEvents } from '@agentxv2/sdk'` — viem-based event stream (`Transfer` / `AgentRegistered` / `PlanCreated` / `Subscribed`), returns an `unwatch()` function. Drop sync latency from 2-min polling to < 15s. |
| **createPlanAndSubscribe()** | One-shot `createPlan` + `subscribe` helper. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.8.0
```

### Breaking Changes

1. **`createPlan({ period })`** — TypeScript now rejects values outside `day|week|month|year`, and a runtime guard throws for anything else. If you previously passed `'monthly'`/`'quarterly'`/`'yearly'`, map them to `'month'`/`'month'`(quarterly is not expressible in 30-day units)/`'year'` — or better, fix the contract duration expectations.
2. **`subscribe()` return type** — now includes `subscriptionId`, `expiresAt`, `subscriber`, `agentId`. No field was removed.
3. Everything else is purely additive.

### Example

```ts
import { AgentRegistry, SubscriptionManager } from '@agentxv2/sdk'

const registry = new AgentRegistry({ contractAddress, publicClient, walletClient })
const total = await registry.totalAgents()
const agents = await registry.getAllAgents({ activeOnly: true, capabilities: ['trading'] })

const sm = new SubscriptionManager({ contractAddress, publicClient, walletClient })
const { planId } = await sm.createPlan({ agentId: 1, price: 1n, period: 'month' })
const sub = await sm.subscribe(planId)
console.log(sub.subscriptionId, sub.expiresAt)
```

---

## v0.7.4 → v0.7.5

### What's New

| Feature | Description |
|---------|-------------|
| **AgentLoop respects provider model** | `AgentLoop` no longer forces `ctx.model ?? 'gpt-4o'` on every LLM call. Model priority is now `ctx.model` → `provider.model` → `gpt-4o`. Any provider configured with a non-default model (e.g. BYOK DeepSeek `deepseek-v4-pro`) now works inside the loop. |

**Why this matters**: previously a provider built with `model: 'deepseek-v4-pro'` still sent `gpt-4o` to the model API inside the loop (the loop's `request.model` always won), so non-OpenAI providers errored with `you passed gpt-4o`. This also silently broke the Conversation Service tenant DB model config.

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.5
```

No breaking changes — explicit `ctx.model` still takes precedence; only the fallback behavior changed.

---

## v0.7.3 → v0.7.4

### What's New

| Feature | Description |
|---------|-------------|
| **BYOK model override** | `ConversationClient` adds `llmModel` — forwarded as `X-Llm-Model`. Combined with `llmApiKey` + `llmEndpoint`, callers now control key + endpoint + model per request (e.g. DeepSeek `deepseek-v4-pro`). |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.4
```

### Example

```ts
const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
  llmApiKey: 'sk-deepseek-...',
  llmEndpoint: 'https://api.deepseek.com/v1',
  llmModel: 'deepseek-v4-pro',          // NEW
})

const result = await client.chat({ message: 'hello' })
```

No breaking changes — existing calls behave as before.

---

## v0.7.2 → v0.7.3

### What's New

| Feature | Description |
|---------|-------------|
| **Stateless BYOK (key + endpoint)** | `ConversationClient` adds `llmEndpoint` — forwarded as `X-Llm-Endpoint` alongside `X-Llm-Api-Key`. Callers now supply their own LLM key **and** endpoint (e.g. DeepSeek `https://api.deepseek.com/v1`) per request, with zero AgentX-side configuration or key storage. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.3
```

### Use Your Own LLM Key + Endpoint (DeepSeek example)

```ts
const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
  llmApiKey: 'sk-deepseek-...',
  llmEndpoint: 'https://api.deepseek.com/v1',   // NEW
})

const result = await client.chat({ message: 'hello' })
```

No breaking changes — existing calls behave as before.

---

## v0.7.1 → v0.7.2

### What's New

| Feature | Description |
|---------|-------------|
| **Clarification Interruption** | `ConversationSSEEvent` adds `clarification` + `question`; `chat()` returns `result.clarification` when the service interrupts an ambiguous request instead of running tools. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.2
```

### Handle Clarification

```ts
const result = await client.chat({ agentId: 42, message: 'help me' })
if (result.clarification) {
  // surface the question to the user, re-submit with clarified intent
  showPrompt(result.clarification)
} else {
  console.log(result.text)
}
```

No breaking changes — existing calls behave as before.

---

## v0.6.9 → v0.7.0

### What's New

| Feature | Description |
|---------|-------------|
| **ConversationClient** | `@agentxv2/sdk/conversation` — remote Conversation Service client. SSE streaming via Gateway `POST /api/v1/agent/runs`; auto-sends `X-Api-Key`, `X-End-User-Id` (end-user memory isolation), `X-Llm-Api-Key` (BYOK). |
| **Direct MCP Skill Execution** | Gateway Agent-as-MCP `tools/call` executes the agent's skill directly (`execution.type`: `mcp` / `http`) instead of a second LLM pass. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.7.0
```

### 1. Use ConversationClient

```ts
import { ConversationClient } from '@agentxv2/sdk/conversation'

const client = new ConversationClient({
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'agentx_...',
  endUserId: 'user-123',   // optional: per-end-user memory isolation
})
const result = await client.chat({ agentId: 42, message: 'Hello' })
```

### Breaking Changes

None. v0.7.0 is purely additive (new `conversation` module + Gateway-side behavior change). All v0.6.9 APIs remain fully compatible.

---

## v0.6.8 → v0.6.9

### What's New

| Feature | Description |
|---------|-------------|
| **AgentLoop Memory** | Cross-session memory with `memory: { enabled: true }` config. Stores/recalls facts via MemoryProvider interface. |
| **Context Engineering** | Token budget management via `contextBudget` config. Auto-summarizes old conversation turns when exceeded. |
| **Observability** | TraceEmitter interface — structured trace events for tool_call, tool_result, session_complete. Noop fallback when disabled. |
| **Browser Control Skill** | `@agentxv2/sdk/skills` — `executeBrowserAction()`, `extractAccessibleDOM()` for browser-based agent actions. |
| **New Sub-path Exports** | `@agentxv2/sdk/memory`, `@agentxv2/sdk/traces`, `@agentxv2/sdk/skills` |
| **Conversation Service** | New independent microservice (`@agentxv2/conversation`) for AgentLoop execution with pgvector memory |
| **Skills Marketplace** | Gateway endpoints for skill CRUD (public GET, JWT POST, admin review) |
| **Agent-as-MCP** | JSON-RPC 2.0 endpoint `POST /mcp/agent/:id` exports any AgentX agent as an MCP server |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.6.9
```

### 1. Enable Memory in AgentLoop

```ts
const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  memory: {
    enabled: true,
    provider: new HttpMemoryProvider({ baseUrl: 'http://localhost:8100' }),
    storeOnSessionEnd: true,
  },
})
```

### 2. Enable Trace Observability

```ts
import { HttpTraceEmitter } from '@agentxv2/sdk/traces'

const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  trace: {
    enabled: true,
    emitter: new HttpTraceEmitter({ endpoint: 'http://localhost:8100/traces' }),
  },
})
```

### 3. Context Budget (auto-compaction)

```ts
const loop = new AgentLoop({
  ctx,
  llmProvider: provider,
  contextBudget: 8000,  // auto-summarize when token budget exceeded
})
```

### Breaking Changes

None. All v0.6.8 APIs remain fully compatible.

### New API Routes (Gateway)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/agent/runs` | POST | SSE-streamed Agent conversation (proxied to Conversation Service) |
| `/api/v1/agent/skills` | GET/POST | Skills marketplace CRUD |
| `/mcp/agent/:agentId` | POST | JSON-RPC 2.0 agent-as-MCP export |
| `/api/v1/traces/sessions` | GET | List trace sessions |
| `/api/v1/traces/session/:sessionId` | GET | Session trace details |

---

## v0.6.7 → v0.6.8

### What's New

| Feature | Description |
|---------|-------------|
| **Platform Tools Fix** | Fixed broken import paths in `platform-tools/` after module split (definitions.ts, executor.ts, index.ts). All 8 entry points now build correctly (CJS + ESM + DTS). |
| **Frontend Modularization** | 3 God Components split into 14 focused files: AgentCardManager (5 files), AgentRegistration (4 files), RevenueDisplay (5 files). No SDK API changes. |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.6.8
```

### Breaking Changes

None. All v0.6.7 APIs remain fully compatible. This is a patch release with only internal build fixes.

### Technical Details

The platform-tools module was previously split into `platform-tools/definitions.ts` and `platform-tools/executor.ts` with a `platform-tools/index.ts` barrel. However, the sibling `platform-tools.ts` re-export file created a name collision with the directory, causing DTS generation to fail. The fix:

- `agent-loop/index.ts`: Import from `./platform-tools/index` instead of `./platform-tools`
- `agent-loop/platform-tools.ts`: Re-export `./platform-tools/index` explicitly  
- `platform-tools/definitions.ts`: Fixed import paths (added `../` prefix for correct depth)
- `platform-tools/executor.ts`: Fixed import paths + added missing `RunnableSkill` and `buildPlatformTools` imports

---

## v0.6.3 → v0.6.4

### What's New

| Feature | Description |
|---------|-------------|
| **IPFSUploader** | Upload to IPFS via Pinata REST API or custom endpoint. Supports JSON, files, and encrypted payload upload. |
| **publishAgent()** | One-shot pipeline: encrypt agent private payload → upload to IPFS → return CIDs ready for on-chain minting. |
| **IPFS Platform Tools** | AgentLoop tools: `agentx_ipfs_upload`, `agentx_ipfs_upload_encrypted`, `agentx_ipfs_get_url` |
| **Sub-path Export** | `@agentxv2/sdk/ipfs` — tree-shakeable IPFSUploader import |

### Upgrade Steps

```bash
npm install @agentxv2/sdk@0.6.4
```

### 1. Replace manual IPFS upload with publishAgent()

**Before (v0.6.3):**

```ts
import { generateAesKey, encryptPayload, packAgentForPublish } from '@agentxv2/sdk'

const aesKey = generateAesKey()
const encrypted = encryptPayload(privatePayload, aesKey)
const packResult = packAgentForPublish(agentPayload, publicKey, aesKey)
// Manually upload encrypted.data to IPFS (not provided by SDK)
// Manually upload agent metadata to IPFS (not provided by SDK)
```

**After (v0.6.4):**

```ts
import { IPFSUploader, publishAgent } from '@agentxv2/sdk'

const uploader = new IPFSUploader({ pinataJwt: 'eyJ...' })

const result = await publishAgent({ agent, publicKey, uploader })
// result.encryptedCid, result.publicCid — ready for on-chain minting
```

### 2. Use IPFSUploader directly

```ts
import { IPFSUploader } from '@agentxv2/sdk/ipfs'

const uploader = new IPFSUploader({
  pinataJwt: 'eyJ...',           // required for Pinata
  // customEndpoint: '...',      // alternative to Pinata
  gatewayUrl: 'https://ipfs.io', // default
})

// Upload JSON
const { cid, url } = await uploader.uploadJSON({ key: 'value' })

// Upload encrypted agent payload
const { cid } = await uploader.uploadEncryptedPayload(encryptedPayload, 'agent-name')
```

### 3. AgentLoop IPFS tools

The following tools are now available in AgentLoop:

| Tool Name | Description |
|-----------|-------------|
| `agentx_ipfs_upload` | Upload JSON data to IPFS |
| `agentx_ipfs_upload_encrypted` | Encrypt and upload agent payload |
| `agentx_ipfs_get_url` | Build public gateway URL from CID |

### Breaking Changes

None. All v0.6.3 APIs remain fully compatible.

### Pinata Setup

1. Go to [pinata.cloud](https://pinata.cloud) → API Keys
2. Create a key with `pinFileToIPFS` and `pinJSONToIPFS` permissions
3. Copy the JWT token
4. Pass it to `IPFSUploader({ pinataJwt: '...' })`
