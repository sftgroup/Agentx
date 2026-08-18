-- AgentX — ERC-4337 Auto-Renew Sessions (t9)
-- ---------------------------------------------------------------------------
-- 用户对某个链上订阅（chain_subscriptions）开启自动续订：网关经 aa-relay 创建
-- ERC-4337 Session Key（Kernel v3 智能账户 + Session Module）。用户 EOA 一次
-- 授权（ENABLE-mode UserOp）后，服务端即可在订阅到期前用 session key 签发
-- UserOp 调用 SubscriptionManager.subscribe(planId) 自动续订（用户自付 gas，
-- 智能账户需预存 OXA；session 策略限定了 target/selector/valueLimit/有效期）。
--
-- 设计要点：
--   * (subscriber, agent_id, plan_id) 复合主键 —— 同一用户对同一计划的订阅
--     只登记一条自动续订记录（每个订阅一个独立 session，策略互不越权）；
--   * current_subscription_id 指向当前生效的订阅，每次续订（链上产生新的
--     subscription_id）后前移，扫描逻辑永远针对最新一条活跃订阅，天然幂等；
--   * session_key_enc 存 session key 私钥（AES-256-GCM，MASTER_ENCRYPTION_KEY），
--     与 agent_payer_wallets.session_token_enc 同款加密模式；
--   * policy_json 存完整 SessionPolicy 快照，续订前链下校验（valueLimit/有效期）；
--   * renew_log 记录历次续订（subscription_id / 交易 / 时间），审计可追溯。
-- 刻意不改动 chain_subscriptions（事件驱动同步表），续订标记独立存放。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS aa_auto_renew (
  subscriber              TEXT NOT NULL,           -- 用户 EOA（session owner）
  agent_id                INTEGER NOT NULL,
  plan_id                 INTEGER NOT NULL,        -- 续订调 subscribe(planId) 用
  account_address         TEXT NOT NULL,           -- Kernel 智能账户（counterfactual）
  current_subscription_id INTEGER,                 -- 当前生效订阅，续订后前移
  session_id              TEXT NOT NULL,           -- 32 字节 hex（aa-relay 签发）
  session_signer          TEXT NOT NULL,           -- session key 地址（UserOp agent 签名者）
  session_key_enc         TEXT NOT NULL,           -- AES-256-GCM 加密的 session 私钥
  policy_json             JSONB NOT NULL,          -- SessionPolicy 快照
  renew_status            TEXT NOT NULL DEFAULT 'enabled', -- enabled | pending | disabled
  last_renew_at           TIMESTAMPTZ,
  last_renew_tx           TEXT,                    -- 最近一次续订 userOpHash / 交易哈希
  last_renew_err          TEXT,                    -- 最近一次失败原因（gas 不足、链上拒绝等）
  renew_count             INTEGER NOT NULL DEFAULT 0,
  renew_log               JSONB NOT NULL DEFAULT '[]'::jsonb,
  disabled_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscriber, agent_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_aa_auto_renew_status  ON aa_auto_renew(renew_status);
CREATE INDEX IF NOT EXISTS idx_aa_auto_renew_sub     ON aa_auto_renew(subscriber);
CREATE INDEX IF NOT EXISTS idx_aa_auto_renew_cur_sub ON aa_auto_renew(current_subscription_id);
CREATE INDEX IF NOT EXISTS idx_aa_auto_renew_updated ON aa_auto_renew(updated_at);
