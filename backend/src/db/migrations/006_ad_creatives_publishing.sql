-- 'publishing': la pieza se reclama antes de llamar a Meta para que dos "Publicar" a la vez no creen dos anuncios
ALTER TABLE ad_creatives DROP CONSTRAINT ad_creatives_status_check;
ALTER TABLE ad_creatives ADD CONSTRAINT ad_creatives_status_check CHECK (status IN ('unused','publishing','used','archived'));
