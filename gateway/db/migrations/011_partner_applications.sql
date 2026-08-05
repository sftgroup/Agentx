-- B-end partner applications: self-service channel onboarding requests.
-- Submitted via the public /apply page, reviewed by admins; approval
-- auto-creates a channel row (see admin/applications).

CREATE TABLE IF NOT EXISTS partner_applications (
  id                BIGSERIAL PRIMARY KEY,
  company           TEXT NOT NULL,
  contact_name      TEXT NOT NULL,
  contact_email     TEXT NOT NULL,
  website           TEXT,
  description       TEXT,
  channel_id_hint   TEXT,                  -- optional preferred channel id
  desired_share_bps INTEGER,               -- optional requested revenue share (basis points)
  wallet            TEXT,                  -- optional payout wallet for attribution
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  decision_note     TEXT,                  -- admin note on decision
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON partner_applications(status);
