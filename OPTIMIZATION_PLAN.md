# AgentX Agent 能力优化方案 v3.0

> 基于 DeerFlow + Page-Agent 参考，结合 AgentX 多租户 SaaS 架构设计
> 约束：解耦合/模块化 · 避免硬编码 · 大文件拆分 · 避免过度设计 · 与当前系统结合
>
> **v3.0 变更**：Agent 对话引擎拆为独立微服务 + B2B API Key 鉴权 + 付费计费体系

---

## 总体架构

```
                    External Apps
                    ┌──────┬──────┬──────┐
                    │ SDK  │ REST │ MCP  │
                    └──┬───┴──┬───┴──┬───┘
                       │      │      │
                       ▼      ▼      ▼
              ┌────────────────────────────────────┐
              │     AgentX Gateway（控制面）          │
              │                                    │
              │  Auth(JWT) · Rate-limit · Routing   │
              │  MCP Platform · Skills Catalog      │
              │  Billing · Tenant Management        │
              │  Admin API                          │
              │                                    │
              │  ┌────────────────────────────────┐ │
              │  │ Conversation Proxy (转发)       │ │
              │  │ POST /runs → 路由到对话实例      │ │
              │  │ WebSocket → 透传到对话实例       │ │
              │  └──────────────┬─────────────────┘ │
              └─────────────────┼───────────────────┘
                                │ HTTP/SSE (internal)
                                ▼
              ┌────────────────────────────────────┐
              │ Agent Conversation Service（×N）     │  ← 独立微服务
              │  Port: 8100                        │
              │                                    │
              │  AgentLoop (ReAct)                 │
              │  ├─ MemoryEngine  (pgvector)       │
              │  ├─ ContextEngine (compaction)     │
              │  ├─ SkillExecutor (API/Browser/MCP)│
              │  ├─ LLMResolver   (OpenAI/Gateway) │
              │  └─ TraceEmitter  (observability)  │
              │                                    │
              │  Docker · PM2 · Health Check · LB  │
              └────────────────────────────────────┘
                                │
                                ▼
                        PostgreSQL (共享)
                     Gateway DB + Conversation DB
```

### 为什么拆微服务

| 维度 | Gateway 内部模块 | 独立微服务 |
|------|----------------|-----------|
| **故障隔离** | AgentLoop OOM → Gateway 整体挂 | 只挂对话实例，Gateway 继续处理 auth/MCP/traces |
| **扩缩** | 扩 Gateway = 连 auth 层一起扩 | 对话实例独立扩（按 LLM 延迟/并发数） |
| **资源** | Gateway 轻量 (~50MB)，对话重 (~200MB+) | 计算节点跑对话，轻节点跑 Gateway |
| **部署** | 单进程 PM2 | 独立 Docker Compose / K8s，可独立滚动更新 |
| **调试** | 对话日志混在 Gateway 日志 | 独立日志流 + 独立可观测面板 |

---

## 项目文件结构

```
agentx/
├── gateway/                          # 控制面（已有，+6 文件）
│   └── src/
│       ├── index.ts                  # +8 行：注册新路由
│       ├── config.ts                 # +8 行：conversation url + billing 配置
│       ├── routes/
│       │   ├── skills.ts             # NEW  ~120 行 P3: 技能市场 CRUD
│       │   ├── agent-mcp.ts          # NEW  ~100 行 P4: Agent-as-MCP
│       │   ├── tenant.ts             # 修改 +30 行：租户注册 + API key 管理
│       │   └── billing.ts            # NEW  ~80 行：计费查询/套餐变更
│       ├── middleware/
│       │   └── auth.ts               # 修改 +20 行：API Key 鉴权分支
│       └── services/
│           ├── conversation-proxy.ts # NEW  ~60 行：转发到对话微服务
│           ├── skill-service.ts      # NEW  ~100 行 P3: 技能审核逻辑
│           └── billing-service.ts    # NEW  ~100 行：配额检查/计费逻辑
│
├── conversation-service/             # 对话微服务（全新）
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.example
│   ├── ecosystem.config.js           # PM2 集群配置
│   ├── src/
│   │   ├── index.ts                  # ~50 行  Express server + health check
│   │   ├── config.ts                 # ~30 行  环境变量
│   │   ├── routes/
│   │   │   └── runs.ts               # ~60 行  POST /runs (SSE stream)
│   │   ├── services/
│   │   │   ├── agent-runner.ts       # ~100 行 AgentLoop 封装
│   │   │   ├── memory-engine.ts      # ~80 行  pgvector 记忆引擎
│   │   │   ├── context-engine.ts     # ~50 行  上下文压缩引擎
│   │   │   └── sandbox-service.ts    # ~150 行 P6: Docker 沙箱
│   │   └── lib/
│   │       ├── db.ts                 # ~20 行  pg Pool
│   │       └── llm-resolver.ts       # ~40 行  LLM Provider 工厂
│   └── migrations/
│       ├── 001_memory.sql            # ~15 行  P1
│       └── 002_traces.sql            # ~20 行  P2
│
├── sdk/                              # 已有，P1/P2/P5 增强
│   └── src/
│       ├── index.ts                  # +3 行：导出新模块
│       ├── agent-loop/
│       │   ├── loop.ts               # +70 行：Memory 注入 + compaction + trace
│       │   ├── types.ts              # +5 行：memory? / contextBudget?
│       │   └── executor.ts           # +8 行：browser / sandbox case
│       ├── memory/
│       │   └── types.ts              # NEW  ~40 行 P1: MemoryProvider 接口
│       ├── traces/
│       │   └── tracer.ts             # NEW  ~60 行 P2: TraceEmitter 接口
│       └── skills/
│           └── browser.ts            # NEW  ~120 行 P5: Browser DOM 技能
│
└── OPTIMIZATION_PLAN.md              # 本文档
```

---

## Phase 1: Memory + Context Engineering（2 周）

### 目标
Agent 记住用户偏好和历史，对话轮次过多时自动压缩上下文。

### 1.1 新增文件

#### SDK: `sdk/src/memory/types.ts`
```typescript
// Memory provider interface — implementation injected by consumer
export interface MemoryProvider {
  store(params: {
    subscriberAddress: string
    agentId: number
    fact: string
    metadata?: Record<string, string>
  }): Promise<void>

  recall(params: {
    subscriberAddress: string
    agentId: number
    query: string
    limit?: number     // default 5
  }): Promise<MemoryFact[]>
}

export interface MemoryFact {
  fact: string
  score: number
  createdAt: string
}

export interface MemoryConfig {
  provider: MemoryProvider
  enabled: boolean
  storeOnSessionEnd: boolean   // default true
}
```

> **设计原则**：`MemoryProvider` 是接口，不是实现。对话微服务实现 Gateway-backed provider，本地 SDK 使用时也可注入 mock。

#### Conversation Service: `conversation-service/src/services/memory-engine.ts`

约 80 行。核心逻辑：

```typescript
export class MemoryEngine implements MemoryProvider {
  constructor(
    private readonly db: Pool,
    private readonly openaiApiKey?: string,  // embedding 可选
  ) {}

  async store(params) {
    // INSERT INTO memories (subscriber, agent_id, fact, embedding)
    // embedding = openaiApiKey ? ai.embed(fact) : null
  }

  async recall(params) {
    // Tenant isolation: WHERE subscriber = $1 AND agent_id = $2
    // embedding: ORDER BY embedding <=> query_vector LIMIT n
    // fallback: ORDER BY created_at DESC LIMIT n
  }
}
```

> **设计原则**：embedding 搜索通过 pgvector 完成，无额外基础设施。无 API key 时自动降级为时间排序。

#### Conversation Service: `conversation-service/src/services/context-engine.ts`

约 50 行。纯算法，无外部依赖：

```typescript
export class ContextEngine {
  /**
   * When messages exceed token budget:
   *   - Keep system prompt + last 2 turns
   *   - Summarize middle turns via LLM → single system message
   */
  async compact(
    messages: LLMMessage[],
    budget: number,
    llmProvider: LLMProvider,
  ): Promise<LLMMessage[]>
}
```

### 1.2 修改文件

#### `sdk/src/agent-loop/types.ts` — 新增字段
```typescript
export interface AgentLoopConfig {
  // ... existing ...
  memory?: MemoryConfig        // ← NEW: optional
  contextBudget?: number       // ← NEW: optional, total max tokens
}
```

#### `sdk/src/agent-loop/loop.ts` — 三处插入（+50 行）

```
run() {
  // ① Memory recall → inject into system prompt
  // ② Before each iteration: check budget → compact if needed
  // ③ On session end: extract facts → store
}
```

> **设计原则**：三处都是"插入"而非"改写"，对现有 AgentLoop 零破坏。Memory/compaction 不可用时不增加开销。

#### `conversation-service/src/services/agent-runner.ts` — 核心封装（~100 行）

```typescript
export class AgentRunnerService {
  constructor(
    private readonly memoryEngine: MemoryEngine,
    private readonly contextEngine: ContextEngine,
    private readonly llmResolver: LLMResolver,
  ) {}

  async *streamRun(req: {
    agentId: number
    message: string
    tenantAddress: string
    enableMemory?: boolean
    contextBudget?: number
  }): AsyncGenerator<AgentRunSSEEvent> {
    // 1. Fetch agent from blockchain → decrypt payload
    // 2. Recall memories if enabled
    // 3. Init AgentLoop with injected config
    // 4. Stream results via SSE
    // 5. Store memory facts on session end
  }
}
```

### 1.3 数据库迁移

```sql
-- conversation-service/migrations/001_memory.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memories (
  id BIGSERIAL PRIMARY KEY,
  subscriber VARCHAR(42) NOT NULL,
  agent_id INTEGER NOT NULL,
  fact TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_memories_subscriber_agent (subscriber, agent_id)
);
```

---

## Phase 2: Observability（1 周）

### 新增文件

#### SDK: `sdk/src/traces/tracer.ts`（~60 行）

```typescript
export interface TraceEvent {
  tenantId: string
  agentId: number
  sessionId: string
  type: 'tool_call' | 'tool_result' | 'text_delta' | 'session_complete'
  timestamp: number
  data: Record<string, unknown>
}

export interface TraceEmitter {
  emit(event: TraceEvent): void
}

export class NoopTraceEmitter implements TraceEmitter {
  emit(): void {}
}
```

#### Conversation Service: traces 表（~20 行 SQL）

```sql
CREATE TABLE traces (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(42) NOT NULL,
  agent_id INTEGER NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  type VARCHAR(30) NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_traces_tenant_agent (tenant_id, agent_id, session_id)
);
```

### 修改文件

#### `sdk/src/agent-loop/loop.ts`（+20 行）
在每个 `onToolCall`/`onToolResult`/`onComplete` 回调后追加 `traceEmitter?.emit()`。

---

## Phase 3: Skills Marketplace（2 周）— Gateway 控制面

### 新增文件（Gateway 侧）

| 文件 | 行数 | 说明 |
|------|------|------|
| `gateway/src/routes/skills.ts` | ~120 | GET/POST/PUT CRUD |
| `gateway/src/services/skill-service.ts` | ~100 | 业务逻辑：提交/审核/列表 |

### 数据库迁移

```sql
-- gateway/migrations/001_skills.sql
CREATE TABLE skills (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  input_schema JSONB NOT NULL,        -- OpenAI tool parameters 格式
  output_schema JSONB,
  usage_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  publisher VARCHAR(42) NOT NULL,
  reviewer VARCHAR(42),
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_skills_status_category (status, category)
);
```

> **设计原则**：技能模板不存储端点地址——那是 Publisher 配置时填写。`input_schema` 用 OpenAI tool parameters 格式，与 `buildTools()` 输出一致。

---

## Phase 4: Agent-as-MCP Export（1 周）— Gateway 控制面

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `gateway/src/routes/agent-mcp.ts` | ~100 | `/mcp/agent/:id`，转发到 Conversation Service |

```typescript
// gateway/src/routes/agent-mcp.ts
// tools/list → 从区块链提取 Agent skills → 转为 MCP tool 格式
// tools/call → 通过 conversation-proxy 转发到 Conversation Service
```

> **设计原则**：Gateway 负责解析链上 Agent + 转 MCP 格式；Conversation Service 负责执行。职责清晰。

---

## Phase 5: Browser Control Skill（1.5 周）— SDK 增强

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `sdk/src/skills/browser.ts` | ~120 | 文本化 DOM → LLM 解析 → browser action 执行 |

```typescript
export interface BrowserAction {
  type: 'click' | 'type' | 'scroll' | 'extract' | 'navigate'
  selector?: string
  value?: string
}

export function executeBrowserAction(action: BrowserAction): {
  success: boolean; result?: string; error?: string
}
```

### 修改文件

#### `sdk/src/agent-loop/executor.ts`（+3 行）
```typescript
case 'browser': return executeBrowserAction(args as BrowserAction)
```

---

## Phase 6: Sandbox Execution（2 周，可选）— Conversation Service

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `conversation-service/src/services/sandbox-service.ts` | ~150 | Docker 容器生命周期管理 |

```typescript
export class SandboxService {
  async execute(params: {
    image: string     // Docker image
    code: string      // code to execute
    timeoutSec: number
    maxMemoryMb: number
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // docker create → docker start → docker exec → capture → docker rm
  }
}
```

### 修改文件

#### `sdk/src/agent-loop/executor.ts`（+5 行）
```typescript
case 'sandbox':
  return fetch(`${conversationServiceUrl}/sandbox`, { body: args })
```

---

## Gateway 控制面：Conversation Proxy

Gateway 不直接运行 AgentLoop。对话请求统一通过 proxy 转发：

```typescript
// gateway/src/services/conversation-proxy.ts (~60 行)
export class ConversationProxy {
  constructor(
    private readonly serviceUrl = config.conversationServiceUrl
  ) {}

  async streamRun(req: {
    agentId: number; message: string; tenantAddress: string
    enableMemory?: boolean; contextBudget?: number
  }): Promise<Response> {
    // Gateway validates JWT → extracts tenantAddress → forwards
    return fetch(`${this.serviceUrl}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Address': req.tenantAddress,  // internal header
        'X-Internal-Token': config.conversationServiceToken,
      },
      body: JSON.stringify(req),
    })
  }
}
```

> **服务间认证**：Conversation Service 只监听内网，通过 `X-Internal-Token` header 验证。

---

## 实施路线图

```
Week 1-2   │ Phase 1: Memory + Context Engine（2 周）
           │ ├─ SDK: memory/types.ts + loop.ts（+50 行）
           │ ├─ Conversation: memory-engine + context-engine + agent-runner
           │ ├─ Gateway: conversation-proxy.ts（转发到微服务）
           │ └─ DB: memories 表
           │
Week 3     │ Phase 2: Observability（1 周）
           │ ├─ SDK: traces/tracer.ts + loop.ts 埋点
           │ ├─ Conversation: trace emit hooks
           │ └─ DB: traces 表
           │
Week 4-5   │ Phase 3: Skills Marketplace（2 周）— Gateway
           │ ├─ Gateway: skills.ts + skill-service.ts
           │ └─ DB: skills 表
           │
Week 6     │ Phase 4: Agent-as-MCP Export（1 周）— Gateway
           │ └─ Gateway: agent-mcp.ts（转发到 Conversation Service）
           │
Week 7-8   │ Phase 5: Browser Control Skill（1.5 周）— SDK
           │ ├─ SDK: skills/browser.ts
           │ └─ executor.ts: +3 行 case 'browser'
           │
Week 9-10  │ Phase 6: Sandbox Execution（2 周，可选）— Conversation Service
           │ └─ Conversation: sandbox-service.ts
```

**合计**：6 周核心 + 4 周可选。

---

## SDK / API / MCP / DB 影响矩阵

### SDK 变化

| Phase | 模块 | 变化 | 兼容性 |
|-------|------|------|--------|
| P1 | `@agentxv2/sdk/memory` | **新增** `MemoryProvider` 接口 | — |
| P1 | `AgentLoop` | `memory?` / `contextBudget?` 可选字段 | 向后兼容 |
| P2 | `@agentxv2/sdk/traces` | **新增** `TraceEmitter` 接口 | — |
| P5 | `@agentxv2/sdk/skills` | **新增** `executeBrowserAction()` | — |
| P5 | `executor.ts` | +3 行 `case 'browser'` | 向后兼容 |
| P6 | `executor.ts` | +5 行 `case 'sandbox'` | 向后兼容 |

### API 变化

| Phase | 端点 | 位置 | 认证 | 类型 |
|-------|------|------|------|------|
| — | `POST /api/v1/agent/runs` | Gateway（proxy→Conversation） | JWT / API Key | 核心 |
| — | `GET /api/v1/agent/runs/:runId` | Gateway（proxy→Conversation） | JWT / API Key | 核心 |
| — | `POST /api/v1/tenant/register` | Gateway | 公开 | B2B 入驻 |
| — | `GET /api/v1/tenant/billing` | Gateway | JWT / API Key | B2B 计费查询 |
| — | `PUT /api/v1/tenant/billing/plan` | Gateway | JWT / API Key | B2B 套餐变更 |
| P3 | `GET /api/v1/skills` | Gateway | 公开 | 技能市场 |
| P3 | `POST /api/v1/skills` | Gateway | JWT | 技能提交 |
| P3 | `PUT /api/v1/skills/:id/review` | Gateway | Admin | 技能审核 |
| P4 | `POST /mcp/agent/:id` | Gateway（proxy→Conversation） | API Key | MCP Agent 调用 |
| P6 | `POST /api/v1/sandbox/execute` | Conversation Service (internal) | 内部 token | 沙箱执行 |

### MCP 变化

| 端点 | 变化 |
|------|------|
| `POST /mcp` | **不变**——29 个平台工具 |
| `POST /mcp/agent/:id` | **新增** (P4)——Agent skills 暴露为 MCP 工具 |

### 数据库变化

| 表名 | 位置 | Phase | 说明 |
|------|------|-------|------|
| `memories` | Conversation Service | P1 | 会话记忆（pgvector） |
| `traces` | Conversation Service | P2 | 链路追踪 |
| `skills` | Gateway | P3 | 技能模板目录 |
| `tenant_billing` | Gateway | — | B2B 租户计费 |
| `request_logs` | Gateway | — | 请求用量明细 |

### 配置新增项

```bash
# Gateway .env
CONVERSATION_SERVICE_URL=http://localhost:8100
CONVERSATION_SERVICE_TOKEN=internal-shared-secret

# Conversation Service .env
PORT=8100
DATABASE_URL=postgresql://localhost:5432/agentx_conversation
INTERNAL_AUTH_TOKEN=internal-shared-secret
OPENAI_API_KEY=sk-...              # P1: embedding（可选）
SANDBOX_DOCKER_IMAGE=node:20-alpine # P6: 沙箱镜像（可选）
SANDBOX_TIMEOUT_SEC=30              # P6
SANDBOX_MAX_MEMORY_MB=256           # P6
```

---

## B2B 付费服务：鉴权与计费

Conversation Service 作为独立付费产品对外提供。AgentX 自身也是其租户之一。

### 鉴权架构

```
         B2B Client                AgentX Frontend
        (外部企业客户)              (AgentX 自身)
              │                         │
         API Key                    JWT (wallet)
              │                         │
              ▼                         ▼
    ┌─────────────────────────────────────────────┐
    │              AgentX Gateway                   │
    │                                              │
    │  Auth Layer（统一认证层）                      │
    │  ├─ API Key  → B2B 客户（外部付费）            │
    │  ├─ JWT      → AgentX 终端用户（钱包签名）     │
    │  └─ Internal → 服务间调用（X-Internal-Token）  │
    │                                              │
    │  Rate-limit · Billing · Tenant Isolation     │
    │                                              │
    │  Conversation Proxy ────────────────────┐    │
    └─────────────────────────────────────────│────┘
                                              │
                                     X-Internal-Token
                                              │
                                              ▼
                                ┌────────────────────────┐
                                │  Conversation Service   │
                                │                        │
                                │  无对外认证逻辑          │
                                │  只验证 Internal Token   │
                                │  不区分 B2B vs AgentX   │
                                └────────────────────────┘
```

> Conversation Service 不直接暴露公网。所有认证在 Gateway 层完成，Conversation Service 只接收来自 Gateway 且携带正确 Internal Token 的请求。

### AgentX 自身也是租户

| 调用方 | 认证方式 | tenant_id | 计费 |
|--------|----------|-----------|------|
| AgentX 前端用户 | Gateway JWT (wallet) | `agentx` | AgentX 平台承担 |
| B2B 客户 A | API Key `axk_live_xxx` | `defi_audit_inc` | 按 Plan 月结 |
| B2B 客户 B | API Key `axk_live_yyy` | `trading_bot_io` | 按 Plan 月结 |

### B2B 客户入驻流程

```bash
# 1. 注册租户 → 获得 API Key
POST /api/v1/tenant/register
{
  "name": "某 DeFi 审计平台",
  "email": "admin@defi-audit.com",
  "wallet": "0x...",          # 收款地址
  "plan": "pro"
}
→ { "tenantId": "t_abc123", "apiKey": "axk_live_xxxxxxxxxx" }

# 2. 调用对话服务（SSE 流式）
POST /api/v1/agent/runs
Authorization: Bearer axk_live_xxxxxxxxxx
{
  "agentId": 42,
  "message": "帮我审计 0x... 合约",
  "memory": true,
  "contextBudget": 32000
}
```

### Gateway 认证中间件扩展

```typescript
// gateway/src/middleware/auth.ts — 新增 API Key 分支（+20 行）
export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''

  // Branch 1: API Key (B2B client)
  if (header.startsWith('axk_')) {
    const tenant = await validateApiKey(header)
    if (!tenant) return res.status(401).json({ error: 'Invalid API key' })
    if (tenant.quotaExceeded) return res.status(429).json({ error: 'Quota exceeded' })
    req.user = { type: 'tenant', tenantId: tenant.id, plan: tenant.plan }
    return next()
  }

  // Branch 2: JWT (AgentX wallet user) — existing logic unchanged
  // ...
}
```

### B2B 计费模型

| Plan | 月费 | 请求数 | 并发 | 功能 |
|------|------|--------|------|------|
| **Free** | $0 | 1,000/mo | 1 | 基础对话 |
| **Pro** | $99/mo | 10,000/mo | 5 | + Memory |
| **Enterprise** | $499/mo | 100,000/mo | 20 | + Memory + Sandbox + 优先支持 |

超量不拒绝服务，按 $0.01/req 计费（Free 超量后暂停）。

### 新增文件

```
gateway/src/
├── routes/
│   ├── tenant.ts            # 扩展 +30 行：tenant register + API key 管理
│   └── billing.ts           # NEW ~80 行：计费查询/套餐变更/用量查询
├── middleware/
│   └── auth.ts              # 修改 +20 行：API Key 分支
└── services/
    └── billing-service.ts   # NEW ~100 行：配额检查 / 用量统计 / 计费逻辑
```

### 数据库迁移

```sql
-- gateway/migrations/002_billing.sql
CREATE TABLE tenant_billing (
  tenant_id VARCHAR(30) PRIMARY KEY,
  api_key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200),
  plan VARCHAR(20) DEFAULT 'free',        -- free / pro / enterprise
  monthly_quota INTEGER NOT NULL,         -- max requests per billing cycle
  used_this_month INTEGER DEFAULT 0,
  max_concurrency INTEGER DEFAULT 1,
  features JSONB DEFAULT '{}',            -- {"memory":false, "sandbox":false}
  reset_at DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',    -- active / suspended / cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking (per-request detail — optional, for analytics)
CREATE TABLE request_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(30) NOT NULL,
  agent_id INTEGER NOT NULL,
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_request_logs_tenant_date (tenant_id, created_at)
);
```

### Gateway 配置新增项

```bash
# gateway/.env 新增
API_KEY_PREFIX=axk_live_               # B2B API key 前缀
FREE_PLAN_QUOTA=1000                    # Free plan 月配额
PRO_PLAN_QUOTA=10000                    # Pro plan 月配额
ENTERPRISE_PLAN_QUOTA=100000            # Enterprise plan 月配额
OVERAGE_RATE_PER_REQUEST=0.01           # 超额单价 (USD)
```

---

## 约束检查清单

| 约束 | 如何满足 |
|------|----------|
| **解耦合/模块化** | Gateway（控制面：认证+计费+路由）与 Conversation Service（对话面：Engine）职责分离；AgentX 自身作为租户走同一鉴权体系 |
| **避免硬编码** | API Key 前缀、Plan 配额、超额单价全部通过环境变量配置；embedding 维度通过接口参数传入 |
| **大文件拆分** | 每文件 ≤ 150 行路由层 + ≤ 150 行业务层；auth.ts 仅新增 API Key 分支不重写；billing/service 分开 |
| **避免过度设计** | 计费用最简单的 request count 模型，不做 token 级别/UUID 级别计费；暂不做 Webhook 用量回调 |
| **与当前系统结合** | auth.ts 在现有 JWT 逻辑旁新增 else-if 分支不破坏原有逻辑；tenant 路由在现有 tenant.ts 上扩展非重写；所有现有 API 向后兼容 |
