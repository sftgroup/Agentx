# AgentX — AT API 测试场景

> 项目: AgentX (ERC-8004 AI Agent Protocol)
> 覆盖: Gateway API (10 路由模块) + IPFS Proxy + Chat LLM Pipeline
> 生成时间: 2026-07-20

---

## 概述

AgentX Gateway 提供 10 个核心 API 路由模块，覆盖 EIP-191 认证、多租户 SaaS、Chat 代理、MCP JSON-RPC、IPFS Proxy、历史记录和用量追踪。

---

## AT-1: 认证模块 (Auth)

### AT-1.1: 获取 Challenge
```
GET {gateway}/api/v1/auth/challenge?address=0x{valid_address}
```
| 验证项 | 预期 |
|--------|------|
| 状态码 | 200 |
| 响应格式 | `{ challenge: "agentx:auth:{ts}:{nonce}", timestamp, nonce }` |
| 缺少 address 参数 | 400 `{ error: "Missing wallet address" }` |
| 无效 address 格式 | 仍返回 challenge（不区分大小写） |
| 连续调用 3 次 | 3 次 nonce 均不同 |

### AT-1.2: 验证签名获取 JWT
```
POST {gateway}/api/v1/auth/verify
Body: { wallet_address, signature, timestamp, nonce }
```
| 验证项 | 预期 |
|--------|------|
| 正常场景 | 200 `{ access_token, expires_in, tenant }` |
| 缺少 signature | 400 `{ error: "Missing wallet_address or signature" }` |
| challenge 过期（>5min） | 401 `{ error: "Challenge expired" }` |
| 无效签名 | 401 `{ error: "Invalid signature" }` |
| 签名地址不匹配 | 401 `{ error: "Signature does not match wallet address" }` |
| 首次登录新地址 | 自动创建 tenant，plan_slug='free' |
| 被暂停账户 | 403 `{ error: "Account suspended" }` |
| 重复 verify（同一 challenge） | 401（challenge 已被消费） |

### AT-1.3: Token 续期/验证
| 验证项 | 预期 |
|--------|------|
| 无 Authorization header | 401 |
| Authorization 非 Bearer 格式 | 401 |
| 有效 Bearer token | 200（通过 authMiddleware 路由） |
| 过期 JWT | 401 `{ error: "Invalid or expired token" }` |
| 篡改 JWT | 401 |

---

## AT-2: 租户管理 (Tenant)

### AT-2.1: 获取当前租户信息
```
GET {gateway}/api/v1/tenant/me
Authorization: Bearer {token}
```
| 验证项 | 预期 |
|--------|------|
| 正常 | 200 `{ plan, own_keys[], usage_today }` |
| plan.byok_enabled | free→true, pro/enterprise→true |
| plan.platform_models | free→[], pro→[gpt-4o-mini,deepseek-chat] |
| usage_today | `{ total_tokens, total_tool_calls }` 实时累计 |

### AT-2.2: 更新租户配置
```
PATCH {gateway}/api/v1/tenant/me
Body: { name: "My Org" }
```
| 验证项 | 预期 |
|--------|------|
| name 更新 | 200 返回更新后 tenant |
| 无效字段 | 400 |

### AT-2.3: 管理自有 API Key (BYOK)
```
POST {gateway}/api/v1/tenant/me/keys
Body: { provider, endpoint, api_key, model, label }
```
| 验证项 | 预期 |
|--------|------|
| 创建新 key | 201 返回 key 记录（api_key 部分脱敏） |
| 重复 provider+model | 允许（不同 endpoint） |
| 缺少必填字段 | 400 |
| 获取 key 列表 | GET → 200 返回所有 own_keys |
| 删除 key | DELETE → 200 |
| 设为 inactive | PATCH → 200 |

### AT-2.4: API Key 加密存储验证
| 验证项 | 预期 |
|--------|------|
| 创建 key 后查 DB | api_key 字段为 AES-256-GCM 密文 |
| decryptApiKey(cipher, masterKey) | 解密后与原值一致 |
| masterKey 错误 | 解密失败抛异常 |

### AT-2.5: 租户配额追踪
| 验证项 | 预期 |
|--------|------|
| free 计划调用 chat | quotaDaily=0 → 仅 BYOK 可用 |
| pro 计划调用 chat | 扣除 platform 配额 |
| 达到日配额上限 | 429 `{ error: "Daily quota exceeded" }` |
| 跨天重置 | 次日 quota_used 归零 |

---

## AT-3: Chat 模块

### AT-3.1: 发送聊天请求 (流式)
```
POST {gateway}/api/v1/chat/completions
Authorization: Bearer {token}
Body: {
  messages: [{ role: "user", content: "Hello" }],
  agent_id: 1,
  key_source: "platform" | "tenant_owned",
  tenant_key_id?: "...",
  model?: "gpt-4o-mini",
  stream: true
}
```
| 验证项 | 预期 |
|--------|------|
| 正常流式响应 | 200 SSE, data: chunks + `[DONE]` |
| key_source=platform 无配额 | 429 |
| key_source=tenant_owned | 使用存储的加密 key 代理 |
| 无 agent_id | 200（通用 chat，不过 agent 上下文） |
| 无效 tenant_key_id | 400 |
| tool_calls 支持 | 返回 `tool_calls` 数组 |
| 超大 prompt | 400 token limit |

### AT-3.2: 聊天请求（非流式）
```
POST {gateway}/api/v1/chat/completions
Body: { ..., stream: false }
```
| 验证项 | 预期 |
|--------|------|
| 正常 | 200 `{ choices, usage, model }` |
| usage 日志 | 写入 usage_logs 表 |

### AT-3.3: Chat Rate Limiting
| 验证项 | 预期 |
|--------|------|
| free 计划 RPM | 超过 5 req/min → 429 `{ error: "Rate limit exceeded", limit_type: "rpm" }` |
| pro 计划 RPM | 超过 30 req/min → 429 |
| enterprise 计划 RPM | 超过 100 req/min → 429 |
| 并发控制 | 超过 max_concurrent → 429 `{ limit_type: "concurrency" }` |
| 请求完成后释放并发槽 | 并发计数正确递减 |

### AT-3.4: 多租户隔离
| 验证项 | 预期 |
|--------|------|
| tenant A 查不到 tenant B 的 history | 空数组 |
| tenant A 查不到 tenant B 的 keys | 空数组 |
| tenant A 用 tenant B 的 token | 401 |

---

## AT-4: MCP JSON-RPC 模块

### AT-4.1: 列出可用方法
```
POST {gateway}/api/v1/mcp
Body: { jsonrpc: "2.0", method: "tools/list", id: 1 }
```
| 验证项 | 预期 |
|--------|------|
| 正常 | 200 `{ tools: [...] }` |
| 无认证 | 200（tools/list 公开） |

### AT-4.2: 列出资源
```
POST {gateway}/api/v1/mcp
Body: { jsonrpc: "2.0", method: "resources/list", id: 2 }
```
| 验证项 | 预期 |
|--------|------|
| 正常 | 200 `{ resources: [...] }`（agent skills） |

### AT-4.3: 调用工具
```
POST {gateway}/api/v1/mcp
Body: { jsonrpc: "2.0", method: "tools/call", params: { name: "...", arguments: {...} }, id: 3 }
```
| 验证项 | 预期 |
|--------|------|
| 有效工具名 | 200 `{ content: [...] }` |
| 无效工具名 | 200 但 `{ isError: true }` |
| 缺少 agent 参数时 | 回退到通用 MCP 上下文 |

### AT-4.4: Dual-Chain 上下文
| 验证项 | 预期 |
|--------|------|
| 请求指定 chain=sepolia | MCP 操作在 Sepolia 链 |
| 请求指定 chain=oxachain | MCP 操作在 OxaChain L1 |
| 不指定 chain | 默认 Sepolia |

### AT-4.5: MCP 认证
| 验证项 | 预期 |
|--------|------|
| tools/call 无认证 | 返回错误 |
| tools/call 有有效 Bearer | 正常执行 |

---

## AT-5: 聊天历史 (History)

### AT-5.1: 列出消息
```
GET {gateway}/api/v1/history?agent_id=1&limit=20
Authorization: Bearer {token}
```
| 验证项 | 预期 |
|--------|------|
| 正常 | 200 `{ messages: [...], total }` |
| 无 agent_id | 返回该租户所有消息 |
| limit=100 | 最多 100 条 |
| 跨 agent 过滤 | 只返回指定 agent_id 的消息 |
| 空历史 | 200 `{ messages: [], total: 0 }` |

### AT-5.2: 删除消息
```
DELETE {gateway}/api/v1/history/{message_id}
```
| 验证项 | 预期 |
|--------|------|
| 自己的消息 | 200 |
| 他人的消息 | 404 |
| 不存在的 ID | 404 |

### AT-5.3: 清空历史
```
DELETE {gateway}/api/v1/history?agent_id=1
```
| 验证项 | 预期 |
|--------|------|
| 清空后查询 | `[]` |
| 仅清空指定 agent | 其他 agent 消息不受影响 |

---

## AT-6: IPFS Proxy

### AT-6.1: 上传 JSON 到 IPFS
```
POST /api/ipfs/upload-json
Body: { data: { name: "test", description: "..." } }
```
| 验证项 | 预期 |
|--------|------|
| 上传成功 | 200 `{ IpfsHash: "Qm..." }` |
| Pinata 不可用 | 500 `{ error: "..." }` |
| 空 JSON | 400 |
| 超大数据 (> 限制) | 413 |

### AT-6.2: 上传文件到 IPFS
```
POST /api/ipfs/upload
Content-Type: multipart/form-data
```
| 验证项 | 预期 |
|--------|------|
| 图片上传 | 200 `{ IpfsHash, PinSize, Timestamp }` |
| 无文件 | 400 |
| 不支持的文件类型 | 400 |

### AT-6.3: IPFS 代理获取
```
GET /api/ipfs-proxy?cid=Qm...
```
| 验证项 | 预期 |
|--------|------|
| 有效 CID | 200（代理转发 IPFS 内容） |
| 无效 CID | 400/500 |
| 超时 | 504 |

---

## AT-7: 用量统计 (Usage)

### AT-7.1: 查询用量
```
GET {gateway}/api/v1/usage?period=today
Authorization: Bearer {token}
```
| 验证项 | 预期 |
|--------|------|
| period=today | 200 `{ total_tokens, total_tool_calls, cost_estimated }` |
| period=week | 按周聚合 |
| period=month | 按月聚合 |

### AT-7.2: 用量日志写入验证
| 验证项 | 预期 |
|--------|------|
| chat 完成后查 DB usage_logs | tokens_prompt + tokens_completion = tokens_total |
| BYOK 调用 | key_source='tenant_owned' |
| Platform 调用 | key_source='platform' |
| agent_id 标记 | 非 null |
| cost_estimated 计算 | 按模型费率正确 |

---

## AT-8: 全局中间件

### AT-8.1: CORS
| 验证项 | 预期 |
|--------|------|
| OPTIONS preflight | 200 含 Access-Control-* headers |
| 允许的 origin | 返回 Access-Control-Allow-Origin |
| 不允许的 origin | 拒绝 |

### AT-8.2: Global Rate Limit (IP)
| 验证项 | 预期 |
|--------|------|
| 同一 IP 短时间大量请求 | 429（express-rate-limit） |

### AT-8.3: 健康检查
```
GET {gateway}/health
```
| 验证项 | 预期 |
|--------|------|
| 正常 | 200 `{ status: "ok", uptime }` |
| DB 断开 | 503 |

---

## AT-9: 安全场景

### AT-9.1: SQL 注入
| 验证项 | 预期 |
|--------|------|
| challenge?address='; DROP TABLE-- | 400 或正常参数化查询 |
| tenant/me 注入尝试 | 无异常 |

### AT-9.2: XSS
| 验证项 | 预期 |
|--------|------|
| chat 消息含 `<script>` | HTML 转义或拒绝 |
| agent description 含 XSS | JSON 正常输出不执行 |

### AT-9.3: Token 劫持
| 验证项 | 预期 |
|--------|------|
| 在非 HTTPS 环境传输 token | 生产应强制 HTTPS |
| 在 URL 参数中传 token | 拒绝（仅 Header 接受） |

### AT-9.4: 重放攻击
| 验证项 | 预期 |
|--------|------|
| 重复使用同一 challenge | 401（已消费） |
| 重复使用同一 JWT（过期后） | 401 |

---

## 测试统计

| 模块 | 场景数 |
|------|--------|
| AT-1: Auth (EIP-191) | 15 |
| AT-2: Tenant Management | 14 |
| AT-3: Chat Completions | 11 |
| AT-4: MCP JSON-RPC | 7 |
| AT-5: Chat History | 6 |
| AT-6: IPFS Proxy | 7 |
| AT-7: Usage Tracking | 4 |
| AT-8: Global Middleware | 5 |
| AT-9: Security | 8 |
| **合计** | **77** |
