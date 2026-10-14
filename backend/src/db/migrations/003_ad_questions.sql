-- Preguntas del agente de pauta al equipo (se contestan desde el Resumen)
CREATE TABLE ad_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES ad_runs(id) ON DELETE SET NULL,
  question text NOT NULL,
  why text NOT NULL DEFAULT '',
  quick_answers jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','dismissed')),
  answer text,
  answered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_questions_open ON ad_questions (created_at DESC) WHERE status = 'open';
