// ---------------------------------------------------------------------------
// AgentX Gateway — PaymentsService assembly (generic engine + AgentX store)
// ---------------------------------------------------------------------------
// Maps AgentX environment config onto the generic @0xinfrax/payments module.
// The engine itself has zero AgentX knowledge; everything AgentX-specific
// (tables, subscription business) lives in payments-bridge.ts.
// ---------------------------------------------------------------------------

import { PaymentsService, PgMPPSessionStore } from '@0xinfrax/payments'
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
  // gateway database. a2a / period-authorization rails are self-hosted by
  // AgentX (services/payments-a2a-period.ts) since @0xinfrax/payments@0.1.2
  // removed them from the generic engine (see PROGRESS R17.5).
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
  onWebhookEvent: (event) => paymentsBridge.handleWebhookEvent(event),
  logger: {
    info: (msg) => console.log(`[payments] ${msg}`),
    warn: (msg) => console.warn(`[payments] ${msg}`),
    error: (msg) => console.error(`[payments] ${msg}`),
  },
})
