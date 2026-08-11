-- 022_api_key_hash.sql
-- R19.1 (D8 / T2): 新增 API key 只存 SHA-256 摘要（api_key_hash），不存明文。
-- 存量明文 key（tenants.api_key）保留不迁移，验证时兼容两种匹配：
--   api_key_hash = sha256(输入)  OR  api_key = 输入（存量回退）
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_tenants_api_key_hash ON tenants(api_key_hash);
