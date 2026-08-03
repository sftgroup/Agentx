# Conversation Service — 接收方部署 / 配置 / 运维 / 验收指南

> 本文档面向**接收方（目标项目）**：拿到 `conversation-service/` 目录后，如何把它部署起来、接入上游、日常运维并完成验收。
> 配套文档：[CONVERSATION_SERVICE.md](./CONVERSATION_SERVICE.md)（API 与集成细节）、[MCP_SETUP.md](../MCP_SETUP.md)（Agent-as-MCP 工具定义）

---

## 1. 交付内容（拿到什么）

```
conversation-service/
├── src/                     # TypeScript 源码（12 个文件）
│   ├── index.ts             # Express 入口（:8100）
│   ├── config.ts            # 全部配置来自环境变量
│   ├── lib/                 # crypto (AES-256-GCM) / db (pg pool) / llm-resolver
│   ├── routes/              # runs（对话 SSE）/ tenants（租户 LLM key）
│   └── services/            # agent-runner / agent-context-loader / tool-executor
│                            #   memory-engine / context-engine / tenant-llm-resolver / sandbox-service
├── migrations/              # 4 个 SQL（记忆表 / traces / 租户LLM配置 / 端用户隔离）
├── package.json             # npm 包 @agentxv2/conversation，依赖 @agentxv2/sdk（npm 已发布）
├── tsconfig.json
├── Dockerfile               # node:20-alpine，健康检查 /health，EXPOSE 8100
└── .env.example             # 环境变量模板
```

**服务定位**：通用 AgentLoop 对话执行引擎（多租户 + 端用户隔离 + 记忆 + 上下文压缩 + 技能/工具调用）。上游通过 `POST /runs` 调用，SSE 流式返回。

## 2. 前置依赖

| 依赖 | 要求 | 说明 |
|------|------|------|
| Node.js | ≥ 20 | 运行时 |
| PostgreSQL | ≥ 14 | 需安装 **pgvector** 扩展（`CREATE EXTENSION vector`） |
| npm 包 | `@agentxv2/sdk` | 通过 npm registry 安装（版本见 package.json，建议 ≥ 0.6.9） |
| 上游 Gateway | 可达的 HTTP 服务 | 拉取 agent metadata（prompt + skills），见 §6.4 |

## 3. 部署

### 3.1 本地开发

```bash
cd conversation-service
npm install
cp .env.example .env      # 然后按 §4 填值
psql $DATABASE_URL -f migrations/001_memory.sql
psql $DATABASE_URL -f migrations/002_traces.sql
psql $DATABASE_URL -f migrations/003_tenant_llm_config.sql
psql $DATABASE_URL -f migrations/004_end_user_isolation.sql
npm run dev                # tsx watch，默认 :8100
```

### 3.2 Docker

```bash
npm run build                            # 先产出 dist/（Dockerfile 基于 dist）
docker build -t conversation-service .   # 镜像含 migrations/ 与 healthcheck
docker run -d --name conv -p 8100:8100 \
  --env-file .env \
  conversation-service
# 健康检查内置：GET /health，镜像每 30s 自检一次
```

### 3.3 PM2（生产推荐）

```bash
npm run build
pm2 start dist/index.js --name conversation-service
pm2 save
pm2 startup systemd     # 开机自启
```

## 4. 配置（环境变量）

从 [config.ts](./src/config.ts) 提取的全部配置项：

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `PORT` | 8100 | - | 服务端口 |
| `NODE_ENV` | development | - | production/development |
| `DATABASE_URL` | postgresql://localhost:5432/agentx_conversation | ✅ | 需支持 pgvector 的 PostgreSQL |
| `INTERNAL_AUTH_TOKEN` | change-me-in-production | ✅ | **上游调用鉴权密钥**，见 §6.3 |
| `GATEWAY_URL` | http://localhost:3090 | ✅ | 上游 Gateway 地址（拉 agent metadata + 兜底 LLM） |
| `MASTER_ENCRYPTION_KEY` | 空 | ⚠️ | **64 位 hex（32 字节）**。保存/解密租户 LLM key 必需，缺失则 `POST /tenants/:address/llm-key` 直接报错。**注意：此变量不在 .env.example 中，必须自行添加**。生成：`openssl rand -hex 32` |
| `OPENAI_API_KEY` | 空 | 视情况 | 平台兜底 LLM key（无租户 key / 无 header key 时使用） |
| `EMBEDDING_MODEL` | text-embedding-ada-002 | - | 记忆向量化模型（pgvector 1536 维） |
| `EMBEDDING_API_URL` | https://api.openai.com/v1/embeddings | - | 嵌入服务地址（可换非 OpenAI） |
| `COMPACT_MODEL` | gpt-4o-mini | - | 上下文压缩模型 |
| `RPC_URL` / `RPC_URL_OXACHAIN` | sepolia / oxa 默认 | - | 链上读取 agent 数据（当前 loader 主要走 GATEWAY_URL） |
| `IDENTITY_REGISTRY` / `_OXACHAIN` | 默认合约 | - | 合约地址（保留兼容） |
| `CONTEXT_CACHE_TTL_SEC` | 300 | - | agent 上下文缓存 TTL（秒），改动 agent 后如需立即生效可调小 |
| `CORS_ORIGIN` | * | - | 允许的跨域来源 |
| `SANDBOX_DOCKER_IMAGE` / `SANDBOX_TIMEOUT_SEC` / `SANDBOX_MAX_MEMORY_MB` | node:20-alpine / 30 / 256 | - | Sandbox（Phase 6 预留，未启用） |

## 5. 数据库初始化与升级

```bash
# 按顺序执行（001 → 004），幂等（IF NOT EXISTS）
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

- `001_memory.sql`：建 `memories` 表（含 `embedding vector(1536)`）+ 租户×agent×端用户复合索引 + 唯一约束。**依赖 pgvector 扩展**，未安装时此文件会失败。
- `002_traces.sql`：`traces` 表（可观测性，当前为预留）。
- `003_tenant_llm_config.sql`：`tenant_llm_configs` 表（租户自有 LLM key，AES-256-GCM 加密存储）。
- `004_end_user_isolation.sql`：为 `memories` 增加 `end_user_id` 列（默认 `default`），重建索引与唯一约束。

> 升级策略：沿用本服务的版本化 migration 约定，新变更按 `005_*.sql` 追加；回滚需手动（无 down migration）。

## 6. 接入方式（作为上游服务被调用）

### 6.1 健康检查

```bash
curl http://localhost:8100/health
# → {"status":"ok","service":"agentx-conversation","time":"..."}
```

### 6.2 对话（SSE）

```bash
curl -N -X POST http://localhost:8100/runs \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: <token>" \
  -H "X-Tenant-Address: 0x<40hex>" \
  -H "X-End-User-Id: user-123" \        # 可选：端用户隔离桶
  -H "X-Llm-Api-Key: sk-..." \          # 可选：本次调用自带 LLM key（优先级最高）
  -d '{"agentId": 1, "message": "你好", "enableMemory": true}'
```

SSE 事件：`thinking` →（`tool_call`/`tool_result` 循环）→ `text` → `done`，异常时 `error`。

### 6.3 密钥约定（与上游对齐）

| 服务 | 变量 | 值必须一致 |
|------|------|-----------|
| 本服务 | `INTERNAL_AUTH_TOKEN` | `X-Internal-Token` header 校验值 |
| 上游 Gateway | `CONVERSATION_SERVICE_TOKEN` | 同上（gateway 转发时携带） |

### 6.4 对本服务的上游依赖（重要）

本服务运行 `POST /runs` 时需要调用 `GATEWAY_URL/api/v1/agents/:id` 获取 agent 的 `description`（prompt）与 `metadata_json.skills`（工具定义）。**若上游 Gateway 不可达或返回结构不含 `skills`，对话仍可返回文本，但工具调用会退化**。保证该端点可达、响应含 `metadata_json.skills` 即可启用工具。

## 7. 运维指南

### 7.1 健康监控

- 探针：`GET /health`（每 30s）。建议接入监控告警（如 Prometheus 黑盒探针）。
- 关键指标：`/runs` 延迟（含 LLM 调用）、SSE 完成率、`error` 事件占比。

### 7.2 日志

- 全部输出到 stdout（console.log/error，带 `[AgentRunner]`、`[Tenants]`、`[Conversation Service]` 前缀）。pm2 用 `pm2 logs conversation-service`，Docker 用 `docker logs -f conv`。
- 生产建议接集中日志（如 journald / Loki / CloudWatch），按 `session` 关联请求（`[AgentRunner] Run failed (session <uuid>)`）。

### 7.3 数据

- `memories` 为长期记忆（事实条目，唯一约束防重复），按租户+agent+端用户隔离。备份策略随 PostgreSQL 主库。
- `tenant_llm_configs.encrypted_key` 用 `MASTER_ENCRYPTION_KEY` 加密——**轮换密钥会导致历史密文不可解密**（AES-256-GCM 无主密钥派生），轮换需同时重写该表。
- `traces` 为预留，量大会增长，按需加 TTL 清理任务。

### 7.4 容量与扩展

- 单实例无状态（记忆在 DB），横向扩多个实例 + 上游负载均衡即可。
- 每实例默认内存缓存 agent 上下文（`CONTEXT_CACHE_TTL_SEC`，默认 300s）。
- LLM 调用为外部依赖，注意上游限流/配额；`OPENAI_API_KEY` 为平台兜底 key，流量大时配额消耗快。

### 7.5 常见故障排查

| 现象 | 排查 |
|------|------|
| `/runs` 返回 401 | `X-Internal-Token` 与 `INTERNAL_AUTH_TOKEN` 不一致 |
| `POST /tenants/.../llm-key` 报错 | `MASTER_ENCRYPTION_KEY` 未设置或长度 ≠ 64 hex |
| SSE 中 `Agent N not found` | `GATEWAY_URL` 不可达或 agent 不存在 |
| 工具调用返回"no remote execution configured" | agent 的 `metadata_json.skills[].execution` 未配置（需 `type:"mcp"` + `endpoint`） |
| 记忆不生效 | 请求未带 `enableMemory: true`；或 `X-End-User-Id` 与存储时不一致 |

## 8. 验收清单

按顺序执行，全部通过即验收完成。

### 8.1 环境就绪

- [ ] `node -v` ≥ 20；`psql` 可连接 `DATABASE_URL`
- [ ] 数据库存在 pgvector：`SELECT * FROM pg_extension WHERE extname='vector'` 返回 1 行
- [ ] 4 个 migration 执行成功；`\dt` 可见 `memories`、`traces`、`tenant_llm_configs`

### 8.2 启动与健康

- [ ] 服务启动无报错：`GET /health` → `{"status":"ok","service":"agentx-conversation",...}`
- [ ] 未配置 `OPENAI_API_KEY` 时服务仍正常启动（走 Gateway 兜底）

### 8.3 鉴权

- [ ] 不带 `X-Internal-Token` 调 `/runs` → 401
- [ ] 带错误 token → 401；带正确 token → 非 401

### 8.4 对话主链路

- [ ] 有效 agentId + 正确 token → SSE 事件流：至少出现 `text` 与 `done`
- [ ] 无效 agentId → SSE `error` 事件（内容含 not found），HTTP 200（SSE 内报错）

### 8.5 LLM key 解析（Plan C）

- [ ] 设置 `MASTER_ENCRYPTION_KEY` 后，`POST /tenants/0x<40hex>/llm-key {"apiKey":"sk-..."}` 返回 success，且 DB 中 `encrypted_key` 为密文（非明文）
- [ ] 请求头带 `X-Llm-Api-Key` 时优先于 DB key / 平台 key 生效

### 8.6 记忆与端用户隔离

- [ ] 两次对话带 `enableMemory:true` 且 `X-End-User-Id:userA` → 第二次 `thinking` 出现"Recalling memory"，回答体现第一次的事实
- [ ] 相同 tenant/agent 但 `X-End-User-Id:userB` → **不出现** userA 的记忆

### 8.7 工具调用（可选，需上游配合）

- [ ] agent 配置含 `execution.type:"mcp"` 的 skill → SSE 出现 `tool_call` → `tool_result`
- [ ] skill 未配置 execution → 工具返回"no remote execution configured"提示，主流程不崩溃

### 8.8 稳定性

- [ ] 连续 10 次 `/runs` 无 5xx；单次超 30s 无响应时连接可被上游中止
- [ ] 重启服务后 `memories` 数据仍在（记忆持久化）

---

> 记录：接收方负责人 / 验收时间 / 结果 在此补充。
