# AgentX 支付层升级方案（全量对齐 OKX APP：x402 v2 / MPP / 稳定币 / a2a-pay + 通用支付模块）

> 版本：0.4（待审阅）
> 决策：① OKX 对齐区间**全部纳入**；② SDK 按「通用支付模块 → agentx 版」分层，**通用层先行**；③ 鉴权采用**分层设计**（链上凭证即支付安全根基，传输层按版本注入）；④ **通用模块零 AgentX 依赖，将来可整体迁出独立维护**。

---

## 一、背景与目标

现有三轨支付（chain / fiat / x402）已发布 SDK 0.8.11 并本地全绿。本次升级目标 = **全量对齐 OKX Agent Payments Protocol**：

| OKX 能力 | 本方案 | 状态 |
|---|---|---|
| x402 v2 三 header（`PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE`） | 字节对齐 | 纳入 |
| scheme `exact` / `exact+Permit2` / `upto` / `aggr_deferred` / `period` | 全量实现 | 纳入 |
| EIP-3009 稳定币 + Permit2 | 双机制 | 纳入 |
| MPP session（open/voucher/topUp/close + 签名复用） | 对齐 | 纳入 |
| 批量/自动结算 | 按阈值定时结算 | 纳入 |
| a2a-pay（paymentId 两阶段） | 实现 | 纳入 |
| quote/pay 两阶段 | 标准 quote 端点 | 纳入 |
| 链上 escrow（TIP-1034） | 平台托管余额（务实差异，channelId 公式兼容可平滑升级） | 差异 |
| 托管钱包（Agentic Wallet/TEE） | 用户自托管（刻意不做） | 差异 |
| 身份 | 无账号依赖，链上凭证即身份 | 更开放 |

设计原则：
1. **协议字节级对齐** x402 v2 字段与 header 命名，标准 x402 客户端可直连。
2. **向后兼容**：v1 `X-PAYMENT` / `x-price` 等头与现有端点全量保留。
3. **资金模型务实**：不引入新 escrow 合约，会话资金托管在平台钱包余额（`x402_balances`），close 记账退还。
4. **通用层先行**：支付能力打包为 `@agentxv2/payments`（通用模块，服务端+通用客户端），`@agentxv2/sdk` 在其上封装 agentx 订阅语义。
5. **鉴权分层**：支付安全靠链上凭证（不可伪造），传输层鉴权按版本注入，详见 §九。
6. **解耦可迁移**：`@agentxv2/payments` 是**零 AgentX 依赖**的独立包（仅依赖 viem/pg 等通用库），业务参数一律透传、账本用自有 schema，将来可整体迁出到其他项目独立维护，AgentX 仅通过 npm 依赖它（详见 §十二）。

---

## 二、总体架构（三层 + 双版本 + 通用层先行）

```
┌────────────────────────────────────────────────────────────┐
│ @agentxv2/sdk（agentx 业务版，依赖通用客户端）                 │
│  SubscriptionPayments（四轨 + 订阅语义）  +  MPPSession        │
│    planId/agentId/订阅状态/访问控制 → 通用客户端              │
└─────────────────────────────┬──────────────────────────────┘
┌─────────────────────────────▼──────────────────────────────┐
│ @agentxv2/payments（通用支付模块 · 零 AgentX 依赖）            │
│  服务端 PaymentsService：createPayment/verifyPayment/         │
│    resolveAccess → Chain/Stripe/X402/MPP/A2A 五 Adapter      │
│  通用客户端：x402Client / mppClient / a2aClient               │
│  自有账本 schema：payment_*（intents/credits/sessions/vouchers）│
│  —— 业务参数走 metadata 透传，无 agentx 概念                 │
└──────────────┬──────────────────────────┬───────────────────┘
       版本 B（AgentX 托管）        版本 A（调用方自建）
       agentx-gateway 内嵌          app.use('/my-payments', router)
       + agentx「订阅 bridge」      或自实现端点调 PaymentsService
       （入账事件 → fiat_subscriptions）
┌──────────────▼─────────────────────────────────────────────┐
│ on-chain：平台钱包收款（原生 / ERC-20 transferWithAuthorization /
│           Permit2）                                         │
└────────────────────────────────────────────────────────────┘
```

依赖方向（单向，可整体迁出）：
```
@agentxv2/payments  ←（npm 依赖）@agentxv2/sdk / agentx-gateway
（无任何 agentx 引用）
```

---

## 三、Phase 1：x402 v2 标准协议（scheme 全量）

### 3.1 三个 base64 header（与 x402.org 字节对齐）

- **`PAYMENT-REQUIRED`**（服务端 → 客户端）：base64 `PaymentRequired`（`x402Version:2`、`error`、`resource`、`accepts[]`、`extensions`）
- **`PAYMENT-SIGNATURE`**（客户端 → 服务端）：base64 `PaymentPayload`（`x402Version:2`、`accepted`、`payload`、`extensions`）
- **`PAYMENT-RESPONSE`**（服务端 → 客户端）：base64 结算回执（`status`、`reference`、`settledAmount`）

`accepts[]` 元素（CAIP-2 网络）：`{ scheme, network, amount, asset, payTo, maxTimeoutSeconds, extra }`。
`asset = 0x0…0` 原生；稳定币为合约地址。`amount` 字符串原子单位。

### 3.2 scheme 全量

| scheme | 语义 | 实现 |
|---|---|---|
| `exact` | 精确金额 | 原生 verifyOnly / token EIP-3009 facilitator |
| `exact+Permit2` | Permit2 预授权 | `permit2.permit` 验签 → `transferFrom` 代执行 |
| `upto` | 上限授权（cap） | 记录 `authorizedAmount` 上限，消费 ≤ cap，过期释放 |
| `aggr_deferred` | 聚合延迟 | = MPP voucher（见 Phase 2），sessionCert 语义 |
| `period` | 授权制订阅 | permit2 一次性授权 n 期 → 每期扣费，无重签 |

### 3.3 两阶段 quote/pay

- `GET /api/v1/payments/quote?url=…`：请求目标 → 解析 402 → 返回标准 challenge（等价客户端 `fetchPaymentChallenge`）
- 客户端 `pay()`：选 scheme → 构造 `PAYMENT-SIGNATURE` → 重放原请求 → 收 `PAYMENT-RESPONSE`
- `x402Guard` 解析顺序：`Authorization: Payment`（session）→ `PAYMENT-SIGNATURE`（v2）→ `X-PAYMENT`（v1 兼容）→ 余额扣减 → 402 challenge

---

## 四、Phase 2：MPP session（高频计费 + 自动结算）

### 4.1 数据模型（`019_x402_sessions.sql`）

```sql
CREATE TABLE IF NOT EXISTS x402_sessions (
  channel_id     TEXT PRIMARY KEY,          -- keccak256(payer,payee,asset,salt,chainId)
  payer          TEXT NOT NULL, payee TEXT NOT NULL,
  chain_id       INTEGER NOT NULL, asset TEXT NOT NULL DEFAULT '0x0',
  deposit_wei    TEXT NOT NULL DEFAULT '0',
  current_cum    TEXT NOT NULL DEFAULT '0',
  spent_wei      TEXT NOT NULL DEFAULT '0',
  last_signature TEXT,
  auto_settle    BOOLEAN NOT NULL DEFAULT TRUE,
  settle_interval_sec INTEGER NOT NULL DEFAULT 86400,
  last_settle_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         TEXT NOT NULL DEFAULT 'open', -- open|closed
  salt TEXT, created_at/updated_at/closed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS x402_vouchers (
  id BIGSERIAL PRIMARY KEY, channel_id TEXT NOT NULL,
  cumulative_amount TEXT NOT NULL, signature TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 EIP-712 Voucher（与 OKX 同构）

```
Voucher(bytes32 channelId, uint256 cumulativeAmount)
domain: { name:"AgentX MPP", version:"1", chainId, verifyingContract:<AGENTX_MPP_DOMAIN> }
```
`viem.verifyTypedData` 本地验签（零 RPC）；单调递增且 ≤ deposit；签名复用（cum 覆盖多笔请求）。

### 4.3 状态机与端点

```
open → (voucher)* → close        （自动结算：按 spend 阈值/时间间隔触发 settle，无需 close）
            ↘ topup ↗
```

| 动作 | 端点 | 关键校验 | 响应 |
|---|---|---|---|
| open | `POST /api/v1/mpp/session/open` | 入金 txHash 验证 + 余额冻结 | `{ channelId, deposit }` |
| voucher | `POST /api/v1/mpp/session/voucher` | 验签 + 单调 + ≤ deposit | `{ accepted, mode: reuse\|sign }` |
| topup | `POST /api/v1/mpp/session/topup` | 新入金验证 | `{ deposit }` |
| settle | `POST /api/v1/mpp/session/settle` | 幂等 | 记账消费 = cum − 已结算 |
| close | `POST /api/v1/mpp/session/close` | 验签 | `{ spent, refund }` 剩余退还 payer 余额 |

### 4.4 批量自动结算

- 服务端按配置阈值自动触发 `settle`（`spent` 达阈值 / 时间间隔），把消费批量记入 `x402_payments`（资金结算台账），close 只处理尾差。
- 目的：与 OKX「定期批量链上结算」对齐——高频消费不必每次写账，定期落库可审计。

---

## 五、Phase 3：稳定币（EIP-3009 + Permit2）

### 5.1 配置

```
X402_STABLECOIN_SEPOLIA=0x…   # 每链稳定币地址（USDC），缺省 = 仅原生
X402_PERMIT2_SEPOLIA=0x…      # Permit2 合约地址（eip155:11155111 为 0x0000…022D）
```

### 5.2 验证路径

- `asset=0x0`（原生）：现有 `verifyAndCredit` 不变（tx.to==payTo && value≥price）。
- **EIP-3009**：验 `transferWithAuthorization` EIP-712 签名（`validAfter/Before` + nonce 防重放）→ gateway 代提交（facilitator）→ 验 `Transfer` 事件（to==payTo）。
- **Permit2**：验 `permit()` 签名 → `transferFrom` 代执行 → 验事件。
- 幂等复用 `x402_payments`；`amount_wei` 按 `asset_decimals` 归一。

### 5.3 `period` 授权制订阅（Phase 1 scheme）

- permit2 一次性授权 n 期总额 → 每期到期 `transferFrom` 扣当期 → 订阅表续期，无重签。
- 与 `fiat_subscriptions`（provider='x402'）打通：授权制订阅复用同一张订阅表与统一访问控制。

---

## 六、Phase 4：a2a-pay（paymentId 两阶段）

- **无 402 的直付路径**：`POST /api/v1/payments/a2a` 创建支付意图 → 返回 `paymentId` + 待付金额/收款方 → 付款方签名确认 → 广播 → gateway 验 receipt 入账。
- 复用 `verifyPayment` 幂等记账；`a2a_payments` 表（paymentId、status、amount、链信息）。
- 适用：显式支付场景（购买/充值），无需 HTTP 402 协商。

---

## 七、SDK 分层（通用层先行）

### 7.1 `@agentxv2/payments`（通用模块，先做）

- **服务端**：`PaymentsService`（`createPayment/verifyPayment/resolveAccess`）+ 五 Adapter（Chain/Stripe/X402/MPP/A2A）+ migrations SQL + 可选 Express router（版本 A 用）。
- **通用客户端**：`x402Client`（quote/challenge/pay/replay）、`mppClient`（open/voucher/topup/settle/close）、`a2aClient`（create/confirm）。**业务无关**（无 agentId/planId 概念）。
- 版本：`@agentxv2/payments@0.1.0`。

### 7.2 `@agentxv2/sdk`（agentx 业务版，依赖通用层）

- `SubscriptionPayments` 重构：四轨 `pay()` 内部调用通用客户端 + agentx 语义（planId/agentId/订阅落库/统一访问控制 `hasAccess`）。
- 新增 `MPPSession`（通用 mppClient + agentx gatewayUrl）。
- 版本：`0.9.0`（API 兼容 0.8.x）。

### 7.3 双版本一致性

- 同一 `PaymentsService` 代码：版本 B（agentx-gateway 内嵌）与版本 A（库形态）行为/表/验证逻辑一致；SDK `gatewayUrl` 可指向任一端点。

---

## 八、数据库迁移（通用模块自有 schema）

> 解耦要求：通用模块**不读不写 agentx 业务表**（`fiat_subscriptions`、`x402_payments` 等归 agentx 侧）。通用账本用 `payment_*` 前缀自有 schema；agentx 订阅通过「订阅 bridge」消费入账事件同步（见 §十二）。

| 迁移（`@agentxv2/payments` 内） | 内容 |
|---|---|
| `001_payment_intents.sql` | `payment_intents`（paymentId、method、asset、amount、payer/payee、status、metadata JSONB、created/updated）——统一支付意图 |
| `002_payment_credits.sql` | `payment_credits`（reference、amount、asset、chain、nonce、intent_id）——入账台账（幂等） |
| `003_payment_sessions.sql` | `payment_sessions` + `payment_vouchers`（MPP 通道） |
| `004_payment_authorizations.sql` | `payment_authorizations`（owner/asset/amount/expiry/nonce/status，Permit2/upto/period 共用） |
| `005_payment_events.sql` | `payment_events`（入账/结算事件队列，供 agentx bridge 等下游消费） |

---

## 九、鉴权设计（分层）

> 结论：**需要鉴权，但分层**。支付安全根基是链上凭证本身（不可伪造），传输层鉴权按版本注入。

| 层 | 保护对象 | 鉴权机制 | 是否内嵌 PaymentsService |
|---|---|---|---|
| 协议凭证层 | `verifyPayment`（txHash/EIP-712/voucher） | 链上签名/tx 验证——凭证伪造即无效，无需额外鉴权 | 不内嵌（协议固有） |
| 传输/API 层 | `createPayment`、session 操作、quote | **版本 A**：调用方自建端点自加（JWT/API key/OAuth 任意）；**版本 B**：AgentX 提供 API key / JWT（SDK `accessToken`），可配置为公开（链上身份即可） | 不内嵌，transport 注入 |
| webhook 层 | `fiat/webhook` | Stripe 签名验签（`whsec`，现有） | 内嵌（必须） |
| 管理面 | 配置/密钥/通道管理 | 管理 API key / 内部网络 | 内嵌（仅内部） |
| 防滥用 | fiat checkout 创建、quote 扫描 | 版本 B：调用方身份（accessToken/API key）+ 速率限制 | 传输层 |

要点：
- 通用模块**不带业务鉴权**（保持通用），通过「transport 注入」策略接缝让调用方决定——版本 A 完全自管，版本 B 用现有 JWT 体系。
- 「钱」的安全永远由链上凭证保证：即使端点公开，伪造的 voucher/tx 也不可能通过 `verifyPayment` 入账。
- Stripe webhook 签名验签、Permit2/EIP-3009 nonce 防重放属于模块内强制项（不可关闭）。

---

## 十、测试计划（本地 harness 扩展）

沿用 `scripts/local-payments/`（anvil + mock Stripe + gateway tsx）。Flow1-3（chain/fiat/x402 订阅）回归全绿前提下新增：

| Flow | 覆盖 | 断言 |
|---|---|---|
| F4 | x402 v2 exact（verifyOnly + EIP-3009 token） | `PAYMENT-REQUIRED` 可解析（v2/accepts[]）；重放后 200 + `PAYMENT-RESPONSE` |
| F5 | MPP session 全流程 | open→voucher(复用多次)→settle→close；refund 正确；自动结算触发 |
| F6 | 稳定币（anvil mock USDC 6 位） | EIP-3009/Permit2 入账按 6 位精度；accepts[] 含稳定币 |
| F7 | period 授权制订阅 | permit2 一期授权 → 每期扣费续订 → 统一访问持续 active |
| F8 | a2a-pay | paymentId → 付款 → 入账 → resolveAccess active |
| F9 | 通用模块版本 A | 独立 express app 挂 `@agentxv2/payments` router，重复 F4-F6 全绿 |
| F10 | 鉴权 | 伪造 voucher/tx 被拒；版本 B accessToken 生效；webhook 错签被拒 |

---

## 十一、统一支付模块（双版本交付）

### 11.1 PaymentsService 统一契约（业务参数透传）

```ts
// 通用契约：只含资金语义，业务参数一律进 metadata（不感知 agentId/planId）
createPayment({
  method: 'chain'|'fiat'|'x402'|'mpp'|'a2a',
  subscriber?, period?, amountCents?, currency?, valueWei?,
  asset?, salt?, scheme?,
  metadata?: { agentId?, planId?, subscriptionId?, ... },  // 透传，原样回写 payment_intents
}) =>
  | { method:'fiat'; sessionUrl; sessionId; redirect:true }
  | { subscriptionId?; channelId?; paymentId?; txHash?; }
verifyPayment(reference, meta) => { creditedWei, balance }
resolveAccess(subscriber, resource, metadata?) => { active }  // 资源维度通用化
```

### 11.2 版本 B（AgentX 托管）

- agentx-gateway 内嵌，暴露：`POST /api/v1/payments`（统一入口）+ `/api/v1/payments/quote`、`/api/v1/mpp/*`、`/api/v1/payments/a2a`；现有 `/api/v1/fiat/*`、`/api/v1/x402/*`、`/api/v1/chain/*` 兼容保留。
- 鉴权：默认公开（链上凭证）+ 可配置 accessToken/API key；webhook 强制签名验签。

### 11.3 版本 A（调用方自建端点）

- 交付 `@agentxv2/payments`：调用方 `app.use('/my-payments', createRouter(payments))` 或完全自实现端点；端点路径/鉴权/业务语义全由调用方掌控；调用方自配 Stripe key / DB / 合约地址。

---

## 十二、解耦与可迁移性（核心约束）

> `@agentxv2/payments` 是独立资产，将来可能迁出 AgentX 仓库到其他项目独立维护。以下规则为**硬约束**。

### 12.1 代码解耦

- 独立目录（与 `sdk/`、`gateway/` 平级的 `payments/`），**不 import 任何 agentx 代码**（sdk/gateway/contracts）。
- 允许依赖：`viem`、`pg`（或纯 SQL）、`express`（可选，仅 router）、`ethers`（可选）。业务库零依赖。
- 将来迁移 = 移动目录 + npm 发布，AgentX 侧零代码改动（仅升级依赖版本）。

### 12.2 业务解耦（metadata 透传）

- 契约只含资金语义：`method/asset/amount/payer/payee/period/凭证`。
- `agentId/planId/subscriptionId` 等一律经 `metadata` 透传，原样落 `payment_intents.metadata`（JSONB），模块不解释、不校验、不消费。

### 12.3 数据解耦（自有 schema + 事件）

- 通用模块只读写 `payment_*` 表；agentx 的 `fiat_subscriptions` / `x402_*` / 访问控制表**归 agentx 侧**。
- 入账与结算通过 `payment_events`（事件表/出站队列）向下游暴露；agentx「订阅 bridge」消费事件 → 更新订阅表（现 webhook→订阅 的落库逻辑抽为 bridge）。

```
@agentxv2/payments                    agentx 侧
  payment_credits 入账
    → payment_events 事件
        ──────────────────→ 订阅 bridge（agentx-gateway 内）
                              └→ fiat_subscriptions / 访问控制
```

### 12.4 配置解耦（构造注入）

- 全部配置经构造函数注入：`{ db, stripe?, chain?, permit2?, settlePolicy? }`；**不读全局 env**，不依赖 agentx config。
- agentx-gateway 组装时把自身 env 映射注入（仅版本 B 做这层映射）。

### 12.5 版本 B 的 bridge 职责（agentx 侧代码）

- `gateway/src/services/payments-bridge.ts`：消费 `payment_events` → 更新 `fiat_subscriptions`（含 chain/fiat/x402/mpp/a2a 各轨的订阅映射）、维护统一访问控制。
- 现有 `routes/fiat.ts` / `services/x402.ts` 中的落库逻辑**抽离到 bridge**，路由变薄（只做传输）。

### 12.6 迁移演练（验收）

- P6 验收附加项：在独立空仓库 `npm pack @agentxv2/payments` 解包后（或直接以独立目录）`npm test` 全绿，证明零 agentx 引用。

---

## 十三、兼容与安全

- **兼容**：v1 头与 `X-PAYMENT` 保留；`/api/v1/x402/subscribe` 契约不变；SDK 0.8.x 调用不变。
- **安全**：voucher 验签+单调+≤deposit+防重放；EIP-3009/Permit2 验时间窗+nonce；金额全字符串原子单位，精度按 decimals 归一；session 状态共享 Postgres 支持多实例。

---

## 十四、实施顺序与验收标准

| 阶段 | 交付 | 验收 |
|---|---|---|
| P0 | `payments/` 独立目录：PaymentsService + Chain/Stripe/X402 Adapter + `001/002` 迁移 + 通用客户端雏形 | 现有 Flow1-3 经通用模块回归绿；`grep agentId payments/` 仅出现在 metadata 类型 |
| P1 | x402 v2（header + quote + scheme exact/upto）+ 中间件升级 | F4 绿 |
| P2 | MPP session + 自动结算（`003`）+ mppClient | F5 绿 |
| P3 | 稳定币 EIP-3009 + Permit2（`004`） | F6 绿 |
| P4 | period 授权制订阅 + a2a-pay（`005` 事件） | F7/F8 绿 |
| P5 | 鉴权注入 + 版本 B：统一端点 `/api/v1/payments` + 订阅 bridge（落库抽离） | F10 绿；F4-F8 经统一端点全绿 |
| P6 | 版本 A 发布 + SDK 0.9.0 重构（通用层先行）+ 文档（README/UPGRADE）+ npm publish | F9 绿；独立目录 `npm test` 全绿（解耦演练）；集成方按文档接入两版本 |

---

## 十五、附：与 OKX 对照（最终）

| 维度 | OKX APP | 本方案 |
|---|---|---|
| challenge/凭证/回执 | `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE` | 字节对齐 |
| schemes | exact / exact+Permit2 / upto / aggr_deferred / period | 全量对齐 |
| session | escrow 合约 + TEE | 平台托管余额 + 钱包签名（voucher 同构；可平滑迁移链上 escrow） |
| 稳定币 | EIP-3009 | EIP-3009 + Permit2 |
| a2a-pay | paymentId | 对齐 |
| 批量结算 | 定期链上结算 | 按阈值自动 settle + close 尾差 |
| 身份 | OKX 账号/API key | 无账号依赖，链上凭证即身份；版本 B 可配 API key |
| 交付形态 | Payment SDK + APP | 通用模块 `@agentxv2/payments` + agentx 版 SDK 双版本 |
