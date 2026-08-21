import { createConfig, http } from 'wagmi'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

// 全链路统一取值：env 可覆盖，fallback 为生产默认值（链配置唯一来源）。
const RPC_URL = process.env.NEXT_PUBLIC_OXACHAIN_RPC_URL || 'https://rpc-oxa.0xainet.top'

// OxaChain L1 — the ONLY chain supported by AgentX platform
// Chain ID 19505, Clique PoA, Shanghai+Cancun, gas token OXA
// RPC: https://rpc-oxa.0xainet.top  Explorer: https://explorer-oxa.0xainet.top
export const oxaChain = {
  id: 19505,
  name: 'OxaChain L1',
  network: 'oxachain',
  nativeCurrency: {
    decimals: 18,
    name: 'OXA',
    symbol: 'OXA',
  },
  rpcUrls: {
    public: { http: [RPC_URL] },
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: 'OxaChain Explorer',
      url: 'https://explorer-oxa.0xainet.top',
    },
  },
} as const

export const supportedChains = [oxaChain] as const

// A2AProtocolRegistry — env 可覆盖，fallback 为生产 OxaChain 部署地址。
export const A2A_REGISTRY = (process.env.NEXT_PUBLIC_A2A_PROTOCOL_ADDRESS || '0x7F42a7dC4A0F3C107664C3750bE1B5B6fa6BEb86') as `0x${string}`

// 已知 ERC20 token 元数据（平台费 / 订阅展示共用）。
export const KNOWN_TOKEN_META: Record<string, { symbol: string; decimals: number }> = {
  '0x0000000000000000000000000000000000000000': { symbol: 'ETH', decimals: 18 },
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { symbol: 'USDC', decimals: 6 },
  '0x6B175474E89094C44Da98b954EedeAC495271d0F': { symbol: 'DAI', decimals: 18 },
}

export const config = createConfig({
  chains: [oxaChain],
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
    }),
  ],
  transports: {
    [oxaChain.id]: http(RPC_URL),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
