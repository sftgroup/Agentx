import { createConfig, http } from 'wagmi'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

// OxaChain L1 — the ONLY chain supported by AgentX platform
// Chain ID 19505, Clique PoA, Shanghai+Cancun, gas token T0x
// RPC: http://43.156.99.215:18545  Explorer: http://43.156.99.215:18400
export const oxaChain = {
  id: 19505,
  name: 'OxaChain L1',
  network: 'oxachain',
  nativeCurrency: {
    decimals: 18,
    name: 'T0x',
    symbol: 'T0x',
  },
  rpcUrls: {
    public: { http: ['http://43.156.99.215:18545'] },
    default: { http: ['http://43.156.99.215:18545'] },
  },
  blockExplorers: {
    default: {
      name: 'OxaChain Explorer',
      url: 'http://43.156.99.215:18400',
    },
  },
} as const

export const supportedChains = [oxaChain] as const

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
    [oxaChain.id]: http(process.env.NEXT_PUBLIC_OXACHAIN_RPC_URL || 'http://43.156.99.215:18545'),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
