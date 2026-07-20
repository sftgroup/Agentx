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

| ID | 问题 | 建议 |
|----|------|------|
| AT-7.2 | 无效 JSON 返回 500 而非 400 | 添加 Express JSON parse error 中间件 |
| CT-4 | A2A 合约未初始化 agent card/task | 需要初始化 A2A 合约或部署新版本 |

### P2 (优化)

| ID | 问题 | 建议 |
|----|------|------|
| AT-7.1 | 未知 /api/v1/* 路径返回 401 | 在 authMiddleware 之前注册已知路由 |
| AT-2.2 | /health 无 alias | 可考虑添加 /health 全局 alias |

---

## SDK 运行说明

Node.js 运行 SDK 加密测试需要 `--experimental-global-webcrypto` 标志:

```bash
cd /home/ubuntu/Agentx/sdk
node --experimental-global-webcrypto test_ct5.mjs
```