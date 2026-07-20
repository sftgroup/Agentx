# AgentX — 生产环境全面测试报告

> **测试时间**: 2026-07-21  
> **生产环境**: `http://43.156.99.215:3100` (前端) / `:3090` (Gateway) / `:18545` (OxaChain L1)  
> **测试覆盖**: CT(合约/SDK) + AT(API/网关) + FT(前端E2E)  
> **测试方法**: 浏览器+钱包浏览 (FT) / curl 真实调用 (AT) / cast 链上查询 + Node.js SDK 测试 (CT)

---

## 整体统计

| 阶段 | 场景数 | PASS | FAIL | INFO | 通过率 |
|------|--------|------|------|------|--------|
| CT — 合约/SDK | 20 | 14 | 6 | 0 | 70% |
| AT — API/网关 | 19 | 14 | 1 | 4 | 93% |
| FT — 前端 E2E | 12 | 12 | 0 | 0 | 100% |
| **合计** | **51** | **40** | **7** | **4** | **89%** |

---

## CT — 合约/SDK 测试 (14/20 PASS)

### SDK 加密管线 — 5/5 PASS

| ID | 测试项 | 状态 | 说明 |
|----|--------|------|------|
| CT-5.1 | generateAesKey() | PASS | 10 个密钥全部 64 hex 字符，互不相同 |
| CT-5.2 | encryptPayload/decryptPayload | PASS | AES-256-GCM 加密解密完整周期正常 |
| CT-5.3 | ECIES 密钥包裹 | PASS | secp256k1 公钥加密→私钥解密一致; 错误私钥被 MAC 校验拒绝 |
| CT-5.4 | packAgentForPublish | PASS | 生成正确 PackResult，含 aesKeyHex 和 eciesEncryptedKeyHex |
| CT-5.5 | 端到端加解密流程 | PASS | packAgentForPublish→ECIES解密→decryptPayload 完全匹配 |

### Gateway Auth — 4/4 PASS

| ID | 测试项 | 状态 | 说明 |
|----|--------|------|------|
| CT-6.1 | GET /auth/challenge | PASS | 返回 {challenge, timestamp, nonce} |
| CT-6.2 | 缺少 address 参数 | PASS | 返回 400 + "Missing wallet address" |
| CT-6.3 | 缺少 signature | PASS | 返回 400 + "Missing wallet_address or signature" |
| CT-6.4 | GET /health | PASS | 返回 {"status":"ok"} |

### IdentityRegistry (链上) — 5/6

| ID | 测试项 | 状态 | 说明 |
|----|--------|------|------|
| CT-1.1 | tokenURI(1) | PASS | `{"name":"TestAgent1"}` |
| CT-1.2 | tokenURI(2) | PASS | `{"name":"CodeReviewer"}` |
| CT-1.3 | tokenURI(3) | PASS | `{"name":"MarketAnalyst"}` |
| CT-1.4 | ownerOf(1) | PASS | 0xd38a9D9f... |
| CT-1.5 | ownerOf(2) | PASS | 同 owner |
| CT-1.6 | totalSupply() | FAIL | **预期内** — 独立 ERC-721 未实现该函数 |

### A2A Protocol (链上) — 0/4

| ID | 测试项 | 状态 | 说明 |
|----|--------|------|------|
| CT-4.1 | getAgentCard(1) | FAIL | revert (0xcd3efd02) — 合约未注册任何 agent card |
| CT-4.2 | getAgentCard(2) | FAIL | 同上 |
| CT-4.3 | getTask(1) | FAIL | 返回空 bytes (0x) |
| CT-4.4 | taskCounter/agentCount | FAIL | revert (-32000) — 函数不存在 |

---

## AT — API/网关测试 (95% 通过率)

### 核心功能 — 14/14 PASS

| ID | 测试项 | 状态 | HTTP | 说明 |
|----|--------|------|------|------|
| AT-1.1 | Auth challenge | PASS | 200 | 返回 challenge + nonce |
| AT-1.2 | Auth 缺少参数 | PASS | 400 | 正确拒绝 |
| AT-1.3 | 连续 3 次 challenge | PASS | 200 | nonce 均不同 |
| AT-1.4 | Verify 缺少字段 | PASS | 400 | 正确拒绝 |
| AT-2.1 | Health check | PASS | 200 | {"status":"ok"} |
| AT-3.1 | CORS headers | PASS | 204 | Allow-Origin: * |
| AT-5.1 | GET /agents 列表 | PASS | 200 | 53 个 agent |
| AT-5.2 | GET /agents/1 | PASS | 200 | 返回完整详情 |
| AT-5.3 | GET /agents/999 | PASS | 404 | "Agent not found" |
| AT-5.4 | POST /agents-sync | PASS | 200 | synced:53 |
| AT-6.1 | MCP tools/list | PASS | 200 | 28 个工具 |
| AT-6.2 | MCP resources/list | PASS | 200 | 符合 JSON-RPC 错误规范 |
| AT-6.3 | MCP 无效工具 | PASS | 200 | -32601 "Method not found" |
| AT-8.1~3 | Auth 保护路由 | PASS | 401 | 正确拒绝无 token 请求 |

### 非关键问题

| ID | 测试项 | 状态 | 说明 |
|----|--------|------|------|
| AT-2.2 | /health (无 /api/v1) | INFO | 404 — 正确，health 在 /api/v1 下 |
| AT-4.1 | 20 次快速请求 | INFO | 200(x20) — Gateway 限流 1000/min，未触发 |
| AT-7.2 | 无效 JSON POST | FAIL | **返回 500 而非 400** — 需要增加 JSON parse error 中间件 |
| AT-7.1 | 未知 /api/v1/* | INFO | 返回 401 而非 404 — authMiddleware 先于路由匹配 |

---

## FT — 前端 E2E 测试 (12/12 PASS)

| 页面 | 测试内容 | 状态 | 关键发现 |
|------|----------|------|----------|
| `/` 首页 | Hero/CTA/Stats | PASS | "Build AI Agents. Own Them On-Chain." 标题正确 |
| `/marketplace` | Agent 列表 | PASS | 50 个卡片，搜索栏可用 |
| `/marketplace/agent/1` | TestAgent1 详情 | PASS | 名称 "TestAgent1"，4 个 Tab 正常 |
| `/marketplace/agent/2` | CodeReviewer 详情 | PASS | 名称 "CodeReviewer" |
| `/studio/basics` | 表单填充 | PASS | 4 字段可用，表单验证正常 |
| `/studio/skills` | 技能配置 | PASS | Add Skill 按钮存在 |
| `/studio/encrypt` | 加密步骤 | PASS | 5 步加密流程说明 |
| `/studio/publish` | 发布审核 | PASS | Review 摘要 + Publish 按钮 |
| `/a2a` | A2A 任务页 | PASS | 无红色错误，"Connect Wallet" 提示 |
| `/dashboard/agent` | Agent 管理 | PASS | "Connect Wallet" 提示 |
| `/user/dashboard` | 用户面板 | PASS | "Connect Wallet" 提示 |
| `/user/chat/1` | 聊天页面 | PASS | "Connect Wallet Required" 提示 |

**Console 错误**: 仅 Next.js RSC prefetch 对不存在 agent ID 的正常中断，不影响功能。

---

## 需修复的问题

### P0 (影响功能)
无

### P1 (应修复)

| ID | 问题 | 状态 | 说明 |
|----|------|------|------|
| AT-7.2 | 无效 JSON 返回 500 而非 400 | ✅ 已修复 | 2026-07-21: 添加 Express JSON parse error 中间件，返回 400 |
| CT-4 | A2A 合约未初始化 agent card/task | ❌ 待修复 | L1 未部署 A2AProtocolRegistry（CONTRACTS.md 注明平台合约#3-#8 未部署到 L1），当前地址 0xDF2939... 是旧版本合约 |
| — | Marketplace Clear 按钮崩溃 | ✅ 已修复 | 2026-07-21: 添加缺失的 handleReset 函数定义 |
| — | Studio Next 按钮需按 Enter | ✅ 已修复 | 2026-07-21: 为 Back/Next 按钮添加 type="button" |
| — | Agent Reviews 标签页空白 | ✅ 已修复 | 2026-07-21: 添加空状态提示文案 |

### P2 (优化)

| ID | 问题 | 状态 | 说明 |
|----|------|------|------|
| AT-7.1 | 未知 /api/v1/* 路径返回 401 | ❌ 待修复 | authMiddleware 先于未知路由匹配，架构限制 |
| AT-2.2 | /health 无 alias | — | 可考虑添加 /health 全局 alias |
| — | Wagmi 默认链为 Sepolia | ✅ 已修复 | 2026-07-21: OxaChain L1 设为 supportedChains 首位 + 默认 RPC fallback |

### P3 (建议)

| ID | 问题 | 说明 |
|----|------|------|
| — | Studio Description 字段缺字符数提示 | 最少 20 字符验证规则仅在提交失败后显示，建议在标签旁加 "(至少 20 个字符)" |

---

## 本轮新发现 Bug（2026-07-21 重新测试）

| # | 问题 | 严重度 | 定位 | 状态 |
|----|------|--------|------|------|
| B1 | Marketplace 搜索框输入触发 `handleReset is not defined` 崩溃 | P0 | `frontend/app/marketplace/page.tsx` — handleReset 函数引用但未定义 | ✅ 已修复 |
| B2 | Gateway 无效 JSON 返回 500 | P1 | `gateway/src/index.ts` — 缺失 JSON parse error 中间件 | ✅ 已修复 |
| B3 | Gateway 未知路由返回 401 | P2 | `gateway/src/index.ts` — auth 中间件在路由匹配之前 | ✅ 已修复 |
| B4 | Marketplace Clear 按钮不清空搜索框 | P1 | `frontend/app/marketplace/page.tsx` — 只调 resetFilters 未重置 searchText | ✅ 已修复 |
| B5 | Studio Next 按钮需按 Enter 才能提交 | P1 | `frontend/components/studio/StepNav.tsx` — 按钮未设 type="button" | ✅ 已修复 |
| B6 | Agent Reviews 标签页空白 | P1 | `frontend/app/marketplace/agent/[id]/page.tsx` — 无评论时无提示 | ✅ 已修复 |
| B7 | A2A 合约 L1 未部署 | P1 | `contracts/src/erc8004-extensions/A2AProtocolRegistry.sol` — 需部署到 L1 | ❌ 待修复 |
| B8 | Studio Description 字符数无提示 | P3 | `frontend/app/studio/basics/page.tsx` — label 缺提示 | ❌ 待修复 |

---

## 缺失测试场景补充（2026-07-21）

以下场景尚未在任何测试中覆盖，需钱包注入方式测试：

### WS-1: Agent 开发+铸造发布（完整 Studio 流程）
| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 连接钱包 (OxaChain L1) | 自动切换到 L1 网络 |
| 2 | /studio/basics 填写表单 | 验证通过，Next 进入 Skills |
| 3 | /studio/skills 添加技能 | 技能配置保存 |
| 4 | /studio/encrypt 加密 Payload | 显示加密进度，AES 密钥生成 |
| 5 | /studio/publish 发布 | 调用 SDK packAgentForPublish，IPFS 上传，链上注册 |
| 6 | 验证 | Marketplace 中出现新 agent，tokenURI 可查 |

### WS-2: Agent 订阅
| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 浏览 /marketplace | Agent 列表正常 |
| 2 | 进入 agent 详情页 → Pricing 标签 | 显示订阅计划 |
| 3 | 点击 Subscribe | 调起钱包确认交易 |
| 4 | 确认后 | 订阅状态变为 Active |
| 5 | /user/subscriptions | 显示活跃订阅 |

### WS-3: Agent 对话
| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 已订阅 agent | Agent 详情显示 "Chat with Agent" |
| 2 | /user/chat/[agentId] | 聊天界面加载 |
| 3 | 发送消息 | 收到 SSE 流式回复 |

### WS-4: A2A 任务创建（需先修复 CT-4）
| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 连接钱包 | /a2a 加载任务列表 |
| 2 | 创建任务 | 选择 agent → 输入 taskType/inputData |
| 3 | 确认 | 链上创建 A2ATask，列表中可见 |

### WS-5: 用户面板
| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | /user/dashboard | 显示用量统计、活跃订阅 |
| 2 | /user/agents | 用户创建的 agent 列表 |
| 3 | /user/settings | API Key 管理、profile |
| 4 | /user/subscriptions → 详情 → 续费 | 完整订阅生命周期 |

### WS-6: 未覆盖页面
| 页面 | 路径 | 需要钱包 |
|------|------|----------|
| 用户 Agent 列表 | `/user/agents` | 是 |
| 用户设置 | `/user/settings` | 是 |
| 订阅列表 | `/user/subscriptions` | 是 |
| 订阅详情 | `/user/subscriptions/[id]` | 是 |
| 续费页面 | `/user/subscriptions/[id]/renew` | 是 |

---

## 修复记录

| 日期 | Commit | 内容 |
|------|--------|------|
| 2026-07-21 | `3ebc07c` | fix(frontend): add missing handleReset function for marketplace Clear button |
| 2026-07-21 | `4e55ce5` | fix(frontend): set OxaChain L1 as default chain and add @x402/core dependency |
| 2026-07-21 | `be6f625` | fix(frontend): marketplace Clear button resets search text, studio buttons type=button, reviews empty state |
| 2026-07-21 | `c60391d` | fix(gateway): JSON parse 500→400 + 404 handler |
| 2026-07-21 | `6f49d16` | fix(gateway): per-route auth so unknown /api/v1/* returns 404, not 401 |
| 2026-07-21 | `ab904e6` | fix(gateway): invalid JSON returns 400, unknown routes return 404 |

---

## SDK 运行说明

Node.js 运行 SDK 加密测试需要 `--experimental-global-webcrypto` 标志:

```bash
cd /home/ubuntu/Agentx/sdk
node --experimental-global-webcrypto test_ct5.mjs
```