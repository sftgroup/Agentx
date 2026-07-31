-- AgentX Gateway — Migration 001: Skills Marketplace

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'skills') THEN
    CREATE TABLE skills (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(50) NOT NULL,
      input_schema JSONB NOT NULL,
      output_schema JSONB DEFAULT '{}',
      usage_count INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      publisher VARCHAR(42) NOT NULL,
      reviewer VARCHAR(42),
      review_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_skills_status_category ON skills (status, category);
    CREATE INDEX idx_skills_publisher ON skills (publisher);
    CREATE UNIQUE INDEX idx_skills_name_publisher ON skills (name, publisher);
  END IF;
END $$;
