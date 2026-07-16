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

  freePlanId: process.env.FREE_PLAN_ID || '',

  // MCP / On-chain read
  rpcUrl: process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  chainId: parseInt(process.env.CHAIN_ID || '11155111', 10),
  identityRegistry: process.env.IDENTITY_REGISTRY || '0xe94ad380d3F8d08a7590eda0C84f354a93F96e5F',
  subscriptionManager: process.env.SUBSCRIPTION_MANAGER || '0xC15fE80b9d800abb72121F353a6ae6d6E9077E63',
  a2aProtocol: process.env.A2A_PROTOCOL || '0x309C7447d89f3087A9924BB686d88df020F7e9cB',
  reputationRegistry: process.env.REPUTATION_REGISTRY || '0xeb6B410ea71b8d9dA0c96f6A91d35027CE143DC9',
  configurationRegistry: process.env.CONFIGURATION_REGISTRY || '0x68DcE00e4C9077c94BC68016cD14B09557faEA6c',
  multiEndpoint: process.env.MULTI_ENDPOINT || '0xEB5e866f186d4B73F97aa0d70B86f2C6e2e21Cb7',
}
