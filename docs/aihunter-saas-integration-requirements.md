# AgentX SDK — 链上数据微服务集成需求

> **给 AgentX 团队** | AIHunter-SaaS 需要 SDK 提供链上数据批量读取、筛选、订阅写操作能力

---

## 背景

AIHunter-SaaS 当前有 3 个组件需要与 AgentX 合约深度交互：

```
┌──────────────────────────────────────────────────┐
│              AIHunter-SaaS                        │
│                                                   │
│  ┌─────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ chain-sync  │  │ subscribe  │  │  pricing   │ │
│  │ (数据同步)   │  │ (链上订阅) │  │ (计费)     │ │
│  └──────┬──────┘  └─────┬──────┘  └─────┬──────┘ │
│         │               │               │         │
│         ▼               ▼               ▼         │
│  ┌──────────────────────────────────────────┐    │
│  │      当前: 裸 ethers.js + 手工 ABI       │    │
│  │      期望: AgentX SDK 统一封装            │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│         ↓ 需要以下 SDK 能力 ↓                      │
└──────────────────────────────────────────────────┘
```

---

## 需求 1: IdentityRegistry 批量查询接口

### 当前问题

chain-sync 用二分查找 + `ownerOf` 逐个扫描 62 个 Agent，不能筛选、无结构化元数据：

```typescript
// 当前: 手工二分查找 + base64 字符串解析
const b64 = tokenURI.split(',')[1];
const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
// → { name: "TestAgent1" }  // 只有 name，无 capabilities/isActive 等
```

### SDK 需要提供

#### 1.1 `IdentityRegistry.getAllAgents(options?)`

```typescript
interface GetAllAgentsOptions {
  /** 起始 Agent ID，默认 1 */
  fromId?: number;
  /** 结束 Agent ID，默认到最后一个 */
  toId?: number;
  /** 筛选: 只返回状态为 active 的 Agent */
  activeOnly?: boolean;
  /** 筛选: 只返回包含指定 capabilities 的 Agent */
  capabilities?: string[];
  /** 每批数量，默认 10 */
  batchSize?: number;
}

interface AgentSummary {
  agentId: number;
  owner: string;
  tokenURI: string;
  /** 结构化元数据 */
  metadata: {
    name: string;
    description: string;
    capabilities: string[];
    skills: string[];
    isActive: boolean;
  };
  /** 创建时间（从 Transfer 事件推导） */
  createdAt: number;
}

// 返回
async getAllAgents(options?: GetAllAgentsOptions): Promise<AgentSummary[]>
```

#### 1.2 `IdentityRegistry.totalAgents()`

```typescript
async totalAgents(): Promise<number>
```

> 当前合约不支持 `totalSupply()`，导致前端只能用二分查找推测最大 ID。
> 如果合约暂不升级，SDK 内部实现二分查找封装也可。

#### 1.3 `IdentityRegistry.getAgentMetadata(agentId)`

```typescript
async getAgentMetadata(agentId: number): Promise<{
  name: string;
  description: string;
  encryptedPayloadCid: string;
  eciesEncryptedKey: string;
  publicPayloadCid: string;
  capabilities: string[];
  skills: string[];
  isActive: boolean;
}>
```

---

## 需求 2: SubscriptionManager 写操作封装

### 当前问题

subscribe.ts 裸调合约，手工维护 40 行 ABI + 手工 parseLog 事件：

```typescript
// 当前: 手工拼 ABI + 手工解析事件
const SM_ABI = [
  'function createPlan(uint256 agentId, uint256 price, string period, ...)',
  'event PlanCreated(uint256 indexed planId, ...)',
];
for (const log of receipt.logs) {
  const parsed = smWrite.interface.parseLog({...});
  if (parsed?.name === 'PlanCreated') { planId = parsed.args.planId; }
}
```

### SDK 需要提供

#### 2.1 `SubscriptionManager.createPlan()`

```typescript
interface CreatePlanParams {
  agentId: number;
  price: string;        // ETH 金额 (wei 字符串)
  period: 'monthly' | 'quarterly' | 'yearly';
  payToken?: string;    // ERC20 地址，默认 0x0 (native)
  trialDays?: number;   // 默认 0
}

interface CreatePlanResult {
  planId: number;
  txHash: string;
}

async createPlan(params: CreatePlanParams): Promise<CreatePlanResult>
```

#### 2.2 `SubscriptionManager.subscribe()`

```typescript
interface SubscribeParams {
  planId: number;
  /** ETH 金额 (wei 字符串)，必须与 plan price 匹配 */
  value: string;
}

interface SubscribeResult {
  subscriptionId: number;
  txHash: string;
  expiresAt: number;        // Unix timestamp (秒)
  subscriber: string;
}

async subscribe(params: SubscribeParams): Promise<SubscribeResult>
```

#### 2.3 `SubscriptionManager.createPlanAndSubscribe()`

```typescript
/** 一步完成: createPlan + subscribe（减少两次交易等待） */
async createPlanAndSubscribe(params: CreatePlanParams): Promise<CreatePlanResult & SubscribeResult>
```

#### 2.4 已有接口确认（当前 SDK 已提供）

| 方法 | 状态 | 说明 |
|------|:--:|------|
| `hasActiveSubscription()` | ✅ 已有 | subscription-client.ts 在用 |
| `getSubscription()` | ✅ 已有 | subscription-client.ts 在用 |
| `getSubscriptionDetail()` | ✅ 已有 | 返回完整订阅结构 |
| `getPlatformFeeBps()` | ✅ 已有 | 返回平台费率 |

---

## 需求 3: 事件监听（可选，P1）

### 用途

chain-sync 目前纯轮询，新 Agent 注册最多等 2 分钟。如果 SDK 能监听合约事件，延迟可降到 < 15 秒。

```typescript
interface EventListenerOptions {
  /** 监听的事件类型 */
  events: ('Transfer' | 'AgentRegistered' | 'PlanCreated' | 'Subscribed')[];
  /** 回调 */
  onEvent: (event: { type: string; args: any; txHash: string }) => void;
  /** 从哪个块开始监听 */
  fromBlock?: number;
}

async subscribeToEvents(options: EventListenerOptions): Promise<() => void>
// 返回 unsubscribe 函数
```

---

## 优先级建议

| 优先级 | 需求 | 影响 |
|:--:|------|------|
| **P0** | `SubscriptionManager.createPlan()` + `subscribe()` | 替代 subscribe.ts 中 40 行手工 ABI |
| **P0** | `IdentityRegistry.getAllAgents()` | 替代 chain-sync 的手工扫描 |
| **P1** | `getAgentMetadata()` 返回结构化数据 | 替代 tokenURI base64 解析 |
| **P1** | 事件监听 | 降低同步延迟 2min→15s |
| **P2** | `createPlanAndSubscribe()` 原子操作 | 减少一次交易等待 |
