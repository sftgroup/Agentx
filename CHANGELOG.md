# AgentX Changelog

> 记录 Conversation Service 与 SDK 近期的重要变更。
> SDK 版本对应 npm 包 `@agentxv2/sdk`；Conversation Service 无独立版本号，跟随主仓库提交。

---

## 2026-08-04

### SDK v0.7.5 — AgentLoop 模型覆盖修复

**修复**：`AgentLoop` 主循环原先强制发送 `ctx.model ?? 'gpt-4o'`，忽略 LLM Provider 自身配置的模型（`#517490b`）。

- **影响范围**：任何通过 Provider 指定模型、但未在 `ctx` 传 `model` 的场景——包括 BYOK（`X-Llm-Model`）和租户 DB 配置（`tenant_llm_configs.model`），此前实际均被强制成 `gpt-4o`。
- **变更**：
  - `LLMProvider` 接口暴露可选 `model`（Provider 配置的模型）
  - `OpenAIProvider` / `GatewayProvider` 暴露 `model` getter
  - AgentLoop 模型解析优先级改为：`ctx.model` → `provider.model` → `gpt-4o`
- **依赖**：`conversation-service` 升级至 `@agentxv2/sdk ^0.7.5`（本地与生产均已安装并部署）。

### SDK v0.7.4 — BYOK 模型透传（X-Llm-Model）

**新特性**：对话服务协议新增 `X-Llm-Model` 请求头（`#c22d397`）。

- Gateway（`agent-runs` 读取 → `conversation-proxy` 转发）→ Conversation Service（`runs` 读取 → `agent-runner` 透传 → `tenant-llm-resolver` 使用 `headerModel || ctx.model || 'gpt-4o'`）。
- SDK `ConversationClient` 新增 `llmModel` 配置，自动发送 `X-Llm-Model`。
- **向后兼容**：不传时行为不变（仍为 `gpt-4o` 兜底）。
- 典型用法：DeepSeek 等非 OpenAI 供应商需要显式传模型名（如 `deepseek-v4-pro`）。

### SDK v0.7.3 — 无状态 BYOK（X-Llm-Endpoint）

**新特性**：调用方可自持 LLM Key 与端点，AgentX 侧零配置、零存储（`#0cb94c6`）。

- 协议新增 `X-Llm-Api-Key` + `X-Llm-Endpoint` 请求头，全链路透传。
- SDK `ConversationClient` 新增 `llmApiKey` / `llmEndpoint`。
- 修复：`tenant-llm-resolver` 将租户 DB 配置的 `endpoint_url` 透传给 Provider（`#01a28b6`）。

**LLM Key 解析优先级（当前）**：

```
1. X-Llm-Api-Key + X-Llm-Endpoint + X-Llm-Model（请求头，无状态 BYOK）
2. tenant_llm_configs（租户持久化 Key，加密存储，支持 endpoint/model）
3. OPENAI_API_KEY env（AgentX 官方 Key）
4. AgentX Gateway 兜底
```

### SDK v0.7.2 — 澄清打断（Clarification Interruption）

**新特性**（`#9c2e75e`）：AgentLoop 前置意图门——对模糊请求先向 LLM 询问澄清问题，再决定是否执行工具/写记忆。

- SSE 协议新增 `clarification` 事件（携带 `question`）。
- SDK `ConversationClient.stream()` 产出澄清事件；`chat()` 聚合结果含 `clarification` 字段。
- 服务端开关：`CLARIFICATION_ENABLED`（默认开启）、`CLARIFICATION_MODEL`（默认 `gpt-4o-mini`）。

### Conversation Service — 记忆置信度过滤

**新特性**（`#9c2e75e`）：事实提取为 `{fact, confidence}`，低于 `MEMORY_CONFIDENCE_THRESHOLD`（默认 0.5）的记忆被丢弃，防止低价值内容污染长期记忆。

### Conversation Service — 质量重构

**代码清理**（`#ec1442a`，详见 [REFACTORING_NOTES.md](REFACTORING_NOTES.md)）：

- 删除未使用代码：`ContextEngine`、`lib/llm-resolver.ts` 的 `LLMResolver`、`SandboxService`（连同 sandbox 配置）
- 修复硬编码：事实提取模型改用 `config.compactModel`
- 抽取通用 `tryParseJson<T>`，消除 `parseClarificationJson` / `parseFactsJson` 冗余

### 前端（agentx-frontend）— SDK 升级 + 生产配置恢复

- SDK `^0.6.5 → ^0.7.5`（`#410685f`）：chat 页面的 AgentLoop fallback 获得 provider 模型修复与澄清打断支持；`next build` 验证通过。
- `.env.production`：恢复为完整配置（合约地址 / RPC / Pinata / WalletConnect），`APP_URL` 与 `GATEWAY_URL` 指向新生产服务器 `43.159.60.46`；重新构建部署后前端真正指向新 Gateway。

---

## 文档（2026-08-04）

| 文档 | 内容 |
|------|------|
| [README.md](README.md) | 项目门面：SDK v0.7.5、目录结构、BYOK 示例 |
| [CHANGELOG.md](CHANGELOG.md) | 本文件 |
| [REFACTORING_NOTES.md](REFACTORING_NOTES.md) | 对话服务重构说明（死代码清理、硬编码修复） |
| [AISERVICER_INTEGRATION.md](AISERVICER_INTEGRATION.md) | aiservicer 接入样例（完整 BYOK + DeepSeek） |
| [CONVERSATION_SERVICE.md](CONVERSATION_SERVICE.md) | 对话服务协议：鉴权、BYOK、澄清、记忆 |
| [INTEGRATION.md](INTEGRATION.md) | SDK 集成指南 v0.7.5 |
| [sdk/UPGRADE.md](sdk/UPGRADE.md) | SDK 升级指南 |
