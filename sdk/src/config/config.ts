// ---------------------------------------------------------------------------
// @agentx/sdk — Configuration
// ---------------------------------------------------------------------------
// Wraps ConfigurationRegistry contract for key-value settings.
// ---------------------------------------------------------------------------

import { stringToHex, hexToString } from 'viem'
import type { PublicClient, WalletClient, Address, Hash } from 'viem'

const CONFIG_ABI = {
  setConfig: {
    inputs: [{ name: 'key', type: 'string' }, { name: 'value', type: 'bytes' }] as const,
    name: 'setConfig' as const,
    outputs: [] as const,
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  getConfig: {
    inputs: [{ name: 'key', type: 'string' }] as const,
    name: 'getConfig' as const,
    outputs: [{ name: '', type: 'bytes' }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
  getAllConfig: {
    inputs: [] as const,
    name: 'getAllConfig' as const,
    outputs: [{ name: '', type: 'tuple[]', components: [{ name: 'key', type: 'string' }, { name: 'value', type: 'bytes' }] }] as const,
    stateMutability: 'view' as const,
    type: 'function' as const,
  },
} as const

// ── Known chain configs ────────────────────────────────────────────────────

// Moves these to a separate file when the list grows.

export interface ChainConfig {
  chainId: number
  contracts: {
    identityRegistry: Address
    subscriptionManager: Address
    paymentGateway: Address
    a2aProtocolRegistry: Address
    reputationRegistry: Address
    configurationRegistry: Address
  }
  ipfsGateways: string[]
  rpcUrl?: string
}

export const KNOWN_CHAINS: Record<number, ChainConfig> = {
  // Sepolia Testnet
  // v3 (deployed 2026-07-13): platformFee=250bps(2.5%), ReentrancyGuard, audit fixes
  11155111: {
    chainId: 11155111,
    contracts: {
      identityRegistry: '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F',
      subscriptionManager: '0xC15fE80b9d800abb72121F353a6ae6d6E9077E63',
      paymentGateway: '0x59eA58c0089314C0fCc86A4ff646fb6dAE571C96',
      a2aProtocolRegistry: '0xEdb0022c250B38e281B3EF1418037889fC5C6092',
      reputationRegistry: '0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9',
      configurationRegistry: '0x68DcE00e4C9077c94BC68016cD14B09557faEA6c',
    },
    ipfsGateways: ['ipfs.io', 'gateway.pinata.cloud', 'dweb.link', 'cf-ipfs.com'],
  },

  // OxaChain L1 Mainnet
  // Chain ID 19505, Clique PoA, Shanghai+Cancun, gas token T0x
  // Deployer: 0x8E869A0624fF9e766Df71b5B08897d00E4d260ba
  // RPC: http://43.156.99.215:18545
  // Explorer: http://43.156.99.215:18400
  // Note: platform contracts not yet deployed to L1 (IR+SM only)
  19505: {
    chainId: 19505,
    contracts: {
      identityRegistry: '0x0292af212Ce34bbCd95BbC69F4F8c9f7ae123902',
      subscriptionManager: '0x37BA9DdfE66Aa86f920a34Ae0ae268342151E249',
      paymentGateway: '0x0000000000000000000000000000000000000000',
      a2aProtocolRegistry: '0x0000000000000000000000000000000000000000',
      reputationRegistry: '0x0000000000000000000000000000000000000000',
      configurationRegistry: '0x0000000000000000000000000000000000000000',
    },
    ipfsGateways: ['ipfs.io', 'gateway.pinata.cloud', 'dweb.link', 'cf-ipfs.com'],
    rpcUrl: 'http://43.156.99.215:18545',
  },
}

// ── Config Registry ────────────────────────────────────────────────────────

export interface ConfigRegistryOpts {
  contractAddress: Address
  publicClient: PublicClient
  walletClient: WalletClient
}

export class ConfigurationRegistry {
  private address: Address
  private publicClient: PublicClient
  private walletClient: WalletClient

  constructor(opts: ConfigRegistryOpts) {
    this.address = opts.contractAddress
    this.publicClient = opts.publicClient
    this.walletClient = opts.walletClient
  }

  private get account(): Promise<Address> {
    return this.walletClient.getAddresses().then(a => {
      if (!a[0]) throw new Error('Wallet not connected')
      return a[0]
    })
  }

  async set(key: string, value: string): Promise<Hash> {
    const acct = await this.account
    const { request } = await this.publicClient.simulateContract({
      account: acct,
      address: this.address,
      abi: [CONFIG_ABI.setConfig],
      functionName: 'setConfig',
      args: [key, stringToHex(value)],
    })
    return this.walletClient.writeContract(request)
  }

  async get(key: string): Promise<string> {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [CONFIG_ABI.getConfig],
      functionName: 'getConfig',
      args: [key],
    })
    return hexToString(r as `0x${string}`)
  }

  async getAll(): Promise<Record<string, string>> {
    const r = await this.publicClient.readContract({
      address: this.address,
      abi: [CONFIG_ABI.getAllConfig],
      functionName: 'getAllConfig',
    })
    const map: Record<string, string> = {}
    for (const { key, value } of r as { key: string; value: string }[]) {
      map[key] = hexToString(value as `0x${string}`)
    }
    return map
  }
}
