-- Lectura del agente sobre un período del reporte de pauta (se guarda para no volver a pedirla)
CREATE TABLE ad_report_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  since date NOT NULL,
  until date NOT NULL CHECK (until >= since),
  text text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_report_analyses_range ON ad_report_analyses (since, until, created_at DESC);
