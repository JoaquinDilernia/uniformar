-- 'decide': entre ver y editar. En ideas: decidir, marcar realizada con el link y dejar nota, sin crear ni editar el contenido
ALTER TABLE user_permissions DROP CONSTRAINT user_permissions_level_check;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_level_check CHECK (level IN ('none','view','decide','edit'));
