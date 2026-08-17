-- AgentX — Agent Payer MPC Wallets (t8)
-- ---------------------------------------------------------------------------
-- 配置了自主钱包（InfraX MPC 钱包，Email 2-of-2 TSS）的 Agent，在 A2A 委派
-- 需要付款时可用自己的钱包自动付款（无需用户钱包弹窗/预充值）。
--
-- session_token_enc 存解锁后的 MPC 会话令牌（AES-256-GCM 加密，MASTER_ENCRYPTION_KEY），
-- 用于 chain.sendTransaction 自动代付；过期后由 agent-payer 服务用 email 重解锁。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_payer_wallets (
  agent_id          INTEGER PRIMARY KEY REFERENCES agents(id),
  email             TEXT NOT NULL,
  wallet_address    TEXT NOT NULL,
  chain             TEXT NOT NULL DEFAULT 'oxachain',
  session_token_enc TEXT,
  session_expires_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_payer_wallets_addr ON agent_payer_wallets(wallet_address);
