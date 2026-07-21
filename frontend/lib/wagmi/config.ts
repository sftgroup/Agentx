import { createConfig, http } from 'wagmi'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

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
    public: { http: ['https://rpc-oxa.0xainet.top'] },
    default: { http: ['https://rpc-oxa.0xainet.top'] },
  },
  blockExplorers: {
    default: {
      name: 'OxaChain Explorer',
      url: 'https://explorer-oxa.0xainet.top',
    },
  },
} as const

export const supportedChains = [oxaChain] as const

const RPC_URL = process.env.NEXT_PUBLIC_OXACHAIN_RPC_URL || 'https://rpc-oxa.0xainet.top'

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
