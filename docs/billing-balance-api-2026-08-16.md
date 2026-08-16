# B 端 x402 余额查询 API — SDK 版本更新 + 需求单回复存档

> 日期：2026-08-16 · 关联：R19.7（A2A 按次付费）companion · 提出方：aihunter-saas

## 一、需求背景

R19.7「A2A 多 Agent 编排按次计费」上线后，编排方委派未订阅 Agent 时，服务端自动从 x402 余额按次扣除 0.001 OXA，余额不足返回 `403 AGENT_ACCESS_DENIED`。aihunter-saas 已基于 SDK 接入编排通道（`ConversationClient` / `A2AClient`），但委派前无法程序化预检余额：

- 余额仅在 B 端面板可视化，无 REST / SDK 接口
- SDK v0.11.5 无任何余额查询方法
- 后果：最终用户委派未订阅 Agent 时只能先撞一次 403，再由我方透传错误引导充值——体验差、无效请求多

## 二、交付内容（已上线）

### 2.1 Gateway — `GET /api/v1/billing/balance`

- 只读、幂等、无副作用；鉴权挂载于 api router（`X-Api-Key` / Bearer JWT），401/403 语义与现有接口一致
- 查询维度：默认返回 B 端租户余额；透传 `X-End-User-Id: 0x…` 返回该端用户余额（与 R19.7 端用户透传口径一致）
- 返回字段：

```json
{
  "balance": "1.500000000000000000",
  "balanceWei": "1500000000000000000",
  "currency": "OXA",
  "updatedAt": "2026-08-16T…Z",
  "subject": "0x…",
  "payTo": "0x7099…",
  "priceWei": "1000000000000000"
}
```

- `balance` = OXA 高精度 decimal 字符串；`balanceWei` = 原始 wei（与 `priceWei` 精确比较）
- 余额 0 / 未充值：返回 `"0"`，正常响应不抛错
- `payTo` / `priceWei` 仅当 x402 开启时返回（可选增强，用于构建充值引导页）

### 2.2 SDK — `BillingClient`（@agentxv2/sdk@0.11.6 已发布 npm）

```ts
import { BillingClient } from '@agentxv2/sdk'
const billing = new BillingClient({ gatewayUrl, apiKey: 'agentx_xxx' })

const { balanceWei, priceWei, payTo } = await billing.getBalance()              // 租户余额（默认）
const user = await billing.getBalance({ endUserId: '0x<端用户钱包>' })           // 端用户余额

if (priceWei && BigInt(balanceWei) < BigInt(priceWei)) {
  // 余额不足 → 展示充值引导：向 payTo 转 OXA，充值后自动恢复
}
```

- 鉴权与 `ConversationClient` 一致：`X-Api-Key`（租户 key）或 Bearer JWT
- 余额 0 不抛错；`endUserId` 支持按调用覆盖配置

### 2.3 验收口径对照

| 验收项 | 结果 |
|---|---|
| SDK getBalance() 返回真实余额，与 B 端面板一致 | ✅ 同源（x402_balances 账本） |
| 余额 0 / 未充值：返回 0，不抛错 | ✅ |
| 鉴权失败 401；无权限 403 | ✅ |
| X-End-User-Id 透传返回端用户余额；缺省返回租户余额 | ✅ |
| 充值地址（可选增强） | ✅ `payTo` 返回平台收款地址 |

## 三、重要注意点（务必同步给调用方）

**x402 余额账本按 0x 钱包记账**。存量 B 端租户 `wallet_address` 是逻辑名（如 `partner-aihunter-saas`）、自身无常驻 0x 钱包余额——委派扣费实际落在**端用户 0x 钱包**上。因此：

> 逻辑名租户**必须使用 `getBalance({ endUserId })` 预检**（即委派时会扣费的那个钱包）；默认租户查询恒返回 `"0"`，属正常语义，非余额为 0。

## 四、验证

- gateway：tsc 0 error，测试 82/82（新增 5 例：401 / 租户余额 / 端用户透传 / 零余额 / 增强字段）
- sdk：tsc 0 error，测试 38/38（新增 6 例：apiKey / Bearer / 必填校验 / endUserId / 零余额 / 错误传播）
- 生产：`43.159.60.46:3090/api/v1/billing/balance` 无鉴权 401、无效 key 401、有效 key 200
- 生产 commit：`47ed889`（功能）+ `f78013b`（README 补充说明）

## 五、需求单回复文案（可直接发送）

> **回复：x402 余额查询 API 已交付（sdk@0.11.6 + gateway 已上线）**
>
> 贵方需求已全部实现并上线，验收口径逐条对齐：
>
> **1. 接口（REST + SDK 各一，已交付）**
> - REST：`GET /api/v1/billing/balance`（命名采用我方 `/billing/balance`）
> - SDK：`BillingClient.getBalance()`，`@agentxv2/sdk@0.11.6` 已发布 npm
>
> **2. 查询维度（租户 + 端用户双支持）**
> - 默认返回 B 端租户余额；透传 `X-End-User-Id: 0x…`（SDK 侧 `getBalance({ endUserId })`）返回该端用户余额——与 R19.7 按次扣费的端用户口径完全一致
>
> **3. 返回字段**
> ```json
> {
>   "balance": "1.500000000000000000",
>   "balanceWei": "1500000000000000000",
>   "currency": "OXA",
>   "updatedAt": "2026-08-16T…Z",
>   "subject": "0x…",
>   "payTo": "0x7099…",
>   "priceWei": "1000000000000000"
> }
> ```
> - 余额 0 / 未充值：返回 `"0"`，正常响应不抛错 ✅
> - 鉴权失败 401 / 无权限 403，与现有接口语义一致 ✅
>
> **4. SDK 用法**
> ```ts
> import { BillingClient } from '@agentxv2/sdk'
> const billing = new BillingClient({ gatewayUrl, apiKey: 'agentx_xxx' })
>
> const { balanceWei, priceWei, payTo } = await billing.getBalance()                // 租户余额
> const user = await billing.getBalance({ endUserId: '0x<端用户钱包>' })             // 端用户余额
>
> if (priceWei && BigInt(balanceWei) < BigInt(priceWei)) {
>   // 余额不足 → 展示充值引导：向 payTo 转 OXA，充值后自动恢复
> }
> ```
>
> **5. 升级方式**：`npm install @agentxv2/sdk@0.11.6`（无 breaking changes，现有调用零改动）
>
> **⚠️ 一个重要注意点（与贵方场景直接相关）**：x402 余额账本按 **0x 钱包**记账，而贵方租户（`partner-aihunter-saas`）是逻辑名标识、自身无常驻 0x 钱包余额——委派扣费实际落在**端用户 0x 钱包**上。因此**请务必使用 `getBalance({ endUserId })` 预检**（即委派时会扣费的那个钱包），不要依赖默认租户查询（逻辑名租户恒返回 `"0"`，属正常语义，非余额为 0）。
>
> 文档：[BillingClient 用法](sdk/README.md) · [升级指南](sdk/UPGRADE.md) · [集成示例](docs/sdk-integration-example.md#29-余额预检v0116billingclient委派前查询-x402-余额)

## 六、SDK 版本更新记录（0.11.6）

| 项 | 内容 |
|---|---|
| 版本 | `@agentxv2/sdk@0.11.6`（minor，无 breaking changes） |
| 新增 | `BillingClient` + `GET /api/v1/billing/balance`（B 端余额预检，R19.7 companion） |
| 文档 | README「BillingClient」节 + 版本历史；UPGRADE「0.11.5→0.11.6」；CHANGELOG；sdk-integration-example 2.9；sdk-vs-mcp 版本行 |
| 构建 | dist 已含 BillingClient 导出并随仓库提交 |
