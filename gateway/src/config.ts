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
  rpcUrlOxaChain: process.env.RPC_URL_OXACHAIN || 'http://43.156.99.215:18545',
  chainId: parseInt(process.env.CHAIN_ID || '11155111', 10),
  chainIdOxaChain: parseInt(process.env.CHAIN_ID_OXACHAIN || '19505', 10),

  identityRegistry: process.env.IDENTITY_REGISTRY || '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F',
  identityRegistryOxaChain: process.env.IDENTITY_REGISTRY_OXACHAIN || '0xbf5F9db266c8c97E3334466C88597Eb758AfE212',

  subscriptionManager: process.env.SUBSCRIPTION_MANAGER || '0xC15fE80b9d800abb72121F353a6ae6d6E9077E63',
  subscriptionManagerOxaChain: process.env.SUBSCRIPTION_MANAGER_OXACHAIN || '0x019AC9d945467478Dd371CDbD70cb2f325800E6B',

  a2aProtocol: process.env.A2A_PROTOCOL || '0x309C7447d89f3087A9924BB686d88df020F7e9cB',
  a2aProtocolOxaChain: process.env.A2A_PROTOCOL_OXACHAIN || '0xDF2939EFafEe6439eB2226DbEd07AD6F5Ae2112B',

  reputationRegistry: process.env.REPUTATION_REGISTRY || '0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9',
  reputationRegistryOxaChain: process.env.REPUTATION_REGISTRY_OXACHAIN || '0x6a18C2664E1b42063860d864b6448b824d7B843F',

  configurationRegistry: process.env.CONFIGURATION_REGISTRY || '0x68DcE00e4C9077c94BC68016cD14B09557faEA6c',
  configurationRegistryOxaChain: process.env.CONFIGURATION_REGISTRY_OXACHAIN || '0x07280674ccc2898Fd038A9e3C22005CA83ffD2F8',

  multiEndpoint: process.env.MULTI_ENDPOINT || '0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7',
  multiEndpointOxaChain: process.env.MULTI_ENDPOINT_OXACHAIN || '0xB361d04F49000013FC131D3C59C41c8486C64f8c',
}
