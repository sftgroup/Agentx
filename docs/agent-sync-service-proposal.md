# AgentX — 链上数据微服务需求

> **给 AgentX 团队** | 新增独立微服务 `agent-sync`，提供 REST API 暴露链上 Agent 数据

---

## 状态更新

SDK v0.8.0 已完成以下接口 (✅):

| 模块 | 接口 | 状态 |
|------|------|:--:|
| registry | `getAllAgents(options)` — 批量 + 筛选 + 分页 | ✅ |
| registry | `totalAgents()` — 总数 | ✅ |
| registry | `getAgentMetadata(agentId)` — 结构化元数据 | ✅ |
| subscription | `createPlan(params)` — 创建定价计划 | ✅ |
| subscription | `subscribe(params)` — 订阅 | ✅ |
| subscription | `createPlanAndSubscribe(params)` — 组合方法 | ✅ |
| events | `subscribeToEvents(options)` — 链上事件监听 | ✅ |

> **REST 层（2026-08-04 已实现，按"增强现有 Gateway"决策，非独立微服务）**：
> - `GET /api/v1/agents`（筛选/分页）、`/count`（含 `byCategory`，由扁平 `capabilities` 派生）、`/:id`（含 `subscriptionPlans[]`，事件驱动维护）— `gateway/src/routes/agents.ts`
> - 同步：IdentityRegistry `Transfer` 事件增量 + 120s 全量兜底 + SubscriptionManager `PlanCreated` 事件维护 `subscription_plans` 表（迁移 `006_plans.sql`）
> - `GET /api/v1/health` 返回 `services.{chain,database,lastSyncAt,syncedAgentCount}`
> - 备注：链上无 category 概念，`byCategory` 以 capabilities 聚合 + `other`；`subscriptionPlans` 中 `price` 为 wei 十进制字符串；"按 agent 列计划"由 REST 提供，SDK 侧对应查询为 `getPlan(planId)`（合约无按 agent 枚举方法）

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                      AgentX                              │
│                                                         │
│  contracts ──→ SDK v0.8.0 ──→ agent-sync ──→ PostgreSQL │
│                                   │                     │
│                              REST API :3500              │
│                              GET /api/agents              │
│                              GET /api/agents/count        │
│                              GET /api/agents/:id          │
│                              GET /api/health              │
└───────────────────────────────────┼─────────────────────┘
                                    │
        ┌───────────────────────────┘
        ▼
  ┌─────────────┐   ┌──────────────┐
  │  外部服务    │   │  其他消费者   │
  │  MarketPage │   │  MCP / SDK   │
  └─────────────┘   └──────────────┘
```

---

## REST API

### `GET /api/agents`

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `activeOnly` | bool | false | 仅活跃 Agent |
| `capabilities` | string | — | 逗号分隔筛选 |
| `page` | int | 1 | 页码 |
| `pageSize` | int | 50 | 每页 (max 100) |

**Response:**

```json
{
  "code": 200,
  "data": {
    "agents": [{
      "agentId": 1,
      "owner": "0xd38a...",
      "metadata": {
        "name": "TradingBot",
        "description": "Momentum strategy",
        "capabilities": ["trading", "backtest"],
        "skills": ["momentum"],
        "isActive": true
      }
    }],
    "total": 62,
    "page": 1
  }
}
```

### `GET /api/agents/count`

```json
{ "code": 200, "data": { "total": 62, "active": 45 } }
```

### `GET /api/agents/:id`

```json
{
  "code": 200,
  "data": {
    "agentId": 1,
    "owner": "0xd38a...",
    "metadata": {
      "name": "TradingBot",
      "description": "...",
      "encryptedPayloadCid": "Qm...",
      "capabilities": ["trading"],
      "skills": ["momentum"],
      "isActive": true
    },
    "subscriptionPlans": [{
      "planId": 1, "price": "0.005", "period": "month", "isActive": true
    }]
  }
}
```

---

## 内部实现 (基于 SDK v0.8.0)

```typescript
// agent-sync/src/syncer.ts
import { IdentityRegistry } from '@agentxv2/sdk/registry'
import { createPublicClient, http } from 'viem'

export class AgentSyncer {
  private registry: IdentityRegistry

  constructor() {
    this.registry = new IdentityRegistry({
      contractAddress: process.env.IDENTITY_REGISTRY_ADDRESS!,
      publicClient: createPublicClient({
        transport: http(process.env.RPC_URL!),
      }),
    })
  }

  async syncAll() {
    const agents = await this.registry.getAllAgents({
      activeOnly: false,
      batchSize: 10,
    })

    for (const agent of agents) {
      await db.upsert({
        agent_id: agent.agentId,
        owner: agent.owner,
        name: agent.metadata.name,           // SDK 返回结构化数据
        description: agent.metadata.description,
        capabilities: agent.metadata.capabilities,
        skills: agent.metadata.skills,
        is_active: agent.metadata.isActive,
      })
    }
  }
}

// 事件驱动增量同步
import { subscribeToEvents } from '@agentxv2/sdk/events'

subscribeToEvents(publicClient, {
  identityRegistryAddress: process.env.IDENTITY_REGISTRY_ADDRESS!,
  subscriptionManagerAddress: process.env.SUBSCRIPTION_MANAGER_ADDRESS!,
  events: ['Transfer', 'AgentRegistered'],
  onEvent: async (event) => {
    if (event.type === 'AgentRegistered') {
      const agent = await registry.getAgentMetadata(event.args.agentId)
      await db.upsert(agent)
    }
  },
})
```

---

## 数据库

```sql
CREATE TABLE agents (
  agent_id     INTEGER PRIMARY KEY,
  owner        TEXT NOT NULL,
  name         TEXT,
  description  TEXT,
  capabilities TEXT[],
  skills       TEXT[],
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agents_active ON agents(is_active);
CREATE INDEX idx_agents_capabilities ON agents USING GIN(capabilities);
```

---

## Docker

```yaml
agent-sync:
  build: ./services/agent-sync
  container_name: agentx-sync
  restart: unless-stopped
  depends_on: [postgres]
  environment:
    PORT: 3500
    DATABASE_URL: postgresql://...
    RPC_URL: ${RPC_URL}
    IDENTITY_REGISTRY_ADDRESS: ${IDENTITY_REGISTRY_ADDRESS}
    SUBSCRIPTION_MANAGER_ADDRESS: ${SUBSCRIPTION_MANAGER_ADDRESS}
  ports: ["0.0.0.0:3500:3500"]
```
