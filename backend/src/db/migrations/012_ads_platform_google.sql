-- Agente de Google Ads: comparte las tablas del agente de Meta, separadas por plataforma.
-- Lo existente queda como Meta.
ALTER TABLE ad_runs ADD COLUMN platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','google'));
ALTER TABLE ad_decisions ADD COLUMN platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','google'));
ALTER TABLE ad_learnings ADD COLUMN platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','google'));
ALTER TABLE ad_questions ADD COLUMN platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','google'));
ALTER TABLE ad_creative_requests ADD COLUMN platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','google'));
CREATE INDEX ad_runs_platform_recent ON ad_runs (platform, started_at DESC);
CREATE INDEX ad_decisions_platform_recent ON ad_decisions (platform, created_at DESC);

-- Ajustes: fila 1 = Meta, fila 2 = Google (tope de noviembre 2026: $50.000)
ALTER TABLE ad_settings DROP CONSTRAINT ad_settings_id_check;
ALTER TABLE ad_settings ADD CONSTRAINT ad_settings_id_check CHECK (id IN (1, 2));
INSERT INTO ad_settings (id, monthly_cap_ars) VALUES (2, 50000);
