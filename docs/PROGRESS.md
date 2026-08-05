# AgentX — 项目任务清单与进度

> Last updated: 2026-08-06 · 统一进度文档，替代过时的 `memory/AGENTX_PROGRESS.md`（后者已归档停用）
> 状态图例：✅ 完成 · ⏸ 代码完成待外部前提 · 🔧 进行中 · ⏳ 待办 · 🔵 技术债

---

## 一、已完成任务

### P0 基础设施与合约（✅ 全部完成）
| # | 任务 | 状态 |
|---|------|:--:|
| P0-1 | 6 核心合约（IdentityRegistry / SubscriptionManager v3 / ReputationRegistry / A2AProtocolRegistry / ConfigurationRegistry / MultiEndpointRegistry）双链部署（Sepolia + OxaChain L1） | ✅ |
| P0-2 | Gateway 双轨架构：DB 索引层（agent-indexer：120s 全量 + PlanCreated/事件增量）+ 实时直读层（ChainDataReader，`/api/v1/chain` 6 端点） | ✅ |
| P0-3 | MCP 读工具（ethers 直读链上） | ✅ |
| P0-4 | AgentX 独立仓库（sftgroup/Agentx） | ✅ |

### P1 SDK 0.8.x 系列（✅ 全部发布 npm）
| # | 版本 | 任务 | 状态 |
|---|------|------|:--:|
| P1-1 | 0.8.0 | 链上数据能力：`getAllAgents`/`totalAgents`/`getAgentMetadata`/`getPlan`/`subscribe`/`subscribeToEvents`；`createPlan` 强类型 period（day/week/month/year） | ✅ |
| P1-2 | 0.8.1 | `parseTokenURIJSON` 容错解析（base64 垃圾清理 / unterminated JSON 修复 / regex 兜底），与 indexer 对齐 | ✅ |
| P1-3 | 0.8.2 | 写操作签名修复：`createPlan`/`subscribe`/`releaseFunds`/`cancel` 支持本地私钥签名（eth_sendRawTransaction），链上实测通过 | ✅ |
| P1-4 | 0.8.3 | 安装修复：`wagmi` 提升为必装 peer，`npm install` 后即可独立使用（干净安装 ESM+CJS 实测通过） | ✅ |
| P1-5 | 文档 | README/Version History 同步；样例 `sdk-chain-read.ts`（读）+ `sdk-create-plan.ts`（写） | ✅ |

### P2 支付体系（✅ 代码完成并生产部署；部分待外部前提）
| # | 任务 | 状态 |
|---|------|:--:|
| P2-1 | 渠道归因 §6：migration 007 + `POST /api/v1/channel/attribute`（幂等）+ `GET /api/v1/channel/report`（分成计算）+ 前端 `?ref=` 归因上报 | ✅ |
| P2-2 | A1 法币订阅：migration 008 + Stripe Checkout / webhook（HMAC 验签）/ status API | ⏸ 待 `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` |
| P2-3 | A2 x402：migration 009 + 402 门卫（`/api/v1/agent/runs`）+ `X-PAYMENT` 验证 + 余额账本 | ⏸ 待 `X402_ENABLED=true` + `X402_PAY_TO` |
| P2-4 | 设计文档 [docs/payment-architecture.md](payment-architecture.md)（§6 渠道分成 / §7 决策树 / §8 结论 / §9 实现状态） | ✅ |

### P3 管理后台（✅ 完成）
| # | 任务 | 状态 |
|---|------|:--:|
| P3-1 | `GET /api/v1/admin/system`（三服务健康 + DB + 双链区块） | ✅ |
| P3-2 | `GET /api/v1/admin/revenue`（链上平台费直读 + fiat/channel/x402 汇总，含 `platformFeesCollected`） | ✅ |
| P3-3 | `GET /api/v1/admin/payments`（Stripe/x402/channel 配置状态，不泄漏密钥） | ✅ |
| P3-4 | 前端 /admin 7 个 Tab + revenue/payments 调用/结果日志 | ✅ |

### P4 生产部署与运维（✅ 完成）
| # | 任务 | 状态 |
|---|------|:--:|
| P4-1 | 生产三服务（43.159.60.46）：gateway:3090 / conversation:8100 / frontend:3100（pm2） | ✅ |
| P4-2 | 数据清洗：17 条 `period='monthly'` → `month` + indexer 归一化（事件/回填/全量同步统一入口），130s 稳定性验证无回写 | ✅ |
| P4-3 | 前端套餐管理闭环：`/user/plans` 创建套餐入口 + 移除 Quarterly 选项（合约无 quarter） | ✅ |
| P4-4 | 文档站点 `/docs/sdk`：服务端每次请求实时渲染 `sdk/README.md`（marked，force-dynamic） | ✅ |
| P4-5 | 代码清理：4 个 TS1434 遗留文件 + 40+ 历史类型错误修复，typecheck 零错误 | ✅ |
| P4-6 | 全项目代码审查修复（commit `90bddc0`，净 -107 行）：见下「P5」 | ✅ |

### P5 代码审查修复（✅ 完成，2026-08-06 · commit `90bddc0`）
> 审查维度：硬编码 / 大文件 / 模块化解耦 / 过度设计冗余 / 鉴权统一性

| # | 维度 | 修复内容 | 状态 |
|---|------|---------|:--:|
| P5-1 | 硬编码 | gateway `config.ts` 生产 fail-fast：`JWT_SECRET` / `CONVERSATION_SERVICE_TOKEN` 缺失或仍为占位值即拒绝启动 | ✅ |
| P5-2 | 硬编码 | `ZERO_ADDRESS` 常量抽取（mcp.ts / chain-data-reader.ts）；mcp.ts 头部旧生产 IP（43.156.225.164）修正为 43.159.60.46 | ✅ |
| P5-3 | 冗余/死代码 | 删除未挂载的 `gateway/src/routes/history.ts`（deprecated，-117 行） | ✅ |
| P5-4 | 模块化/解耦 | mcp.ts Identity + Subscription 链读统一走 `ChainDataReader`（SDK 栈），删除 ethers 双套实现与手工 AbiCoder 解码；ChainDataReader 新增 `getSubscriptionDetail` / `getUserSubscriptions` | ✅ |
| P5-5 | 鉴权统一 | `skills.ts` review 端点改用共享 `adminAuth` 中间件；原内联校验引用不存在的 `ADMIN_API_KEY` 变量，端点恒 403 | ✅ |
| P5-6 | ABI 冗余 | 前端 `abis/` 新增 `SubscriptionManager`（v2 规范）/ `SubscriptionManagerV1`（legacy 兼容）/ `ReputationRegistry` / `A2AProtocol` 共享模块；5 处内联 ABI 全部改为导入 | ✅ |
| P5-7 | 安全 | `.gitignore` 忽略 `.env.local` / `.env.*.local`（含钱包私钥的本地环境文件，此前未被忽略） | ✅ |
| P5-8 | 生产修复 | 执行已有 migration `001_skills.sql` 补建生产 `skills` 表（缺失导致 skills 端点 500，review 端点此前从未真正可用） | ✅ |

### P6 对话链路统一（✅ 完成，2026-08-06 · commit `5675346`）
> 背景：前端 `useAgentChat` 自研 fetch+SSE 解析，与 SDK `ConversationClient` 是同链路的双实现，且 conversation-service SDK 停留在 `^0.8.1`。
> 方案：统一为「SDK ConversationClient 单一实现」——前端不再手写 SSE，三服务 SDK 版本拉齐。

| # | 任务 | 状态 |
|---|------|:--:|
| P6-1 | SDK 0.8.4：`ConversationClient` 鉴权支持 JWT Bearer（`accessToken`，与 `apiKey` 二选一）；`stream(params, { signal })` 支持外部 AbortController 停止；`ConversationSSEEvent` 新增 `error` 字段（tool_result 失败） | ✅ |
| P6-2 | SDK 0.8.5：README 快照修正后重新发布（npm 元数据与仓库对齐） | ✅ |
| P6-3 | 前端 `useAgentChat` 改用 `new ConversationClient({ gatewayUrl, accessToken, llmApiKey })` 流式消费，删除约 100 行手写 fetch/SSE 解析，对外 API（ChatMessage/stopStreaming/clearMessages）不变 | ✅ |
| P6-4 | 三项目依赖统一 `^0.8.5`：gateway（0.8.1→0.8.5）/ conversation-service（0.8.1→0.8.5）/ frontend（0.8.3→0.8.5）；typecheck + build 全绿 | ✅ |
| P6-5 | 生产部署：三服务 `npm install@^0.8.5` + build + pm2 restart，均 online；SDK 版本验证 3/3 为 0.8.5 | ✅ |
| P6-6 | 回归验证：JWT → gateway `/api/v1/agent/runs` → conversation-service SSE 流式事件正常返回（text/done） | ✅ |

### P7 平台商业化能力（✅ 完成，2026-08-06 · commits `1fa03b8` / `45703cd` / `25a3914`）
> 需求调研 → 按阶段全部实施 → 生产部署 + 端到端验证完成。

| # | 需求 | 交付 |
|---|------|------|
| P7-1 | 付费用户使用平台 LLM（平台 key 在管理后台添加） | admin `PATCH /platform-keys/:id`（编辑/启停/权重）；PlatformKeysTab 增/改双模式表单 |
| P7-2 | 普通/付费用户自加 LLM key（预置常见 provider+端点，可自定义） | settings 页对接 gateway `/tenant/keys` CRUD + validate；预置 openai/deepseek/moonshot/zhipu/siliconflow/ollama/custom；聊天链路透传 `tenantKeyId`（SDK 0.8.6），gateway 服务器端解密后转发（加密 key 不出服务器） |
| P7-3 | 管理后台监控平台收入/用户 | 既有 Tenants/Usage/System/Revenue/Payments Tab（保持） |
| P7-4 | 渠道分成追踪 + 收益提成分配 | 渠道 CRUD（`GET/POST/PATCH/DELETE /channels`）+ 单渠道明细报表（attributions + channelShare 计算）+ 记录制结算（`POST /channels/:id/settle` 写 `channel_settlements` 台账并标记 `settled_at`/`settlement_id`）；链上打款人工发起、台账可审计 |
| P7-5 | 独立页面供 B 端申请（入驻） | 公开 `POST /channel/apply` + `/apply` 页面（hero + 收益说明 + Glass 表单）；admin Applications Tab 审批/拒绝（通过自动创建 channel） |

> P7 决策备忘：实施范围=按阶段全部做（①LLM key 双轨 → ②渠道结算 → ③B 端申请），已全部完成并生产部署。

### P8 对话多任务并行管理（✅ 完成，2026-08-06 · commits `9129031` / `051b4a6` / `151e67b`）
> 参考 DeerFlow 的 Thread/Run 模型：会话（session）为对话框容器，任务（task）为一次后台执行；
> 提交即返回 taskId，队列并行执行，事件持久化 + SSE 重放，可取消。

| # | 任务 | 状态 |
|---|------|:--:|
| P8-1 | 迁移 004 `chat_sessions`（会话容器）+ 005 `chat_tasks`（任务）+ `chat_task_events`（事件日志，task FK 级联删除），生产已执行 | ✅ |
| P8-2 | conversation-service `TaskManager`：状态机 `queued→running→done/error/cancelled`，队列 + 并发信号量（`TASK_MAX_CONCURRENT` 默认 4），超时 abort（`TASK_TIMEOUT_MS` 默认 15min），BYOK key 加密落盘按任务解密 | ✅ |
| P8-3 | sessions/tasks REST + SSE 路由：`POST /sessions`（幂等）、`POST /sessions/:id/tasks`（201 返回 taskId）、`GET /sessions/:id/tasks`、`GET /tasks/:id`、`DELETE /tasks/:id`（取消）、`GET /tasks/:id/events`（先重放持久化事件再续实时，30s 心跳，终态自动关闭） | ✅ |
| P8-4 | gateway 代理 `/api/v1/sessions` + `/api/v1/tasks`（JWT/API-key 认证，存储式 BYOK 服务端解密，SSE 流式转发） | ✅ |
| P8-5 | agent-runner 支持外部 `AbortSignal`（取消 → `AgentLoop.abort()`） | ✅ |
| P8-6 | 生产部署 + 冒烟 6/6 PASS（session 创建 / task 立即返回 / 终态 / 列表 / SSE 事件重放 / DELETE 契约） | ✅ |

> P8 排障记录：①gateway chat-tasks 路由曾挂载在 `/sessions` `/tasks` 双前缀导致路径重复 404，改挂根路径修复（`051b4a6`）；②`rowToTask` 对 pg 已解析的 JSONB 值二次 `JSON.parse`（空数组→空串→`Unexpected end of JSON input`），改类型感知解析修复（`151e67b`）。
> 验证备注：生产平台兜底 LLM key 无效（401），任务瞬间终态，真实 LLM 输出与 running 态取消的运行时验证需有效 BYOK key（与链路改造无关，见验证记录）。

### P9 集成方可配置禁用多 task / 子 agent（⏳ 待开发，2026-08-06 需求已细化）
> 背景：P8 上线多 task 并行后，部分集成方（租户）不希望开放多 task/子 agent 能力，需要平台侧可配置禁用。
> 决策（已确认）：①配置粒度=套餐级 + 租户级覆盖；②一个 `parallel_tasks` 开关同时约束「多 task 并行」与未来「子 agent」；③禁用行为=完全禁用（创建 task 返回 403）。

**细化需求：**

| # | 条目 | 明细 |
|---|------|------|
| P9-1 | 配置模型 | `plans.features.parallel_tasks: boolean` 默认 `true`（套餐级）；`tenants.allow_parallel_tasks BOOLEAN DEFAULT NULL`（租户级覆盖，NULL=继承套餐）；`effective = tenant.allow_parallel_tasks ?? plan.features.parallel_tasks ?? true`。迁移：`ALTER TABLE tenants ADD COLUMN allow_parallel_tasks BOOLEAN` |
| P9-2 | 门卫行为 | gateway `POST /api/v1/sessions/:sessionId/tasks` 前解析 effective 位，`false` 时返回 **403** `{ "error": "Parallel tasks are disabled for this tenant", "code": "PARALLEL_TASKS_DISABLED" }`；只拦截「新建」，已存在任务的查询/SSE 重放/删除保持可用 |
| P9-3 | 管理入口 | 新增 `PATCH /api/v1/admin/plans/:id`（编辑 `features.parallel_tasks` 等）；扩展 `PATCH /api/v1/admin/tenants/:id` 支持 `allow_parallel_tasks`（含清空回 NULL=继承）；`GET /admin/plans`、`/admin/tenants` 返回该字段；前端 Plans Tab / Tenants Tab 加开关 |
| P9-4 | 租户可见性 | `GET /api/v1/tenant/me` 返回 `plan.features.parallel_tasks` 与租户级 `allow_parallel_tasks` 覆盖值，集成方在 SDK/前端可感知自身能力 |
| P9-5 | 子 agent 预留 | 未来实现子 agent（DeerFlow Subagent）时读取同一 effective 位，`false` 禁止 spawn；本次不实现子 agent 本体 |
| P9-6 | SDK/文档 | ConversationClient `createTask` 对 403 返回明确错误（映射 code）；CONVERSATION_SERVICE.md / UPGRADE.md 说明配置与 403 语义 |
| P9-7 | 验证 | 生产冒烟：默认套餐可建 task → 关闭套餐 features 后 403 → 租户覆盖 true 恢复 → 覆盖 false 再禁；查询/取消不受影响 |

---

## 二、当前状态

- **进行中**：无阻塞项
- **待办（规划）**：
  - **P9 集成方可配置禁用多 task/子 agent**（2026-08-06 加入，需求已细化）：套餐级 `features.parallel_tasks` + 租户级 `allow_parallel_tasks` 覆盖；禁用后创建 task 403；admin 编辑入口 + 租户可见性 + SDK/文档。详见「P9」章节
  - 对话多任务前端接入（useAgentChat / 前端聊天页切换到 sessions+tasks 模型，支持并行任务列表与取消）
  - `scripts/agentx-integration-test.mjs` 集成测试补 task 并行链路
- **待办（外部前提）**：
  - 法币订阅：提供 Stripe 商户账号 → 配置 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
  - x402：提供结算通道与收款钱包 → 配置 `X402_ENABLED=true` / `X402_PAY_TO`
  - 渠道归因：向 `channels` 表插入渠道配置即可启用（零外部依赖）
  - 平台兜底 LLM key 有效值：conversation-service `OPENAI_API_KEY` 当前 401（影响非 BYOK 任务真实执行）
- **技术债（🔵 可选优化）**：
  - 8 个 >760 行大文件待拆分（`gateway/src/routes/mcp.ts`、前端 hooks/组件等）——审查 #9，单独排期
  - 主入口仍 re-export react hooks（useAgentRunner），导致后端用户也需安装 wagmi——可后续拆分为独立子路径
  - admin/revenue 链上平台费目前只展示原生代币（OXA/ETH），ERC20 付费的按 token 展示扩展点已预留
  - 上游依赖 `@coinbase/cdp-sdk → axios` 存在 high 级通用 DoS 漏洞，待上游发版修复（与 SDK 代码无关）

---

## 三、生产环境

| 项 | 值 |
|----|-----|
| 服务器 | 43.159.60.46（SSH: ubuntu） |
| 服务 | agentx-gateway:3090 · agentx-conversation:8100 · agentx-frontend:3100（pm2） |
| 数据库 | agentx_gateway（索引层）+ agentx_conversation（对话，端口 5433） |
| SDK | `@agentxv2/sdk@0.8.6`（npm latest；gateway/conversation/frontend 三服务一致） |
| 文档站点 | http://43.159.60.46:3100/docs/sdk（实时渲染 README） |
| 管理后台 | http://43.159.60.46:3100/admin（X-Admin-Key） |
| 测试钱包 | `0x52Ec58173042E8d0C9be0BdA81e95a8CbB5B8e06`（OXA 余额充足，私钥在本地 `.env.local`，已被 gitignore 保护） |

## 四、链上合约地址

**OxaChain L1**（Chain ID 19505 · RPC `https://rpc-oxa.0xainet.top` · Explorer `https://explorer-oxa.0xainet.top`）
| 合约 | 地址 |
|------|------|
| IdentityRegistry | `0xbf5F9db266c8c97E3334466C88597Eb758AfE212` |
| SubscriptionManager v3 | `0x019AC9d945467478Dd371CDbD70cb2f325800E6B` |
| ReputationRegistry | `0x6a18C2664E1b42063860d864b6448b824d7B843F` |
| A2AProtocolRegistry v2 | `0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86` |
| ConfigurationRegistry | `0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8` |
| MultiEndpointRegistry | `0xB361d04F49000013FC131D3C59C41c8486C64f8c` |

**Sepolia**
| 合约 | 地址 |
|------|------|
| IdentityRegistry | `0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F` |
| SubscriptionManager v3 | `0xC15fE80b9d800abb72121F353a6ae6d6E9077E63` |
| ReputationRegistry | `0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9` |
| A2AProtocolRegistry v2 | `0x309C7447d89f3087A9924BB686d88df020F7e9cB` |
| ConfigurationRegistry | `0x68DcE00e4C9077c94BC68016cD14B09557faEA6c` |
| MultiEndpointRegistry | `0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7` |

---

## 五、验证记录（关键实测）

| 验证项 | 结果 |
|--------|------|
| SDK 链上创建套餐（0.8.2 修复后） | plan 41 创建成功，读回 period=month；39/40/41 经 PlanCreated 事件同步进 Gateway DB |
| 干净安装 0.8.3 | ESM+CJS 加载、getPlan(41)、totalAgents()=62 全部正常 |
| x402 paywall | 返回 HTTP 402 + `x-price/x-pay-to/x-network` 头 |
| P7 全链路集成回归（生产） | 15/15 通过：三服务 health / 链上读 / MCP 工具 / 对话 SSE 直连与经 gateway |
| P7 渠道结算链路 smoke（生产） | 渠道创建 → 插入归因（1 OXA）→ report（channelShare=1e18×125/10000 正确）→ settle（写 `channel_settlements` 台账 + attribution `settled=true`）→ 有归因渠道删除自动转停用，全通过；测试数据已清理 |
| P7 B 端申请链路 smoke（生产） | 公开 `/channel/apply` 提交 → admin 列表可见 → 审批通过自动创建 channel（含 channelId 解析）→ 删除清理，全通过 |
| 渠道归因 | 归因→幂等（重复归因 false）→ report 分成计算正确（1 ETH × 125bps = 0.0125 ETH） |
| period 数据清洗 | 生产 38 个套餐全部为标准值；130s 同步周期后无回写 |
| 管理后台 | system/revenue/payments 200，日志输出 ip/query/耗时/结果 |
| 代码审查修复回归（90bddc0） | gateway/frontend typecheck+build 全绿；MCP 迁移后 identity_total_count=62 / subscription_plans / identity_list_all(过滤) / subscription_my_list=[1,2,3] 正常；skills review 无 key→401、带 key→404(业务语义)；生产三服务 online，frontend 200 |
| 对话链路统一回归（5675346） | 三服务 SDK 均为 0.8.5；JWT（现场签名）→ gateway `/api/v1/agent/runs` → conversation-service SSE 流式事件正常返回（text/done）；直连 `/runs`（X-Internal-Token）SSE 同样正常。LLM 层因生产未配置平台 key（`platform_api_keys` 0 行）报 `Missing or invalid Authorization header`——为既有凭据配置状态，与链路改造无关 |
| P8 多任务并行冒烟（9129031） | 生产 6/6 PASS：POST /sessions 201 → POST /sessions/:id/tasks 立即返回 taskId → 轮询终态（done）→ GET /sessions/:id/tasks 列表 → GET /tasks/:id/events 返回持久化 `data:` 事件 → DELETE /tasks/:id 200+状态字段。测试数据已清理（smoke- 前缀 5 session 级联删除）。任务执行因平台兜底 key 401 瞬间终态，未验证真实 LLM 输出与 running 态取消（需有效 BYOK key） |

---

## 归档说明

- 旧 `memory/AGENTX_PROGRESS.md` 已停用（内容停在 2026-07-14），历史记录保留于 git 历史，不再维护
