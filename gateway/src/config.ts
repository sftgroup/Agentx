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
}
