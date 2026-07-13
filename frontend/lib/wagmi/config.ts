import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, polygonMumbai, baseSepolia } from 'wagmi/chains'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

// 自定义zkSync测试网配置
export const zkSyncTestnet = {
  id: 300,
  name: 'zkSync Era Testnet',
  network: 'zksync-era-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    public: { http: ['https://sepolia.era.zksync.dev'] },
    default: { http: ['https://sepolia.era.zksync.dev'] },
  },
  blockExplorers: {
    etherscan: {
      name: 'zkSync Explorer',
      url: 'https://sepolia.explorer.zksync.io/',
    },
    default: {
      name: 'zkSync Explorer',
      url: 'https://sepolia.explorer.zksync.io/',
    },
  },
  contracts: {
    multicall3: {
      address: '0xF9cda624FBC7e059355ce98a31693d299FACd963',
    },
  },
} as const

// 从环境变量获取RPC URLs，优先使用Infura
const getRpcUrl = (chainId: number): string => {
  const urls: { [key: number]: string } = {
    [mainnet.id]: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_PROJECT_ID}`,
    [sepolia.id]: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_PROJECT_ID}`,
    [polygonMumbai.id]: process.env.NEXT_PUBLIC_POLYGON_TESTNET_RPC_URL || `https://polygon-mumbai.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_PROJECT_ID}`,
    [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_TESTNET_RPC_URL || `https://base-sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_PROJECT_ID}`,
    [zkSyncTestnet.id]: process.env.NEXT_PUBLIC_ZKSYNC_TESTNET_RPC_URL || 'https://sepolia.era.zksync.dev'
  }
  return urls[chainId] || urls[sepolia.id]
}

// 确保至少有一个链，使用类型断言
export const supportedChains = [sepolia, zkSyncTestnet, polygonMumbai, baseSepolia] as const

export const config = createConfig({
  // 使用类型断言确保类型正确
  chains: supportedChains as any,
  connectors: [
    injected(),
    metaMask(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
    }),
  ],
  transports: {
    [sepolia.id]: http(getRpcUrl(sepolia.id)),
    [zkSyncTestnet.id]: http(getRpcUrl(zkSyncTestnet.id)),
    [polygonMumbai.id]: http(getRpcUrl(polygonMumbai.id)),
    [baseSepolia.id]: http(getRpcUrl(baseSepolia.id)),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
