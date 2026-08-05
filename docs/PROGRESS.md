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

### P9 集成方可配置禁用多 task / 子 agent（✅ 完成，2026-08-06 · commit `8023e6e`）
> 背景：P8 上线多 task 并行后，部分集成方（租户）不希望开放多 task/子 agent 能力，需要平台侧可配置禁用。
> 决策（已确认）：①配置粒度=套餐级 + 租户级覆盖；②一个 `parallel_tasks` 开关同时约束「多 task 并行」与未来「子 agent」；③禁用行为=完全禁用（创建 task 返回 403）。

| # | 条目 | 状态 |
|---|------|:--:|
| P9-1 | 配置模型：迁移 012 `tenants.allow_parallel_tasks`（NULL=继承）+ plans.features 回填 `parallel_tasks=true`；auth 三处查询注入 `allow_parallel_tasks` + `plan_features` | ✅ |
| P9-2 | 门卫：`POST /sessions/:sessionId/tasks` 计算 `effective = tenant ?? plan ?? true`，false 返回 403 `{code: 'PARALLEL_TASKS_DISABLED'}`；已有任务查询/取消不受影响 | ✅ |
| P9-3 | 管理入口：`PATCH /admin/plans/:id`（features JSONB 合并）+ `PATCH /admin/tenants/:id`（allow_parallel_tasks 三态）；GET 列表返回新字段；admin 前端 Plans Tab 开关 + Tenants Tab 三态下拉 | ✅ |
| P9-4 | 租户可见性：`GET /tenant/me → capabilities.parallel_tasks` + `parallel_tasks_override` | ✅ |
| P9-5 | 子 agent 预留：同一 effective 位，未来 Subagent 实现读取；本次未实现本体 | ✅ |
| P9-6 | SDK 0.8.7：`ConversationClient` 新增 `createSession/createTask/getTask/listTasks/cancelTask/getCapabilities`，403 映射 `ConversationTaskError.code`；CONVERSATION_SERVICE.md / UPGRADE.md 更新 | ✅ |
| P9-7 | 验证：生产冒烟 8/8 PASS（默认可建 → 套餐关 403 → 套餐开恢复 → 租户覆盖 false 403 → true 恢复 → /tenant/me 透出 → 旧任务可查）；测试数据已清理 | ✅ |

> P9 验证备注：①`adminAuth` 优先取 `Authorization: Bearer`，同时携带 JWT 与 X-Admin-Key 时 admin 请求 401——冒烟脚本 admin 请求不带 JWT（既有行为，非本次引入）；②测试租户在 enterprise plan，冒烟需操作其所属 plan 而非 free plan。
> 遗留：前端聊天页接入 sessions+tasks 模型（含并行列表/取消）仍为待办；SDK 侧「子 agent」= 客户端本地 A2A 委托（链上执行），不受平台 gate 约束，P9 gate 面向平台托管执行（conversation-service task）。

---

## 二、当前状态

- **进行中**：R2（集成测试补 task 并行链路）
- **待办**：遗留待办已整理为具体开发任务清单，见下「### 开发任务清单 R」
  - R1 ✅ 已完成（2026-08-06 · commit `0f5c30d`；SDK 0.8.7 已发布 npm）
  - R2-R3 = 可立即开发的规划任务
  - R4-R6 = 待外部前提任务（R4/R5 需业务方提供凭据，R6 零依赖）
  - R7-R9 = 技术债（🔵 可选优化）
  - R10 = 用户定时任务（新需求，2026-08-06 用户确认补充，需求已细化待开发）

### 开发任务清单 R（2026-08-06 由 PROGRESS.md 遗留待办整理）

> 来源：P2/P8/P9 章节遗留 + 原「当前状态」待办。每项含：来源 / 优先级 / 涉及文件 / 实施要点 / 验收标准。

**R1 前端聊天页接入 sessions+tasks 模型（并行任务列表与取消）** —— 优先级：高 · ✅ 完成（2026-08-06 · commit `0f5c30d`）
- 来源：P9 遗留（原 P8 待办「对话多任务前端接入」）
- 涉及：[frontend/app/hooks/useAgentChat.ts](file:///home/ubuntu/Agentx/frontend/hooks/useAgentChat.ts)、前端聊天页组件、`@agentxv2/sdk@0.8.7` `ConversationClient`（0.8.7 功能版 + 0.8.8 README 文档重发均已发布 npm；三服务依赖统一升至 ^0.8.8，commit `1802fab`）
- 实施要点：
  1. `useAgentChat` 底层切为 sessions+tasks：进入会话先 `createSession()`（幂等），发消息走 `createTask()` 立即返回 taskId，不再走单轮 `chat()`
  2. 任务列表：`listTasks()` 渲染并行任务卡片（status: queued/running/done/error/cancelled + 结果/错误摘要）
  3. 取消：`cancelTask()` 按钮（运行中 abort，终态幂等）
  4. 事件流：`getTask()` 轮询或 `GET /tasks/:id/events` SSE 增量刷新
  5. 能力降级：`getCapabilities().parallelTasks === false` 时回退单轮 `chat()`，UI 隐藏多任务/取消入口（对接 P9 gate）
- 验收标准：
  - 单会话可同时运行 ≥2 个任务互不阻塞，卡片状态实时刷新
  - 取消运行中任务 → 状态 cancelled，终态任务取消幂等
  - P9 禁用租户前端自动回退单轮对话，无 403 报错
- 实现记录：useAgentChat 双模式（并行 task 模式默认启用 + 单轮 SSE 回退），createTask 403 `PARALLEL_TASKS_DISABLED` 自动降级单轮；任务完成结果自动上屏为 assistant 消息；session 按 agent+wallet 持久化于 localStorage，刷新恢复任务列表；2s 轮询非终态任务。生产冒烟 7/7 PASS（capability/session/双任务并行/list/cancel/poll 终态/错误类映射），测试数据已清理。

**R2 集成测试补 task 并行链路** —— 优先级：高
- 来源：原「当前状态」待办第 2 条
- 涉及：[scripts/agentx-integration-test.mjs](file:///home/ubuntu/Agentx/scripts/agentx-integration-test.mjs)
- 实施要点：
  1. sessions 幂等创建 + 查询
  2. 同一会话并发创建多个 task，全部到达终态（done/error/cancelled）
  3. `GET /tasks/:id/events` SSE 事件重放断言
  4. `DELETE /tasks/:id` 取消契约（运行中/终态）
  5. P9 gate 用例：禁用的租户创建 task → 断言 403 `PARALLEL_TASKS_DISABLED`（复用 P9 冒烟脚本思路）
  6. 用例数据清理（smoke- 前缀删除）
- 验收标准：脚本在测试环境全绿，可作为回归冒烟

**R3 平台兜底 LLM key 有效化（解除任务真实执行阻塞）** —— 优先级：中
- 来源：原「当前状态」外部前提第 4 条 + P8 验证备注
- 涉及：conversation-service 环境变量（`OPENAI_API_KEY` 当前 401），非代码改动
- 实施要点：
  1. 配置有效 `OPENAI_API_KEY`（或经 admin 添加平台 key 入 `platform_api_keys`）
  2. 补验 P8 未覆盖场景：非 BYOK 任务真实 LLM 输出 + running 态取消
- 验收标准：P8 冒烟注记中的「真实 LLM 输出与 running 态取消的运行时验证」补验通过

**R4 法币订阅（Stripe）上线** —— 优先级：中 · 前提：Stripe 商户账号
- 来源：P2-2（⏸ 待 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`）
- 实施要点：配置两个环境变量 → 启用 Stripe Checkout / webhook（HMAC 验签）/ status API 链路 → 端到端验证（创建订阅 → webhook 回调 → status 查询）
- 验收标准：订阅全链路可支付、webhook 幂等处理、状态正确流转

**R5 x402 支付门卫启用** —— 优先级：中 · 前提：结算通道 + 收款钱包
- 来源：P2-3（⏸ 待 `X402_ENABLED=true` + `X402_PAY_TO`）
- 实施要点：配置两个环境变量 → 验证 `POST /agent/runs` 402 门卫（返回 `x-price/x-pay-to/x-network`）→ 支付后余额账本记账
- 验收标准：未支付请求 402 + 响应头齐全，支付后请求放行且账本正确

**R6 渠道归因启用** —— 优先级：低 · 前提：无（零外部依赖）
- 来源：原「当前状态」外部前提第 3 条
- 实施要点：向 `channels` 表插入渠道配置 → 前端 `?ref=` 归因上报 → report/settle 链路走通
- 验收标准：归因幂等、report 分成计算正确（复用 P7 smoke 已验证逻辑）

**R7 大文件拆分（🔵 技术债）** —— 优先级：低
- 来源：原「当前状态」技术债第 1 条
- 涉及：8 个 >760 行文件（`gateway/src/routes/mcp.ts`、前端 hooks/组件等）
- 实施要点：按模块拆分（链读/写、MCP 工具分组、组件拆分），保持对外 API 不变
- 验收标准：typecheck + build 全绿，行为无回归

**R8 SDK 主入口拆分子路径（🔵 技术债）** —— 优先级：低
- 来源：原「当前状态」技术债第 2 条
- 涉及：[sdk/src/index.ts](file:///home/ubuntu/Agentx/sdk/src/index.ts)（re-export `useAgentRunner`）
- 实施要点：react hooks 移入独立子路径（如 `@agentxv2/sdk/react`），主入口去除 wagmi 依赖
- 验收标准：纯后端用户安装后无需 wagmi；前端用法不变

**R9 revenue ERC20 平台费展示（🔵 技术债）** —— 优先级：低
- 来源：原「当前状态」技术债第 3 条
- 涉及：gateway `admin/revenue` 端点 + 前端 admin RevenueTab
- 实施要点：ERC20 付费按 token 计价展示（预留扩展点已就绪），原生代币（OXA/ETH）展示不变
- 验收标准：混用代币付费时 revenue 按 token 分组展示正确

**R10 用户定时任务（调度执行，新需求）** —— 优先级：中 · ⏳ 待细化确认后开发
- 来源：2026-08-06 用户确认补充（基于 P8 sessions+tasks 后台执行模型 + R1 前端模型）
- 目标：用户可设定**一次性 / 周期性**定时任务，到点自动创建并执行 task（无需人工触发）
- 涉及：gateway 新 `routes/schedules.ts` + 调度 daemon、migration `013_schedules.sql`、前端用户「定时任务」设置页 + admin 调度查看入口
- 需求细化：
  1. **数据模型**
     - `schedules`：id, tenant, agent_id, title, schedule_type(`one_time`|`interval`|`cron`), run_at / interval_seconds / cron_expr, timezone, enabled, next_run_at, created_at, updated_at
     - `schedule_runs`：id, schedule_id, task_id, status(`triggered`|`failed`), error, triggered_at
  2. **REST API**（JWT 鉴权）：`POST/GET /api/v1/schedules`、`PATCH /api/v1/schedules/:id`（启停/改参数）、`DELETE /api/v1/schedules/:id`、`GET /api/v1/schedules/:id/runs`（运行历史）
  3. **调度 daemon**：gateway 内独立 setInterval（与 agent-sync 分离），每 30s 扫描 `enabled AND next_run_at <= NOW()` 的 schedules → 以租户身份调 task-manager 创建 task；**单飞防重入**（乐观锁 `UPDATE ... WHERE next_run_at = 旧值`），成功后推进 next_run_at
  4. **P9 gate 联动**：调度触发 createTask 若返回 403 `PARALLEL_TASKS_DISABLED` → schedule_runs 记 failed（error 含 code），不中断其他调度
  5. **前端**：用户中心新增「定时任务」页（新建：选 agent / 一次性时间或周期 / 启停 / 删除 / 运行历史）；管理后台可查看全局调度状态
  6. **配额与限制**：每租户 schedule 上限（默认 10）、单 schedule 最小间隔（60s）、时间戳精确到秒
- 验收标准：
  - 一次性任务到点自动创建 task 并执行成功
  - 周期任务按规则重复触发，无重复/漏触发（单飞）
  - 禁用后不再触发；删除后运行历史保留
  - P9 禁用租户：调度触发失败被记录（failed + error code），不影响其他功能
  - 运行历史可查（schedule_runs 关联 task 状态）

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
