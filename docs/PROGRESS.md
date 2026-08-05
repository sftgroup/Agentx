# AgentX — 项目任务清单与进度

> Last updated: 2026-08-05 · 统一进度文档，替代过时的 `memory/AGENTX_PROGRESS.md`（后者已归档停用）
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

---

## 二、当前状态

- **进行中**：无阻塞项
- **待办（外部前提）**：
  - 法币订阅：提供 Stripe 商户账号 → 配置 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
  - x402：提供结算通道与收款钱包 → 配置 `X402_ENABLED=true` / `X402_PAY_TO`
  - 渠道归因：向 `channels` 表插入渠道配置即可启用（零外部依赖）
- **技术债（🔵 可选优化）**：
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
| SDK | `@agentxv2/sdk@0.8.3`（npm latest） |
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
| 渠道归因 | 归因→幂等（重复归因 false）→ report 分成计算正确（1 ETH × 125bps = 0.0125 ETH） |
| period 数据清洗 | 生产 38 个套餐全部为标准值；130s 同步周期后无回写 |
| 管理后台 | system/revenue/payments 200，日志输出 ip/query/耗时/结果 |

---

## 归档说明

- 旧 `memory/AGENTX_PROGRESS.md` 已停用（内容停在 2026-07-14），历史记录保留于 git 历史，不再维护
