-- Las piezas de pauta pueden ser videos (MP4/MOV)
ALTER TABLE files DROP CONSTRAINT files_kind_check;
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('image','pdf','video'));
