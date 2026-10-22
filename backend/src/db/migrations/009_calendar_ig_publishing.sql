-- Publicación automática en Instagram desde el calendario.
-- Una pieza con hora y en 'ready' se publica sola a esa hora (hora argentina) en sus canales de IG.
ALTER TABLE calendar_items ADD COLUMN publish_time text CHECK (publish_time ~ '^[0-2][0-9]:[0-5][0-9]$');

-- Archivos finales para publicar (las previsualizaciones siguen aparte): imágenes JPG y videos
ALTER TABLE files DROP CONSTRAINT files_owner_type_check;
ALTER TABLE files ADD CONSTRAINT files_owner_type_check
  CHECK (owner_type IN ('idea_ref','idea_result','calendar_preview','calendar_media','project_photo','project_pdf','ad_feed','ad_story'));

-- Una fila por pieza y canal: se reserva antes de llamar a Meta para que dos procesos no publiquen dos veces
CREATE TABLE calendar_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES calendar_items(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('ig_post','ig_reel','ig_story')),
  status text NOT NULL CHECK (status IN ('publishing','published','failed')),
  ig_media_ids text[] NOT NULL DEFAULT '{}',
  permalink text,
  error text,
  attempts integer NOT NULL DEFAULT 1,
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (item_id, channel)
);
