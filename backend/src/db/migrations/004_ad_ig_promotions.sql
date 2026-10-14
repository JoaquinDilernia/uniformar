-- Posts/reels de Instagram promocionados como anuncio (para marcar "ya promocionado" y no duplicar).
-- La fila se reserva antes de llamar a Meta (meta_ad_id null) y el UNIQUE impide dos anuncios del mismo post en el mismo conjunto.
CREATE TABLE ad_ig_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_media_id text NOT NULL,
  permalink text NOT NULL DEFAULT '',
  meta_ad_id text,
  meta_adset_id text NOT NULL,
  adset_name text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ig_media_id, meta_adset_id)
);
