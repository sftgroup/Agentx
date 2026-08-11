# AgentX C/B 端分角色商业化方案（R19）

> 状态：方案定稿 + 决策完成（2026-08-11）· 待实施 · 关联 PROGRESS.md「R19」条目

## 1. 背景与目标

商业模型对齐：用户分 **C 端**与 **B 端**两类，各自付费入口：

- **B 端**：以 API/REST/SDK 调用对话为主，使用平台 LLM 需付费。目标改为「**钱包登录 → 自动生成用户 → 独立 B 端用户面板 → 面板内自助购买套餐 → 面板自动获得 key**」，替代当前的「申请 → admin 审批 → 手动签发 key」模式。
- **C 端**：注册用户（钱包登录，已有）。目标为「**购买 LLM token 套餐**」，即平台配额套餐（Free/Pro/Enterprise）的自助购买闭环。

## 2. 现状盘点（事实，2026-08-11）

| 能力 | 现状 | 位置 |
|---|---|---|
| C 端登录 | 钱包 EIP-191 签名 → JWT，自动注册 tenant（kind=user） | `gateway/src/middleware/auth.ts` |
| C 端自动发 key | **已有**——新钱包注册时自动生成 `agentx_` key（明文存 DB） | auth.ts:182-200 |
| B 端获取 | 申请模式：`/developer/apply` 表单 → `partner_applications` → admin 审批 → 自动建租户 + 签发 key（仅显示一次） | `gateway/src/routes/developer.ts`、`admin-partners.ts`、`frontend/app/apply` |
| B 端面板 | 无（仅公开申请页 + admin 管理页） | — |
| B 端购套餐 | 无自助（admin PATCH 手动分配 plan） | admin-partners.ts |
| 平台套餐体系 | `plans` 表（free/pro/enterprise）+ `tenants.quota_daily/quota_used` + Redis 配额计数 + chat 页用量展示 | R18 已打通计费 |
| 购买流程 | 未上线（R4 Stripe 待外部凭据）；`user/plans` 页是 agent 链上订阅计划管理（P2），非平台套餐购买 | payments.ts / payments-bridge.ts（webhook 已铺路） |
| 前端缺口 | ① 用户端无独立「配额/账单」页——仅 chat 页内联计数，无进度条/升级入口 · ② chat 页无 429 配额耗尽引导（无 exceeded 提示/升级 CTA）· ③ Admin 套餐页只读——仅并行任务能力位开关，无「编辑配额数值」UI | `frontend/app/user/chat/*/page.tsx`、`frontend/app/admin/tabs/plans.tsx` |
| 链上支付 | x402/P2 结算链路完整可用 | payments-bridge.ts |

## 3. 目标模式

```
B 端                                C 端（已有登录）
┌───────────────┐                   ┌────────────────┐
│ 钱包登录(partner)│                  │ 钱包登录(kind=user) │
│ ↓ 自动建租户     │                  │ ↓               │
│ ↓ 自动发 agentx_ key│                │ 购买 LLM token 套餐 │
│ ↓ 独立 B 端面板   │                  │ ↓ 配额即时生效     │
│   · 购套餐/用量   │                  │ chat 页用量反映    │
│   · key 管理/轮换 │                  └────────────────┘
│   · 调用日志     │
└───────────────┘
```

## 4. 差距分析

| # | 差距 | 当前 | 目标 |
|---|---|---|---|
| G1 | B 端钱包登录建租户 | 仅申请通道（partner_applications） | 钱包登录可选 B 端通道，kind=partner |
| G2 | B 端独立面板 | 无 | 独立前端路由 + scoped API |
| G3 | B 端自助购套餐 | admin 手动分配 | 面板内购买，支付后绑定 plan |
| G4 | B 端自动发 key | admin 签发 | 注册即自动签发（复用 C 端逻辑） |
| G5 | C 端购买闭环 | 无（R4 待办） | Billing 页购买 token 套餐 |

## 5. 设计决策

- **D1 钱包登录扩展 B 端通道**：复用现有 EIP-191 → JWT 流程，新增注册标识（如登录请求/注册端点带 `kind=partner` 或独立 `/auth/partner/signin`）→ 创建 kind=partner 租户，沿用 auth.ts:182-200 的自动发 key 逻辑（需调整支持 partner）。
- **D2 申请模式去留**（已定 T1）：**全自助**——R19.1 上线后下线 `/developer/apply` 独立申请流程（含 `partner_applications` 审批）；未来需人工审批（背调/大客户）时融入客服系统（非本期）。
- **D3 支付通道**：链上支付优先（x402/P2 结算链路现成、无外部依赖）→ C/B 端购买均可用；Stripe 法币待商户凭据就绪后接入（复用 R4 已铺路的 `fiat_subscriptions` + webhook）。
- **D4 B 端面板隔离**：独立路由（如 `/b/*`）+ 新 API 一律 scoped 到 partner 租户（与 admin 隔离），仅暴露本租户 key/用量/套餐。
- **D5 C 端 Billing 页**：用户中心新增「套餐」页（与现有 agent 订阅 plans 页区分），展示当前套餐/**用量进度条**/升级购买入口；chat 页 429（`daily_quota`）时展示**配额耗尽引导**——exceeded 提示 + 升级 CTA + 切换 BYOK 提示。
- **D6 配额衔接**：购买成功后仅更新 `tenants.plan_id/quota_daily`，计费继续走 R18 已就绪的 `updateQuota` 链路，零改造。
- **D7 Admin 套餐配额编辑**：admin plans 页增加配额数值编辑（`quota_daily`/RPM/并发 直接改库并即时生效），配额变更经既有 `tenants`/`updateQuota` 链路生效，无需新增 API。
- **D8 key 存储**（已定 T2）：**仅新 key hash 化**——新增签发的 key 存 `api_key_hash`（SHA-256），存量明文 key 保留不迁移。
- **D9 定价结构**（已定 T4）：**订阅制**——B 端套餐为「月费 + 每日配额」，复用现有 `plans` 表 + `quota_daily` 体系；按量预充值作为后续扩展。
- **D10 B 端无免费套餐**（已定 T3）：自助注册的 partner 租户**不授予 free plan**（`quota_daily=0`），必须购订阅套餐后才可使用平台 LLM——从源头抑制批量注册刷配额。

## 6. 落地拆分（阶段）

| 阶段 | 内容 | 关键点 |
|---|---|---|
| R19.1 | B 端钱包登录 + 自动建租户 + 自动发 key | auth 扩展 kind=partner；**新 key hash 化**；**无免费套餐**（quota_daily=0，购订阅才可用平台 LLM） |
| R19.2 | B 端独立面板骨架 | 前端 `/b` 路由：套餐展示 / 用量 / key 查看（仅一次后隐藏）/ 调用统计 |
| R19.3 | 自助购买通道 | 链上支付优先；订单→绑定 plan→配额生效；Stripe 预留接口 |
| R19.4 | C 端 Billing 页 + 429 引导 | 购买 token 套餐 + **用量进度条** + 升级入口 + chat 页 429 `daily_quota` 配额耗尽引导（exceeded 提示 / 升级 CTA / BYOK 切换提示） |
| R19.5 | 申请模式下线 | 下线 `/developer/apply` 独立申请流程与申请页；未来人工审批走客服系统 |
| R19.6 | Admin 套餐配额编辑 | plans 页支持编辑 `quota_daily`/RPM/并发 数值（直接改库即时生效），不依赖 API/DB 手工 |

## 7. 安全要点

- **key 存储**（已定 T2）：**仅新 key hash 化**——新增签发 key 存 `api_key_hash`（SHA-256），存量明文 key 保留不迁移（存量已轮换过，迁移收益低于成本）。
- **租户隔离**：B 端面板 API 严格 scoped，partner 只能看自己的 key/用量/订单。
- **key 显示策略**：签发后仅显示一次（沿用现有 admin 签发行为），面板提供轮换入口（轮换后旧 key 失效）。
- **防滥用**（已定 T3）：**B 端租户无免费套餐**（quota_daily=0，购订阅才可用平台 LLM）+ 接现有限流，从源头抑制批量注册刷配额。

## 8. 依赖与前提

- 链上支付：可用（无外部依赖）——可立即推进 R19.3。
- Stripe：需商户凭据（外部前提，与 R4 同一依赖）。
- 前端：新增 B 端面板 + C 端 Billing 页（新路由，不影响现有页面）。

## 9. 验收标准

- B 端：钱包登录 → 自动获得 `agentx_` key → 面板可购套餐 → key 直接调通 `/agent/runs` 与并行任务 → 用量在面板实时反映。
- C 端：Billing 页购买 token 套餐 → `quota_daily` 即时生效 → chat 页用量指示器（**进度条**）与配额同步；配额耗尽时 chat 页出现 **429 引导**（exceeded 提示 + 升级 CTA + BYOK 切换提示）。
- Admin：plans 页可编辑配额数值（`quota_daily`/RPM/并发）并即时生效。
- 回归：R18 计费链路（SSE + 回调双通道）不受影响；admin 审批通道仍可用。

## 10. 决策记录（2026-08-11 已定）

| # | 决策 | 已定方案 |
|---|---|---|
| T1 | 申请表单去留 | **全自助**：下线独立申请流程；未来人工审批融入客服系统 |
| T2 | 存量 key 迁移 | **仅新 key hash 化**：新增 key 存 SHA-256，存量明文保留 |
| T3 | 自助注册防滥用 | **B 端租户无免费套餐**（quota_daily=0），购订阅后才可用平台 LLM |
| T4 | B 端套餐定价结构 | **订阅制**：月费 + 每日配额（复用 plans 表 + quota_daily）；按量预充值为后续扩展 |
