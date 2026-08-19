# ERC-4337 自动续订（t9）— 详细测试用例

> 范围：gateway `aa-autorenew.ts` 服务 / `routes/auto-renew.ts` / 迁移 `026_aa_auto_renew.sql` / 前端 `AutoRenewCard` + `lib/auto-renew.ts`
> 依赖：`@0xinfrax/aa-sdk@0.1.1`、aa-relay、Kernel v3 oxachain 栈、SubscriptionManager v3（`0x019AC9d945467478Dd371CDbD70cb2f325800E6B`）
> 生成日期：2026-08-18

---

## 0. 关键事实（测试断言依据）

| 事实 | 值 |
|---|---|
| 合约枚举 | `Inactive=0, Active=1, Expired=2, Cancelled=3`（`contracts/src/SubscriptionManager.sol`） |
| `subscribe(uint256)` selector | `0x0f574ba7` |
| Kernel v3 | 0.3.0-beta（initialize 4 参数），EntryPoint v0.7；**aa-relay 必须设 `AA_OXACHAIN_KERNEL_VERSION=0.3.0-beta`**，否则 session 账户地址按 0.3.1 编码（无法部署，链上 revert） |
| enable 签名组合 | `signature = hook(20B) ‖ abi.encode(validatorData, hookData, executeSelector, enableSig, userOpSig)` |
| enableSig | **owner 对 EIP-712 enableDigest 的裸 ECDSA（eth_sign，32B 输入）**，非 personal_sign(EIP-191) |
| userOpSig（enable） | `sessionId(32B) ‖ agent/sessionKey(userOpHash)` |
| userOpSig（续订调用） | `sessionId(32B) ‖ agent/sessionKey(userOpHash)` |
| enableDigest 依赖 | `currentNonce`（部署后 =1，部署前 =0）→ **必须先部署再算 digest** |
| 资金路径 | Kernel `receive()` 将转入账户的 ETH 自动转 EntryPoint deposit（自付 gas）；`getAccountFunding` 读 native + `balanceOf(EP)` 双保险 |
| 续订窗口 | 默认到期前 86400s 内 / 过期后 86400s 内（`AA_AUTO_RENEW_WINDOW_SEC`） |
| 续订冷却 | 10min（`RENEW_COOLDOWN_MS`）防收据确认/指针前移前重复提交 |
| 会话有效期 | 默认 730 天（`AA_AUTO_RENEW_SESSION_DAYS`），countLimit=366（`AA_AUTO_RENEW_MAX_COUNT`） |
| 计费 token | ETH 计划 `pay_token = 0x0` 才支持自动续订（ERC20 计划链上 `subscribe` 会 revert `No ETH for ERC20 plans`） |

---

## 1. Fixtures

- **userEoa**：已连接钱包（oxachain 持有 OXA，可 `eth_sign` / `personal_sign`）
- **deployer**：`AA_DEPLOYER_PRIVATE_KEY` 对应地址（oxachain 有 OXA 余额）
- **agent/plan**：已上链 agent + ETH 计费 plan（price=0.001 OXA，active）
- **sub**：`chain_subscriptions` 中 userEoa 的 Active(status=1) 订阅
- **relayMock**：mock `POST /v1/session`、`POST /v1/userops`、`POST /v1/session/disable`（返回 `{code:0, data:{...}}`）
- **aaMock**：mock `@0xinfrax/aa-sdk`（导出 `estimateFeesPerGas/encodeKernelFactoryData/predictWithFactoryGetAddress/isAccountDeployed/buildEnableSessionUserOp/signEnableUserOp/buildSessionUserOp/validateSessionCall/PrivateKeySigner`）

---

## 2. 服务层单元测试（gateway/src/services/aa-autorenew.ts）

### 2.1 配置与开关
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 1 | 功能开启 | `AA_AUTO_RENEW_ENABLED=true` + URL + Key | 调 `isAutoRenewEnabled()` | `true` |
| 2 | 缺 Key 关闭 | 未设 `AA_RELAY_API_KEY` | 同上 | `false`（安全默认） |
| 3 | 缺 URL 关闭 | 未设 `AA_RELAY_URL` | 同上 | `false` |
| 4 | 总开关关闭 | `AA_AUTO_RENEW_ENABLED=false` | 同上 | `false` |

### 2.2 relayRequest
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 5 | 成功 | relayMock 返回 code=0 | `POST /v1/session` | 返回 `data` |
| 6 | 业务错误 | 返回 code!=0 | 同上 | 抛错含路径 + message |
| 7 | HTTP 错误 | 返回 500 | 同上 | 抛错 |
| 8 | 超时 | fetch 30s 不返回 | 同上 | 抛错（AbortError） |
| 9 | 鉴权头 | — | 断言请求头 | 携带 `x-api-key: AA_RELAY_API_KEY` |
| 10 | URL 尾部斜杠 | 配置 `https://…/aa-relay/` | 拼接 | 无 `//` 重复 |

### 2.3 policy 序列化往返
| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| 11 | bigint 无损 | `stringifyPolicy` → `parsePolicy` | validAfter/validUntil/valueLimit/dailyLimit/tokenLimits 数值不变 |
| 12 | 非法 JSON | `parsePolicy('{bad')` | 抛错 |
| 13 | 缺 validUntil | parse 无该字段 | 抛错（`BigInt(undefined)`） |
| 14 | tokenLimits 缺省 | policy 无 tokenLimits | 不崩，默认 `[]` |

### 2.4 ensureAccountDeployed
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 15 | 已部署 | `isAccountDeployed=true` | 调用 | 返回 true，**不**发部署交易 |
| 16 | 未部署 + 无 deployer key | 未配 `AA_DEPLOYER_PRIVATE_KEY` | 调用 | 抛错 `AA_DEPLOYER_PRIVATE_KEY not configured` |
| 17 | 地址不一致 | relay 地址 ≠ 复算 `factory.getAddress` 预测 | 调用 | 抛错 `account address mismatch`（**防部署错账户**） |
| 18 | 地址一致 | 预测 = relay 地址 | 调用 | 发 `to: factory, data: factoryData` 交易并等收据，返回 true |
| 19 | 部署 RPC 失败 | 余额不足/网络错误 | 调用 | 抛错，不透传 tx |
| 20 | 收据超时 | waitForTransactionReceipt 挂起 | 调用 | 抛错（可重试） |

### 2.5 getAccountFunding
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 21 | 双零 | 账户无资金 | 调用 | `{nativeWei:0n, epDepositWei:0n}` |
| 22 | 仅 native | 账户有 ETH（Kernel receive 后转 EP） | 调用 | native>0 |
| 23 | 仅 EP deposit | 显式 `depositTo` 过 | 调用 | epDeposit>0 |
| 24 | RPC 失败 | readContract 抛错 | 调用 | 归零不抛（catch） |

### 2.6 createAutoRenew（enable）
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 25 | 订阅不存在 | 无 subscription_id | enable | 抛错 `subscription #N not found` |
| 26 | 订阅归属他人 | sub.subscriber ≠ 当前钱包 | enable | 抛错 `does not belong to this wallet` |
| 27 | 订阅非 Active | status=2/3/0 | enable | 抛错 `subscription is not active` |
| 28 | 金额不一致 | 传的 planPriceWei ≠ sub.amount_wei | enable | 抛错 `plan price mismatch (subscription vs provided)` |
| 29 | 计划不存在 | 无 plan_id | enable | 抛错 |
| 30 | 计划不属该 agent | plan.agent_id ≠ agentId | enable | 抛错 |
| 31 | 计划停用 | plan.active=false | enable | 抛错 |
| 32 | 计划价不一致 | plan.price ≠ planPriceWei | enable | 抛错 |
| 33 | relay session 失败 | mock 抛错 | enable | 抛错，**不写 DB** |
| 34 | 正常路径 | 全部通过 | enable | 返回 `accountAddress/accountDeployed/sessionId/sessionSigner/digest/validUntil` |
| 35 | digest 格式 | 成功返回 | 断言 | 32 字节 hex（`0x` + 64 hex） |
| 36 | DB 登记 | 成功 | 查 `aa_auto_renew` | 行存在，`renew_status='pending'`，`session_key_enc` 为 AES 密文（≠ sessionKey 明文） |
| 37 | 重复 enable | 已有 pending/enabled 行 | 再次 enable | **upsert 覆盖**为新 session，状态回 pending（旧 session key 作废） |
| 38 | 免费计划 | plan.price=0 | enable | 正常创建，valueLimit=0（策略不拦截 0 限额） |
| 39 | 大额计划 | price 接近 uint256 max | enable | 无溢出，BigInt 正常 |
| 39b | ERC20 计费计划 | plan.pay_token ≠ 0x0 | enable | **已修复（2026-08-18）**：抛错 `auto-renew only supports ETH plans (pay_token must be zero address)`，API 层 422，不写 DB |

### 2.7 confirmAutoRenew
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 40 | 无 pending 行 | 未 enable 或已 confirm | confirm | 抛错 `no pending auto-renew session` |
| 41 | 正常路径 | pending + 合法签名 | confirm | relay `/v1/userops` 成功 → 状态置 `enabled`，返回 userOpHash/txHash/receiptSuccess |
| 42 | 链上 revert | receipt.success=false | confirm | **已修复（2026-08-18）**：状态保持 `pending`，`last_renew_err` 记录 `enable UserOp failed on-chain`，允许用户重签重试 |
| 43 | session key 解密失败 | MASTER_ENCRYPTION_KEY 不符 | confirm | 抛错 |
| 44 | owner 签名错误钱包 | 前端用另一钱包 eth_sign(digest) | confirm | 链上 ecrecover 失败 → UserOp revert（**资产保护**） |
| 45 | 签名用 personal_sign | 前端误用 `signMessage(digest)` | confirm | ecrecover 失败 → revert（EIP-191 前缀导致 digest 不同） |
| 46 | 重复 confirm | 已 enabled | confirm | 无 pending 行 → 抛错（幂等保护） |
| 47 | 签名格式 | 非 65B hex | 路由层 | 400（路由校验 `/^0x[0-9a-fA-F]{130}$/`） |

### 2.8 disableAutoRenew
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 48 | 未登记 | 无行 | disable | 抛错 |
| 49 | 正常停用 | 已登记 | disable | `renew_status='disabled'` + `disabled_at` 落库 |
| 50 | relay disable 失败 | mock 抛错 | disable | 本地仍 disabled，`disableCallData` 缺省（**不影响停用**） |
| 51 | relay disable 成功 | mock 返回 disableCallData | disable | 返回 disableCallData（前端可链上撤销 session） |
| 52 | 停用后重开 | disabled → enable | enable | 新 pending 行，disabled_at 清空 |

### 2.9 listAutoRenew
| # | 用例 | 操作 | 预期 |
|---|---|---|---|
| 53 | 空列表 | 查无数据 | `[]` |
| 54 | 多行排序 | 登记多条 | 按 `updated_at DESC` |
| 55 | 字段完整 | 正常行 | `sub_status/sub_started_at/sub_expires_at/amount_wei/plan_price/plan_period` 经 LEFT JOIN 就位 |
| 56 | 用户隔离 | 两个用户各登记 | 只返回本人的行 |

### 2.10 renewOne（核心续订逻辑）
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 57 | 无订阅可续 | 该 agent 无 status∈{1,2} 订阅 | renewOne | markRenewError `no active subscription to renew`，返回 null |
| 58 | 指针自愈 | 已续订一次，indexer 产生新 id | renewOne | `current_subscription_id` 前移到最新订阅（DB 同步） |
| 59 | 未到窗口 | expiresAt > now + 86400 | renewOne | 返回 null，不动 DB |
| 60 | 过期超窗 | now − expiresAt > 86400 | renewOne | markRenewError，停止续订 |
| 61 | 冷却期 | last_renew_at < 10min | renewOne | 返回 null 跳过 |
| 62 | 计划停用 | plan.active=false | renewOne | markRenewError `plan is inactive`，停止 |
| 63 | 会话过期 | now > policy.validUntil | renewOne | `validateSessionCall` 拒绝 `session expired` |
| 64 | 涨价越限 | 现价 > 授权时 valueLimit | renewOne | 拒绝 `value exceeds single-tx limit`（**保护资金，需重新 enable**） |
| 65 | 免费计划 | price=0 | renewOne | valueLimit=0 不拦截，正常放行 |
| 66 | 资金不足 | EP deposit + native 均 0 | renewOne | markRenewError `unfunded`，停止（充值后自动恢复） |
| 67 | 仅 native 有值 | 账户收到 ETH（receive→EP deposit） | renewOne | 通过资金预检 |
| 68 | 成功路径 | 窗口内 + 资金足 + 策略过 | renewOne | 先打 `last_renew_at` 防重 → relay 广播成功 → `renew_count+1`、`last_renew_tx`、`renew_log` append、`last_renew_err` 清空，返回 true |
| 69 | 链上失败 | receipt.success=false | renewOne | markRenewError，`last_renew_at` 清空（**下轮可重试**） |
| 70 | 多周期 | 连续两期 | renewOne×2 | `renew_log` 两条，订阅指针逐期前移 |
| 71 | ERC20 计划（存量行） | pay_token ≠ 0 | renewOne | 链上恒 revert `No ETH for ERC20 plans`；新登记已由 enable 拦截（39b），存量行由资金/链上失败路径兜底 |

### 2.11 扫描与 daemon
| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 72 | 功能未启用 | 关闭 | runAutoRenewScan | `{checked:0,renewed:0,failed:0}` |
| 73 | 多行处理 | 3 行 enabled | runAutoRenewScan | checked=3，计数正确 |
| 74 | in-flight 防重 | 同一 key 已在处理 | 二次扫描 | 跳过（单进程 Set 防重） |
| 75 | 异常兜底 | renewOne 抛错 | runAutoRenewScan | failed++，markRenewError 落库 |
| 76 | daemon 未启用 | 未配置 | startAutoRenewDaemon | warn，不建 timer |
| 77 | 重复启动 | 已启动 | startAutoRenewDaemon | 不建第二个 timer |
| 78 | 停止 | 运行中 | stopAutoRenewDaemon | 清 timer，不再扫描 |

---

## 3. API 层测试（routes/auto-renew.ts，挂 `/api/v1/billing`）

> 认证链：`apiKeyAuth → authMiddleware → tenantRateLimiter`（X-Api-Key 或 Bearer JWT）

| # | 用例 | 请求 | 预期 |
|---|---|---|---|
| 79 | GET 未认证 | 无任何头 | 401 |
| 80 | GET 正常 | Bearer JWT | 200 `{rows:[…]}`，每行含 `funding:{nativeWei,epDepositWei}`（**字符串**，BigInt 已序列化，不 500） |
| 81 | POST enable 功能关闭 | 未启用 | 503 `Auto-renew (ERC-4337) is not enabled` |
| 82 | POST enable 缺参 | 少 agentId/planId/subscriptionId/planPriceWei | 400 |
| 83 | POST enable 正常 | 全参 | 200 含 digest/accountAddress |
| 84 | POST confirm 缺签名 | 无 ownerSignature | 400 |
| 85 | POST confirm 格式错误 | 非 65B hex（如 64B） | 400 |
| 86 | POST confirm 正常 | 合法签名 | 200 userOpHash/receiptSuccess |
| 87 | POST disable 未登记 | 无行 | **已修复（2026-08-18）**：404 |
| 88 | POST disable 正常 | 已登记 | 200 `{disableCallData?}` |
| 89 | 用 X-Api-Key（partner）调 enable | 仅 partner key | 401/403（主体非用户钱包，子主不匹配） |
| 90 | 注入 | body 含超长/特殊字符 | 不崩、SQL 参数化（无注入） |

---

## 4. 前端组件测试（AutoRenewCard / lib/auto-renew.ts）

| # | 用例 | 前置 | 操作 | 预期 |
|---|---|---|---|---|
| 91 | 未连接钱包 | isConnected=false | 渲染 | 不弹签名，显示连接引导（继承页面行为） |
| 92 | 未认证 | 无 JWT | 渲染 | 显示 "Sign in to manage auto-renew"，**不自动弹签名**（lazy） |
| 93 | 点击 Sign in | 未认证 | 点击 | 触发 1 次 personal_sign challenge（JWT） |
| 94 | 认证失败 | 钱包拒绝 challenge | 点击 | 错误提示，可重试 |
| 95 | idle + active | 已认证，无登记行 | 渲染 | 显示 Enable Auto-Renew 按钮 + 价格标签 |
| 96 | idle + 非 active | 订阅已过期 | 渲染 | 不显示 enable 按钮（disabled 提示） |
| 97 | enabling | 点击 Enable | 点击 | 按钮转 "Preparing…" 并禁用 |
| 98 | enable 成功 | relay 正常 | 点击 | 进入 pending-sign：Account/Digest/Limit/ValidUntil 面板 |
| 99 | pending-sign Cancel | 面板中 | 点击 | 回 idle，丢弃 draft |
| 100 | eth_sign 被拒 | 钱包拒绝 | 点 Sign & Enable | 错误提示，停留在 pending-sign |
| 101 | 确认成功 | receiptSuccess=true | 签名提交 | enabled 状态 + 智能账户地址 + 资金视图 + renew 次数 |
| 102 | 确认 revert | receiptSuccess=false | 签名提交 | 错误提示（含 op 前缀） |
| 103 | 资金引导 | enabled 且双零 | 渲染 | 琥珀色警告 "Smart account is unfunded" |
| 104 | 资金正常 | native/EP > 0 | 渲染 | 无警告，显示余额与 gas deposit |
| 105 | disable | enabled | 点击 | window.confirm → disabled + Re-enable 入口 |
| 106 | refresh | 任意 | 点击 | 重新 GET 列表 |
| 107 | copy 地址 | enabled | 点击 | clipboard 写入 + 短暂 "Copied" |
| 108 | 价格显示 | planPriceWei=1e15 | 渲染 | `0.0010 OXA / period` |
| 109 | 网络错误 | GET 失败 | 渲染 | 错误条 + Retry |
| 110 | lib 错误映射 | API 返回 {error} | fetch | 抛 `error` 字段文案 |

---

## 5. 链上 E2E（oxachain 测试钱包 + aa-relay）

| # | 用例 | 步骤 | 预期 |
|---|---|---|---|
| 111 | 全流程 happy path | ① enable（创建 session+部署账户）② 钱包 `eth_sign(digest)` ③ confirm ④ 智能账户充值 OXA ⑤ 到期窗口内跑扫描 | UserOp 上链 → 新 subscription_id → indexer upsert → 指针前移 → renew_log 一条 → `chain_subscriptions` 出现新 Active 行 |
| 112 | 多周期续订 | 周期短计划 + 连续扫描 | 续订两次，两次均成功，指针逐期前移 |
| 113 | 取消订阅停止 | 链上 cancelSubscription | resolveCurrentSubscription 无 active → markRenewError，停止 |
| 114 | 换钱包签名被拒 | enable 后用钱包 B eth_sign | 上链 ecrecover 失败 → 授权 revert（**资产保护**） |
| 115 | personal_sign 签名被拒 | 用 signMessage 签 digest | 授权 revert |
| 116 | 部署前算 digest | 未部署账户构造 draft | 链上验证失败（nonce=0 vs 1）→ revert（验证"先部署再 digest"硬约束） |
| 117 | 并发防重 | 同一行双 daemon tick 并发 | 仅一次成功续订（时间戳冷却兜底） |
| 118 | 资金耗尽恢复 | unfunded 停 → 充值 → 再扫描 | 恢复续订 |
| 119 | 断电/收据丢失恢复 | 已打 last_renew_at 未确认 → 10min 后 | 按最新订阅续订，**不双花** |
| 120 | session 越权 | 手动构造 session 调用非 subscribe selector / 非 SubscriptionManager target | 链上 revert（Session Module 策略强制） |
| 121 | 跨链 replay | 同 userOpHash 投到其他链 | getUserOpHash 含 chainId，签名不匹配 → 拒绝 |
| 122 | countLimit 用尽 | 366 次后 | 链上拒绝（计数策略） |

---

## 6. 安全与回归

| # | 项 | 断言 |
|---|---|---|
| 123 | session key 落盘 | 仅存 AES-256-GCM 密文（`session_key_enc`），日志/响应不出现明文 |
| 124 | 最小权限 | session 仅能调 `subscribe(uint256)` @ SubscriptionManager，valueLimit=订阅价，有效期 730d，countLimit=366 |
| 125 | 越权升级 | 计划涨价超 valueLimit → 链上+链下双重拒绝，需重新授权 |
| 126 | 日志脱敏 | digest/私钥/sessionKey 不整段打日志 |
| 127 | 回归 | gateway `npm test`（82 例）+ `tsc --noEmit` + frontend typecheck + `npm run build` 全绿 |
| 128 | 配置默认安全 | 生产未配 AA_* 时功能整体关闭（503 / daemon 不启动） |

---

## 7. 已知限制与建议修复

> 三个缺陷已修复（2026-08-18，待提交）：L1 confirm 失败分支、L2 ERC20 拦截、L3 disable 404。
> 新增回归断言见上表：用例 42 / 39b / 87。

| # | 事项 | 状态 |
|---|---|---|
| L1 | `confirmAutoRenew` 未按 `receiptSuccess` 分支 | **已修复**：失败保持 `pending` + `last_renew_err`，允许重签 |
| L2 | ERC20 计划（pay_token≠0）未被 enable 拦截 | **已修复**：`createAutoRenew` 拒绝（API 422），存量行由链上失败路径兜底 |
| L3 | disable 未登记返回 500 | **已修复**：服务抛 `err.status=404`，路由映射 404 |
| L4 | 免费计划仍需账户有 gas 才能续订 | 合理（UserOp 需 gas），文档说明即可 |

### 7.1 2026-08-19 资金预检与失败护栏（P0，已实现）

> 动机：续订 cron 对失败行默认"每轮无限重试"；资金不足（三类资金任一缺失）时
> 会反复骚扰，且失败原因只落 `last_renew_err` 无暂停机制。本次补齐失败护栏。

| # | 事项 | 状态 |
|---|---|---|
| L5 | 续订前 escrow 余额预检（`InfraXEscrow.balanceOf(account)` < `AA_RELAY_SERVICE_FEE_WEI` 默认 0.00246 OXA → 不提交） | **已修复**：`getAccountFunding` 返回三类资金（native / EP deposit / escrow），`renewOne` ⑦ 逐项预检 |
| L6 | 失败无限重试 | **已修复**：`renew_fail_count` 连续计数（迁移 027），续订成功/confirm 成功/disable/resume 归零；达 `AA_RENEW_MAX_FAIL_COUNT`（默认 3）自动暂停 + 告警 |
| L7 | 不可自愈失败（无订阅/计划下架/策略拒绝/错过窗口）继续空转 | **已修复**：`markRenewError(fatal)` 直接暂停，不再累计重试 |
| L8 | 暂停后无法恢复 | **已修复**：新增 `POST /billing/auto-renew/resume`（`resumeAutoRenew`，仅 `paused` 行可恢复，重置计数） |
| L9 | 无告警通道 | **已修复**：`AA_ALERT_WEBHOOK_URL` 可选告警（JSON POST 10s 超时），未配置时 `log.error`；`/api/v1/health` 暴露 `autoRenew` daemon 指标（lastScan / pausedCount） |
| L10 | 前端无资金/暂停展示 | **已修复**：AutoRenewCard 三类资金展示 + 充值指引（fallback 路径）+ paused 状态/原因 + Resume 按钮 |
| L11 | 续订后新订阅归属智能账户，用户 EOA 订阅列表查不到 | **已修复**：订阅列表页新增 `SmartAccountSubscriptionsCard`（懒 JWT 认证，合并展示智能账户名下订阅） |

**新增单测**（`gateway/test/aa-autorenew.test.ts`，9 条，mock DB 不触链上）：
- `resolveCurrentSubscription` 双归属 + 指针前移（指针优先/前移/回退智能账户归属/回退 EOA/无订阅）5 条；
- `resumeAutoRenew` 恢复 + 404 2 条；
- `runAutoRenewScan` fatal 暂停落库 + 空扫描 2 条。

### 7.2 2026-08-19 产品化充值（depositFor 一键充值）+ 真实测试结果

> REQ-1（depositFor）由 infraX 上线后，前端充值引导从 fallback 切换为真实一键充值
> （commit 8625da6）：AutoRenewCard 三类资金各自金额输入 + 单个充值按钮 + 一键充值全部
> （顺序 3 笔 tx：`escrow.depositFor` / `EP.depositTo` / native 转账），默认金额按 12 期估算。

**生产真实测试（2026-08-19，全新 EOA `0x8abA0A03…`，无历史会话）**：

| 步骤 | 结果 |
|---|---|
| 链上 subscribe（agent 30 / plan 18，0.001 OXA）→ indexer 入库订阅 #28 | ✅ |
| JWT 登录（challenge + personal_sign）→ enable | ✅ 返回新账户 `0x376Ee450…`（escrow=0）+ digest |
| **不充值直接 confirm → relay 402 + topupHint** | ✅ `402 余额不足…主钱包 EOA 单笔 tx 调 depositFor(智能账户) 代充值…计费主体=0x376ee450…（当前链上余额 0，本次需 0.00246000003304）`——REQ-2c 文案验收通过 |
| 一键充值三笔（depositFor 0.03 / EP.depositTo 0.02 / 转账 0.02 OXA） | ✅ 全部 success，`balanceOf` 即时生效 |
| confirm 重试 | ✅ `receiptSuccess=true`（tx `0x5ca57611…`）——充值闭环打通 |
| GET /auto-renew | ✅ `renew_status=enabled`，funding 三类资金精确（confirm 已扣 1 次服务费 ~0.00246 OXA） |

**真实测试发现的问题**：

| # | 事项 | 状态 |
|---|---|---|
| L12 | **旧会话残留导致重复 enable 失败**：测试主钱包 `0xd8e2cf33…` 曾有 enabled 会话（表已清但链上未撤销），再次 enable 后 confirm 报 `FailedOpWithRevert`（bundler 层 AA23 signature error，tracer 显示 Session Module `isValidSignature` revert）。**根因**：Kernel v3 单 session 结构，已有 session 时 enableSession 覆盖被拒 | **已修复**（commits deb779f/54095e9/dc74d54/7696db6，2026-08-19 全链路生产验证通过，见下） |
| L13 | relay 402 文案仍含 REQ-4 已淘汰的 self-pay 提示（"账户自身用 session key 调 deposit() 自付"） | 建议 infraX 文案去重 |

**L12 修复方案（已上线 + 生产全链路验证）**：

1. **残留检测改为 `isModuleInstalled(1, sessionModule)`**（`hasOnChainSession`）——`eth_getStorageAt` 探测 slot `0x7bcaa2…` 是误报（那是常驻 root ECDSA validator 的绑定，卸载 session 后仍非零）。
2. **enable 前残留自愈**：`createAutoRenew` 检测到链上残留 → 返回 `needsSessionRevoke + disableUserOpHash + disableSessionId`（不再直接建新 session）；前端签名后调 `POST /billing/auto-renew/revoke` 上链撤销，再重试 enable。
3. **revoke 残留兜底**：`revokeAutoRenew` 优先查登记行，登记行被清空时由调用方回传 `accountAddress/sessionId`（哈希一致性校验兜底，传错 → 409）。
4. **重 enable `InvalidNonce` 修复**（commit 7696db6）：Kernel v3 `_installValidation` 要求 `config.nonce > validationConfig[vId].nonce`，而 `uninstallModule` 只清 hook 不清 nonce → 撤销后 validationConfig.nonce 停留旧值，紧接着的 enable 用同一旧 nonce 再次 install 必 `InvalidNonce`。修复 = 撤销 UserOp 改为 **批量 execute**：`execute(BATCH, abi.encode([uninstallModule, self.invalidateNonce(cur+1)]))`，卸载同时推进账户 `currentNonce`（实证 `execute(bytes32,bytes)` BATCH execMode `0x01…0` 链上通过；Kernel v3 无独立 `executeBatch` 函数）。

**生产全链路验证（2026-08-19，`aa-l12-heal-verify.mjs`，测试钱包）**：

| 步骤 | 结果 |
|---|---|
| ① 干净账户 enable → confirm#1 | ✅ `receiptSuccess=true`（tx `0xd1142f8b…`，session `0x1dd6a45a…`） |
| ② 再 enable → 命中残留 | ✅ `needsSessionRevoke=true` + disable draft |
| ③ 签名 revoke（批量 uninstall + invalidateNonce） | ✅ `revoked=true`（tx `0x957fa362…`），链上 `validNonceFrom 2→3` |
| ④ 干净 enable → confirm#2 | ✅ `receiptSuccess=true`（tx `0x87d23706…`，session `0x7d5bf856…`） |

> 单测同步更新（`aa-autorenew.test.ts` 14 条）：revoke 兜底路径断言 `execute(BATCH)` 编码含 `uninstallModule`/`invalidateNonce`/`cur+1`。验证后测试残留已清理（aa_auto_renew 清空、链上 session 撤销，账户 `validNonceFrom=4`）。

**2026-08-20 对齐 infraX 三段批量 revoke 契约（已完成）**：infraX 发布 `@0xinfrax/aa-sdk@0.1.2`（`buildDisableSessionUserOp` 三段批量 disable），AgentX `buildDisableUserOpDraft` 改用该函数（commit f080086），revoke 现为 `execute(BATCH, [disableSession@module, uninstallModule, invalidateNonce(cur+1)])`——显式 `disableSession` 删除旧 session 记录（已部署 Session Module `onUninstall` 为空实现，两段版不删记录 → 旧 session key 仍可验证，已修复）。生产验证：clean→confirm→残留检测→三段批量 revoke（tx `0x044412fe…` success，nonce 4→5）→clean→confirm 全通过；残留已清理（aa_auto_renew 清空、链上无 session、nonce=6）。**广播路径进一步对齐**：`revokeAutoRenew` 撤销上链由 `POST /v1/userops` 切换为 relay `POST /v1/session/revoke`（submitSignedOp 统一流程：owner 派生账户校验 + ECDSA 签名校验 + userOpHash 一致性 + A-10 escrow 计费 + 广播结算），请求体含 `chain/account/owner/sessionId/userOpHash/signature/op/wait`，op 无需预置 signature（relay 侧注入）；单测同步断言新端点与请求体。

### 7.3 2026-08-20 e4 余额不足主动告警 + e5 escrow 计费对账（已实现）

> 动机：此前资金不足只在**续订窗口内**由 `renewOne` ⑦ 事后预检（失败 → 累计暂停），
> 缺「到期前提前主动通知」；relay A-10 escrow 计费（Charged/Refunded）无本地对账，
> 无法发现漏计费/重复扣费。本次补齐 e4/e5。

| # | 事项 | 状态 |
|---|---|---|
| E4-1 | 提前告警窗口：到期前 `AA_ALERT_AHEAD_SEC`（默认 3 天）检查三类资金 | **已实现**：`watchFunding`（aa-autorenew.ts）——已进入续订窗口（`AA_AUTO_RENEW_WINDOW_SEC` 内）时跳过交给 `renewOne` ⑦，避免重复 |
| E4-2 | 告警判定口径（与 `renewOne` ⑦ 一致）：escrow ≥ 2×固定费；native ≥ 订阅费；native+EP deposit ≥ 订阅费 | **已实现**：任一不满足 → `sendAlert` webhook（JSON POST） |
| E4-3 | 告警节流防轰炸 | **已实现**：`last_funding_alert_at`（迁移 028）+ `AA_ALERT_MIN_INTERVAL_SEC`（默认 1 天） |
| E4-4 | scan 集成与统计 | **已实现**：`runAutoRenewScan` 每行先 `watchFunding`，`alerts` 计入 `lastScan` / health 指标 |
| E5-1 | escrow 计费事件增量同步 | **已实现**：`reconcile-escrow.ts` `syncEscrowEvents`——`aa_escrow_events`（唯一 tx+log）+ `aa_escrow_sync`（last_block），每轮 `AA_ESCROW_SYNC_BLOCK_SPAN`（默认 5000）块分页；**首次同步（last_block=0）不从区块 0 回填，直接从最近 `SPAN` 块起算（head-SPAN+1..head），首轮即追平、对账立即可用** |
| E5-2 | 对账口径：净扣费 = ΣCharged - ΣRefunded vs `renew_log` 条数×固定费 | **已实现**：漏计费（< 期望×`MIN_RATIO` 0.5）、重复扣费（> 期望×`MAX_RATIO` 3）、净额为负三类异常 |
| E5-3 | 追平前不判定（防追历史期间误报） | **已实现**：`caughtUp = head - last <= span` 才执行判定 |
| E5-4 | 对账告警 | **已实现**：异常 → `sendAlert` + `log.error`；无异常 → `log.info` |
| E5-5 | daemon 注册 | **已实现**：index.ts 启动 `startEscrowReconciler`（`AA_ESCROW_RECONCILE_INTERVAL_SEC` 默认 3600s） |

**新增单测**：
- `gateway/test/aa-autorenew.test.ts`（19 条，+5 条 `watchFunding`）：未进入窗口/已进入续订窗口跳过/资金充足不告警/资金不足告警落库（未配置 webhook 走 log.error）/节流跳过；
- `gateway/test/reconcile-escrow.test.ts`（6 条，mock viem + DB）：未启用直接返回/无登记行无告警/正常对账无告警/漏计费 missing/重复扣费 excess/净额为负 negative。

**配置项**（`.env.example`）：`AA_ALERT_AHEAD_SEC` / `AA_ALERT_MIN_INTERVAL_SEC` / `AA_ALERT_WEBHOOK_URL` / `AA_ESCROW_RECONCILE_INTERVAL_SEC` / `AA_ESCROW_SYNC_BLOCK_SPAN` / `AA_ESCROW_RECONCILE_MIN_RATIO` / `AA_ESCROW_RECONCILE_MAX_RATIO`。
**迁移**：`028_aa_funding_alert.sql`（`aa_auto_renew.last_funding_alert_at`）、`029_aa_escrow_reconcile.sql`（`aa_escrow_events` / `aa_escrow_sync`）。

---

## 8. 测试执行建议

1. **L0 单元**：`gateway/test/aa-autorenew.test.ts` 已落地（14 条，2026-08-19）：`resolveCurrentSubscription` 双归属/指针前移、`resumeAutoRenew`、`runAutoRenewScan` 失败护栏、`resolveExistingSessionId` 兜底、`revokeAutoRenew`（404/兜底路径断言批量 execute 编码）。对资金计算、窗口/冷却判定等纯函数继续补 vitest + mock aa-sdk/relay。
2. **L1 API**：supertest 挂载真实路由 + 内存 DB / 现有测试基座（参照 `test/billing.test.ts`）。新增 `resume` 端点需补回归用例。
3. **L2 前端**：vitest + testing-library 渲染 AutoRenewCard（mock `useGatewayAuth`/`useWalletClient`/fetch），覆盖 91–110 及 paused/escrow 展示分支。
4. **L3 链上 E2E**：参照 infraX `aa-relay/scripts/aa-session-e2e.ts`，用测试钱包跑 111–122；用测试网/短周期计划缩短等待（临时调低 `AA_AUTO_RENEW_WINDOW_SEC`）。资金预检已由 2026-08-19 生产实证覆盖（三类资金 + 指针前移复验 0 renewed）。
5. **优先级**：P0 失败护栏（L5–L11）已上线验证；后续补 L1/L2 层回归用例即可。
