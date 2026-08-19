-- AgentX — ERC-4337 Auto-Renew 资金巡检（e4）
-- ---------------------------------------------------------------------------
-- 余额不足主动告警：在续订窗口开启前（到期前 AA_ALERT_AHEAD_SEC 秒）对 enabled
-- 登记做资金预检，escrow / native / EP deposit 任一不足时提前发送站内/webhook
-- 告警并记录 last_funding_alert_at（配合 AA_ALERT_MIN_INTERVAL_SEC 防重复轰炸，
-- 由服务端控制告警频率，这里只持久化最近一次告警时间）。
-- ---------------------------------------------------------------------------

ALTER TABLE aa_auto_renew ADD COLUMN IF NOT EXISTS last_funding_alert_at TIMESTAMPTZ;
