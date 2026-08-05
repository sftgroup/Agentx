-- 016_tenant_kind.sql
-- R14: 区分 B 端集成租户（kind='partner'）与正常注册用户（kind='user'）。
-- B 端租户由 R11/R13 审批自动创建，只能使用对话服务；
-- MCP 对话/任务工具与任务端点对其禁用。
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'user';

-- 回填既有集成租户（wallet = partner-<slug>，R11/R13 创建约定）
UPDATE tenants SET kind = 'partner' WHERE wallet_address LIKE 'partner-%';

CREATE INDEX IF NOT EXISTS idx_tenants_kind ON tenants(kind);
