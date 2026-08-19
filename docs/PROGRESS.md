# AgentX — 项目任务清单与进度

> Last updated: 2026-08-20 · 统一进度文档，替代过时的 `memory/AGENTX_PROGRESS.md`（后者已归档停用）
> 状态图例：✅ 完成 · ⏸ 代码完成待外部前提 / 未采用 · 🔧 进行中 · ⏳ 待办 · 🔵 技术债

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

- **当前**：可立即开发任务已清零；R17 / R17.5 / R17.6 支付引擎迁移全链路完成（2026-08-10：sdk@0.11.0~0.11.3 发布、0.1.1 首次跟随演练、0.1.2 剥离应对与业务侧重建、0.1.3 恢复 a2a/period 后切换回模块委托、生产部署+自测全绿、B 端零改动通知）；R18 B 端计费策略修订完成并生产部署（2026-08-11：放开 BYOK 强制 + SSE 精确计费，见下）；R19 C/B 端分角色商业化方案定稿待实施（2026-08-11：B 端钱包自助接入 + 独立 B 端面板 + 自助购套餐（LLM token），见下「## R19」）
- **待办**：均为外部前提——R4/R5（业务方凭据），见下
  - R1 ✅ 已完成（2026-08-06 · commit `0f5c30d`；SDK 0.8.7 已发布 npm）
  - R2 ✅ 已完成（2026-08-06 · 集成测试补 task 并行链路，生产 28/28 通过）
  - R4-R5 = 待外部前提任务（R4/R5 需业务方提供凭据）
  - R6 ✅ 已完成（2026-08-06 · 渠道归因启用）
  - R7 ✅ 已完成（2026-08-06 · 大文件拆分，commits `368bb93` / `d1fc80e` / `1f4ad27` / `2ff22b0`）
  - R8 ✅ 已完成（2026-08-06 · SDK 子路径，commit `a17a68a`）
  - R9 ✅ 已完成（2026-08-06 · revenue ERC20，commit `2deee30`）
  - R10 ✅ 已完成（2026-08-06 · 用户定时任务，commit `60c0744`）
  - R11 = 多调用方接入配置管理（新需求，2026-08-06 完成：迁移 014 + admin Integrations 端点 + 前端 Tab + 5 调用方 key 签发分发，见下）
  - R3 ✅ 已完成（2026-08-06 · DeepSeek 平台 key 配置 + conversation-service LLM_ENDPOINT/LLM_MODEL，非 BYOK 任务真实 LLM 输出补验通过）
  - R12 ✅ 已完成（2026-08-06 · commit `c224317`，MCP 6 工具）
  - R13 ✅ 已完成（2026-08-06 · 开发者自助申请）
  - R14 ✅ 已完成（2026-08-06 · B 端仅对话 + MCP 仅注册用户）→ **2026-08-08 部分修订**：并行任务统一 P9 能力位（见 R15）
  - R15 ✅ 已完成（2026-08-08 · B 端能力修订补完：强制 BYOK + 端用户订阅转发 + kind 统一 + sdk@0.10.1）→ **2026-08-11 部分修订**：并行任务放开 BYOK 强制，改平台精确计费（见 R18）
  - R16 ✅ 已完成（2026-08-08 · 审计闭环与文档补完：createTask 签名修正 + 边界澄清 + BYOM 文档 + 新调用方 key）
  - R17 ✅ 已完成（2026-08-10：A-E + F1 + F2 全部完成——sdk@0.11.0/0.11.1 发布、gateway 升级、旧包 deprecate、文档、生产升级、应用方通知、0.1.1 首次跟随演练；发布流程见下「### R17 支付引擎迁移发布流程」）
  - R17.5 ✅ 已完成（2026-08-10：@0xinfrax/payments@0.1.2 剥离 a2a/period rail——exact 锁定 → 业务侧重建 → sdk@0.11.2 发布 → issue #1 留痕并回复 infraX；见下「## R17.5」）
  - R17.6 ✅ 已完成（2026-08-10：@0xinfrax/payments@0.1.3 恢复 a2a/period rails（模块内置）→ AgentX 迁移回模块委托、sdk@0.11.3 发布、生产部署+自测（4648bb8 优雅 4xx 修复）、B 端零改动通知；见下「## R17.6」）
  - R18 ✅ 已完成（2026-08-11：B 端计费策略修订——并行任务放开 BYOK 强制，平台 LLM 按 done 事件 usage+llmSource 精确计费（SSE 透传解析 + 完成回调双通道、billedTaskIds 幂等）；生产部署 c69fdb7 + 历史对齐与防分歧加固；见下「## R18」）
  - R19 ⏳ 方案定稿（2026-08-11：C/B 端分角色商业化——B 端钱包自助接入 + 独立 B 端面板 + 自助购套餐（LLM token）、C 端购买闭环；方案见 `docs/billing-role-model-r19.md`，见下「## R19」）

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

**R2 集成测试补 task 并行链路** —— 优先级：高 · ✅ 完成（2026-08-06）
- 来源：原「当前状态」待办第 2 条
- 涉及：[scripts/agentx-integration-test.mjs](file:///home/ubuntu/Agentx/scripts/agentx-integration-test.mjs)
- 实施：新增 [6] Task 并行链路用例组（REST 直测 gateway 代理层，JWT 认证，测试租户=TEST_TENANT_ID）：
  1. **6.1 Session 幂等**：无 id 创建返回 sessionId；同 sessionId 重复创建幂等；新会话列表为空
  2. **6.2 并发多任务**：Promise.all 并发建 3 任务 → 3 个不同 taskId 立即返回 → 轮询全部终态（3/3 done）、≥2 done（并行真实执行）、result + usage 非空（真实 LLM，DeepSeek 平台 key）
  3. **6.3 SSE 重放**：`GET /tasks/:id/events` → text/event-stream，事件序列含 done 无 error
  4. **6.4 取消契约**：运行中任务 DELETE → cancelled；终态任务重复 DELETE 幂等（非 4xx/5xx）
  5. **6.5 P9 gate**：临时 UPDATE `allow_parallel_tasks=false` → POST task 403 `PARALLEL_TASKS_DISABLED` → 恢复原值 → 回归任务 done
  6. **6.6 清理**：取消运行中任务 + conversation DB 删本次 session（级联 tasks/events）+ gateway DB 删本次 usage_logs（时间窗口）+ 恢复租户原值；require 提升模块级（createRequire）
- 验收：生产全量 **28/28 通过**（[1]-[5] 原有 + [6] 14 项）；残留检查 0（smoke-r2 session 无）；脚本可作回归冒烟（退出码 0/1）

**R3 平台兜底 LLM key 有效化（解除任务真实执行阻塞）** —— 优先级：中 · ✅ 完成（2026-08-06）
- 来源：原「当前状态」外部前提第 4 条 + P8 验证备注
- 涉及：conversation-service 配置 + 平台兜底 LLM key
- 实施：
  1. 2026-08-06 配置正式 DeepSeek 平台 key：生产 gateway `.env` `DEEPSEEK_API_KEY` + admin API 写入 `platform_api_keys`（provider=deepseek，绑定 pro/enterprise，加密存储）——覆盖 gateway 侧平台模式
  2. conversation-service 平台兜底（非 BYOK 任务）：config 新增 `LLM_ENDPOINT` / `LLM_MODEL` env；`TenantLLMResolver` 第 3 级（AgentX 官方 key）支持自定义 OpenAI 兼容端点——生产 `.env` 配置 `OPENAI_API_KEY=<正式key>` + `LLM_ENDPOINT=https://api.deepseek.com/v1` + `LLM_MODEL=deepseek-chat`
- 验收标准（补验通过）：非 BYOK 租户（无 tenant_llm_configs / 无 header key）创建任务 → `status=done`，`result="2"`（1+1=2，DeepSeek 真实输出，`llmApiKeyEnc:null`，22 tokens，~1.3s）；running 态取消 → `status=cancelled`；smoke 数据已清理

**R4 法币订阅（Stripe）上线** —— 优先级：中 · 前提：Stripe 商户账号
- 来源：P2-2（⏸ 待 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`）
- 实施要点：配置两个环境变量 → 启用 Stripe Checkout / webhook（HMAC 验签）/ status API 链路 → 端到端验证（创建订阅 → webhook 回调 → status 查询）
- 验收标准：订阅全链路可支付、webhook 幂等处理、状态正确流转

**R5 x402 支付门卫启用** —— 优先级：中 · 前提：结算通道 + 收款钱包
- 来源：P2-3（⏸ 待 `X402_ENABLED=true` + `X402_PAY_TO`）
- 实施要点：配置两个环境变量 → 验证 `POST /agent/runs` 402 门卫（返回 `x-price/x-pay-to/x-network`）→ 支付后余额账本记账
- 验收标准：未支付请求 402 + 响应头齐全，支付后请求放行且账本正确

**R6 渠道归因启用** —— 优先级：低 · ✅ 完成（2026-08-06）
- 来源：原「当前状态」外部前提第 3 条
- 实施要点：向 `channels` 表插入渠道配置 → 前端 `?ref=` 归因上报 → report/settle 链路走通
- 验收标准：归因幂等、report 分成计算正确（复用 P7 smoke 已验证逻辑）
- 实现记录：激活渠道 `oxa-partner`（share_bps=125）；渠道归因 share = `amount_paid × share_bps / 10000`（BigInt 精确计算）；生产冒烟 5/5 PASS（归因幂等 / report 分成计算 / settle 台账）

**R7 大文件拆分** —— 优先级：低 · ✅ 完成（2026-08-06 · commits `368bb93` / `d1fc80e` / `1f4ad27` / `2ff22b0`）
- 来源：原「当前状态」技术债第 1 条
- 涉及：8 个 >760 行文件（`gateway/src/routes/mcp.ts`、前端 hooks/组件等）
- 实施要点：按模块拆分（链读/写、MCP 工具分组、组件拆分），保持对外 API 不变
- 验收标准：typecheck + build 全绿，行为无回归
- 实现记录：
  - gateway：`admin.ts`（重写 363 行）→ `admin-finance.ts`（395 行）+ `admin-partners.ts`（340 行），生产冒烟 10/10；`mcp.ts`（重写 86 行）→ `mcp-tools.ts`（32 工具声明）+ `mcp-executor.ts`（链配置/ABIs/helpers/executeToolCall），生产 curl tools/list 正常
  - 前端：`admin/page.tsx`（重写 105 行）+ `tabs/` 目录（9 tab + shared.tsx）；3 个 hooks 抽 `*-types.ts`（payment-gateway / multi-endpoint / agent-factory）+ 主文件 re-export 类型保持消费方兼容（usePaymentGateway 875→784、useMultiEndpoint 810→687、useAgentFactory 818→736）；3 个组件抽 `*-utils.ts` + 展示子组件 Card/Modal（EndpointManager 961→521、ConfigurationManager 816→372、SubscriptionManager 763→438）
  - 全程 typecheck 零错误；前端 build 25 页全部生成；生产 pull + build + pm2 restart 后 home/admin/dashboard 全部 200

**R8 SDK 主入口拆分子路径** —— 优先级：低 · ✅ 完成（2026-08-06 · commit `a17a68a`）
- 来源：原「当前状态」技术债第 2 条
- 涉及：[sdk/src/index.ts](file:///home/ubuntu/Agentx/sdk/src/index.ts)（re-export `useAgentRunner`）
- 实施要点：react hooks 移入独立子路径（如 `@agentxv2/sdk/react`），主入口去除 wagmi 依赖
- 验收标准：纯后端用户安装后无需 wagmi；前端用法不变
- 实现记录：package.json `exports` 增加 `./react` 子路径映射；主入口不再导出 react hooks；验证 `dist/index.d.mts` 无 `useAgentRunner`、`dist/react` 有；前端导入路径更新为 `@agentxv2/sdk/react`，typecheck + build 全绿

**R9 revenue ERC20 平台费展示** —— 优先级：低 · ✅ 完成（2026-08-06 · commit `2deee30`）
- 来源：原「当前状态」技术债第 3 条
- 涉及：gateway `admin/revenue` 端点 + 前端 admin RevenueTab
- 实施要点：ERC20 付费按 token 计价展示（预留扩展点已就绪），原生代币（OXA/ETH）展示不变
- 验收标准：混用代币付费时 revenue 按 token 分组展示正确
- 实现记录：revenue 按 token 地址查询平台费并分组展示；零地址（native sentinel）排除出 ERC20 分组、按原生代币展示（commit `a249d83` 修复 `pay_token='0x0...'` 被误计入 erc20 的问题）；生产 revenue 端点验证返回正确

**R10 用户定时任务（调度执行，新需求）** —— 优先级：中 · ✅ 完成（2026-08-06 · commits `60c0744` / `a249d83`）
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
- 实现记录：migration `017_schedules.sql`（schedules + schedule_runs）+ gateway `routes/schedules.ts`（REST CRUD + runs）+ `index.ts` 挂载（commit `a249d83` 补回，此前被误回退）+ 调度 daemon（30s 扫描，单飞乐观锁 `UPDATE ... WHERE next_run_at = 旧值` 防重入）+ 前端用户「定时任务」页 `user/schedules/page.tsx`。生产验证 13/14 PASS（创建/列表/启停/删除/一次性触发/周期触发/P9 gate failed 记录），测试数据清理后 0 残留；P9 禁用租户触发失败正确记录 `schedule_runs.failed` + error code

**R11 多调用方接入配置管理（新需求）** —— 优先级：高 · ✅ 完成（2026-08-06）
- 来源：2026-08-06 用户需求（已确认：平台侧集中管理 + 各调用方项目侧模板；各调用方独立租户 key；5 个调用方全部生成模板）
- 背景：外部系统调用 AgentX 需统一管理 `AGENTX_GATEWAY_URL` + `AGENTX_CONVERSATION_API_KEY`。调用方：aitrader / aiservicer / aihunter-saas（已存在）/ autoops / aiops-saas（目录未创建）
- 现状：① 仅 aiservicer 有 `AGENTX_GATEWAY_URL`（config.cjs，fetch gateway chat/mcp/agents）；`AGENTX_CONVERSATION_API_KEY` 全平台不存在；② 平台租户 = wallet + `api_key`（agentx_xxx，`X-Api-Key` 经 apiKeyAuth 识别），admin **无**创建租户/签发 key 端点（租户靠 wallet 登录自动创建）
- 平台侧：
  1. 数据表 `integration_partners`：id, slug(唯一), name, gateway_url, tenant_id, active, notes, created_at, updated_at
  2. admin 端点：GET /admin/integrations（列表）；POST /admin/integrations（创建调用方 = 自动创建租户 + 签发 `agentx_xxx`，明文 key 仅返回一次）；PATCH /admin/integrations/:id（URL/名称/active）；POST /admin/integrations/:id/rotate-key（轮换）；DELETE /admin/integrations/:id
  3. admin 前端：新增 **Integrations Tab**（卡片列表 + 创建/编辑/轮换/复制配置，显示 `AGENTX_GATEWAY_URL` + `AGENTX_CONVERSATION_API_KEY`）
  4. 租户创建：wallet_address 用系统标识（如 `partner-<slug>`），plan 可指定（默认 free 或 pro）
- 调用方侧：
  5. 统一变量约定：`AGENTX_GATEWAY_URL`（指向 AgentX 网关）+ `AGENTX_CONVERSATION_API_KEY`（租户 key，SDK `ConversationClient.apiKey` / `X-Api-Key`）
  6. 为 5 个调用方生成 `.env.example` 模板 + 说明（aitrader：python-backend；aiservicer：config.cjs 补 key 支持；aihunter-saas：TypeScript backend；autoops/aiops-saas：占位模板）
  7. 集成校验：`GET /api/v1/tenant/me` 验证 key 有效性
- 验收标准：
  - admin 可创建调用方并获得一次性明文 key；列表/编辑/轮换/禁用可用
  - 调用方用 gateway_url + key 可访问 /tenant/me、chat、tasks（apiKeyAuth 生效）
  - key 轮换后旧 key 立即失效
  - 5 个调用方均有配置模板（含占位）
- 实现记录：迁移 014 `integration_partners` + admin 5 端点（列表/创建=自动建租户 `partner-<slug>` + 签发 key/编辑/轮换/删除）+ 前端 Integrations Tab（创建/编辑/轮换/复制，明文 key 仅一次）+ 5 个调用方 key 全部签发并分发（aitrader/aihunter-saas 本地 `.env`，aiservicer/autoops 生产服务器 `.env`，aiops-saas 无项目仅占位文档 [docs/integration-callers.md](integration-callers.md)）。生产冒烟 10/10 PASS（列表/创建/API-key 鉴权/编辑/轮换旧 key 401 新 key 200/删除清理），5 key 有效性与 /tenant/me 验证 5/5（enterprise plan）。附加修复：生产 Redis 未运行导致 gateway 每请求阻塞 ~10s（ioredis 重连队列），启动 `agentx-redis` 容器（redis:7-alpine，6379）后恢复。部署：迁移已执行、gateway/frontend 均已 build + pm2 restart。

**R12 MCP 补充对话与任务管理工具（新需求）** —— 优先级：高 · ✅ 完成（2026-08-06 · commit `c224317`）
- 来源：SDK/MCP 覆盖检查（2026-08-06）：MCP 33 个工具全部为链上 + 网关只读（tenant/health），MCP 客户端无法发起对话/创建查询取消任务，无法消费 P8/P9 并行能力
- 平台侧：
  1. 新增 6 个 MCP 工具：`agentx_gateway_chat`（单轮对话，SSE 聚合为 reply+tool_calls）/ `create_session`（幂等）/ `create_task`（立即返回 taskId）/ `get_task` / `list_tasks` / `cancel_task`，工具总数 33→38
  2. 鉴权：每个工具支持 `api_key`（X-Api-Key）或 `access_token`（JWT）参数二选一（MCP 公开路由无 HTTP 头鉴权）；参数 snake_case，handler 转 camelCase 经 `127.0.0.1:config.port` 内部转发 gateway REST，P9 gate 403 透传
- 测试：新增 [gateway/test/mcp.test.ts](../../gateway/test/mcp.test.ts) 11 用例（tools/list 注册/参数校验/两种鉴权模式/SSE 聚合/错误事件），gateway 全量 27/27 通过
- 文档：MCP_SETUP.md（38 tools + Conversation & Tasks 表 + curl 示例）、mcp/README.md、[docs/sdk-vs-mcp.md](sdk-vs-mcp.md)（对话/任务行双通道等价）、README.md、docs/sdk-integration-example.md、[docs/integration-callers.md](integration-callers.md)（新增 §7.5 MCP 接入）
- 验证：生产部署 + 冒烟 7/7 PASS（tools/list=38 / create_session / create_task→running→done / get_task / list_tasks / cancel_task / chat 聚合）；任务执行错误 `Missing or invalid Authorization header` 为既有 R3 平台兜底 LLM key 未生效问题（非本次引入）

**R13 外部项目方自助申请 API Key（开发者接入申请）** —— 优先级：高 · ✅ 已上线（2026-08-06）
- 来源：2026-08-06 用户确认（R11 调用方 key 由运营线下在 admin Integrations Tab 手动签发，缺少外部项目方**自助申请**入口；复用 P7-5 B 端申请模型 + R11 自动建租户/签发 key 逻辑）
- 目标：外部项目方可自助提交接入申请 → admin 审批 → **自动**创建集成租户 + 签发 `agentx_` key；明文 key 在审批响应一次性返回，由运营线下分发给申请方（申请方无账号体系，沿用 R11 分发模式）
- 平台侧：
  1. migration 015：`partner_applications` 加 `type TEXT NOT NULL DEFAULT 'channel'`（'channel' | 'developer'）
  2. 公开端点 `POST /api/v1/developer/apply`（company/contact_name/contact_email/website/description → 创建 type=developer 的 application，status=pending）
  3. admin `POST /applications/:id/decide` 扩展：approve 按 `app.type` 分支——`developer` → 自动建租户（wallet=`partner-<slug>`，enterprise plan）+ 签发 `agentx_` key（明文仅响应一次）+ 创建 `integration_partners` 行；`channel` → 现有建 channel 逻辑不变
  4. admin `GET /applications` 返回 `type` 字段
- 前端：
  5. `/apply` 页改为**双 Tab**（渠道合作 / API 接入）；developer 表单提交至 `/api/v1/developer/apply`
  6. admin Applications Tab 支持 developer 类型审批，通过后展示一次性明文 key（复制分发）
- 验收标准：
  - 公开提交开发者申请成功 → admin Applications 可见 pending（含 type）
  - approve 后自动创建租户 + integration partner + key；响应含明文 key；key 经 `GET /tenant/me` 验证 200
  - 已审批申请不可重复审批（沿用现有保护）
  - channel 申请/审批流程回归无影响
- 验证：生产冒烟 4/4 PASS——① developer/apply 创建 type=developer application；② admin approve 返回 `type:'developer'` + `api_key`（`agentx_` 39 字符）+ integration partner（slug=smoke-dev-*）；③ 新 key 经 `GET /tenant/me` 200（enterprise plan · rate_limit_rpm=100 · max_concurrent=10）；④ channel 申请/审批回归返回 `channelId`；smoke 数据已清理

**R14 B 端能力边界：仅对话服务，MCP 仅注册用户** —— 优先级：高 · ✅ 已上线（2026-08-06）· ⚠️ 部分修订（2026-08-08）
- 来源：2026-08-06 用户确认——B 端调用方（R11/R13 签发的 `agentx_` key）**只允许使用对话服务**；B 端 key **完全不能调用 MCP**；MCP 对话/任务工具必须是正常注册用户（JWT）
- ⚠️ **2026-08-08 修订**：B 端反馈 `GET /tenant/me` 报 `parallel_tasks: true` 但 `POST /sessions` 403 `PARTNER_TASKS_DISABLED`（R14 kind 一刀切 与 P9 能力位冲突）。已删除 `chat-tasks` / `schedules` 的 partner 拦截，改为**统一 P9 能力位**（`allow_parallel_tasks ?? plan.features.parallel_tasks ?? true`），user JWT 与 B 端 key 一视同仁——**B 端 key 一个即可**，Enterprise 计划自动获得 sessions/tasks 并行能力。详见 CHANGELOG（2026-08-08）。
- 背景事实：B 端租户原 `quota_daily=0` 导致对话 400 不可用；任务执行（a2a-worker）无 BYOK 时会回退平台 key 消耗 LLM 且不计费
- 平台侧：
  1. migration 016：`tenants.kind TEXT NOT NULL DEFAULT 'user'`（'user' 注册用户 | 'partner' B 端集成租户）；回填 `wallet_address LIKE 'partner-%'` 存量租户（生产 5 行已回填）
  2. R11/R13 创建 B 端租户：`kind='partner'` + `quota_daily` 改为**继承套餐配额**（enterprise plan 当前 5,000,000/日，原硬编码 0 → 对话自动进入平台 key 分支）
  3. `TenantContext` 增加 `kind`；`apiKeyAuth` / `authMiddleware` / `verifyChallenge` 三处填充
  4. ~~B 端禁用任务：`chat-tasks` 全路由 `kind='partner'` → 403 `PARTNER_TASKS_DISABLED`（sessions/tasks 全部拦截）~~ → 2026-08-08 删除，改为统一 P9 能力位
  5. MCP 收紧：对话/任务 6 工具 schema 移除 `api_key`，`gatewayAuthHeaders` 仅接受 `access_token`（JWT 注册用户）【保持不变】
- 验收标准（2026-08-08 修订后）：
  - B 端 key approve 后租户 `kind='partner'`、`quota_daily` 继承套餐
  - B 端 key 调 `/sessions` `/tasks` → 按 P9 能力位：Enterprise plan（`parallel_tasks=true`）**放行**；能力位 false → `403 PARALLEL_TASKS_DISABLED`
  - B 端 key 调 `/chat/completions` 进入平台模式（非 401）
  - MCP 对话/任务工具传 `api_key` → 拒绝；传 `access_token` 正常转发【保持不变】
- 验证：单测 37/37（chat-tasks 重写为「B 端 key 遵循 P9 能力位」5 用例 + mock canAccessAgent 修复既有失败用例）；生产冒烟——① developer apply→approve→key（39 字符）；② 租户 `kind=partner, quota_daily=5,000,000`；③ `/chat/completions` **200**（2026-08-06 配置正式 DeepSeek 平台 key 后 B 端对话真实可用；key 记录于生产 `.env` 的 `DEEPSEEK_API_KEY`，经 admin API 写入 `platform_api_keys` 加密存储）；④ MCP 传 `api_key` → `access_token (registered-user JWT) is required for this tool` ✅；smoke 数据已清理

**R15 B 端能力修订补完：强制 BYOK + 端用户订阅转发 + kind 统一 + sdk@0.10.1** —— 优先级：高 · ✅ 完成（2026-08-08）· ⚠️ 部分修订（2026-08-11，见 R18）
- 来源：B 端反馈（`/tenant/me` 报 `parallel_tasks: true` 但 `/sessions` 403 `PARTNER_TASKS_DISABLED`）+ 需求确认（放开并行任务、partner 预算约束、端用户授权代调）
- 实施：
  1. **R14 修订**（`4652d1c`）：`chat-tasks` / `schedules` 删除按 `kind` 拦截的 partner gate → 统一 `parallelTaskGate`（P9 能力位 `allow_parallel_tasks ?? plan.features.parallel_tasks ?? true`），user JWT 与 B 端 key 一视同仁；能力位 false → `403 PARALLEL_TASKS_DISABLED`
  2. **partner 任务强制 BYOK**（`0f1b521`）：`POST /sessions/:id/tasks` 时 partner 租户必须携带 LLM key（`X-Llm-Api-Key` header / `llmApiKey` / `tenantKeyId` 三者之一），否则 `400 LLM_KEY_REQUIRED`（防平台兜底 key 被后台任务消耗）；chat 与 user 租户不受限
     > ⚠️ **2026-08-11 修订（R18）**：此条**已废除**——并行任务不再强制 BYOK，B 端不带 key 时走平台 key 并按 token 精确计费（SSE done 事件 + 完成回调双通道）。保留此处仅作历史留痕。
  3. **B 端端用户订阅转发**（`e8be980`）：请求带 `X-End-User-Id: 0x<钱包>`（或 body `endUserId`）→ 网关按该钱包做「拥有/订阅」授权检查（agent-access `kind='partner'` 分支），通过即放行对话/任务；端用户记忆隔离不变
  4. **SDK 0.10.1 发布**（CI `bump=patch`，run 31227825434）：`ConversationCreateTaskParams.endUserId?` / `ConversationChatParams.endUserId?` per-request 透传；已发布 npm `@agentxv2/sdk@0.10.1`（latest）
  5. **kind 统一**：生产 5 个 `partner-*` 租户全部 `kind='partner'`（`UPDATE 2`：aiservicer/autoops 由 user→partner，R13 创建时 kind 混用的历史遗留），预算约束与端用户转发对全部 B 端 key 一致
  6. **文档**：`sdk/README.md`（0.10.1 Released + B 端 key vs JWT 差异 + MCP 边界「平台 vs 自建」note）、`sdk/UPGRADE.md`（差异对照表 + 0.10.1 标注已发布）、`docs/integration-callers.md`（强制 BYOK 说明 + FAQ `LLM_KEY_REQUIRED` + MCP 边界）、CHANGELOG
- 验收/验证：
  - gateway 单测 **46/46**（P9 gate 5 用例 + B 端 end-user proxy 5 用例 + BYOK 守卫 4 用例；mock `canAccessAgent`/`lib/db`/`lib/crypto`）
  - 生产实测：partner key `/sessions` **201**（原 403）；无 BYOK 建 task **400 `LLM_KEY_REQUIRED`**；带 `X-Llm-Api-Key` 建 task **201**（真实执行 done）；smoke 数据已清理
  - `sdk@0.10.1` 已发布 npm（0.10.1，CI 自动回推版本号 `b04f6f8`）；三服务 `^0.10.0` semver 兼容无需强制升级
- 影响面（对调用方）：零代码改动；仅 partner 建任务需新增传 LLM key（header/参数，非代码改动）；`aiops-saas/aihunter-saas/aitrader` 原即 partner，`aiservicer/autoops` 由 user→partner 后任务同样强制 BYOK + 获得端用户转发能力；MCP 通道维持仅注册用户 `access_token`（R14 收紧不变）；A2A 上链/发布/订阅仍走用户钱包签名（平台不持私钥）

**R16 审计闭环与文档补完（createTask 签名修正 + 边界澄清 + BYOM 文档 + 新调用方 key）** —— 优先级：高 · ✅ 完成（2026-08-08）
- 来源：B 端/审计反馈闭环（createTask 参数不一致、BYOK 适用范围、MCP 边界、应用侧建议项、对话工具模型）+ 新集成方接入
- 实施：
  1. **createTask 签名文档修正**（`793470d`）：`integration-callers.md` §6/§7 由过时签名 `createTask(sessionId, { input })` / body `{ input }` → `createTask({ sessionId, agentId, message })` / body `{ agentId, message }`（与 SDK 0.10.1 签名 `ConversationCreateTaskParams` 及 gateway 校验一致：`message` 必填、`agentId` 或 inline `prompt/skills` 必填）；无代码/API 变更
  2. **三服务 SDK 对齐 `^0.10.1`**（`2e4fdb6`）：gateway / conversation-service / frontend 依赖 0.10.0 → `^0.10.1`（生产机 conversation 未提交的手动升级正式化）；本地+生产 node_modules 均 0.10.1，三服务 tsc 全绿
  3. **边界澄清**（`29a87de`，决策维持现状）：BYOK 守卫**适用范围**——只约束 partner 经 REST/SDK 创建的并行任务，平台托管后台路径（定时任务/编排）按存储 `tenantKeyId` 或平台兜底；**B 端最终用户路径**——对话/任务由 REST + `agentx_` key + `X-End-User-Id` 完整覆盖，平台 MCP 维持仅注册用户 JWT，「B 端用户 → AgentX JWT」记作未来独立设计项（无需求 + 自建 MCP 替代路径 + 需安全设计）
  4. **应用侧建议项文档化**（`2607ec0`）：显式配置 `AGENTX_CONVERSATION_LLM_KEY`（SDK 构造 `llmApiKey`，任务自动 BYOK）+ `createSession` 补传 `agentId`（绑定会话到 Agent）；交付包 `agentx-callers.env` 更新为 7 调用方 + LLM Key 建议段 + SDK ≥0.10.1 示例（含真实 key，不入库，仅本地交付）
  5. **对话 Skill 执行模型文档**（`538e9a2`）：`publish-subscribe-pay.md` §1.6「如何在对话中引入你自己的 MCP」——对话工具 = 发布时声明的 skills（**无 MCP server 注册表**，注册点=发布）；`execution.type` 三模型 `open`/`mcp`/`a2a`；路径 A（发布者 skill 配自定义 MCP endpoint，平台不代理其鉴权）+ 路径 B（B 端 `loadInline` 注入自定义 MCP/HTTP 工具）；最终用户不能给别人的 Agent 临时加工具
  6. **新集成方 key 签发**（生产数据，无代码）：`partner-infrax`（enterprise、parallel_tasks 放行、kind=partner），key 明文已单次交付调用方；生产 7 个 partner-* 租户 kind 全部为 `partner`
  7. **SDK 审查加固 + endUserId 澄清**（`8f22e88`，**已随 0.10.2 发版**）：① `createTask()` per-request `endUserId` 统一以 `X-End-User-Id` header 发送（与 `stream()` 机制一致；0.10.1 已发布版本走请求体透传，Gateway 优先 header 回退 body，两版兼容，调用方零改动）；② 澄清 `endUserId` **全程可选、缺省不会被拒**——缺省授权主体回退租户自身钱包（user 天然=用户钱包；partner 不代理，链上失败返回 `403 AGENT_ACCESS_DENIED`），非 `0x` 仅记忆隔离，平台**无**「必须带 endUserId」强制校验（否定审计方第 6 条「sessions/tasks 必须带 endUserId / gatewayConfig() 统一注入」的不实描述，`gatewayConfig()` 全仓库 0 匹配）
  8. **tenantKeyId 租户隔离澄清**（B 端审计反馈 ②）：`tenant_api_keys` 按 `tenant_id` 归属，`tenantKeyId` 跨租户复用报 `400 Tenant API key not found or inactive`（已有调用方沿用其他租户的 tenantKeyId 触发）；已文档化「key 轮换 / 切换租户后必须用新 Key 重新存 BYOK」——`integration-callers.md` §6 + FAQ、`sdk/README.md` tenantKeyId note；无代码变更
  9. **发布 sdk@0.10.2**（2026-08-08）：#7 的仓库级加固正式纳入 npm（patch）——build + typecheck 通过、vitest **32/32**、远端 `latest = 0.10.2` 确认；UPGRADE/CHANGELOG 同步
  10. **发布 sdk@0.10.3**（2026-08-08）：exports 暴露 `"./package.json"`（修复 `ERR_PACKAGE_PATH_NOT_EXPORTED`，调用方可直接 `require('@agentxv2/sdk/package.json').version`）——纯元数据 patch；生产三服务同步升级 + build + restart
- 验收/验证：三处（本地 / GitHub / 生产）同步在最新 HEAD `8f22e88`；SDK typecheck + 单测 **32/32**；gateway **46/46** 无回归（本次无 gateway 代码变更）；新 key `GET /tenant/me` **200**
- 影响面：调用方零代码改动；partner 建任务带 BYOK 是唯一新增要求（已文档化为显式 `AGENTX_CONVERSATION_LLM_KEY` 建议）

### R17 支付引擎迁移发布流程（✅ 2026-08-10 全部完成，含 F2 跟随演练）

> 背景：通用支付引擎移交 infraX，以 `@0xinfrax/payments@0.1.0` 发布（2026-08-08）；AgentX 依赖切换代码提交（`323d3c9`）后按本流程执行——sdk@0.11.0 发布、gateway 升级、生产升级与冒烟、应用方通知、F2 首次跟随演练全部完成（2026-08-10）。
> 方案文档：[docs/payments-infrax-migration.md](payments-infrax-migration.md)（§四执行状态：✅ 全部完成）

| 阶段 | # | 任务 | 命令 / 通过标准 | 状态 |
|---|---|---|---|---|
| A 前置确认 | A1 | 确认 infraX 集成完成 | 对方确认 / infraX 仓库已有消费方接入 | ✅ infraX `projects/payments/` 迁入 + `@0xinfrax/payments@0.1.0` 发布（cc98172，2026-08-08） |
| | A2 | 本地 main 最新且干净 | `git pull`；`git status` 干净 | ✅ main 与 origin 同步、工作区干净 |
| | A3 | 新包可查 | `npm view @0xinfrax/payments version` → `0.1.0`（404 则 `--prefer-online` 或等待 CDN） | ✅ 0.1.0 |
| B sdk 验证+发布 | B1 | sdk 全量验证 | `npm run build && npm run typecheck && npm test` 全绿 | ✅ 32/32 全绿（含 `PAYMENT_VERSION` 断言 0.2.0→0.1.0 修正 `55ef9f2`） |
| | B2 | dist 引用确认 | `dist/` 无 `@agentxv2/payments` 残留 | ✅ 无残留 |
| | B3 | bump 0.11.0 | `npm version 0.11.0`（commit + tag） | ✅ commit `3435a01` + tag `v0.11.0` |
| | B4 | 发布 | `npm publish --registry=https://registry.npmjs.org/` | ✅ 发布成功 |
| | B5 | 发布验证 | `npm view @agentxv2/sdk@0.11.0 dependencies` 含 `@0xinfrax/payments` | ✅ `@0xinfrax/payments@^0.1.0`，latest=0.11.0 |
| C gateway 升级 | C1 | 升级 sdk | `npm install @agentxv2/sdk@^0.11.0 --registry=https://registry.npmjs.org/` | ✅ lock 解析 0.11.0 |
| | C2 | lock 干净 | `package-lock.json` 无 `@agentxv2/payments` / `../payments` | ✅ 残留 0（手动移除 extraneous `../payments` 块） |
| | C3 | 复跑验证 | `npm run build && npm run typecheck && npm test` 全绿 | ✅ 46/46 全绿 |
| D 旧包+文档 | D1 | 旧包 deprecate | `npm deprecate @agentxv2/payments "已迁移至 @0xinfrax/payments"` | ✅ 4 版本（0.1.0/0.2.0/0.2.1/0.2.2）全部 deprecate |
| | D2 | sdk 版本更新文档（root CHANGELOG.md） | 0.11.0 + 0.11.1 条目：依赖切换 / `PAYMENT_VERSION` 对齐 / 升级提示 / F2 演练与确认 | ✅ 2026-08-10 两条均已补（0.11.1 于 c13db37 后补充） |
| | D3 | PROGRESS + 方案文档更新 | 本表打勾、§三/§四标记完成 | ✅ 本文档 + `payments-infrax-migration.md` |
| | D4 | 提交推送 | commit + push | ✅ commit `47d3d72` + tag `v0.11.0` 已推送 origin/main |
| E 生产升级 | E1 | 生产机升级 sdk | `npm install @agentxv2/sdk@^0.11.0 --registry=https://registry.npmjs.org/`（生产 `~/.npmrc` 为腾讯云镜像，须显式官方 registry，不改全局） | ✅ 生产 pull 至 `2e2aaa8`，gateway `npm install --registry=https://registry.npmjs.org/`，sdk=0.11.0 / @0xinfrax/payments=0.1.0，旧 `@agentxv2/payments` 已移除 |
| | E2 | 重启 + 冒烟 | `/api/v1/payments/info`、`/access` 正常；x402/fiat 各验一笔 | ✅ pm2 restart，日志干净（indexer/A2A/schedule 全启动）；`/info` 返回统一引擎 payload（fiat/x402 按配置 disabled、chain enabled、oxachain 19505），`/access` 正常返回 active:false；x402/fiat 轨道生产配置 disabled（待 R4/R5 外部凭据），info 已正确反映，无法各验一笔 |
| F 通知收尾 | F1 | 应用方通知 | 通用文案：升级 `@agentxv2/sdk` 至 0.11.x，业务零改动 | ✅ 文案见 `payments-infrax-migration.md` §五；应用方盘点：aiservicer（^0.9.1，不受影响，升级为推荐项）、autoops（无 sdk 依赖） |
| | F2 | 首次跟随演练 | 与 infraX 约 `@0xinfrax/payments@0.1.1` 走一遍完整跟随 check-list | ✅ **F2 完成（2026-08-10）**——infraX 已发布 `@0xinfrax/payments@0.1.1`；AgentX 升级依赖（sdk/gateway `^0.1.1`）、解耦回归 19 项断言通过（run-decouple.sh 改为消费已安装 npm 包）、sdk build+typecheck+32/32、发布 `@agentxv2/sdk@0.11.1`（tag `v0.11.1`）、gateway 升级 `^0.11.1`（46/46）；**本次演练由 infraX 侧代为执行，AgentX 审阅核实后确认「保留」**（生产实装 0.11.1/0.1.1 冒烟一致） |

- 回滚预案：依赖回滚 `npm install @agentxv2/sdk@0.10.3` / `@agentxv2/payments@^0.2.2`（官方 registry）；代码回滚 `git revert 323d3c9`（旧包未删，双保险）

---

## R17.5 支付引擎 0.1.2 剥离 a2a/period（2026-08-10，✅ 完成）

> **事件**：infraX 发布 `@0xinfrax/payments@0.1.2`，按「通用支付引擎只提供通用支付通道」定位，**移除 a2a rail 与 period 授权 rail**（删除 A2AClient/PeriodClient、`payment_authorizations` 表、005 迁移、a2a/period 端点与事件；保留通用字段 `PaymentPeriod` day/week/month/year 与 chain/fiat/x402/MPP/稳定币，测试 89/89）。按 MIGRATION.md 约定属**行为变更**，infraX 已主动知会。

- **影响确认（AgentX 定制层确实引用 a2a/period）**：
  - `sdk/src/payment/index.ts`：re-export `A2AClient`/`PeriodClient`（公开 API 面）→ 0.1.2 下编译失败
  - `gateway/src/services/payments.ts`：import `PgAuthorizationStore` + period 配置块（`config.periodEnabled`）→ 0.1.2 下编译失败
  - `gateway/src/routes/payments.ts`：`POST /payments/a2a`（`method:'a2a'`）、`POST /payments/a2a/settle`（`a2aSettle`）、`POST /payments/period/charge`（`chargePeriod`）、`GET /payments/period/authorization`（`getAuthorization`）→ 0.1.2 下方法不存在
  - 不受影响：agent-loop `a2a-daemon.ts`/`executor.ts` 的 `a2a.*`（链上 A2A 协议客户端，非 payments 能力）；`subscription.ts` 的 `period`（通用字段）
- **防护动作（✅ 已完成）**：sdk/gateway 依赖 `@0xinfrax/payments` `^0.1.1` → **`0.1.1`（exact 锁定）**，lock 已同步（commit `6071ce6`），阻止任何 `npm install` 静默拉到剥离版；typecheck 通过
- **待办**：
  - [x] 业务侧方案评估：a2a-pay / period 授权端点是否有业务在用——A) 业务侧重建（gateway 自持表+逻辑）B) 移除（若无业务）C) 请 infraX 以插件/可选模块保留（**已决策 A：业务侧重建，保持 sdk API 兼容，B 端零改动**）
  - [x] GitHub issue 留痕（✅ 2026-08-10 issue #1 https://github.com/sftgroup/Agentx/issues/1，label dependency+payments）
  - [x] 回复 infraX：确认引用点 + 请求协助评估（✅ 2026-08-10 已发送——issue #1 评论 #issuecomment-5242199966，文案见下「infraX 通知文案」）
  - [x] 解除锁定 → 升级验证（✅ 2026-08-10：sdk/gateway 升 0.1.2，typecheck/test/build 全绿、引擎解耦回归全 PASS、0.1.2 下 F7/F8 全 PASS；commit 78f6ae0）→ ✅ 发 sdk@0.11.2（2026-08-10 已发布 npm + tag v0.11.2）
- **业务侧重建实施（R17.5，代码已落地，本地回归全绿）**：
  - 迁移 `gateway/db/migrations/021_payments_a2a_period_selfhost.sql`：`payment_intents`（含 payee 列）+ `payment_authorizations`，幂等建表（019 已有同构表，语句 IF NOT EXISTS）
  - 新服务 `gateway/src/services/payments-a2a-period.ts`：`A2APeriodService`（createA2AIntent / a2aSettle（复用引擎 verifyPayment 链上验收入账）/ createPeriodAuthorization（新，verifyPayment + 幂等写授权）/ chargePeriod / getAuthorization）
  - 组装剥离 `gateway/src/services/payments.ts`：移除 `PgAuthorizationStore` import + x402.period 配置块 + `authorizations` store，保留 mpp/mppStore
  - 路由 `gateway/src/routes/payments.ts`：`/payments/a2a`、`/payments/a2a/settle`、`/payments/period/charge`、`/payments/period/authorization` 改走 `a2aPeriodService`（HTTP 契约不变）；统一 `POST /payments` a2a 分支同步改造；**新增** `POST /payments/period/authorize`（0.1.2 移除 x402 `period` accept 后的授权创建入口，链上验证 + 幂等落表）
  - sdk 本地客户端 `sdk/src/payment/a2a-client.ts` + `period-client.ts`：`A2AClient`/`PeriodClient` 签名与引擎版逐字一致（`ClientOptions` 仍从引擎导入），`index.ts` re-export 改本地
  - 回归：sdk typecheck / 32 tests / build ✓；gateway tsc ✓；本地完整环境（anvil + MockUSDC + gateway + DB）**F7（改造为 authorize 端点流程）/ F8 全 PASS**；统一端点 a2a 分支 ✓；authorize 幂等（同 txHash 不重复创建）✓
  - 行为变更记录：x402 challenge 不再提供 `period` accept（与 0.1.2 引擎一致）；period 授权改由 `POST /payments/period/authorize` 显式创建
- **infraX 通知文案（✅ 2026-08-10 已发送，issue #1 评论 #issuecomment-5242199966）**：
  > 主题：AgentX 对 `@0xinfrax/payments@0.1.2` 剥离 a2a/period rail 的回应（issue #1）
  > 1. **引用点确认**：AgentX 定制层确实引用了 a2a rail 与 period 授权 rail——sdk re-export `A2AClient`/`PeriodClient`；gateway 路由 `POST /payments/a2a`、`POST /payments/a2a/settle`、`POST /payments/period/charge`、`GET /payments/period/authorization` + 统一 `POST /payments` 的 a2a 分支（issue #1 已列明，与贵司移除点一一对应）。
  > 2. **已按「业务侧重建」落地（R17.5）**：gateway 自持 `payment_intents`/`payment_authorizations` 表（迁移 021）+ `A2APeriodService`（复用引擎 `verifyPayment` 链上验收入账，保持依赖解耦）；新增 `POST /payments/period/authorize` 作为 0.1.2 移除 x402 `period` accept 后的授权创建入口；HTTP 契约与 sdk 公开 API 完全不变，B 端调用方零改动。
  > 3. **已发布 `@agentxv2/sdk@0.11.2`**（依赖 `@0xinfrax/payments@0.1.2` exact），回归全绿（0.1.2 下 F7/F8 全 PASS）。
  > 4. **请求协助评估**：a) 后续若引擎计划回归 a2a/period 或提供插件/可选模块，AgentX 可评估切回引擎原生能力，业务侧重建代码保持独立不影响；b) period 授权语义（autorenew/exhaust、逐期 charge）引擎侧是否有路线图可共享，便于双方对齐契约。

---

## R17.6 支付引擎 0.1.3 恢复 a2a/period（2026-08-10，✅ 完成）

> **事件**：infraX 发布 `@0xinfrax/payments@0.1.3`，**恢复 a2a rail 与 period 授权 rail（模块内置）**并新增 batch / invite / transfer rails——正是 R17.5 请求协助评估的方向（回归引擎原生能力）。AgentX 将 R17.5 的自托管实现**迁移回模块委托**（HTTP 契约与客户端签名逐字不变）。

- **`@agentxv2/sdk@0.11.3` 已发布 npm**（patch，tag `v0.11.3`）：
  - 依赖 `@0xinfrax/payments` 0.1.2 → **0.1.3**；`PAYMENT_VERSION` 对齐 0.1.3
  - `A2AClient` 继续由 SDK 本地实现（修复 0.11.1 ESM 构建从引擎导入已移除导出导致的启动崩溃，签名不变）；`SubscriptionPayments` + 协议客户端（MPP/A2A/Period/X402/Payments）**API 不变——业务方零改动**
- **网关变更（迁移回模块委托）**：
  - `services/payments-a2a-period.ts`：`createPayment({ method: 'a2a' })` / `a2aSettle` / `chargePeriod` / `getAuthorization` 委托模块；**保留自托管 `createPeriodAuthorization`**（模块无公开创建接口）；period 授权表写入后回填 payee 审计列
  - `services/payments.ts` 组装：a2a rail 开关跟随 `config.x402Enabled`；注入模块 `PgAuthorizationStore`（模块自有 `payment_authorizations` 表）
  - `payments-bridge.ts` 新增审计 seam：`recordIntent` / `updateIntentStatus` 幂等写入 `payment_intents`（迁移 021 表）
  - **错误修复（commit `4648bb8`）**：a2a/period 委托路径在 rail 禁用 / 参数不合法时由 **500 改为优雅 4xx**——400 `INVALID_INPUT` / 404 `NOT_FOUND` / 409 `INSUFFICIENT_BALANCE` / 503 `NOT_CONFIGURED`（R17.5 既有行为修复，非回归）
- **数据库（生产已执行）**：迁移 **019**（`payment_sessions` / `payment_vouchers`）+ **021**（`payment_intents` / `payment_authorizations` / payee 列）——支付基础设施全部就位；生产 rails 保持**关闭（不对外开放）**，仅 chain rail 生效
- **验证**：sdk vitest 32/32、gateway 46/46、双方 tsc 通过；生产自测全绿（health / payments/info / access / a2a worker + 禁用 rail 优雅 4xx）
- **配套文档**：sdk README/UPGRADE 同步 0.11.3（commit `106e27f`）；DEPLOYMENT.md 修正生产 DB 端口（5433 单库）/ SSH 凭证 / 迁移执行标记（`f2f674a`）；CHANGELOG R17.6 条目（`a461c0b`）；知识图谱增量更新至 `a461c0b`（`.ua/`，`2a856c3`）
- **通知（B 端零改动）**：`npm install` 吸收 0.11.3 即可（锁精确版本者升级至 0.11.3）；曾用 0.11.1 ESM 构建（启动崩溃）必须升级 ≥0.11.2；`PAYMENT_VERSION` 0.1.2 → 0.1.3 仅当断言该常量时需感知

### R18 B 端计费策略修订：放开 BYOK 强制 + SSE 精确计费（✅ 完成并生产部署，2026-08-11）

> 背景：R15 强制 partner 并行任务携带 BYOK（`400 LLM_KEY_REQUIRED`）。用户确认调整为「**并行任务也不强制 BYOK，平台按 token 计费**」——B 端实时对话与并行任务均可省略自带 key，走平台 key 时按 LLM 实际消耗精确计量（套餐配额 `tenants.quota_daily` / Redis `quota:<tenantId>`）。

- **策略修订**（`gateway/src/routes/chat-tasks.ts`）：删除 partner 任务 BYOK 强制 guard。B 端不带 key 时经 `TenantLLMResolver` 平台分支走平台 key，按任务 `done` 事件的 usage 精确计费
- **SSE 精确计费（方案 B）**：
  1. conversation-service：`TenantLLMResolver.resolve()` 返回 `{ provider, source: 'byok' | 'platform' }`（4 分支：header BYOK / DB 持久化 BYOK → byok；平台 key / GatewayProvider 兜底 → platform）；`AgentRunSSEEvent` 新增 `llmSource`，两处 `done` 事件携带 `llmSource` + `usage`（AgentLoop 跨迭代累计 `promptTokens/completionTokens/totalTokens`）
  2. gateway 新建 `services/sse-usage.ts`：`pipeSSEWithUsage` 逐 chunk 字节级透传 + 按 `\n\n` 定界缓冲解析 `data:` 行 → 命中 `type==='done'` 回调 `{ totalTokens, llmSource }`；支持任务包装格式 `{seq,type,payload}`（usage/llmSource 在 payload 内）；畸形行容错
  3. `/agent/runs`（agent-runs.ts）：平台模式才累计 `platformTokens`（`llmSource==='platform'`；旧版无 llmSource 时回退启发式 `!headerApiKey && !tenantKeyId`）；流关闭后 fire-and-forget `updateQuota`
  4. `/tasks/:id/events`（chat-tasks.ts）：`pipeTaskSSE` 仅认精确 `llmSource==='platform'`（任务通道保守，无启发式）；`billedTaskIds` 幂等集合防重复订阅重复计费
  5. **任务完成回调**：conversation-service `task-manager.ts` 任务完成后捕获 `llmSource`，平台模式且 token>0 时 fire-and-forget POST `{gatewayUrl}/api/v1/internal/task-billing`（复用 `X-Orchestrate-Token` 信任边界）→ gateway `routes/internal-task-billing.ts`：校验平台模式 → `wallet_address`→tenantId 映射 → `updateQuota`——覆盖无订阅者的后台任务；`services/task-billing.ts` 抽共享 `billedTaskIds`，SSE 与回调双通道任一先到只计一次
  6. **修复计量 bug**：`pipeSSEWithUsage` 此前只解析扁平格式，任务通道 SSE 计量实际从未生效（usage 提取为 0）——已修复
- **验证**：gateway typecheck + **59/59**（chat-tasks BYOK 用例改「不带 BYOK → 201」+ internal-task-billing.test.ts 6 用例含幂等 + sse-usage.test.ts 加包装格式用例）；conversation-service typecheck + **11/11**；sdk README 同步（移除「partner tasks require BYOK」描述）
- **生产部署**（43.159.60.46，commit `c69fdb7`）：
  - **git 历史对齐**：生产服务器此前停在 filter-repo 重写前的旧哈希历史（`4648bb8`），`git pull` 报 divergent → `git fetch origin main && git reset --hard FETCH_HEAD` 一次性对齐（已执行；旧历史含已轮换密钥，顺带清除）
  - **防分歧加固**：服务器 `pull.ff=only`；删除残留分支 `prod-patches-20260807`；纪律 = 服务器 main 只 pull 不 commit；若再次重写/force-push 历史必须当天同步重新对齐所有服务器
  - **验证**：gateway/conversation health ok（chain+db connected，66 agents 同步）；`/api/v1/internal/task-billing` 已注册且错误 token → 401；`/runs`、`/tasks` 路由注册正常；双进程稳定无崩溃循环；`ORCHESTRATE_TOKEN` 两服务 .env 一致（回调通道可用）
- **调用方影响**：B 端零代码改动；并行任务原必须带 LLM key（header/参数），现可省略（平台 key 按 token 计费，不扣调用方 key）

### R19 C/B 端分角色商业化方案（✅ 已上线，2026-08-12 · commit `2295443` + `d9eecd3` + `7014f17`）

> 背景：商业模式对齐——**B 端**（API/REST/SDK 调用对话，用平台 LLM 付费）目标改为「钱包登录 → 自动生成用户 → 独立 B 端用户面板 → 面板内自助购买套餐 → 面板自动获得 key」；**C 端**（注册用户）目标为「购买 LLM token 套餐」自助闭环。当前 B 端仍是「申请 → admin 审批 → 手动签发 key」模式。完整方案见 `docs/billing-role-model-r19.md`。

- **现状差距**：G1 B 端无钱包登录建租户（仅 `partner_applications` 申请通道）· G2 无独立 B 端面板 · G3 无自助购套餐（admin 手动分配 plan）· G4 key 由 admin 签发（无自助）· G5 C 端购买闭环缺失（R4 Stripe 待办）· G6 用户端无独立「配额/账单」页（仅 chat 内联计数，无进度条/升级入口）· G7 chat 页无 429 配额耗尽引导 · G8 Admin 套餐页只读（无配额数值编辑 UI）· **G9 A2A 委派无按次付费**（仅拥有/订阅，临时委派子 agent 被拒）
- **关键复用**：C 端钱包登录（auth.ts EIP-191 → JWT）**已自动签发 `agentx_` key**（新钱包注册即发，kind=user）→ B 端仅需新增 partner 注册通道；R18 计费链路（`updateQuota`/SSE+回调）购买后直接衔接，零改造
- **设计决策**（D1-D11）：钱包登录扩展 B 端通道（kind=partner）· **申请模式全自助下线**（T1，人工审批融入未来客服系统）· 支付通道链上优先（x402/P2 现成），Stripe 待凭据（复用 R4 铺路）· B 端面板独立路由（`/b/*`）API 严格 scoped · C 端新增 Billing 页（与 agent 订阅 plans 页区分）· 购买仅更新 `plan_id/quota_daily` · C 端 Billing 页带**用量进度条 + 升级入口**，chat 页 429 `daily_quota` 加**配额耗尽引导**（exceeded 提示/升级 CTA/BYOK 提示）· Admin plans 页支持**配额数值编辑**（quota_daily/RPM/并发，即时生效）· **新 key hash 化**（T2）· **订阅制**定价（T4）· **B 端无免费套餐**（T3）· **A2A 委派按次付费走 x402 余额模式**（T5，服务端自动 deduct）· **D11 套餐购买复用 infraX 支付引擎**（统一入口扩展 tenant-plan 语义，不新建支付链路）
- **落地拆分**：R19.1 B 端钱包登录+自动建租户+自动发 key（新 key hash 化、无免费套餐）→ R19.2 B 端面板骨架（套餐/用量/key 管理）→ R19.3 自助购买通道（链上优先）→ R19.4 C 端 Billing 页 + chat 页 429 配额耗尽引导 → R19.5 申请模式下线（人工审批融入客服系统）→ R19.6 Admin 套餐配额数值编辑 → **R19.7 A2A 委派按次付费（x402 余额模式，A2A-1~A2A-6）**
- **安全要点**：**新 key hash 化**（SHA-256，存量明文保留）；面板租户隔离；key 仅显示一次 + 轮换入口；**B 端无免费套餐**抑制批量注册刷量
- **决策记录**（2026-08-11 已定）：T1 全自助（下线独立申请流程，人工审批融入未来客服系统）· T2 仅新 key hash 化（存量明文保留）· T3 B 端租户无免费套餐（quota_daily=0，购订阅后才可用平台 LLM）· T4 订阅制（月费+每日配额，复用 plans 表+quota_daily；按量预充值为后续扩展）· **T5 A2A 按次付费 = x402 余额模式**（2026-08-12 定，服务端自动 deduct，MPP voucher 需签名不适合 worker 编排；方案详见 billing-role-model-r19.md §11）
- **验收标准**：B 端钱包登录→自动获 key→面板购套餐→key 调通 `/runs` 与并行任务→用量实时反映；C 端购套餐→`quota_daily` 即时生效→chat 页用量进度条同步，耗尽时出现 429 引导；Admin 可编辑配额数值即时生效；R18 计费链路回归不受影响；**R19.7 A2A 委派未订阅 agent 可经 x402 余额按次扣费放行**
- **实施记录**（2026-08-12，commit `2295443`/`d9eecd3`/`7014f17`/`975ec1a`）：R19.1 沿用 · R19.2 B 端面板（key 轮换 `POST /tenant/rotate-key` + x402 余额/充值 + 30 天调用统计）· R19.3 统一支付入口 `purpose=tenant-plan`（SDK `TenantPlanPayments`，@agentxv2/sdk@0.11.5）· R19.4 C 端 `/user/billing` + chat 429 升级引导 · R19.5 `/developer/apply` → 410 下线 · R19.6 Admin plans 配额行内编辑 · R19.7 `a2a_pay_log`（迁移 023）+ `canAccessAgentOrPay` 按次扣费
- **生产部署与验证**（43.159.60.46，2026-08-12）：
  - **迁移**：生产 PG 已执行 `023_a2a_pay_log.sql`（幂等）
  - **配置**：`X402_ENABLED=true` + `X402_PAY_TO=0x70997970C51812dc3A010C7d01b50e0d17dc79C8`（统一环境文件 scripts/local-payments 地址），oxachain 链验证
  - **API 冒烟**：B 端 partner 注册 + 自动发 key、`/tenant/me`（含 kind）、plans 3 档、usage、rotate-key（旧 key 401/新 key 200）、`/developer/apply` 410 → **全部通过**
  - **链上闭环**：向 payTo 充值 0.5 OXA → `/x402/verify` 记账（余额 0.5 OXA）；pro 套餐金额不足购买 → 422 拒绝且 plan 不绑定
  - **A2A 按次**：未拥有 agent 66 委派 → 余额扣 0.001 OXA + `a2a_pay_log` 审计 1 行，同 ref 幂等
  - **UI**：`/b`、`/apply`、`/user/billing`、`/admin`、`/` 浏览器验证全部正常渲染无 JS 错误；首页顶栏补 Business 入口
  - **遗留**：成功套餐绑定需 ~29 OXA 链上付款（测试钱包余额约 9 OXA，待补充后验证成功绑定路径；拒绝路径已验证）

### T 通用支付能力接入（t1~t9，✅ 9/9 完成，2026-08-18 归档，生产生效）

> 归属：AgentX 侧任务（对应 InfraX 侧需求 AX-1~13，见 [infrax-requirements-2026-08-17.md](infrax-requirements-2026-08-17.md)）。基于 InfraX 通用支付能力落地三项优化：**资金金库化托管（escrow）**、**A2A 编排待付款闭环**、**Agent 自主付费（MPC 钱包 + Session Key）**。原独立归档 `docs/tasklist-agentx-payment.md` 已并入本节（该文件已删除）。

| # | Task | 状态 | 提交 | 关键文件 |
|---|---|---|---|---|
| **t1** | 引擎升级 + 启用 escrow：bump `@0xinfrax/payments` 0.1.4；`paymentsService` escrow 配置启用；新增 `escrowDepositFunctionAbi`；`/api/v1/x402/info` 与 `/api/v1/payments/info` 暴露 `escrowAddress` | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [payments.ts](../gateway/src/services/payments.ts)、[escrow-abi.ts](../gateway/src/lib/escrow-abi.ts)、[routes/x402.ts](../gateway/src/routes/x402.ts)、[routes/payments.ts](../gateway/src/routes/payments.ts) |
| **t2** | 金库 escrow 生产部署：`npm` bump、`.env` 注入 `X402_ESCROW_ADDRESS`、build + `pm2 restart agentx-gateway`、公网验证 | ✅ | [6c98367](https://github.com/sftgroup/Agentx/commit/6c98367)（含部署） | 生产 `gateway/.env`、pm2 进程 |
| **t3** | x402 对账：ledger（`x402_balances`）↔ 链上资产对账任务。最终模型 = **资金充足性检查**（escrow 模式：Σ `escrow.balanceOf(holder)` + 收款 EOA 余额；`deficit/surplus`，资产 < ledger − 容差 → 缺口告警） | ✅ | [3c2d608](https://github.com/sftgroup/Agentx/commit/3c2d608) → [6c98367](https://github.com/sftgroup/Agentx/commit/6c98367)（重写） | [reconcile-x402.ts](../gateway/src/services/reconcile-x402.ts)、[index.ts](../gateway/src/index.ts)（任务注册） |
| **t4** | 前端 escrow 充值适配：从 `/api/v1/x402/info` 读 `escrowAddress`；充值/付款路径改为调 `escrow.deposit()`（emit `Deposited` 入账），EOA 直转仅作回退 | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [OnchainApprovalModal.tsx](../frontend/components/a2a/OnchainApprovalModal.tsx)、[X402WalletCard.tsx](../frontend/components/billing/X402WalletCard.tsx)、[useTenantPlanPurchase.ts](../frontend/hooks/useTenantPlanPurchase.ts) |
| **t5** | A2A resume API：`POST /api/v1/a2a/tasks/:id/resume`（充值后恢复 `awaiting_payment` 任务；payer/Admin 鉴权；deduct + `a2a_pay_log` 幂等）；`a2a_task_results.status=4` 状态机 | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [routes/a2a.ts](../gateway/src/routes/a2a.ts)、[024_a2a_task_awaiting_payment.sql](../gateway/db/migrations/024_a2a_task_awaiting_payment.sql) |
| **t6** | A2A SSE 事件推送：worker 状态变更实时推送到前端（emit/subscribe/get） | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [a2a-events.ts](../gateway/src/services/a2a-events.ts) |
| **t7** | 402 响应结构化 + payTo 优先 escrow：`canAccessAgentOrPay` 返回 `{priceWei, payTo, resource, resumeRef, mode}`；`payTo` 取 `x402.escrowAddress()` 优先于 `X402_PAY_TO` | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [agent-access-pay.ts](../gateway/src/services/agent-access-pay.ts) |
| **t8** | Agent MPC 钱包自动代付：`tryAutoPayForDelegation`（escrow 模式 `contractWrite deposit` / EOA 直转）；A2A worker 集成（代付后重试 access）；admin 管理路由；`agent_payer_wallets` 表 | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [agent-payer.ts](../gateway/src/services/agent-payer.ts)、[a2a-worker.ts](../gateway/src/services/a2a-worker.ts)、[routes/admin.ts](../gateway/src/routes/admin.ts)、[025_agent_payer_wallets.sql](../gateway/db/migrations/025_agent_payer_wallets.sql) |
| **t9** | SDK Agent 钱包 API：`bindWallet` / `authorizePaymentSession` / `status` / `list` / `unbind` | ✅ | [2e95909](https://github.com/sftgroup/Agentx/commit/2e95909) | [agent-wallet.ts](../sdk/src/payment/agent-wallet.ts)、[payment/index.ts](../sdk/src/payment/index.ts) |

- **生产验证**：对账任务 `[x402-reconcile] ok mode=escrow ledger=30598000000000000000 assets=30600000000000000000 holders=1 surplus=2000000000000000`（escrow 模式生效，盈余 0.002 OXA 为 gas 残留）；公网 `GET /api/v1/x402/info` 返回 `escrowAddress: 0x8Bf8Ffee86F1D4a160f0953Eb13BEDcBF99eaF9E`（oxachain 19505）；质量门 `tsc --noEmit` 零错误 + `npm test` 82/82；生产 `.env` 移除冗余 `X402_ESCROW_LEGACY_WEI`。
- **关联提交**：`2e95909`（t1/t4/t5/t6/t7/t8/t9 主体）· `3c2d608`（t3 中间态）· `6c98367`（t3 最终态 + t2 部署）。

### T2 ERC-4337 会话接口对齐（s1~s6 + e1~e6，2026-08-20 归档）

> 归属：AgentX 侧任务（对应 InfraX aa-relay 会话接口更新，契约见 infraX `SERVICE_API_REFERENCE.md §7.7`）。infraX 2026-08-20 更新：revoke 为**三段批量**（disableSession + uninstallModule + invalidateNonce，链上真正撤销）；replace 为**两笔流程**（disable 旧 + enable 新）；发布 `@0xinfrax/aa-sdk@0.1.2`。原独立归档 `docs/tasklist-aa-session-alignment.md` 已并入本节（该文件已删除）。

#### T2-A 进一步对齐（s1~s6：5 完成 + 1 未采用）

| # | Task | 状态 | 提交 | 关键文件 |
|---|---|---|---|---|
| **s1** | SDK 对齐：bump `@0xinfrax/aa-sdk` ^0.1.1 → ^0.1.2；`buildDisableUserOpDraft` 改用 `aa.buildDisableSessionUserOp`（gas 估算后传入以重算 userOpHash 再交 owner 签名），删除自建三段批量编码/常量/导入 | ✅ | [f080086](https://github.com/sftgroup/Agentx/commit/f080086) | [aa-autorenew.ts](../gateway/src/services/aa-autorenew.ts)、[package.json](../gateway/package.json) |
| **s2** | 单测更新：mock `buildDisableSessionUserOp`，断言广播 `op.callData` 含三段 selectors（`disableSession 0xf42c859d` / `uninstall 0xa71763a8` / `invalidateNonce 0x1f1b92e3`）+ SDK 以 account/sessionId/gas 调用；14/14 通过 | ✅ | [f080086](https://github.com/sftgroup/Agentx/commit/f080086) | [aa-autorenew.test.ts](../gateway/test/aa-autorenew.test.ts) |
| **s3** | 广播路径对齐：`revokeAutoRenew` 撤销上链由 `POST /v1/userops` 切换为 `POST /v1/session/revoke`（`submitSignedOp` 统一流程：owner 派生校验 + ECDSA 签名校验 + userOpHash 一致性 + A-10 escrow 计费 + 广播结算），请求体 `chain/account/owner/sessionId/userOpHash/signature/op/wait:true`，op 不再预置 signature（relay 侧注入 owner 签名） | ✅ | [c08dd2d](https://github.com/sftgroup/Agentx/commit/c08dd2d) | [aa-autorenew.ts](../gateway/src/services/aa-autorenew.ts) |
| **s4** | 单测断言新端点与请求体（URL 含 `/v1/session/revoke`，逐字段校验 `account/owner/sessionId/userOpHash/signature/wait`） | ✅ | [c08dd2d](https://github.com/sftgroup/Agentx/commit/c08dd2d) | [aa-autorenew.test.ts](../gateway/test/aa-autorenew.test.ts) |
| **s5** | 文档同步：`aa-relay-session-rollover-fix-infrax.md`（2 处 `/v1/userops` → `/v1/session/revoke`）、`test-cases-aa-auto-renew.md`（L12 段补广播路径对齐说明） | ✅ | [c08dd2d](https://github.com/sftgroup/Agentx/commit/c08dd2d) | [aa-relay-session-rollover-fix-infrax.md](aa-relay-session-rollover-fix-infrax.md)、[test-cases-aa-auto-renew.md](test-cases-aa-auto-renew.md) |
| **s6** | replace 两笔流程对齐评估（disable 旧 + enable 新） | ⏸ 未采用 | — | **决策**：AgentX 现有「disable 本地停用 + owner 签名 revoke 上链 + enable」手动两笔流程与 replace 端点功能等价，无需切换。保留为可选后续 |

- **生产验证**：2026-08-19（f080086 轮）`aa-l12-heal-verify.mjs` 全链路通过——clean→confirm→残留检测→三段批量 revoke（tx `0x044412fe…` success，gasUsed 176680，nonce 4→5）→clean→confirm；残留已清理（`aa_auto_renew` 0 行、链上 `isModuleInstalled=false`、nonce=6）。2026-08-20（c08dd2d 轮）gateway 全量 **96/96** 测试通过、`tsc --noEmit` 0 错误、`npm run build` 通过。
- **关联提交**：`f080086`（s1/s2）· `c08dd2d`（s3/s4/s5）。

#### T2-B 遗留待办：智能账户充值 escrow 用户路径（relay A-10 计费依赖）

> 来源：aa-relay A-10 计费（escrow 模式）——每次 UserOp 向 `op.sender`（智能账户）预扣固定费 + 预估 gas；余额取自链上 `InfraXEscrow(0x8bf8ffee…).balanceOf(sender)`，`deposit()` 只记 `msg.sender` → **用户如何给智能账户充值 escrow 是当前唯一产品闭环缺口**。需求文档：[aa-auto-renew-funding-requirements-infrax.md](aa-auto-renew-funding-requirements-infrax.md)（REQ-1~5 + §4 AgentX 侧自理）。
> **资金模型（链上实证）**：订阅费 = 子账户 native 余额（execute value）；UserOp gas = 子账户 EntryPoint deposit；relay 服务费（约 0.00246 OXA/次）= 子账户在 InfraXEscrow 的 `_balances[account]`。三类资金按账户独立记账，EOA 与子账户互不共用。
> **2026-08-20 infraX 交付确认**：REQ-1 已落地（`InfraXEscrow.depositFor` 合约升级已部署，impl `0x5ff86381…`）、REQ-2 已交付（ledger-balance 503 修复 + 资金总览 + 402 文案修正）→ **主路径确定，AgentX 前端直接按一次 `depositFor` 引导选型，self-pay fallback（e3）关闭**；REQ-3 价目文档状态待 infraX 确认。

| # | Task | 状态 | 依赖 / 备注 |
|---|---|---|---|
| **e1** | 方案选型与产品路径设计：对比 REQ-1（infraX 合约升级 `depositFor(address user)`，EOA 单笔 tx 代子账户入账）vs REQ-4（AgentX 自理 self-pay fallback，session 白名单加 `escrow.deposit()`），确定主/备方案、UX 流程与一年续订费用估算模型 | ✅ 完成 | **主路径 = 一次 `depositFor`（REQ-1 已落地，impl `0x5ff86381…`）**；fallback 关闭。12 期费用估算模型已随 8625da6 落地（订阅价×12 + relay 服务费×12 + gas 缓冲） |
| **e2** | 前端充值引导 UI：开启自动续订时展示智能账户三类资金（native / EP deposit / escrow），按估算费用引导用户一步 `depositFor` 充值 | ✅ 完成（[8625da6](https://github.com/sftgroup/Agentx/commit/8625da6)） | 2026-08-19 产品化充值闭环已实现：[AutoRenewCard.tsx](../frontend/components/user/AutoRenewCard.tsx)（三类资金展示 + 12 期估算 + `depositFor`/`EP.depositTo`/native 转账 + 一键充值）、[lib/auto-renew.ts](../frontend/lib/auto-renew.ts)。ABI 与 infraX 已部署合约一致（`depositFor(address user) payable`），REQ-1 交付后无需改动 |
| **e3** | 【fallback 已关闭】自动续订 session 白名单增加 `escrow.deposit()` 条目（self-pay 充值） | ⏸ 不采用 | REQ-1 已落地，无需 fallback（REQ-4 关闭） |
| **e4** | 余额不足主动告警：gateway 在 escrow 不足时提前发送站内/邮件通知（现状 `renewOne` ⑦ 已有 escrow 预检 + 失败护栏自动暂停，缺「提前主动通知」与恢复引导） | ✅ 完成 | `watchFunding` 资金巡检（到期前 `AA_ALERT_AHEAD_SEC` 提前窗口，缺 escrow/native/gas 任一项 → `sendAlert` webhook 告警；`AA_ALERT_MIN_INTERVAL_SEC` 节流防轰炸；已进入续订窗口交给 `renewOne` ⑦ 预检）。迁移 028 加 `last_funding_alert_at`；scan 集成（alerts 计数） |
| **e5** | 计费对账：escrow `Charged/Refunded` 事件与本地 `renew_log` 对账任务 | ✅ 完成 | [reconcile-escrow.ts](../gateway/src/services/reconcile-escrow.ts)：增量同步 escrow Charged/Refunded 事件（迁移 029 `aa_escrow_events` + `aa_escrow_sync`，块跨度分页；**首次同步直接从最近 `AA_ESCROW_SYNC_BLOCK_SPAN` 块起算，不从区块 0 回填**，首轮即追平）→ 每账户净扣费 vs `renew_log` 条数×固定费（`AA_ESCROW_RECONCILE_MIN/MAX_RATIO`）→ 漏计费/重复扣费/净额为负三类告警；追平前不判定防误报；daemon 注册 |
| **e6** | 【infraX 侧前置】REQ-1 `InfraXEscrow.depositFor(address user)` 合约升级 + REQ-2 relay 资金总览端点 / 402 `topupHint` 文案修正 + REQ-3 价目文档 | ✅ 已交付（REQ-1/2）；REQ-3 待确认 | REQ-1 impl `0x5ff86381…` 已部署；REQ-2 已上线（见 funding-requirements §3） |

- **验收标准**：① EOA 单笔 tx 调 `depositFor(子账户)` 入账成功，`balanceOf(子账户)` 即时可见；② 子账户 escrow 余额充足时 relay 广播 UserOp 不再 402；③ 前端可引导用户完成智能账户充值并展示三类资金视图；④ 余额不足时用户收到提前通知，补齐后自动恢复续订。

### P10 R6-R10 技术债与定时任务（✅ 全部完成，2026-08-06）

| # | 任务 | commits | 状态 |
|---|------|---------|:--:|
| R6 | 渠道归因启用：激活 `oxa-partner`（share_bps=125），share = `amount_paid × share_bps / 10000`（BigInt 精确计算） | — | ✅ |
| R7 | 大文件拆分：gateway `admin.ts`→admin-finance+admin-partners、`mcp.ts`→mcp-tools+mcp-executor；前端 `admin/page.tsx`→tabs/、3 hooks 抽 `*-types.ts`、3 组件抽 `*-utils.ts`+Card/Modal 子组件（8 个 >760 行文件全部降至阈值下） | `368bb93` / `d1fc80e` / `1f4ad27` / `2ff22b0` | ✅ |
| R8 | SDK 主入口拆分子路径：react hooks 移入 `@agentxv2/sdk/react`（exports 映射），主入口去除 wagmi 依赖 | `a17a68a` | ✅ |
| R9 | revenue ERC20 平台费按 token 分组展示（零地址 native sentinel 排除，修复 `pay_token=0x0` 误计 ERC20） | `2deee30` / `a249d83` | ✅ |
| R10 | 用户定时任务：一次性/周期调度自动创建 task（migration 017 + REST CRUD + 单飞乐观锁 daemon + 用户页 + P9 gate 联动） | `60c0744` / `a249d83` | ✅ |

> R7 决策备忘：拆分采用「类型/常量/纯函数抽取 + 展示子组件拆分 + 主组件保留状态与 handlers」模式，行为零变更；hooks 拆分后主文件 re-export 类型保持消费方兼容（`isolatedModules: true`）。
> R10 决策备忘：daemon 单飞采用乐观锁 `UPDATE schedules SET next_run_at = ... WHERE id = ? AND next_run_at = 旧值` 防重入；调度触发 P9 禁用租户时记录 `schedule_runs.failed`（含 error code），不中断其他调度。

### R7 收尾（✅ 2026-08-06 · 会话内，无 commit）

> 大文件拆分后的收尾整理，全部通过三项目验证（frontend tsc / sdk tsc+vitest 17/17 / gateway tsc+vitest 35/35）。

| # | 任务 | 涉及文件 | 状态 |
|---|------|---------|:--:|
| #12 | hooks 收尾：`validateAddress` 去重到共享 `contract-address.ts`（`ZERO_ADDRESS` + 非法地址 fallback address(0)）；7 个 hooks/type 文件统一引用 | `components/agent/hooks/contract-address.ts`（新增） | ✅ |
| #14 | `useAgentRegistry` 刷新精简：去掉按区块强制刷新（`useBlockNumber({watch:true})`/`forceRefresh`/1s 节流/`transactionHashRef`），改 `refetchInterval: 30_000` + 交易确认后主动 refetch；全仓 console.log 清理（仅保留 IPFS 调试日志） | `useAgentRegistry` / `useAgentFactory` / `usePaymentGateway` / `useAgentRegistration` / `useAgentCards` / `useUserSubscriptions` | ✅ |
| #10 | chat 页面拆分 658→530 行：`TaskCard`/`MessageBubble`/`ModelSelector` → `components/chat/`，`ModelOption`/`HISTORY_KEY_PREFIX`/`llmApiKeyFromLocalStorage` → `chat-utils.ts` | `app/user/chat/[agentId]/` | ✅ |
| #11 | a2a 页面拆分 582→330 行：`CreateTaskPanel`/`CompleteTaskModal`/`TaskItem` → `components/a2a/`，类型/常量/`friendlyError` → `a2a-utils.ts` | `app/a2a/` | ✅ |
| #13 | Gateway URL 统一：新增 `lib/gateway.ts`（`GATEWAY_URL` 默认 localhost 回退 + `GATEWAY_URL_OPTIONAL` 保留 feature-detect 语义 + `gatewayFetch`），9 处直接读 `NEXT_PUBLIC_AGENTX_GATEWAY_URL` 全部改为导入 | `lib/gateway.ts`（新增）+ 8 个调用文件 | ✅ |

> #13 决策备忘：未配置 dev 环境须保留「未配置即禁用 Gateway 功能」语义（chat 离线 AgentLoop fallback），故提供 `GATEWAY_URL_OPTIONAL`（未配置时为 `''`）供 feature-detect 站点使用，避免本地无 env 时误走 SSE 模式。

---

## 三、生产环境

| 项 | 值 |
|----|-----|
| 服务器 | 43.159.60.46（SSH: ubuntu） |
| 服务 | agentx-gateway:3090 · agentx-conversation:8100 · agentx-frontend:3100（pm2） |
| 数据库 | agentx_gateway（索引层）+ agentx_conversation（对话，端口 5433） |
| SDK | `@agentxv2/sdk@0.8.6`（npm latest；gateway/conversation/frontend 三服务一致） |
| 文档站点 | https://agentx.0xainet.top/docs/sdk（实时渲染 README） |
| 管理后台 | https://agentx.0xainet.top/admin（X-Admin-Key） |
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
| R6 渠道归因启用（生产） | 冒烟 5/5 PASS：归因幂等 / report 分成计算正确（share = amount_paid × share_bps / 10000）/ settle 台账 |
| R7 大文件拆分回归 | gateway admin 冒烟 10/10；mcp curl tools/list 正常（38 工具）；前端 typecheck 零错误 + build 25 页全生成；生产 home/admin/dashboard 全部 200 |
| R8 SDK 子路径 | `dist/index.d.mts` 无 `useAgentRunner`、`dist/react` 有；前端导入 `@agentxv2/sdk/react` 后 typecheck + build 全绿 |
| R9 revenue ERC20 | 生产 revenue 返回正确；`pay_token=0x0`（native sentinel）排除出 ERC20 分组 |
| R10 定时任务冒烟 | 生产 13/14 PASS（创建/列表/启停/删除/一次性触发/周期触发/P9 gate failed 记录）；cleanup 后 0 残留 |

---

## 归档说明

- 旧 `memory/AGENTX_PROGRESS.md` 已停用（内容停在 2026-07-14），历史记录保留于 git 历史，不再维护
- 2026-08-20：独立 tasklist 统一并入本文件 —— `docs/tasklist-agentx-payment.md`（t1~t9）→「### T」章节；`docs/tasklist-aa-session-alignment.md`（s1~s6 + e1~e6）→「### T2」章节；两独立文件已删除
