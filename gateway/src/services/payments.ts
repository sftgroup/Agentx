// ---------------------------------------------------------------------------
// AgentX Gateway — PaymentsService assembly (generic engine + AgentX store)
// ---------------------------------------------------------------------------
// Maps AgentX environment config onto the generic @0xinfrax/payments module.
// The engine itself has zero AgentX knowledge; everything AgentX-specific
// (tables, subscription business) lives in payments-bridge.ts.
// ---------------------------------------------------------------------------

import { PaymentsService, PgAuthorizationStore, PgMPPSessionStore } from '@0xinfrax/payments'
import type { ChainKey } from '@0xinfrax/payments'
import { config } from '../config'
import { getPool } from '../lib/db'
import { agentxPaymentStore, paymentsBridge } from './payments-bridge'

function resolveX402Chain(): ChainKey {
  return config.x402Chain === 'sepolia' ? 'sepolia' : 'oxachain'
}

export const paymentsService = new PaymentsService({
  store: agentxPaymentStore,
  chains: {
    sepolia: {
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      subscriptionManager: config.subscriptionManager,
    },
    oxachain: {
      rpcUrl: config.rpcUrlOxaChain,
      chainId: config.chainIdOxaChain,
      subscriptionManager: config.subscriptionManagerOxaChain,
    },
  },
  stripe: config.stripeSecretKey
    ? {
        secretKey: config.stripeSecretKey,
        webhookSecret: config.stripeWebhookSecret,
        apiBase: config.stripeApiBase,
        tokenUsdPrice: config.fiatTokenUsdPrice,
      }
    : undefined,
  x402: {
    enabled: config.x402Enabled,
    payTo: config.x402PayTo,
    priceWei: config.x402PriceWei,
    chain: resolveX402Chain(),
    // OE-5 escrow（金库托管）：@0xinfrax/payments ≥0.1.4（AX-1 服务层透传已修复）。
    // 配置后 verify 双路径兼容：native 直转 payTo 仍可入账；资金优先经 InfraXEscrow
    // 托管（tx.to==escrow + Deposited 事件）。生产 escrow proxy：0x8Bf8Ff…（oxachain）。
    escrow: config.x402EscrowAddress ? { address: config.x402EscrowAddress } : undefined,
    stablecoin:
      config.stablecoinEnabled && config.stablecoinAsset
        ? {
            enabled: true,
            asset: config.stablecoinAsset,
            decimals: config.stablecoinDecimals,
            priceWei: config.stablecoinPriceWei,
            domainName: config.stablecoinDomainName,
            permit2: config.stablecoinPermit2,
          }
        : undefined,
  },
  // MPP channels use the generic module-owned payment_sessions tables on the
  // gateway database. Since @0xinfrax/payments@0.1.3 restored the a2a rail
  // (intent → settle) and the period-authorization rail, both now run inside
  // the generic engine (see PROGRESS R17.6 / infrax payments 0.1.3). The
  // period seam points at the module's PgAuthorizationStore, which owns the
  // payment_authorizations table created by gateway migration 021.
  mpp:
    config.mppEnabled && config.mppDomain && config.mppPayee
      ? {
          enabled: true,
          domain: config.mppDomain,
          payee: config.mppPayee,
          chain: (config.mppChain === 'sepolia' ? 'sepolia' : 'oxachain') as ChainKey,
          settleThresholdWei: config.mppSettleThresholdWei,
          settleIntervalSec: config.mppSettleIntervalSec,
        }
      : undefined,
  mppStore: config.mppEnabled ? new PgMPPSessionStore(getPool()) : undefined,
  // a2a rail: enabled when the x402 verification engine is on (module default).
  a2a: { enabled: config.x402Enabled },
  // Period-authorization seam: module-owned payment_authorizations table.
  authorizations: new PgAuthorizationStore(getPool()),
  onWebhookEvent: (event) => paymentsBridge.handleWebhookEvent(event),
  logger: {
    info: (msg) => console.log(`[payments] ${msg}`),
    warn: (msg) => console.warn(`[payments] ${msg}`),
    error: (msg) => console.error(`[payments] ${msg}`),
  },
})
