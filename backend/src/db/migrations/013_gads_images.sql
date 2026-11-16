-- Imágenes para los anuncios de Google (recurso de imagen en Búsqueda). Se suben desde el panel o se traen de las piezas de Meta.
CREATE TABLE gads_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  source_creative_id uuid REFERENCES ad_creatives(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE files DROP CONSTRAINT files_owner_type_check;
ALTER TABLE files ADD CONSTRAINT files_owner_type_check
  CHECK (owner_type IN ('idea_ref','idea_result','calendar_preview','calendar_media','project_photo','project_pdf','ad_feed','ad_story','gads_image'));
