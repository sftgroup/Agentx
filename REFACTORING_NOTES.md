# Conversation Service 代码质量重构 — 变更说明

> 日期：2026-08-04
> 提交：`ec1442a`（`acc9cc1..ec1442a`）
> 范围：`conversation-service` + 相关文档
> 性质：纯代码质量重构，**无任何行为变更**，无需回归测试调整

---

## 1. 背景

针对对话服务（conversation-service）做了一次四项代码质量审查：

1. 耦合度检查
2. 过度设计 / 冗余代码检查
3. 大文件拆分检查
4. 硬编码检查

审查结论与修复动作如下。

## 2. 变更明细

### 2.1 删除未使用的死代码（3 处，净减 258 行）

| 文件 | 说明 | 处理 |
|------|------|------|
| `src/services/context-engine.ts` | 上下文压缩引擎，注入 `AgentRunnerService` 但**从未被调用**；SDK `AgentLoop` 内部已基于 `contextBudget` 自行压缩 | 删除文件 + 移除注入 |
| `src/lib/llm-resolver.ts` | `LLMResolver` 类**源码零引用**，与 `services/tenant-llm-resolver.ts` 的 `TenantLLMResolver` 功能叠加 | 删除文件 |
| `src/services/sandbox-service.ts` | Phase 6 Docker 沙箱占位，**从未接线**（无路由、无调用方） | 删除文件 + 同步清理 `config.ts` / `.env.example` / 文档中的 sandbox 配置项 |

删除前均逐文件核对了 import / 引用关系（`grep` 全仓确认无其他引用方）。

### 2.2 硬编码修复

| 位置 | 修复前 | 修复后 |
|------|--------|--------|
| `agent-runner.ts` `extractFacts()` | `model: 'gpt-4o-mini'`（硬编码） | `model: config.compactModel`（env `COMPACT_MODEL` 可配置） |

其余默认值（`'gpt-4o'`、30s 超时等）复核后确认属于合理兜底，统一收敛于 `config.ts`，不做改动。

### 2.3 冗余逻辑重构

- `parseClarificationJson()` 与 `parseFactsJson()` 中重复的「JSON 区间提取」逻辑
- 抽取为通用私有方法 `tryParseJson<T>(raw, open, close)`，两个解析方法复用

### 2.4 文档同步

- `CONVERSATION_SERVICE.md`：删除 sandbox 相关环境变量行与 Docker 前置依赖说明
- `conversation-service/.env.example`：删除 sandbox 三项环境变量

## 3. 涉及文件清单

```
 M CONVERSATION_SERVICE.md
 M conversation-service/.env.example
 M conversation-service/src/config.ts
 M conversation-service/src/index.ts
 M conversation-service/src/services/agent-runner.ts
 D conversation-service/src/lib/llm-resolver.ts
 D conversation-service/src/services/context-engine.ts
 D conversation-service/src/services/sandbox-service.ts
```

## 4. 影响评估

- **无行为变更**：删除的均为死代码（零引用 / 注入未调用），硬编码修复仅将模型名改为等价配置项（默认值相同 `gpt-4o-mini`），解析重构保持原有容错语义
- **对外接口不变**：`POST /runs` / `POST /tenants/:address/llm-key` / SSE 事件格式均未改动
- **部署无新增依赖**：无需改环境变量、数据库 schema

## 5. 验证与部署

- 本地：`npx tsc --noEmit` 通过
- 生产（43.159.60.46）：`git pull && npm install && npm run build && pm2 restart agentx-conversation` 成功，`/health` 返回 `{"status":"ok"}`

## 6. 回滚

如需回滚，`git revert ec1442a` 即可（本次提交为纯删除 + 等价替换，无 schema / 配置破坏）。
