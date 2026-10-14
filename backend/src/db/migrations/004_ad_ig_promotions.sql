-- Posts/reels de Instagram promocionados como anuncio (para marcar "ya promocionado" y no duplicar)
CREATE TABLE ad_ig_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_media_id text NOT NULL,
  permalink text NOT NULL DEFAULT '',
  meta_ad_id text NOT NULL,
  meta_adset_id text NOT NULL,
  adset_name text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_ig_promotions_media ON ad_ig_promotions (ig_media_id);
