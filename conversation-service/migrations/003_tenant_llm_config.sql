-- 003_tenant_llm_config.sql
-- Tenant-level LLM API key storage (encrypted at rest).
-- Each tenant can optionally configure their own LLM key + model.
-- If no tenant record exists → fall back to AgentX official key.

CREATE TABLE IF NOT EXISTS tenant_llm_configs (
    tenant_address  VARCHAR(42) PRIMARY KEY,       -- Ethereum wallet address
    provider        VARCHAR(20)  NOT NULL DEFAULT 'openai', -- openai | deepseek | custom
    encrypted_key   TEXT         NOT NULL,          -- AES-256-GCM encrypted API key (hex)
    model           VARCHAR(50),                    -- override default model (e.g. gpt-4o)
    endpoint_url    VARCHAR(255),                   -- custom provider endpoint (optional)
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_llm_provider ON tenant_llm_configs(provider);
