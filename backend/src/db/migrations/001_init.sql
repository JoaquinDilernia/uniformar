CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  avatar_color text NOT NULL DEFAULT '#775D66',
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  can_delete boolean NOT NULL DEFAULT false,
  manage_users boolean NOT NULL DEFAULT false,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE user_permissions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('home','ideas','calendar','projects','ads','web')),
  level text NOT NULL CHECK (level IN ('none','view','edit')),
  PRIMARY KEY (user_id, section)
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clients_name_lower ON clients (lower(name));

CREATE TABLE content_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  time text CHECK (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  theme text NOT NULL,
  format text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0
);
INSERT INTO content_rules (weekday, time, theme, format, channels, sort) VALUES
  (2, NULL, 'Foco por rubro', 'Carrusel / post', ARRAY['ig_post'], 1),
  (3, NULL, 'Cotización', '1–2 historias', ARRAY['ig_story'], 2),
  (5, NULL, 'Cliente real', 'Reel', ARRAY['ig_reel','tiktok'], 3),
  (0, '20:00', 'Humor / trend', 'Reel', ARRAY['ig_reel','tiktok'], 4);

CREATE TABLE ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('idea','must')),
  format text NOT NULL CHECK (format IN ('video','photo')),
  category text NOT NULL CHECK (category IN ('domingo','viernes','producto','otra')),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  text text NOT NULL,
  reference_url text,
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','yes','no')),
  done_at timestamptz,
  result_url text,
  due_date date,
  note_santi text,
  note_santi_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note_sofi text,
  note_sofi_by uuid REFERENCES users(id) ON DELETE SET NULL,
  legacy_id text UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ideas_created_at ON ideas (created_at DESC);

CREATE TABLE calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  title text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT '{}',
  idea_id uuid REFERENCES ideas(id) ON DELETE SET NULL,
  copy text,
  piece_url text,
  refs text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','published')),
  sort integer NOT NULL DEFAULT 0,
  legacy_id text UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_items_date ON calendar_items (date);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','proposal','upcoming','done')),
  start_date date,
  end_date date,
  goal_text text NOT NULL DEFAULT '',
  doing_text text NOT NULL DEFAULT '',
  how_text text NOT NULL DEFAULT '',
  legacy_id text UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  sort integer NOT NULL DEFAULT 0,
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_tasks_project ON project_tasks (project_id, sort);

CREATE TABLE task_assignees (
  task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE project_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('idea_ref','idea_result','calendar_preview','project_photo','project_pdf')),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','pdf')),
  storage_key text NOT NULL UNIQUE,
  mime text NOT NULL,
  bytes integer NOT NULL,
  width integer,
  height integer,
  original_name text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_owner ON files (owner_type, owner_id, sort);

CREATE TABLE activity_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX activity_recent ON activity_log (created_at DESC);

CREATE TABLE storage_deletions_pending (
  storage_key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
