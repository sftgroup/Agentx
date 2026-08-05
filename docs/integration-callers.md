# AgentX 多调用方接入配置（R11）

外部系统调用 AgentX 需要统一配置两组环境变量：

- `AGENTX_GATEWAY_URL` —— 调用方网络可达的 AgentX gateway 地址（生产默认 `http://43.159.60.46:3090`）
- `AGENTX_CONVERSATION_API_KEY` —— 调用方独立租户 key（`agentx_` 开头），由 **AgentX 管理后台 → Integrations** 签发/轮换，**明文仅在签发或轮换时显示一次**，需立即保存到调用方环境

每个调用方（租户）独立签发 key，互不影响；轮换 key 后旧 key 立即失效。

## 签发流程

1. 登录 AgentX Admin → **Integrations** Tab
2. 点击 **Create**，填写：
   - `slug`：调用方标识（小写字母/数字/短横线，如 `aitrader`）
   - `name`：显示名称
   - `gateway_url`：该调用方视角的 gateway 地址
   - `plan_slug`：默认 `enterprise`
   - `notes`：备注（可选）
3. 创建后页面展示 `agentx_...` key —— **复制并写入调用方 `.env`**
4. 需要更新 key 时使用 **Rotate**（新 key 仅显示一次）

## 调用方模板

### 1. aitrader（已接入配置）

```bash
# aitrader/.env
AGENTX_GATEWAY_URL=http://43.159.60.46:3090
AGENTX_CONVERSATION_API_KEY=agentx_<从 Admin 签发后填入>
```

读取：`python-backend/app/services/agentx_config.py` → `get_gateway_config()`

### 2. aiservicer（已接入配置）

```bash
# aiservicer 环境变量
AGENTX_GATEWAY_URL=http://43.159.60.46:3090
AGENTX_CONVERSATION_API_KEY=agentx_<从 Admin 签发后填入>
```

读取：`shared/config.cjs` → `cfg.AGENTX_GATEWAY_URL` / `cfg.AGENTX_CONVERSATION_API_KEY`

### 3. aihunter-saas（已接入配置）

```bash
# aihunter-saas/.env.prod
AGENTX_GATEWAY_URL=http://43.159.60.46:3090
AGENTX_CONVERSATION_API_KEY=agentx_<从 Admin 签发后填入>
```

读取：`python-backend/app/services/agentx_config.py` → `get_gateway_config()`

### 4. autoops（目录未创建 · 集中占位）

项目创建后按以下模板配置：

```bash
# autoops/.env
AGENTX_GATEWAY_URL=http://43.159.60.46:3090
AGENTX_CONVERSATION_API_KEY=agentx_<从 Admin 签发后填入>
```

### 5. aiops-saas（目录未创建 · 集中占位）

项目创建后按以下模板配置：

```bash
# aiops-saas/.env
AGENTX_GATEWAY_URL=http://43.159.60.46:3090
AGENTX_CONVERSATION_API_KEY=agentx_<从 Admin 签发后填入>
```

## SDK 使用示例

```ts
import { ConversationClient } from '@agentxv2/sdk'

const client = new ConversationClient({
  gatewayUrl: process.env.AGENTX_GATEWAY_URL!,
  apiKey: process.env.AGENTX_CONVERSATION_API_KEY!, // X-Api-Key 鉴权
})
```
