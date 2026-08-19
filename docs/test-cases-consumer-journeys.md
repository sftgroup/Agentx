# AgentX C 端完整用户操作路径测试（用户旅程 / E2E Playbook）

> 本文件与 `docs/test-cases-consumer-c-end.md`（369 条逐条用例库）互补：后者是**离散断言**，本文件是**旅程式完整操作路径**——每一条 Journey 模拟真实用户在一个页面上的一次完整操作序列（点击/输入/等待/校验），且**每条正常路径都配一条对应的"用户会犯的错误"路径**（误操作、输入错误、中断、重复点击、余额不足、签名拒绝等）。
>
> 范围：C 端（终端用户 / Subscriber）从"第一次打开网站"到"账户安全退出"的 10 条完整旅程，覆盖前端全部 `user/*`、`marketplace/*`、`a2a`、首页与公共页面。
>
> 旅程总数：**10 条（J1–J10）**，每条含正常路径（H）+ 错误路径（E）子步骤，均可通过 playwright + wagmi 测试钱包（`~/agentx-prod-test-wallet.txt` 所在钱包）在生产/本地全链路执行。
>
> 生成日期：2026-08-20。

---

## 通用前置（所有旅程共用）

| 项 | 值 |
|---|---|
| 测试钱包 | 链上测试钱包（私钥 `~/agentx-prod-test-wallet.txt`，浏览器需导入对应助记词/私钥） |
| 浏览器状态 | 清空 localStorage（history/session/`i18nextLng` 键）与钱包连接状态，从干净态开始 |
| 域名 | 本地 `http://localhost:3000` 或生产 `https://agentx.0xainet.top` |
| 网关 | 本地 `http://localhost:3090` 或生产 `https://agentx.0xainet.top/api/v1` |
| 计费缓存 | 全量执行前重置 `x402_balances`/`usage_logs`/`chain_subscriptions`（保留既有真实数据，用测试租户） |

---

## J1 钱包登录与账户会话

> 入口：首页 `/`。依赖：`GET /api/v1/auth/challenge`、`POST /api/v1/auth/verify`（[auth.ts](file:///home/steven/Agentx/gateway/src/middleware/auth.ts)）、wagmi 钱包连接。

### J1-H 正常路径
1. 打开首页 → 顶栏显示"Connect Wallet"按钮（未连接态）。
2. 点击 Connect → MetaMask/injected 弹窗 → 选择测试钱包 → 连接成功，按钮变为账户短地址（0x…abc）。
3. 前端自动请求 challenge → 钱包签名 → verify → JWT 落地 localStorage（`auth_token`）→ 顶栏出现"Dashboard/头像"入口。
4. **刷新页面** → 仍保持登录态（JWT 持久化，无重新签名）。
5. 进入 `/user/dashboard` → 显示该钱包的 tenant 信息（无 401）。
6. 关闭浏览器重开 → localStorage 仍在 → 免登录进入。

### J1-E 错误路径
1. **拒绝签名**：连接钱包后点击"拒绝"→ 页面停留未登录态，显示"请签名以继续"类提示，无 JWT 落地。
2. **签错钱包**：前端 signer 与 challenge 钱包不一致 → 401 `Signature does not match wallet address`，保持未登录。
3. **签名重放**：verify 成功后，用同一 nonce/签名再次调 `POST /api/v1/auth/verify` → 401 `Challenge expired or not found`（challenge 已删除）。
4. **Bearer 大小写**：手动构造 `Authorization: bearer xxx`（小写 b）→ 401 `Missing or invalid Authorization header`。
5. **token 指向已删除租户**：删除该钱包 tenant 后用旧 JWT 请求受保护端点 → 401 `Tenant not found`。
6. **X-Api-Key 无效 + Bearer 有效并存**：两个头都带 → 401 `Invalid API key`（apiKeyAuth 先短路）。

> 通过标准：H 全绿；E 均返回文档声明的 4xx，且无 JS 错误（console 0 error）、无 hydration 错误。

---

## J2 市场浏览与 Agent 详情

> 入口：`/marketplace`、`/marketplace/agent/[id]`。依赖：公开端点 `agents`/`chain`（无需登录）。

### J2-H 正常路径
1. 未登录访问 `/marketplace` → 展示 Agent 卡片列表（名称/价格/标签）。
2. 搜索关键词 → 列表实时过滤；切换分类/排序 → 列表刷新。
3. 点击某 Agent 卡片 → 进入 `/marketplace/agent/[id]` → 显示详情：描述、定价（period + priceWei）、模型、是否 BYOK、购买入口。
4. 查看"链上信息"区块（`/api/v1/chain/*`）→ 展示链/合约/订阅状态（已订阅/未订阅）。
5. 未登录用户可浏览与查看详情（公开端点，无登录拦截）。

### J2-E 错误路径
1. **非法 agent id**：直接访问 `/marketplace/agent/abc` 或 `/marketplace/agent/99999999` → 详情页显示"Agent not found"占位（`GET /api/v1/agents/abc` → 400 `Invalid agent id`；不存在 id → 404），页面不崩溃。
2. **搜索无结果**：输入不存在的关键词 → 显示"无匹配 Agent"空态，不报错。
3. **未订阅直接点"开始对话"**：从详情页点 Chat → 跳转 `/user/chat/[id]` → 对话页展示付费墙/订阅引导（402/429 拦截），而非直接进入。
4. **断网刷新详情**：offline 态刷新 → 骨架屏/错误重试按钮，页面不白屏。

> 通过标准：H 全绿；E 均为优雅降级（错误占位/空态/付费墙），无 5xx、无崩溃。

---

## J3 免费使用 → 付费墙 → 订阅购买

> 入口：`/user/chat/[agentId]`、`/user/plans`、`/user/subscriptions`。依赖：统一支付端点 `POST /api/v1/payments`（[payments.ts](file:///home/steven/Agentx/gateway/src/routes/payments.ts)）、`x402`/`chain`/`fiat`。

### J3-H 正常路径
1. 已登录，免费额度充足 → 进入 `/user/chat/[agentId]` → 发送消息 → 正常流式回复（记录 usage，quotaUsed 增长）。
2. **触发付费墙**：持续使用至 `quota_used >= quota_daily`（或订阅过期）→ 对话页出现 quota 横幅 + 429 `Platform quota exhausted` → 页面引导"升级套餐/充值"。
3. 点击引导 → `/user/plans` → 选择目标 plan → 进入支付。
4. **chain 支付**：发起 `POST /api/v1/payments {method:'chain', subscriber, planId}` → 返回 `paymentId` + 需支付金额 → 钱包确认链上交易（向平台钱包转 plan 金额）→ 合约/索引器记账 → `POST /api/v1/payments/verify` → 订阅生效。
5. 回到 `/user/subscriptions` → 新订阅状态为 active，有效期=当前周期结束。
6. 回到对话页 → quota 横幅消失，可继续对话。
7. **升级**：续订周期内点升级 → 按差额计价 → 支付后 plan 提升（R19.4）。

### J3-E 错误路径
1. **余额不足**：钱包余额 < plan 金额 → 链上交易失败（insufficient funds）→ 订阅不生效，页面显示支付失败提示，无半激活状态。
2. **金额不足购套餐**：链上转了 0.1 OXA 但 plan 需更多 → `verify`/`POST /payments` 返回 422 拒绝绑定，余额未错记。
3. **txHash 错误/不完整**：verify 用无效/伪造 txHash → 422 `Transaction is not a valid x402 payment…`，不 credit。
4. **取消支付**：钱包弹窗点"取消"→ 交易未上链 → 订阅未创建，页面停留支付引导。
5. **重复购买/重复 verify**：同一笔 tx 重复 verify → 幂等，第二次不重复 credit（`billedTaskIds`/x402 幂等语义）。
6. **未知支付 method**：手动构造 `method:'bitcoin'` → 400 `Unsupported payment method…`。
7. **tenant-plan 缺参**：`purpose='tenant-plan'` 缺 subscriber/tenantPlanId → 400。
8. **x402 未配置**：`X402_ENABLED=false` 时走 x402 → 503。

> 通过标准：H 全绿；E 均为明确 4xx/5xx + 前端错误提示，无"钱扣了但订阅没生效"类脏状态；DB 侧订阅/配额一致。

---

## J4 对话使用（SSE 流式）

> 入口：`/user/chat`、`/user/chat/[agentId]`。依赖：`POST /api/v1/agent/runs`（SSE）、`POST /api/v1/chat/completions`。

### J4-H 正常路径
1. 进入 `/user/chat` → 选择/新建 Agent 会话 → 输入问题 → 发送。
2. 界面出现 SSE 流式输出（逐字/token 增量），期间显示"思考中/工具调用"状态（thinking / tool_call 事件）。
3. 发送完成 → 回答完整落盘 → 历史列表新增该轮。
4. **澄清交互**：回答歧义时 Agent 发起 clarification 事件 → 页面弹出选择/输入 → 继续回答。
5. **停止生成**：流式中点"Stop" → 输出中断、状态复位、已生成部分保留。
6. 刷新页面 → 历史持久化，可继续此前会话。
7. **BYOK 用户**：使用租户自有 key（`key_source='tenant_owned'`）→ 走自身 endpoint，平台不扣 quota。

### J4-E 错误路径
1. **空消息**：输入框空白点发送 → 前端拦截（不调 API），或后端 400。
2. **配额已耗尽**：quotaUsed >= quotaDaily → 429 + `hint: Switch to BYOK mode or upgrade your plan` → 前端显示升级横幅。
3. **无订阅访问受保护 agent**：未订阅 → 402/403 付费墙，不进入对话。
4. **BYOK key 失效**：`key_source='tenant_owned'` 但 key id 不存在/已停用 → 400 `Tenant API key not found or inactive` → 前端提示切回平台模式。
5. **并发超限**：`max_concurrent=1` 时两个流式请求并发 → 第二个 429 并发限制；**流式中断后**再次请求 → 并发槽释放（`res.on('finish')`），可继续（C337）。
6. **断网/SSE 中断**：流式中断网 → 前端降级提示"连接中断"，已收内容保留；恢复后可重试。
7. **无效 model**：传不存在的 model → 400/502 明确报错，前端不崩溃。

> 通过标准：H 全绿（SSE 事件序列正确、历史持久化、BYOK/平台双轨各自正确）；E 均为明确错误提示 + 优雅降级，无静默吞错。

---

## J5 会话与并行任务

> 入口：`/user/chat`（会话列表）、`/user/dashboard`（并行任务）。依赖：`/api/v1/sessions...`、`/api/v1/tasks...`（chat-tasks/agent-runs）。

### J5-H 正常路径
1. 创建新会话 → 发送多轮 → 会话列表出现多条记录，可切换。
2. 在会话中发起**并行任务**（多路同时请求）→ 页面展示任务列表 + 实时进度。
3. 任务全部完成后查看结果摘要 → 各子任务结果按序展示。
4. 删除已完成会话 → 列表移除，确认弹窗。
5. 重新打开被删会话 → 提示已删除/404，前端回退到列表。

### J5-E 错误路径
1. **删除运行中会话**：任务未完成时删除 → 前端确认拦截或后端拒绝（409），避免数据丢失。
2. **任务 id 不存在**：访问不存在任务详情 → 404 `Task not found`，前端空态。
3. **并行任务并发上限**：同时提交超过 max_concurrent → 后续任务 429 排队/拒绝，前端显示"已达并发上限"。
4. **非法输入**：任务参数缺 agentId/缺消息 → 400 明确提示。
5. **会话过期**：长时间未操作 JWT 过期后提交任务 → 401，前端引导重新登录（不丢本地草稿）。

> 通过标准：H 全绿；E 均有明确状态码 + 前端引导/空态，无任务"假成功"（DB 与 UI 状态一致）。

---

## J6 A2A 多 Agent 编排

> 入口：`/a2a`。依赖：`/api/v1/a2a/*`（[a2a.ts](file:///home/steven/Agentx/gateway/src/routes/a2a.ts)）+ 按次付费 `POST /api/v1/payments/a2a`（[payments.ts](file:///home/steven/Agentx/gateway/src/routes/payments.ts)）。

### J6-H 正常路径
1. 进入 `/a2a` → 选择多个 Agent + 编排输入 → 创建 A2A 任务。
2. 任务进入编排队列 → 前端通过 `GET /a2a/tasks/:id/events`（SSE）实时显示各 Agent 进度。
3. 编排完成 → `GET /a2a/task-result/:taskId` 返回最终结果。
4. **按次付费 resume**：任务进入 awaiting_payment → 前端显示应付金额（x402 余额足够）→ `POST /a2a/tasks/:id/resume` → 扣费 → 任务继续。
5. worker 状态页显示在线 Agent worker。

### J6-E 错误路径
1. **resume 任务不存在**：`POST /a2a/tasks/999999/resume` → 404 `Task not found`。
2. **resume 状态错误**：任务非 awaiting_payment（状态≠4）时 resume → 409 `Task is not awaiting payment (status=…)`。
3. **非 payer 非 admin resume**：用他人钱包 resume → 403 `Only the task payer or an admin can resume this task`。
4. **余额不足 resume**：x402 余额 < 应付 → 402 `Insufficient x402 balance — top up first` + `payment` 字段 → 前端跳充值。
5. **pending-tasks 缺 agentId**：`GET /a2a/pending-tasks` 无参数 → 400 `agentId query parameter required`。
6. **task-result 不存在**：`GET /a2a/task-result/999999` → 404 `Task result not found`。
7. **a2a 支付缺参**：`POST /api/v1/payments/a2a` 缺 payer/amountWei → 400 `payer and amountWei are required`。

> 通过标准：H 全绿（SSE 事件 + 结果 + 扣费闭环）；E 全部命中文档声明的 404/409/403/402/400，且无重复扣费（幂等）。

---

## J7 定时任务

> 入口：`/user/schedules`。依赖：`/api/v1/schedules/*`（[schedules.ts](file:///home/steven/Agentx/gateway/src/routes/schedules.ts)）。

### J7-H 正常路径
1. 进入 `/user/schedules` → 点"新建定时任务" → 选择 Agent + 频率（cron/每天/每周）→ 保存 → 201，列表出现。
2. 到触发时间 → 任务自动执行 → `GET /schedules/:id/runs` 展示 run 历史（成功/失败/耗时）。
3. 查看某次 run 详情 → 结果/错误可见。
4. 删除任务 → 列表移除，不再触发。
5. 暂停/启用切换 → 暂停后不再触发，启用后恢复。

### J7-E 错误路径
1. **未订阅 agent 创建定时**：对未订阅 agent 创建 → **201 创建成功**（[schedules.ts](file:///home/steven/Agentx/gateway/src/routes/schedules.ts) 先建后验），但**触发时**因无订阅执行失败 → run 记录 failure（已对齐 C83 修正）。
2. **非法 cron 表达式**：输入不合法 cron → 400 明确报错。
3. **删除不存在任务**：`DELETE /schedules/999999` → 404。
4. **run 历史超限**：`GET /schedules/:id/runs` 超过 100 条 → 只返回最近 100 条（`LIMIT 100`），前端显示分页/更多。
5. **重复提交**：快速连点保存 → 幂等或 409 去重，不产生重复任务。

> 通过标准：H 全绿；E 与路由真实行为一致（尤其"先建后验"语义），无僵尸任务。

---

## J8 Billing 与租户密钥管理

> 入口：`/user/billing`、`/user/plans`、`/user/settings`。依赖：`/api/v1/billing/*`、`/api/v1/tenant/*`（[tenant.ts](file:///home/steven/Agentx/gateway/src/routes/tenant.ts)）。

### J8-H 正常路径
1. 进入 `/user/billing` → 展示当前套餐、用量统计（30 天调用/花费）、x402 余额、充值入口。
2. **查看用量**：`GET /tenant/usage?days=30` → 图表/列表按日展示调用数与费用。
3. **升级套餐**：选择更高 plan → 支付流程（复用 J3）→ 套餐生效，rate_limit_rpm/max_concurrent/platform_models 提升。
4. **充值 x402**：链上转 OXA 给平台 → `POST /api/v1/x402/verify` → 余额增加 → Billing 页余额刷新。
5. **租户 key 管理**（B 端/高级 C 端）：`POST /api/v1/tenant/keys` 添加 BYOK key（provider/endpoint/api_key/model）→ 列表出现；`POST /tenant/keys/:id/validate` → 校验通过；`DELETE` 删除。
6. **轮换 key**：`POST /tenant/rotate-key` → 旧 key 立即失效、新 key 生效（R19.2）。

### J8-E 错误路径
1. **金额不足购套餐**：x402/链上余额不足 → 422 拒绝绑定（不产生半绑定状态）。
2. **usage days 非法**：`GET /tenant/usage?days=0` 或 `days=abc` → 不返回误导数据（0 天/默认 30），非法值不静默越界。
3. **添加 key 缺参**：缺 provider/endpoint/api_key/model → 400 `provider, endpoint, api_key, and model are required`。
4. **删除不存在 key**：`DELETE /tenant/keys/999999` → 404 `Key not found`（tenant 隔离，跨租户不可见）。
5. **validate 不存在 key**：`POST /tenant/keys/999999/validate` → 404 `Key not found`。
6. **plans price_wei**：`GET /tenant/plans` 每 plan 含 `price_wei`（free=0 时为 `'0'`，付费按 FIAT_TOKEN_USD_PRICE 折算）。
7. **verify 缺 txHash**：`POST /api/v1/x402/verify` 空 body → 400 `txHash is required`。
8. **balance 缺 address**：`GET /api/v1/x402/balance` 无参数 → 400 `address is required`。

> 通过标准：H 全绿；E 均为明确 4xx + 前端提示；DB（quota/keys/余额）与 UI 一致，无跨租户泄漏。

---

## J9 订阅管理与自动续订（AA）

> 入口：`/user/subscriptions`、`/user/subscriptions/[id]/renew`。依赖：`/api/v1/billing/auto-renew/*`（[auto-renew.ts](file:///home/steven/Agentx/gateway/src/routes/auto-renew.ts)）+ AA 栈（relay + Alto + escrow，见 memory：AA 全链路已打通）。

### J9-H 正常路径
1. 进入订阅详情 → 看到"自动续订"卡片（懒加载，未登录/未授权时先认证）。
2. 点击"启用自动续订" → 展示将签名内容 → 钱包签名（eth_sign）→ 返回 `enableUserOpHash`/`accountAddress`/`sessionId`。
3. 点击"确认启用" → `POST /billing/auto-renew/confirm` → relay 广播 → 返回 `receiptSuccess=true`（tx on-chain）→ 状态变"已启用"。
4. 自动续订卡片展示**三类资金**：智能账户 escrow 余额 / native 余额 / EP gas 存款 + 12 期费用估算。
5. **充值引导**：任一资金不足 → 卡片提示 + 一键充值（`depositFor` / `EP.depositTo` / native 转账，对应 REQ-1 已部署合约）。
6. 到期前 cron 自动续订 → 新订阅归属智能账户 → 列表更新、扣费入 escrow 对账。
7. **暂停**：`POST /billing/auto-renew/disable` → 本地停用（DB disabled），不再续订。
8. **恢复**：`POST /billing/auto-renew/resume` → 恢复续订。
9. **撤销重来**：enable 后发现残留 session → `POST /billing/auto-renew/revoke`（三段批量 uninstall + invalidateNonce）→ 再重跑 enable（L12 全链路）。

### J9-E 错误路径
1. **enable 缺参**：`POST /billing/auto-renew/enable` 缺 agentId/planId/subscriptionId/planPriceWei 任一 → 400 `agentId, planId, subscriptionId, planPriceWei required`。
2. **confirm 签名格式**：`ownerSignature` 非 130 hex → 400 `ownerSignature must be a 65-byte hex signature`。
3. **revoke 格式校验**：`disableUserOpHash` 非 64 hex / `accountAddress` 非 40 hex / `sessionId` 非 64 hex → 400 对应格式错误。
4. **resume/disable 缺参**：缺 agentId/planId → 400 `agentId, planId required`。
5. **资金不足告警**：到期前 <3 天且三类资金不足 → `watchFunding` 触发 webhook 告警（节流 1 天），前端卡片显示"余额不足"。
6. **重复 enable（残留）**：链上仍有 session → 探测 `isModuleInstalled(1, sessionModule)` 为真 → 返回 `needsSessionRevoke` → 前端引导 revoke 后重试，而非直接报 AA23。
7. **签名拒绝/超时**：eth_sign 拒绝 → 无 userOp 上链，状态仍"未启用"。
8. **nonce 冲突**：disable 与 enable 同一回合 → 顺序约束（先 revoke 再 enable），前端按流程引导。

> 通过标准：H 全绿（enable→confirm→续订→revoke 全链路 on-chain，escrow 对账无重复扣费）；E 均命中声明的 400/格式校验/自愈流程，链上无孤儿 session。

---

## J10 账户安全、切换与退出

> 入口：顶栏账户菜单。依赖：JWT + wallet 连接态。

### J10-H 正常路径
1. 已登录 → 顶栏账户菜单 → "断开连接" → 钱包断开，页面回到公共态（可浏览市场）。
2. 切换账户：断开后连接另一钱包 → 重新 challenge/verify → 切换到新租户身份（`/user/dashboard` 显示新钱包数据）。
3. 断开前再连同一钱包 → 恢复原租户数据（JWT 重新签发）。
4. 退出登录（清除 localStorage token + 断开连接）→ 全部受保护页面回到登录引导。
5. **多标签一致性**：一个标签退出/断开 → 另一标签请求受保护 API → 401 → 前端统一跳登录/提示（不产生数据残留）。

### J10-E 错误路径
1. **过期 JWT**：本地篡改 `exp` 或等待过期 → 请求受保护端点 → 401 → 前端引导重新登录（不清空聊天历史本地缓存）。
2. **篡改 token**：改 payload 中的 tenantId → 验签失败 → 401（不信任 token 内容，只信签名）。
3. **跨租户访问**：用 A 钱包 token 请求 B 钱包的资源 id（订阅/任务/key）→ 404/403（tenant 隔离），不泄漏数据。
4. **无效 API key**：`X-Api-Key: random` → 401 `Invalid API key`。
5. **断连状态下点受保护操作**：断开钱包后点"我的订阅"→ 前端重定向登录/提示连接钱包。

> 通过标准：H 全绿（切换/恢复/退出数据一致）；E 均为 401/403/404 且无跨租户数据泄漏，前端统一错误引导。

---

## 附：执行策略

1. **执行工具**：playwright + 注入钱包（测试钱包私钥在 `~/agentx-prod-test-wallet.txt` 对应地址）；链上断言用 eth_call/getTransactionReceipt 校验 tx 与订阅归属。
2. **执行顺序**：J1→J2→J3→J4→J5→J6→J7→J8→J9→J10，后置旅程依赖前置产生的订阅/余额（J3 建立订阅，J6/J7/J9 复用）。
3. **每旅程口径**：H 全绿即通过；E 全部命中预期 4xx/5xx + 前端明确提示且无脏状态（DB 与 UI 一致）。
4. **破坏性步骤**：J9 的 revoke/disable、J10 的篡改 token 在独立测试租户/测试钱包执行，勿影响生产真实订阅；AA 用例依赖 relay+Alto+escrow 栈，未配置时跳过并在结论标注。
5. **数据清理**：全量前重置 `x402_balances`/`usage_logs`/`chain_subscriptions`（保留真实数据）/`aa_auto_renew`；每轮结束后清理测试订阅与链上 session（残留自愈可复用 J9-E6 验证）。
6. **与逐条用例库联动**：本文件每条旅程的正常/错误步骤均可回溯到 `docs/test-cases-consumer-c-end.md` 的具体 Cxxx 断言（见下映射）。

## 附：旅程-用例映射（回溯逐条用例库）

| 旅程 | 正常路径对应用例 | 错误路径对应用例 |
|---|---|---|
| J1 钱包登录与会话 | §2（C01–C17）+ §2A（C110–C115） | C275–C278（认证边界）、§17（C253–C262 安全） |
| J2 市场浏览 | §3（C18–C31）+ §3A（C116–C123） | C279–C281（非法 id/分页钳制/过滤） |
| J3 免费→付费墙→订阅 | §4（C32–C44）+ §4A（C124–C133） | §15（C237–C244 支付幂等/竞态）、C316–C331（支付端点边界） |
| J4 对话使用 | §5（C45–C56）+ §5A（C134–C148） | C206–C208（限流）、C259（XFF 伪造）、C337（并发槽释放） |
| J5 会话与并行任务 | §6（C57–C69）+ §6A（C149–C154） | C337（并发槽释放，联动 J4-E5） |
| J6 A2A 编排 | §7（C70–C76）+ §7A（C155–C163） | C301–C306（A2A 边界：resume/缺参/result） |
| J7 定时任务 | §8（C77–C83）+ §8A（C164–C174） | C83（先建后验修正）、C300（run LIMIT 100） |
| J8 Billing 与密钥 | §9（C84–C93）+ §9A（C175–C184） | C311–C315（tenant 边界）、C322–C323（x402/payments 缺参） |
| J9 订阅管理与自动续订 | §10（C94–C101）+ §10A（C185–C198） | C307–C310（AA 缺参/签名与 revoke 格式校验） |
| J10 账户安全与退出 | §11（C102–C109）+ §18（C263–C265） | §17（C253–C262 安全渗透/多租户）、C276/C278（认证边界） |
