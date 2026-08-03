# Conversation Service 拆分迁移计划

> 状态: 待评审 · 目标: 将 `conversation-service` 从 AgentX 单仓库拆分为独立项目，SDK 一并迁入
> 日期: 2026-08-02

---

## 1. 背景与目标

AgentX 当前为单仓库，其中 `conversation-service/` 已是**独立部署的微服务**（独立端口 8100、独立 pm2 进程、独立 DB、独立 env），源码层面与 gateway 零交叉 import（仅依赖 npm 包 `@agentxv2/sdk`）。

目标：
1. `conversation-service` 迁入独立仓库，独立管理与发版
2. `@agentxv2/sdk`（含 `ConversationClient`）一并迁入新仓库
3. AgentX 主仓库瘦身：删除 `conversation-service/` 与 `sdk/`，通过 npm 引用 SDK
4. 本轮**只拆代码，不做部署切换**（部署维持现状）

## 2. 决策记录

| # | 决策点 | 结论 | 备注 |
|---|--------|------|------|
| D1 | SDK 归属 | **迁入 Conversation 新仓库** | 双方（agentx / conversation）通过 npm 引用 |
| D2 | 部署形态 | **先只拆代码不部署** | 部署/切换列为后续阶段 |
| D3 | 新仓库名 | **待定（由新项目定名）** | 下文以 `<conversation-repo>` 占位 |
| D4 | 执行方式 | **先落文档评审** | 本文件评审通过后分阶段执行 |

### 待确认项

- [ ] 新仓库名与组织（GitHub 归属）
- [ ] SDK 迁移后首个版本号（建议 0.8.0，0.7.0 已在 npm 发布）
- [ ] 新仓库是否纳入 monorepo 工具（npm workspaces / pnpm）还是两个独立包平铺

## 3. 目标架构

```
┌─ AgentX repo (github.com/sftgroup/Agentx) ─────────────┐
│  gateway (:3090)   frontend (:3100)                    │
│    └─ ConversationProxy ──HTTP──→  ──┐                 │
└─────────────────────────────────────┼─────────────────┘
                                       │ CONVERSATION_SERVICE_URL
┌─ <conversation-repo> ────────────────▼────────────────┐
│  service/  POST /runs (SSE)  POST /tenants  GET /health│
│    └─ AgentContextLoader ──HTTP──→ gateway /api/v1/agents/:id
│  sdk/      @agentxv2/sdk (npm 包, AgentLoop/ConversationClient)
└─────────────────────────────────────────────────────────┘
```

调用链（不变）：`frontend / SDK ConversationClient → gateway /api/v1/agent/runs → conversation POST /runs (SSE)`。

## 4. 迁移范围清单

### 4.1 迁入新仓库（走）

**service/（原 `conversation-service/`，12 源文件 + 4 migration）**

```
src/index.ts  src/config.ts
src/lib/{crypto,db,llm-resolver}.ts
src/routes/{runs,tenants}.ts
src/services/{agent-runner,agent-context-loader,tool-executor,memory-engine,context-engine,tenant-llm-resolver,sandbox-service}.ts
migrations/{001_memory,002_traces,003_tenant_llm_config,004_end_user_isolation}.sql
package.json  tsconfig.json  Dockerfile  .env.example
```

**sdk/（原 `agentx/sdk/`，npm 包 `@agentxv2/sdk`）**

```
src/  package.json  tsconfig.json  README.md  UPGRADE.md
```

### 4.2 留在 AgentX（集成点，不动）

| 文件 | 作用 |
|------|------|
| [gateway/src/services/conversation-proxy.ts](file:///home/ubuntu/Agentx/gateway/src/services/conversation-proxy.ts) | HTTP 转发，地址走 env，无需改代码 |
| [gateway/src/routes/agent-runs.ts](file:///home/ubuntu/Agentx/gateway/src/routes/agent-runs.ts) | SSE pipe |
| [gateway/src/config.ts](file:///home/ubuntu/Agentx/gateway/src/config.ts#L33-L35) | `conversationServiceUrl` / `conversationServiceToken` |
| [gateway/src/routes/chat.ts](file:///home/ubuntu/Agentx/gateway/src/routes/chat.ts) | Chat Completions LLM 代理，与 conversation **无关**，保留 |

### 4.3 AgentX 侧删除/清理

- `git rm -r conversation-service/ sdk/`
- 删除已废弃 [gateway/src/routes/history.ts](file:///home/ubuntu/Agentx/gateway/src/routes/history.ts)（注释已标 DEPRECATED）及 [index.ts](file:///home/ubuntu/Agentx/gateway/src/index.ts#L126) 废弃注释
- frontend 依赖核对：全部经 npm 包名 `@agentxv2/sdk`（`^0.6.5`）引用，**无相对路径引用**（已实测）；删除 sdk/ 后构建不受影响，可顺带升 `^0.7.0`
- 文档更新：README / INTEGRATION / DEPLOYMENT / MCP_SETUP 移除 `conversation-service/`、`sdk/` 目录引用
- 知识图谱 `.ua/` 增量更新

## 5. 新仓库初始化

### 5.1 推荐结构（monorepo 平铺）

```
<conversation-repo>/
├── service/                 # 原 conversation-service/（npm 包 @agentxv2/conversation）
│   ├── src/  migrations/  Dockerfile  tsconfig.json  .env.example
│   └── package.json         # 依赖改为 workspace: sdk
├── sdk/                     # 原 agentx/sdk/（npm 包 @agentxv2/sdk）
│   └── package.json
├── package.json             # root: npm workspaces ["sdk","service"]
├── README.md
├── docs/API.md              # 契约文档（见 §6）
├── .github/workflows/ci.yml # build + typecheck + test + npm publish + docker
└── ecosystem.config.js      # pm2 配置
```

### 5.2 迁移步骤

```bash
# 保留 git 历史（filter-repo 每次处理一个子目录）
git clone --bare https://github.com/sftgroup/Agentx.git /tmp/agentx.git
cd /tmp/agentx.git
git filter-repo --subdirectory-filter conversation-service --force
git filter-repo --subdirectory-filter sdk --force   # 或分两次克隆合并

# 依赖调整
# service/package.json: "@agentxv2/sdk" → "workspace:*"（monorepo 内联引用）
# sdk 版本：0.7.0 已发布 npm，迁出后由新仓库续发 0.8.0+

# CI（.github/workflows/ci.yml）
#  - service: npm run build && npm run typecheck
#  - sdk: npm run build && npm test && npm publish（tag 时触发）
```

## 6. 契约固化（迁移前提）

迁移前将 3 个隐式契约写入新仓库 `docs/API.md`，并补契约测试：

| 契约 | 定义 | 消费方 |
|------|------|--------|
| `POST /runs` headers | `X-Internal-Token`、`X-Tenant-Address`、`X-End-User-Id`、`X-Llm-Api-Key` | gateway [conversation-proxy.ts](file:///home/ubuntu/Agentx/gateway/src/services/conversation-proxy.ts) |
| SSE 事件格式 | `text / tool_call / tool_result / thinking / done / error` | [ConversationClient](file:///home/ubuntu/Agentx/sdk/src/conversation/client.ts#L33-L42)、[useAgentChat.ts](file:///home/ubuntu/Agentx/frontend/hooks/useAgentChat.ts#L114-L189) |
| `GET /api/v1/agents/:id` 响应 | 含 `metadata_json.skills`（`execution.type`: mcp/http/a2a） | [agent-context-loader.ts](file:///home/ubuntu/Agentx/conversation-service/src/services/agent-context-loader.ts) |

⚠️ **密钥统一**：conversation 的 `INTERNAL_AUTH_TOKEN` 与 gateway 的 `CONVERSATION_SERVICE_TOKEN` 目前是两个 env 名，需统一为单一来源（建议保留 `CONVERSATION_SERVICE_TOKEN`，两侧一致）。

## 7. 分阶段执行计划

| 阶段 | 内容 | 交付物 | 执行窗口 |
|------|------|--------|----------|
| **Phase 0** | 契约固化：写 `docs/API.md` + 契约测试 | 文档 + 测试 | 本轮 |
| **Phase 1** | 创建 `<conversation-repo>`：迁移 service/ + sdk/（filter-repo 保历史）、workspaces 化、CI、README | 新仓库可构建 | 本轮 |
| **Phase 2** | AgentX 清理：`git rm` 两目录、删 history.ts 废弃代码、frontend 依赖核对、文档更新、图谱增量更新并推送 | AgentX 瘦身版 | 本轮 |
| **Phase 3** | 部署切换：conversation 新仓库独立部署（Docker/pm2），gateway `CONVERSATION_SERVICE_URL` 指向新实例，token 对齐 | 端到端验证通过 | 后续（本轮不做） |
| **Phase 4** | 验收与回滚：全链路测试、保留 `v0.7.0-pre-split` tag | 验收报告 | 后续 |

## 8. 风险与回滚

| 风险 | 缓解 |
|------|------|
| AgentContextLoader 依赖 agentx `GET /api/v1/agents/:id` 结构 | 契约写入 docs/API.md + 新仓库契约测试；agentx 侧结构变更走版本化 |
| SDK 版本漂移（conversation 现锁 0.6.9） | 迁移时统一升级路径：SDK 迁出后发 0.8.0，service/frontend 同步引用 |
| 共享密钥泄露面 | 统一 env 名 + 密钥从 env/vault 注入，不进代码库 |
| 历史丢失 | 用 `git filter-repo` 保留两目录完整提交历史 |

**回滚**：Phase 1-2 为纯代码拆分，回滚 = `git revert` + 恢复删除目录；Phase 3 切换前记录 gateway env 现值并保留 release tag。

## 9. 执行入口

评审通过后按 Phase 0 → 1 → 2 顺序执行（每阶段完成即汇报，可分段验收）。
