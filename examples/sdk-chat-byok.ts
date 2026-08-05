// ---------------------------------------------------------------------------
// @agentxv2/sdk — ConversationClient BYOK Example (v0.8.6)
// ---------------------------------------------------------------------------
// 展示通过 Gateway 调用托管 Conversation Service 的三种 key 方式：
//   1. 无状态 BYOK：llmApiKey + llmEndpoint + llmModel（请求头透传，调用方自持 key）
//   2. 存储式 BYOK：tenantKeyId（key 已 AES 加密保存在平台 Settings → Own LLM Keys，
//      Gateway 服务端解密后注入 X-Llm-Api-Key，明文 key 永不出服务器）
//   3. 平台默认：都不传，走租户 DB 配置 / AgentX 官方 key
// 运行：node sdk-chat-byok.ts（需 npm i @agentxv2/sdk）
// ---------------------------------------------------------------------------

import { ConversationClient } from '@agentxv2/sdk/conversation'

const GATEWAY_URL = 'http://43.159.60.46:3090'

// ── 基础客户端（只带租户 API Key，BYOK 全部走请求级/请求参数） ────────────
const client = new ConversationClient({
  gatewayUrl: GATEWAY_URL,
  apiKey: 'agentx_sk_live_...', // 租户 API Key（注册后签发）
  // accessToken: 'eyJ...',     // v0.8.4: Gateway JWT（钱包登录），与 apiKey 二选一
  endUserId: 'user-123',        // 可选：端用户记忆隔离
})

// ── 方式 1：无状态 BYOK（构造级配置，优先级最高） ─────────────────────────
// 调用方自持 LLM Key + 端点 + 模型，AgentX 侧零配置、零存储。
// llmApiKey/llmEndpoint/llmModel 在 ConversationClient 构造时传入，
// 请求自动带 X-Llm-Api-Key / X-Llm-Endpoint / X-Llm-Model 头。
const byokClient = new ConversationClient({
  gatewayUrl: GATEWAY_URL,
  apiKey: 'agentx_sk_live_...',
  llmApiKey: 'sk-deepseek-...',                // 你的 LLM Key
  llmEndpoint: 'https://api.deepseek.com/v1',  // 你的端点
  llmModel: 'deepseek-v4-pro',                 // 你的模型（非 OpenAI 必填）
})

async function statelessBYOK() {
  const res = await byokClient.chat({
    agentId: 1,
    message: '用一句话总结比特币当前市场情绪',
  })
  console.log('stateless BYOK:', res.text)
}

// ── 方式 2：存储式 BYOK（tenantKeyId，v0.8.6） ────────────────────────────
// key 已在平台 Settings → Own LLM Keys 保存（AES 加密），请求只传 keyId。
// Gateway 服务端解密后注入 X-Llm-Api-Key（优先于请求级头），明文不出服务器。
async function storedBYOK() {
  const controller = new AbortController() // v0.8.4: 外部中止（用户点 Stop）
  for await (const event of client.stream(
    {
      agentId: 1,
      message: '分析这段 Solidity 合约的安全隐患',
      tenantKeyId: 'key-01HX...', // 平台已保存的租户自有 key
    },
    { signal: controller.signal }
  )) {
    switch (event.type) {
      case 'thinking':
        console.log('[thinking]', event.content)
        break
      case 'text':
        process.stdout.write(event.content ?? '')
        break
      case 'tool_call':
        console.log('\n[tool]', event.toolName, event.toolArgs)
        break
      case 'tool_result':
        console.log('[tool result]', event.toolName, event.error ?? 'ok')
        break
      case 'done':
        console.log('\n[done]', event.usage)
        break
      case 'error':
        console.error('[error]', event.content)
        break
    }
  }
}

// ── 方式 3：都不传 — 走平台默认 LLM 配置 ─────────────────────────────────
async function platformDefault() {
  const res = await client.chat({ agentId: 1, message: '你好' })
  console.log('platform default:', res.text)
}

async function main() {
  await statelessBYOK()
  await storedBYOK()
  // await platformDefault() // 需在真实租户环境运行
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
