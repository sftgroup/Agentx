// ---------------------------------------------------------------------------
// AgentX Gateway — Configuration
// ---------------------------------------------------------------------------

import dotenv from 'dotenv'
dotenv.config()

export const config = {
  port: parseInt(process.env.PORT || '3090', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/agentx_gateway',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY || '',

  sessionTtlSec: parseInt(process.env.SESSION_TTL_SEC || '86400', 10),

  // MCP / On-chain read — Dual-chain
  // Sepolia
  rpcUrl: process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  rpcUrlOxaChain: process.env.RPC_URL_OXACHAIN || 'https://rpc-oxa.0xainet.top',
  chainId: parseInt(process.env.CHAIN_ID || '11155111', 10),
  chainIdOxaChain: parseInt(process.env.CHAIN_ID_OXACHAIN || '19505', 10),

  identityRegistry: process.env.IDENTITY_REGISTRY || '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F',
  identityRegistryOxaChain: process.env.IDENTITY_REGISTRY_OXACHAIN || '0xbf5F9db266c8c97E3334466C88597Eb758AfE212',

  // Agent indexer batching (number of IDs per RPC batch during full sync)
  agentsIndexBatchSize: parseInt(process.env.AGENTS_INDEX_BATCH_SIZE || '10', 10),

  // Full-sync fallback interval (seconds) — keeps the agents table consistent
  // even if the Transfer event watcher misses blocks. 0 disables the timer.
  agentsSyncIntervalSec: parseInt(process.env.AGENTS_SYNC_INTERVAL_SEC || '120', 10),

  // Block number to start scanning PlanCreated history from on boot
  // (0 = scan from genesis; set to the SubscriptionManager deploy block to save RPC)
  plansSyncFromBlock: parseInt(process.env.PLANS_SYNC_FROM_BLOCK || '0', 10),

  // Block number to start scanning Subscribed history from on boot
  // (0 = scan from genesis; set to the SubscriptionManager deploy block to save RPC)
  subscriptionsSyncFromBlock: parseInt(process.env.SUBSCRIPTIONS_SYNC_FROM_BLOCK || '0', 10),

  subscriptionManager: process.env.SUBSCRIPTION_MANAGER || '0xC15fE80b9d800abb72121F353a6ae6d6E9077E63',
  subscriptionManagerOxaChain: process.env.SUBSCRIPTION_MANAGER_OXACHAIN || '0x019AC9d945467478Dd371CDbD70cb2f325800E6B',

  // Conversation Service (agent dialogue microservice)
  conversationServiceUrl: process.env.CONVERSATION_SERVICE_URL || 'http://localhost:8100',
  conversationServiceToken: process.env.CONVERSATION_SERVICE_TOKEN || 'change-me-in-production',

  // IPFS gateway used to resolve ipfs:// tokenURIs (agent metadata / skills).
  ipfsGateway: process.env.IPFS_GATEWAY || 'https://ipfs.io',

  // Off-chain orchestration: shared token used by the Conversation Service to
  // call gateway internal endpoints (list/check) for sub-agent delegation.
  orchestrateToken: process.env.ORCHESTRATE_TOKEN || '',
  // Maximum nested delegation depth for off-chain orchestration.
  orchestrateMaxDepth: parseInt(process.env.ORCHESTRATE_MAX_DEPTH || '4', 10),

  // Public-facing Gateway URL — recorded on auto-approved developer integrations
  // so callers know which AGENTX_GATEWAY_URL to configure.
  publicGatewayUrl: process.env.PUBLIC_GATEWAY_URL || `http://127.0.0.1:${process.env.PORT || '3090'}`,

  a2aProtocol: process.env.A2A_PROTOCOL || '0x309C7447d89f3087A9924BB686d88df020F7e9cB',
  a2aProtocolOxaChain: process.env.A2A_PROTOCOL_OXACHAIN || '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86',

  reputationRegistry: process.env.REPUTATION_REGISTRY || '0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9',
  reputationRegistryOxaChain: process.env.REPUTATION_REGISTRY_OXACHAIN || '0x6a18C2664E1b42063860d864b6448b824d7B843F',

  configurationRegistry: process.env.CONFIGURATION_REGISTRY || '0x68DcE00e4C9077c94BC68016cD14B09557faEA6c',
  configurationRegistryOxaChain: process.env.CONFIGURATION_REGISTRY_OXACHAIN || '0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8',

  multiEndpoint: process.env.MULTI_ENDPOINT || '0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7',
  multiEndpointOxaChain: process.env.MULTI_ENDPOINT_OXACHAIN || '0xB361d04F49000013FC131D3C59C41c8486C64f8c',

  // ── Fiat subscriptions (A1) ──────────────────────────────────────────────
  // Empty keys = feature disabled (endpoints respond 503 with a clear hint).
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // Stripe API base — override for local mock servers / proxies (default = real Stripe).
  stripeApiBase: process.env.STRIPE_API_BASE || 'https://api.stripe.com/v1',
  // Auto-pricing for fiat checkout: when the caller sends planId without
  // amountCents, the on-chain plan price (wei) is converted with this
  // native-token → USD price: amountCents = (planWei / 1e18) × price × 100.
  // Default 1 (placeholder) — production MUST set the real token price.
  fiatTokenUsdPrice: parseFloat(process.env.FIAT_TOKEN_USD_PRICE || '1'),

  // ── x402 pay-per-request (A2) ────────────────────────────────────────────
  // Enabled when X402_ENABLED=true; pay-to wallet receives native-token
  // micropayments; verify endpoints credit x402_balances.
  x402Enabled: process.env.X402_ENABLED === 'true',
  x402PayTo: process.env.X402_PAY_TO || '',
  x402PriceWei: process.env.X402_PRICE_WEI || '1000000000000000', // 0.001 native by default
  x402Chain: process.env.X402_CHAIN || 'oxachain',
  // OE-5: InfraXEscrow 托管合约地址（infraX projects/escrow 部署）。
  // 配置后 verify 校验 `tx.to == escrow` + Deposited 事件入账，资金进金库而非 EOA。
  x402EscrowAddress: process.env.X402_ESCROW_ADDRESS || '',

  // ── Agent Payer（t8，P2）：agent 自主钱包自动代付（InfraX MPC 钱包）─────
  // 需部署 infraX projects/mpc 服务并配置以下两项；未配置时 agent-payer 能力禁用。
  mpcServerUrl: process.env.MPC_SERVER_URL || '',
  mpcApiKey: process.env.MPC_API_KEY || '',

  // ── Stablecoin accept/verify (P3, x402 rail) ─────────────────────────────
  // When configured, the x402 v2 challenge also advertises an `exact` accept
  // paid in the token; verification scans the token's Transfer event.
  stablecoinEnabled: process.env.STABLECOIN_ENABLED === 'true',
  stablecoinAsset: process.env.STABLECOIN_ASSET || '',
  stablecoinDecimals: parseInt(process.env.STABLECOIN_DECIMALS || '6', 10),
  stablecoinPriceWei: process.env.STABLECOIN_PRICE_WEI || '1000000',
  stablecoinDomainName: process.env.STABLECOIN_DOMAIN_NAME || '',
  stablecoinPermit2: process.env.STABLECOIN_PERMIT2 || '',

  // ── Period scheme (P4, x402 rail) ────────────────────────────────────────
  // One authorization funds n periods; each period boundary charges without
  // re-signing (payment_authorizations).
  periodEnabled: process.env.PERIOD_ENABLED === 'true',
  periodPriceWei: process.env.PERIOD_PRICE_WEI || '2000000000000000',
  periodMaxPeriods: parseInt(process.env.PERIOD_MAX_PERIODS || '12', 10),

  // ── MPP payment channels (P2) ────────────────────────────────────────────
  // Payer pre-funds a channel on-chain, then signs cumulative vouchers;
  // consumption is settled in batch (threshold / interval).
  mppEnabled: process.env.MPP_ENABLED === 'true',
  mppDomain: process.env.MPP_DOMAIN || '',
  mppPayee: process.env.MPP_PAYEE || '',
  mppChain: process.env.MPP_CHAIN || 'oxachain',
  mppSettleThresholdWei: process.env.MPP_SETTLE_THRESHOLD_WEI || '1000000000000000000',
  mppSettleIntervalSec: parseInt(process.env.MPP_SETTLE_INTERVAL_SEC || '86400', 10),

  // ── ERC-4337 auto-renew（t9）─────────────────────────────────────────────
  // 自动续订 = 用户 EOA 一次授权（Kernel v3 智能账户 + session key）后，服务端
  // 在订阅到期前用 session key 签发 UserOp 调 subscribe(planId) 续订，用户自付
  // gas（智能账户需预存 OXA）。依赖 infraX aa-relay（POST /v1/session、/v1/userops）；
  // AA_AUTO_RENEW_ENABLED=true 且 AA_RELAY_URL/AA_RELAY_API_KEY 配置后能力启用。
  aaAutoRenewEnabled: process.env.AA_AUTO_RENEW_ENABLED === 'true',
  aaRelayUrl: process.env.AA_RELAY_URL || '',
  aaRelayApiKey: process.env.AA_RELAY_API_KEY || '',
  aaRelayChain: process.env.AA_RELAY_CHAIN || 'oxachain',
  // 扫描间隔 / 续订窗口（到期前 24h 内触发）/ 会话授权时长 / 单会话最大续订次数
  aaAutoRenewIntervalSec: parseInt(process.env.AA_AUTO_RENEW_INTERVAL_SEC || '3600', 10),
  aaAutoRenewWindowSec: parseInt(process.env.AA_AUTO_RENEW_WINDOW_SEC || '86400', 10),
  aaAutoRenewSessionDays: parseInt(process.env.AA_AUTO_RENEW_SESSION_DAYS || '730', 10),
  aaAutoRenewMaxCount: parseInt(process.env.AA_AUTO_RENEW_MAX_COUNT || '366', 10),
  // 失败护栏：续订失败累计超过上限自动暂停（充值后 resume 恢复）；可选告警 webhook
  aaRenewMaxFailCount: parseInt(process.env.AA_RENEW_MAX_FAIL_COUNT || '3', 10),
  aaAlertWebhookUrl: process.env.AA_ALERT_WEBHOOK_URL || '',
  // 资金巡检（e4 余额不足主动告警）：到期前 AA_ALERT_AHEAD_SEC 秒进入提前告警窗口，
  // 资金不足时向 webhook 告警；同一登记两次告警最小间隔 AA_ALERT_MIN_INTERVAL_SEC。
  aaAlertAheadSec: parseInt(process.env.AA_ALERT_AHEAD_SEC || '259200', 10), // 3 天
  aaAlertMinIntervalSec: parseInt(process.env.AA_ALERT_MIN_INTERVAL_SEC || '86400', 10), // 1 天
  // escrow 计费对账（e5）：事件同步每轮最大区块跨度（防单次 getLogs 超 RPC 上限）
  aaEscrowReconcileIntervalSec: parseInt(process.env.AA_ESCROW_RECONCILE_INTERVAL_SEC || '3600', 10),
  aaEscrowSyncBlockSpan: parseInt(process.env.AA_ESCROW_SYNC_BLOCK_SPAN || '5000', 10),
  // 对账健全性容差：净扣费 < 期望×下限 → 漏计费告警；> 期望×上限 → 重复/多扣告警
  aaEscrowReconcileMinRatio: parseFloat(process.env.AA_ESCROW_RECONCILE_MIN_RATIO || '0.5'),
  aaEscrowReconcileMaxRatio: parseFloat(process.env.AA_ESCROW_RECONCILE_MAX_RATIO || '3'),
  // 智能账户三类资金（实证见 docs/infrax-bundler-restore-handoff.md §5）：
  //   native 余额付订阅费（execute value）、EntryPoint deposit 付 UserOp gas、
  //   InfraXEscrow.balanceOf(account) 付 relay A-10 服务费（预扣固定费+预估 gas，
  //   实测约 0.00246 OXA/次 = 2460000000000000 wei）。续订前逐项预检。
  aaEscrowAddress: process.env.AA_ESCROW_ADDRESS || '0x8bf8ffee86f1d4a160f0953eb13bedcbf99eaf9e',
  aaRelayServiceFeeWei: process.env.AA_RELAY_SERVICE_FEE_WEI || '2460000000000000',
  // Kernel 账户部署 gas（平台代付一次性；未配置且账户未部署时 enable 报错）
  aaDeployerPrivateKey: process.env.AA_DEPLOYER_PRIVATE_KEY || '',
  // oxachain Kernel v3 AA 栈（对齐 infraX AA_SDK_TECH_DESIGN §8.3 生产地址，env 可覆盖）
  aaEntryPointOxaChain: process.env.AA_OXACHAIN_ENTRYPOINT_V07 || '0x97e4cddcffeaf4580bc6315fee512f2b2d82798a',
  aaKernelFactoryOxaChain: process.env.AA_OXACHAIN_FACTORY || '0xf8abe4510a6810d5ef26aa3222c0f63d32b757d1',
  aaKernelImplementationOxaChain: process.env.AA_OXACHAIN_IMPLEMENTATION || '0x5131d75af2126eba05edbb6bc24902c42d1b52b4',
  aaEcdsaValidatorOxaChain: process.env.AA_OXACHAIN_ECDSA_VALIDATOR || '0xb0d4f548e022b8a9d5b454ffb7f327ee2afeb16c',
  aaSessionModuleOxaChain: process.env.AA_OXACHAIN_SESSION_MODULE || '0xfbbca78d2d7d08c1163aa57a0056973ef4fd8c74',
}

// ---------------------------------------------------------------------------
// Fail-fast: never boot production with placeholder secrets.
// Placeholder defaults above exist only so `npm run dev` works without .env;
// a weak/missing secret in production silently breaks auth (or worse).
// ---------------------------------------------------------------------------
const PLACEHOLDER_SECRETS: Record<string, string> = {
  JWT_SECRET: 'dev-secret-change-me',
  CONVERSATION_SERVICE_TOKEN: 'change-me-in-production',
}

if (config.nodeEnv === 'production') {
  const missing: string[] = []
  for (const [name, placeholder] of Object.entries(PLACEHOLDER_SECRETS)) {
    if (!process.env[name] || process.env[name] === placeholder) missing.push(name)
  }
  if (missing.length > 0) {
    throw new Error(
      `[config] Missing required production environment variable(s): ${missing.join(', ')}. ` +
        `Refusing to start with a weak default secret.`
    )
  }
}
