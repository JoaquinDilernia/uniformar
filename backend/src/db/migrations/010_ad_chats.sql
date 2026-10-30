-- Consultas al agente de pauta desde el panel: conversaciones del equipo con el agente.
-- El chat no ejecuta nada en Meta: lo que propone queda como recomendación pendiente (ad_decisions.chat_id).
CREATE TABLE ad_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_chats_recent ON ad_chats (updated_at DESC);

CREATE TABLE ad_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES ad_chats(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  -- Lo que hizo el agente al contestar: [{ type: 'recommendation' | 'learning' | 'request', id, title }]
  actions jsonb NOT NULL DEFAULT '[]',
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_chat_messages_chat ON ad_chat_messages (chat_id, created_at);

ALTER TABLE ad_decisions ADD COLUMN chat_id uuid REFERENCES ad_chats(id) ON DELETE SET NULL;
