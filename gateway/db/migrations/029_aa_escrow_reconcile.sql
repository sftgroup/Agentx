-- AgentX — ERC-4337 Auto-Renew escrow 计费对账（e5）
-- ---------------------------------------------------------------------------
-- 对账基础设施：同步 InfraXEscrow 的 Charged/Refunded 事件到本地，与
-- aa_auto_renew.renew_log 逐期续订做健全性对账（防漏计费 / 防重复扣费）。
--   * aa_escrow_events    链上计费事件增量镜像（唯一键 = tx_hash + log_index）；
--   * aa_escrow_sync      单行 KV：已同步到的最高区块（last_block），增量续拉。
-- 对账口径（ref 为 relay 侧 uuid，无法逐笔关联 renew_log，采用期间聚合）：
--   每个智能账户：净扣费 = ΣCharged - ΣRefunded；
--     漏计费：有续订记录但净扣费显著低于 条数×固定费；
--     重复扣费：净扣费显著高于 条数×(固定费+gas 上限)（L12 曾出现对旧订阅重复扣费）。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS aa_escrow_events (
  id            BIGSERIAL PRIMARY KEY,
  chain_id      INTEGER NOT NULL,
  block_number  BIGINT NOT NULL,
  tx_hash       TEXT NOT NULL,
  log_index     INTEGER NOT NULL,
  kind          TEXT NOT NULL,          -- charged | refunded | deposited | withdrawn
  account       TEXT NOT NULL,          -- 计费主体（智能账户地址，小写）
  amount_wei    TEXT NOT NULL,          -- 事件金额（wei，字符串防溢出）
  ref           TEXT,                   -- relay 计费引用（aa:userop:<uuid> / …:refund 等）
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_aa_escrow_events_account ON aa_escrow_events(account);
CREATE INDEX IF NOT EXISTS idx_aa_escrow_events_block   ON aa_escrow_events(block_number);

CREATE TABLE IF NOT EXISTS aa_escrow_sync (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  last_block  BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 首行占位（last_block=0 表示尚未同步过，首次从配置的起始区块拉取）
INSERT INTO aa_escrow_sync (id, last_block) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
