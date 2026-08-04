# AgentX — 链上数据微服务需求

> **给 AgentX 团队** | 新增独立微服务 `agent-sync`，提供 REST API 暴露链上 Agent 数据

---

## 背景

AIHunter-SaaS 当前自建了一个 `chain-sync` 微服务，用裸 ethers.js 从 OxaChain 扫描 Agent 数据。

问题：
- 手工二分查找 + 手工 base64 解析 tokenURI，不感知 AgentX 合约结构
- 无法筛选（activeOnly、capabilities），62 个 Agent 全入库
- AgentX 和 AIHunter 各维护一套链交互代码

**方案**：将此微服务移入 AgentX，让 AgentX 成为链上 Agent 数据的唯一权威源。

---

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    AgentX                            │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │ contracts│──→│   SDK    │──→│  agent-sync    │  │
│  │          │   │          │   │  ┌──────────┐  │  │
│  │ Identity │   │ getAll   │   │  │ internal  │  │  │
│  │ Registry │   │ Agents() │   │  │  cache    │  │  │
│  │ SubMgr   │   │          │   │  │ (Redis/PG)│  │  │
│  └──────────┘   └──────────┘   │  └──────────┘  │  │
│                                │  REST API      │  │
│                                └───────┬────────┘  │
│                                        │            │
└────────────────────────────────────────┼────────────┘
                                         │
            ┌────────────────────────────┘
            ▼
     ┌─────────────┐     ┌──────────────┐
     │ aihunter-saas│    │  其他消费者   │
     │  frontend    │    │  (MCP, SDK)  │
     └─────────────┘    └──────────────┘
```

---

## REST API 设计

### `GET /api/agents`

查询 Agent 列表。

**Query Parameters:**

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `activeOnly` | boolean | `false` | 只返回 `isActive=true` 的 Agent |
| `capabilities` | string | — | 按能力筛选，逗号分隔，如 `trading,analysis` |
| `fromId` | number | 1 | 起始 ID |
| `toId` | number | — | 结束 ID（不传则到最大） |
| `page` | number | 1 | 页码 |
| `pageSize` | number | 50 | 每页数量 (max 100) |

**Response (200):**

```json
{
  "code": 200,
  "data": {
    "agents": [
      {
        "agentId": 1,
        "owner": "0xd38a9D9f3cF4723fe89e374486616705Aa7b8dAF",
        "tokenURI": "data:application/json;base64,...",
        "metadata": {
          "name": "TestAgent1",
          "description": "A test trading agent",
          "capabilities": ["trading", "backtest"],
          "skills": ["momentum", "arbitrage"],
          "isActive": true
        },
        "createdAt": 1718000000
      }
    ],
    "total": 62,
    "page": 1,
    "pageSize": 50
  },
  "message": "ok"
}
```

### `GET /api/agents/count`

返回 Agent 总数统计。

**Response (200):**

```json
{
  "code": 200,
  "data": {
    "total": 62,
    "active": 45,
    "byCategory": {
      "trading": 30,
      "analysis": 10,
      "defi": 5,
      "other": 17
    }
  }
}
```

### `GET /api/agents/:agentId`

查询单个 Agent 详情。

**Response (200):**

```json
{
  "code": 200,
  "data": {
    "agentId": 1,
    "owner": "0xd38a...",
    "metadata": {
      "name": "TestAgent1",
      "description": "...",
      "encryptedPayloadCid": "Qm...",
      "eciesEncryptedKey": "...",
      "publicPayloadCid": "Qm...",
      "capabilities": ["trading"],
      "skills": ["momentum"],
      "isActive": true
    },
    "subscriptionPlans": [
      {
        "planId": 1,
        "price": "0.005",
        "period": "monthly",
        "payToken": "0x0000...",
        "isActive": true
      }
    ]
  }
}
```

### `GET /api/health`

```json
{
  "status": "ok",
  "services": {
    "chain": "connected",
    "database": "connected",
    "lastSyncAt": "2026-08-04T12:00:00Z",
    "syncedAgentCount": 62
  }
}
```

---

## 内部实现

### 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 22 + TypeScript |
| 框架 | Fastify (与 AgentX gateway 一致) |
| 链交互 | `@agentxv2/sdk` IdentityRegistry |
| 缓存 | Redis (可选，减少链 RPC 调用) |
| 数据库 | PostgreSQL (已有 AgentX 实例) |
| 部署 | Docker 独立容器 |

### 核心同步逻辑

```
启动时:
  1. 连接数据库 + Redis
  2. 调用 SDK.IdentityRegistry.getAllAgents(activeOnly=false)
  3. Upsert 到 agents 表

运行时:
  4. 监听 Transfer/Mint 事件 → 增量更新
  5. 每 2 分钟兜底全量对比 → 清理已销毁 Agent
  6. API 优先从 Redis 缓存返回，miss 时回源 SDK

结构:
  src/
  ├── index.ts          # Fastify server
  ├── routes.ts         # REST endpoints
  ├── syncer.ts         # SDK → DB sync engine
  ├── cache.ts          # Redis cache layer
  └── types.ts          # AgentSummary, etc.
```

### 数据库表

```sql
CREATE TABLE agents (
  agent_id   INTEGER PRIMARY KEY,
  owner      TEXT NOT NULL,
  token_uri  TEXT,
  name       TEXT,
  description TEXT,
  capabilities TEXT[],      -- ['trading', 'backtest']
  skills     TEXT[],        -- ['momentum']
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_active ON agents(is_active);
CREATE INDEX idx_agents_capabilities ON agents USING GIN(capabilities);
```

### docker-compose 新增

```yaml
agent-sync:
  build: ./services/agent-sync
  container_name: agentx-sync
  restart: unless-stopped
  depends_on:
    - postgres
    - redis
  environment:
    NODE_ENV: production
    PORT: 3500
    DATABASE_URL: postgresql://...
    REDIS_URL: redis://...
    RPC_URL: ${RPC_URL}
    IDENTITY_REGISTRY_ADDRESS: ${IDENTITY_REGISTRY_ADDRESS}
  ports:
    - "0.0.0.0:3500:3500"
```

---

## 区别于已有 AgentX Gateway

| | AgentX Gateway (现有) | agent-sync (新增) |
|------|------|------|
| 职责 | Agent 注册、发布、加密管线、订阅 | Agent 数据查询、列表、筛选 |
| 数据源 | 直接读链 (实时) | DB 缓存 + SDK 读链 |
| 调用方 | 前端用户操作 | 外部服务 (aihunter-saas 等) |
| 性能 | 实时但慢 (链 RPC) | 缓存快 (DB/Redis) |
| 接口风格 | MCP / AgentX protocol | RESTful API |

---

## 实施计划

| 步骤 | 内容 | 预估 |
|:--:|------|:--:|
| 1 | 创建 `services/agent-sync/` 目录 + Dockerfile | 小 |
| 2 | 实现 `syncer.ts`：SDK.getAllAgents → PG upsert | 中 |
| 3 | 实现 `routes.ts`：REST API endpoints | 小 |
| 4 | Redis 缓存层 | 小 |
| 5 | docker-compose 集成 + 部署 | 小 |
| 6 | AIHunter-SaaS 接入 | 见 aihunter-saas 侧文档 |
