# Uniform.ar — Panel de contenidos y proyectos (Subproyecto 1)

**Fecha:** 2026-10-07 · **Cliente:** Uniform.ar (vía TechDI) · **Estado:** diseño aprobado en conversación, pendiente de revisión del spec.

**Fuentes:** brief de marketing ("Brief Joaco · Plataforma de marketing Uniform.ar"), brief de Sofía
(`Uniformar_brief_desarrollo.md`, oct 2026), prototipo en artifact de claude.ai
(`https://claude.ai/artifact/LN5hR5YZqG9pPJz3Wbkuis`), y patrones de `gineza-agent` (backend/tests/PWA/agente)
y `DEV-ALTORANCHO/marketing` (calendario de redes, tareas).

---

## 1. Contexto y objetivo

Uniform.ar es una marca argentina B2B de indumentaria laboral personalizada. Hoy las ideas, links, pendientes y
proyectos del equipo quedan sueltos en WhatsApp; Sofía armó un prototipo que funcionó a medias (sobre todo:
guardados que fallaban sin avisar). Este subproyecto construye la **plataforma interna** donde vive todo eso y que
después aloja el agente de pauta y el admin de la web nueva.

**Éxito:** Sofía entra, crea los usuarios, carga el calendario del mes con sus piezas y las ideas; Santi entra desde
el celular y ve en segundos qué tiene que decidir y qué tiene que hacer; nada se pierde sin aviso.

### Hoja de ruta completa (cada uno con su spec → plan → implementación)

| # | Subproyecto | Notas |
|---|---|---|
| **1** | **Panel de contenidos y proyectos** (este spec) | Login, usuarios/permisos, Inicio, Ideas, Calendario de redes, Proyectos, Ajustes, migración. |
| 2 | Recordatorios + calendario general | WhatsApp (infra de bots TechDI) / mail; resumen semanal; Google Calendar. |
| 3 | Agente de pauta Meta + Google | Patrón gineza-agent (candidatos → recomendación → aprobar → ejecutar) con tope $300.000/mes (ideal $200.000), objetivo consultas al WhatsApp de Santi + posicionamiento Google; crear campañas/anuncios. Requiere app de Meta con `ads_management` y developer token de Google Ads — **iniciar esos trámites ya**. |
| 4 | Publicación programada en Instagram | Instagram Content Publishing API desde el calendario. TikTok se evalúa aparte (su API exige auditoría). |
| 5 | Web nueva + Admin web | Rubros, catálogo, trabajos, formularios, chat → WhatsApp, simulador de logo. Lee de la misma base. |

---

## 2. Alcance

### Dentro (Subproyecto 1)
- Login email + contraseña; superadmin inicial; gestión de usuarios con permisos por sección.
- Inicio (dashboard), Ideas de contenido (flujo completo), Calendario de redes (con piezas, copy, previsualización
  y estado de publicación), Proyectos y tareas (con novedades, fotos y PDFs embebidos), Ajustes (grilla fija,
  clientes), Mi cuenta.
- Vincular idea ↔ pieza del calendario; embed de reels/TikTok cuando sea posible.
- Historial de cambios por entidad.
- Subida de imágenes y PDFs con límites de peso y medidas recomendadas.
- PWA instalable, mobile-first.
- Migración de los datos del prototipo.
- Pestañas "Agente de pauta" y "Admin web" visibles como **Próximamente** (pantalla explicativa + tarjeta en Inicio).

### Fuera
- Recordatorios / notificaciones, calendario general, Google Calendar (Subproyecto 2).
- Cualquier integración con Meta, Google o TikTok (Subproyectos 3 y 4).
- Recupero de contraseña por mail (un admin la resetea desde Usuarios).
- Subida de videos (solo links: Drive, IG, TikTok, YouTube).

---

## 3. Arquitectura

Un repo, **un servicio en Railway** (mismo patrón que `gineza-agent`): el backend Express sirve la API y el build
estático del frontend.

```
uniformar/
├── backend/     Node ≥20, Express (ESM), pg, migraciones SQL numeradas, zod, bcrypt, jsonwebtoken,
│   │            @aws-sdk/client-s3 (R2), node-cron (reservado para subproyecto 2)
│   ├── src/app.js, src/index.js
│   ├── src/db/            pool + migrate.js + migrations/NNN_*.sql
│   ├── src/routes/        auth, users, ideas, calendar, projects, files, home, settings, activity
│   ├── src/repo/          un módulo por agregado, SQL a mano
│   ├── src/services/      storage (S3 genérico + driver local para dev/test), permissions, activity
│   ├── src/lib/           ideaStatus.js (estado derivado), errors.js, validate.js
│   ├── scripts/           migrateFromPrototype.js
│   └── test/              vitest + PGlite + supertest
├── frontend/    React 18 + Vite + HashRouter + vite-plugin-pwa, CSS Modules, lucide-react
├── package.json, railway.json   build front + back, start back, healthcheck /health
└── docs/superpowers/{specs,plans}
```

- **Base de datos:** Postgres de Railway. Tests con PGlite (Postgres en memoria), como gineza-agent.
- **Archivos:** bucket S3-compatible (**Cloudflare R2**: 10 GB gratis, sin costo de egress). El servicio de storage
  expone `put/get/delete/signedUrl`; driver `s3` en prod y driver `local` (carpeta) en dev/test. Los archivos se
  sirven con URL firmadas de corta vida (el bucket es privado).
- **Dominio:** `uniformar.techdi.com.ar` (CNAME a Railway).
- **Deploy:** `railway up` por CLI.
- **Costo estimado:** Railway (servicio + Postgres) ~USD 5–10/mes; R2 USD 0 mientras se esté < 10 GB.

---

## 4. Autenticación y permisos

### Auth
- Email + contraseña, hash bcrypt (cost 12).
- Sesión: JWT (30 días, renovación deslizante al usarse con < 15 días restantes) en **cookie httpOnly, Secure,
  SameSite=Lax**. Logout borra la cookie. El JWT lleva `user_id` y `token_version`; cambiar/resetear contraseña o
  desactivar al usuario incrementa `token_version` e invalida sesiones.
- Rate limit en `/api/auth/login`: 10 intentos / 15 min por IP+email.
- **Seed:** migración crea `jdilernia99@gmail.com` (superadmin: `manage_users`, `can_delete`, `edit` en todo) con
  la contraseña de `ADMIN_INITIAL_PASSWORD` y `must_change_password = true`. Mientras `must_change_password` esté
  activo, la API solo permite `/api/auth/*` y el frontend muestra la pantalla de cambio de contraseña.
- Contraseña mínima: 8 caracteres.

### Permisos
- Secciones: `home`, `ideas`, `calendar`, `projects`, `ads`, `web`. Nivel por usuario y sección:
  `none | view | edit`.
- Flags globales: `can_delete` (borrar ideas, piezas, proyectos, tareas, archivos), `manage_users`.
- **Plantillas al crear usuario** (después se ajusta sección por sección):
  - *Admin:* edit en todo + `can_delete` + `manage_users`.
  - *Equipo:* edit en home/ideas/calendar/projects, view en ads/web, sin flags.
  - *Solo lectura:* view en todo, sin flags.
- **El backend valida cada request** (middleware `requirePermission(section, level)` y `requireFlag(flag)`). El
  frontend recibe los permisos en `/api/auth/me` y oculta lo no permitido, pero nunca es la única barrera.
- Nadie puede quitarse a sí mismo `manage_users` ni desactivarse; siempre tiene que quedar al menos un usuario
  activo con `manage_users`.

---

## 5. Modelo de datos

```
users              id uuid PK, email text (UNIQUE sobre lower(email)), name, password_hash, avatar_color,
                   is_active bool, must_change_password bool, can_delete bool, manage_users bool,
                   token_version int, created_at, last_login_at
user_permissions   user_id FK, section text, level text CHECK (none|view|edit), PK(user_id, section)

clients            id, name text (UNIQUE sobre lower(name)), created_at
content_rules      id, weekday smallint (0=dom..6=sáb), time time NULL, theme text, format text,
                   channels text[], active bool, sort int
                   -- seed: mar carrusel por rubro (IG), mié 1-2 historias cotización (IG),
                   --       vie reel cliente real (IG+TikTok), dom 20:00 reel humor/trend (IG+TikTok)

ideas              id, kind (idea|must), format (video|photo), category (domingo|viernes|producto|otra),
                   client_id FK NULL, assignee_id FK NULL (quién la ejecuta; default Santi en la UI),
                   text, reference_url NULL, decision (pending|yes|no),
                   done_at NULL, result_url NULL, due_date NULL,
                   note_santi NULL, note_santi_by FK NULL, note_sofi NULL, note_sofi_by FK NULL,
                   legacy_id NULL, created_by FK, created_at, updated_at

calendar_items     id, date, title, channels text[] (ig_story|ig_post|ig_reel|tiktok),
                   idea_id FK NULL, copy NULL, piece_url NULL, refs text NULL,  -- "references" es palabra reservada
                   status (draft|ready|published), sort, created_by FK, created_at, updated_at

projects           id, name, status (active|proposal|upcoming|done), start_date NULL, end_date NULL,
                   goal_text, doing_text, how_text, legacy_id NULL, created_by FK, created_at, updated_at
project_tasks      id, project_id FK ON DELETE CASCADE, text, due_date NULL, done bool, done_at NULL,
                   sort, legacy_id NULL, created_at
task_assignees     task_id FK ON DELETE CASCADE, user_id FK, PK(task_id, user_id)
project_updates    id, project_id FK ON DELETE CASCADE, author_id FK, body, created_at

files              id, owner_type (idea_ref|idea_result|calendar_preview|project_photo|project_pdf),
                   owner_id, kind (image|pdf), storage_key, mime, bytes, width NULL, height NULL,
                   original_name, sort, uploaded_by FK, created_at

activity_log       id, actor_id FK, entity_type, entity_id, action, diff jsonb, created_at
                   INDEX (entity_type, entity_id, created_at DESC), INDEX (created_at DESC)
```

**Estado derivado de una idea** — una sola función `deriveIdeaStatus` en `backend/src/lib/ideaStatus.js`,
espejada en el frontend y cubierta por tests:

```
decision = 'no'          → 'no_se_hace'   ("No se hace")
done_at  != null         → 'realizada'    ("Realizada")
kind     = 'must'        → 'si_o_si'      ("Sí o sí")      -- nace "por hacer" sin paso de decisión
decision = 'yes'         → 'por_hacer'    ("Por hacer")
otherwise                → 'por_decidir'  ("Por decidir")
```

**Transiciones** (endpoints explícitos, no PATCH libre de estado):
- `decide` (yes|no) — solo `kind='idea'`; **reversible** (`undecide` vuelve a pending).
- `complete` — requiere `result_url` (validado como URL http/https); fotos de resultado opcionales.
- `reopen` — deshace `complete`.
- Cambiar `kind` idea ↔ must se permite en la edición; al pasar a `must`, `decision` queda en pending (no aplica).

**Borrado:** requiere `can_delete`. Borrar una entidad con archivos borra sus `files` y los objetos del bucket
(tras commit; si el borrado del bucket falla, la clave se inserta en `storage_deletions_pending(storage_key,
attempts, created_at)` y un cron horario + el arranque del servidor la reintentan). Borrar una idea vinculada deja `calendar_items.idea_id = NULL`.

**Historial:** todo create/update/delete/transición de ideas, piezas, proyectos y tareas escribe en
`activity_log` con el diff de campos cambiados (en la misma transacción).

---

**"Te toca":** "Te toca decidir" = ideas por decidir con `assignee_id` = yo; "Te toca hacer" = ideas por hacer / sí o sí
con `assignee_id` = yo, más mis tareas abiertas de proyectos activos. La migración asigna las ideas a Santi.

## 6. API (resumen)

Todas bajo `/api`, JSON, cookie de sesión. Formato de error único:
`{ "error": { "code": "FORBIDDEN|VALIDATION|NOT_FOUND|CONFLICT|UNAUTHENTICATED|...", "message": "texto en español", "fields"?: {...} } }`.
Validación de entrada con zod en cada ruta.

```
auth      POST /auth/login · POST /auth/logout · GET /auth/me · POST /auth/change-password
users     GET /users · POST /users · PATCH /users/:id · PUT /users/:id/permissions
          POST /users/:id/reset-password (devuelve contraseña temporal, must_change_password=true)
          GET /users/directory  (id, nombre, color de todos los activos — para asignar tareas; cualquier logueado)
home      GET /home?week=YYYY-MM-DD   (contadores, semana, pendientes por persona, por decidir, realizado,
                                       proyectos activos, últimos cambios)
ideas     GET /ideas · POST /ideas · GET /ideas/:id · PATCH /ideas/:id · DELETE /ideas/:id
          POST /ideas/:id/decide · /undecide · /complete · /reopen · GET /ideas/:id/activity
calendar  GET /calendar?from&to · POST /calendar · PATCH /calendar/:id · DELETE /calendar/:id
projects  GET /projects · POST /projects · GET /projects/:id · PATCH /projects/:id · DELETE /projects/:id
          POST /projects/:id/tasks · PATCH /tasks/:id · DELETE /tasks/:id
          POST /projects/:id/updates · DELETE /updates/:id
files     POST /files (multipart: owner_type, owner_id, file) · GET /files/:id/url · DELETE /files/:id
          PATCH /files/order
settings  GET/PUT /settings/content-rules · GET /clients · POST /clients · PATCH /clients/:id
health    GET /health  (fuera de /api)
```

Permiso requerido por ruta: la sección del recurso (`ideas`, `calendar`, `projects`) con `view` para leer y `edit`
para escribir; `files` hereda la sección de su `owner_type`; `settings` requiere `edit` en `calendar`; `users`
requiere `manage_users`; `home` requiere `view` en `home` y cada bloque se filtra por los permisos de su sección.

---

## 7. Archivos: límites y medidas

| Tipo | Límite | Procesamiento | Medida recomendada (se muestra junto al campo) |
|---|---|---|---|
| Imagen (referencia de idea, resultado, foto de proyecto) | ≤ 2 MB después de comprimir; original hasta 25 MB | En el navegador: lado largo ≤ 2048 px, WebP calidad 0,82; si el WebP sale > 2 MB se baja la calidad hasta 0,6 y luego se rechaza | Foto de producto 1080×1350 · referencia libre |
| Previsualización de pieza | ≤ 2 MB c/u, hasta 10 por pieza (carrusel) | Igual | Post/carrusel IG **1080×1350** (4:5) · Historia / Reel / TikTok **1080×1920** (9:16) · Post cuadrado 1080×1080 |
| PDF | ≤ 10 MB | Sin procesar | — |
| Video | **No se sube** | Link (Drive, IG, TikTok, YouTube) | — |

- El backend revalida tipo (por *magic bytes*, no por extensión) y peso; acepta `image/webp|jpeg|png` y
  `application/pdf`. Tope por request: 12 MB.
- Si la imagen tiene una relación distinta a la recomendada para el canal, se muestra un aviso ("Esta imagen es
  1:1; para Reel se recomienda 9:16") sin bloquear.
- Medidas para la web nueva (Subproyecto 5, quedan documentadas): banner 1920×800, producto 1200×1500.

---

## 8. Frontend: UX y pantallas

### Sistema visual
- Base clara neutra (gris piedra muy suave), tarjetas blancas, **acento ciruela `#775D66`** (color del logo),
  negro para texto, estados semánticos (verde listo, ámbar pendiente, rojo error). Modo oscuro por
  `prefers-color-scheme`.
- Tipografía: Inter (UI) + una display redondeada para títulos. Íconos Lucide.
- Mobile-first: áreas táctiles ≥ 44 px, hojas inferiores (bottom sheets) en el celular y paneles laterales en
  escritorio, sin scroll horizontal salvo carruseles explícitos.
- Logos: `LOGOS/Logo Uniform-ar.png- NEGRO.png`, `-BLANCO.png`, `despues .png` (ciruela) → se generan íconos PWA.

### Navegación
- **Celular:** barra inferior Inicio · Ideas · Calendario · Proyectos · Más (Pauta, Web, Usuarios, Ajustes,
  Mi cuenta). Botón flotante ＋ contextual.
- **Escritorio:** sidebar con las mismas secciones. Pauta y Web con etiqueta "Próximamente".
- Solo se muestran secciones con permiso ≥ view.

### Guardado y errores (requisito #1 del prototipo)
- Cada acción de escritura es **optimista** con toast "Guardado ✓"; si falla, **revierte** y muestra toast rojo con
  el mensaje del backend (p. ej. "No tenés permiso para editar Proyectos").
- Formularios largos guardan borrador local; un 401 lleva al login y al volver se restaura el borrador.
- Banner "Sin conexión" con guardados deshabilitados mientras dure.
- Nunca un guardado silencioso fallido: toda request de escritura termina en toast de éxito o de error.

### Pantallas
1. **Login** / **Cambiar contraseña** (forzado en el primer ingreso).
2. **Inicio:** saludo + 4 contadores (ideas nuevas de la semana, por decidir, realizadas, proyectos activos).
   Bloque personal arriba según el usuario ("Te toca decidir", "Te toca hacer", "Tus tareas"). Luego: semana
   (7 días con temática de la grilla, piezas, canales y estado: sin cargar / planificado / pieza lista /
   publicado; flechas de semana), pendientes por persona (columna por usuario activo; scroll horizontal en
   celular), ideas por decidir (desaparecen al decidir), contenido realizado con miniatura/link, proyectos activos
   con barra de avance (propuestas aparte), tarjetas "Próximamente" de Pauta y Web, "¿Cómo se usa?" plegado.
   Todo ítem navega a su detalle.
3. **Ideas:** chips de filtro combinables Formato (Todo/Videos/Fotos) · Tipo (Todos/Domingo/Viernes/Producto/
   Otros) · Estado (Todas/Sí o sí/Por decidir/Por hacer/Realizadas/No se hacen) — recordados por usuario —
   y buscador. Grupos plegables (arrancan cerrados): 📌 Sí o sí → Domingo · humor → un grupo por cliente de
   viernes → Producto · catálogo → Otros; cada grupo con contador y resumen ("3 por decidir · 1 por hacer").
   Filas compactas (formato, título, estado). Detalle en bottom sheet / panel lateral: texto completo, referencia
   con embed IG/TikTok/YouTube cuando sea posible y botón "Abrir en la app", galería de fotos ampliable, notas,
   botones grandes **Sí la hago / No la hago / Ya la hice** (este último pide link obligatorio + fotos
   opcionales), deshacer, edición en el lugar de todos los campos, "Vincular a un día", historial. Alta: tipo,
   formato, texto, categoría, cliente (solo viernes, autocompletado, crea cliente nuevo si no existe),
   referencia, fotos de referencia (solo foto), fecha límite (solo sí o sí).
4. **Calendario de redes:** escritorio = grilla mensual; celular = lista de semanas con días expandibles. Días de
   la grilla fija marcados con su temática; cualquier día admite piezas extra; un día puede tener varias piezas.
   Pieza: título/qué se sube, canales, idea vinculada (buscador), copy, link de la pieza terminada, referencias
   (una por línea), previsualizaciones (mockup feed 4:5 o historia 9:16 según canal; carrusel deslizable) y
   estado borrador → listo para publicar → publicado.
5. **Proyectos:** pestañas Activos / Propuestas / Próximos / Terminados con tarjetas y avance (tareas hechas/total).
   Detalle: nombre, estado, fechas, los 3 textos largos completos, tareas (multi-asignación, fecha límite, check,
   reordenar), novedades (feed con autor y fecha), fotos (galería) y PDFs (visor embebido con `<iframe>` sobre URL
   firmada; en iOS, fallback "Abrir PDF").
6. **Usuarios:** lista con estado; alta (nombre, email, contraseña inicial, plantilla); matriz de permisos;
   reset de contraseña; activar/desactivar.
7. **Ajustes:** grilla fija editable (día, hora, temática, formato, canales, activa), clientes (renombrar/unificar).
8. **Mi cuenta:** nombre, color de avatar, cambiar contraseña, "Instalar en el celular".
9. **Agente de pauta / Admin web:** pantallas "Próximamente" con qué va a incluir cada una.

### Embeds
- Instagram: `https://www.instagram.com/{p|reel}/{code}/embed` en iframe; TikTok: `https://www.tiktok.com/embed/v2/{id}`;
  YouTube: `/embed/{id}`. Si la URL no se reconoce o el embed falla, se muestra tarjeta con "Abrir" (link que en el
  celular abre la app). Drive: tarjeta con link.

---

## 9. Migración del prototipo

- Fuente: la base del artifact de Sofía (colecciones de ideas, proyectos + tareas, calendario). Se exporta a JSON
  (vía la herramienta de datos del artifact; acceso writer confirmado) y `backend/scripts/migrateFromPrototype.js`
  lo importa. Idempotente por `legacy_id`.
- Mapeo: `encargo`→`kind`, `categoria`→`category` (`otra`), `decision` (`pendiente|si|no`→`pending|yes|no`),
  `hecha/hechaEn`→`done_at`, `link`→`reference_url`, `linkResultado`→`result_url`, `nota`→`note_santi`,
  `notaSofi`→`note_sofi`, `cliente` texto→`clients`. Proyectos: `estado` (+ `terminado` legado) → `status`;
  `queQueremos/queSeEsta/comoSeVa` → `goal/doing/how_text`. Tareas: `asignados` (y `asignado` legado) →
  `task_assignees` por nombre de pila. Calendario: un doc por fecha → un `calendar_item` (status `draft`,
  `canales` → `channels`).
- Requisito previo: existir los usuarios de Sofi, Santi y Bauti (mapeo por nombre configurable en el script).
- Archivos (14 fotos + 1 PDF) no están en el export: Sofía los vuelve a subir.
- Datos esperados: ~21 ideas, 3 proyectos, 3 tareas, pocas fechas de calendario. El script imprime un resumen.

---

## 10. Testing y verificación

- **Backend (vitest + PGlite + supertest):** auth (login, cookie, rate limit, must_change_password, token_version),
  matriz de permisos (cada sección × none/view/edit × lectura/escritura, flags), reglas de "último manage_users",
  `deriveIdeaStatus` y transiciones (incluido rechazo de `complete` sin link y `decide` sobre `must`), validación
  de archivos (tipo por magic bytes, peso), borrado con archivos, activity_log, `/home` agregados, migración con
  un JSON de muestra.
- **Frontend (vitest + Testing Library):** filtros + agrupado de Ideas, `deriveIdeaStatus` espejo, toast de error
  ante 403/500 con reversión optimista, compresión de imágenes (función pura de cálculo de dimensiones/calidad).
- **Manual antes de entregar:** recorrido completo en navegador a 390 px y 1440 px (login → cambio de contraseña →
  crear usuario → idea → decidir → completar → calendario con previsualización → proyecto con PDF), con un
  usuario "Solo lectura" para verificar que no aparecen acciones.

---

## 11. Deploy y configuración

- Railway: servicio Node + Postgres. `railway.json`: build front + back, start back, healthcheck `/health`.
- Variables: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_INITIAL_PASSWORD`, `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` (`auto` en R2), `STORAGE_DRIVER` (`s3|local`),
  `APP_URL`.
- Migraciones corren al arrancar (como gineza-agent).
- Dominio `uniformar.techdi.com.ar` (CNAME en el DNS de techdi.com.ar).

### Pendientes del lado del cliente / TechDI (no bloquean el desarrollo)
- Cuenta de Cloudflare R2 (o se usa un bucket de TechDI) y sus claves.
- Mails definitivos de Santi y Bauti.
- Para el Subproyecto 3: crear la app de Meta (ads_management) y pedir el developer token de Google Ads.
