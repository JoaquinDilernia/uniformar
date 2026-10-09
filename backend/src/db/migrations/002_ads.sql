-- Agente de pauta (Meta Ads): configuración, corridas, decisiones, piezas, pedidos y aprendizajes.

CREATE TABLE ad_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  agent_enabled boolean NOT NULL DEFAULT true,
  -- Con autonomous=false TODO lo que el agente quiere hacer queda pendiente de aprobación.
  autonomous boolean NOT NULL DEFAULT false,
  monthly_cap_ars integer NOT NULL DEFAULT 200000 CHECK (monthly_cap_ars >= 0),
  business_notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ad_settings (id) VALUES (1);

CREATE TABLE ad_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily','manual')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed','skipped')),
  report text NOT NULL DEFAULT '',
  error text,
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX ad_runs_recent ON ad_runs (started_at DESC);

CREATE TABLE ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  copy text NOT NULL,
  headline text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','used','archived')),
  meta_ad_id text,
  meta_adset_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE TABLE ad_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES ad_runs(id) ON DELETE SET NULL,
  tool text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}',
  title text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  expected_impact text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('pending','executed','rejected','failed')),
  result jsonb,
  error text,
  outcome text,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX ad_decisions_recent ON ad_decisions (created_at DESC);
CREATE INDEX ad_decisions_pending ON ad_decisions (status) WHERE status = 'pending';

CREATE TABLE ad_creative_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept text NOT NULL,
  style_notes text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE ad_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  evidence text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','obsolete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Las piezas de pauta guardan sus imágenes en la tabla de archivos común.
ALTER TABLE files DROP CONSTRAINT files_owner_type_check;
ALTER TABLE files ADD CONSTRAINT files_owner_type_check
  CHECK (owner_type IN ('idea_ref','idea_result','calendar_preview','project_photo','project_pdf','ad_feed','ad_story'));
