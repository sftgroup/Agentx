-- AgentX — ERC-4337 Auto-Renew 失败护栏（P0 资金预检与失败处理）
-- ---------------------------------------------------------------------------
-- 续订 cron 对失败行的兜底策略从"每轮无限重试"改为"累计失败上限自动暂停"：
--   * renew_fail_count 连续失败次数（每次 markRenewError +1，续订成功归零）；
--   * 超过 AA_RENEW_MAX_FAIL_COUNT（默认 3）→ renew_status 置 'paused' 并记
--     paused_reason / paused_at（扫描只处理 enabled 行，暂停后不再骚扰重试）；
--   * 用户充值后可调用 POST /billing/auto-renew/resume 恢复（或重新 enable）。
-- ---------------------------------------------------------------------------

ALTER TABLE aa_auto_renew ADD COLUMN IF NOT EXISTS renew_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE aa_auto_renew ADD COLUMN IF NOT EXISTS paused_reason TEXT;
ALTER TABLE aa_auto_renew ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
