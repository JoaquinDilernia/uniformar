-- Consultas al agente de Google: las conversaciones se separan por plataforma, como el resto del agente.
-- Las que ya existen son de Meta.
ALTER TABLE ad_chats ADD COLUMN platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','google'));
DROP INDEX ad_chats_recent;
CREATE INDEX ad_chats_recent ON ad_chats (platform, updated_at DESC);
