# Pauta — preguntas del agente, posts de IG y videos

**Fecha:** 2026-10-14 · **Estado:** diseño aprobado en conversación, pendiente de revisión del spec.
**Base:** agente de pauta de Meta Ads (commit `711b337` y arreglos posteriores en `feat/panel`).

---

## 1. Contexto y objetivo

El agente de pauta corre todos los días, deja un informe y recomendaciones para aprobar. Tres huecos frenan el uso:

1. **El agente pregunta y nadie le puede contestar.** El informe termina en "Qué necesito" con preguntas que muchas
   veces piden *datos* que solo tiene el equipo. Ejemplo real: "¿Cuántas de las 20 conversaciones fueron empresas
   reales con +30 prendas y de qué conjunto vinieron?" — sin esa respuesta no puede decidir entre dos conjuntos.
2. **No se pueden promocionar posts/reels ya publicados en @uniform.ar** (estilo "Promocionar" de Instagram).
3. **Las piezas solo aceptan imágenes**; también hacen falta videos.

**Éxito:** el equipo contesta las preguntas del agente desde el Resumen y la próxima corrida usa esa información;
promociona un reel existente en un conjunto con un par de toques (o aprueba la recomendación del agente de hacerlo);
sube un video como pieza y se publica en Meta igual que una imagen.

**Orden de construcción:** A (preguntas) → C (posts de IG) → B (videos). Cada parte se puede mergear sola.

---

## 2. Parte A — Preguntas del agente

### Decisiones
- El agente crea cada pregunta con una herramienta (`ask_team`), no se parsea del texto del informe.
- La respuesta es **texto libre**; el agente puede sugerir hasta 4 **respuestas rápidas** (botones que completan el
  campo, editable antes de guardar).
- Al responder: **Guardar** (la toma la próxima corrida) o **Guardar y analizar ahora** (dispara una corrida manual).
- Puede responder **cualquiera con permiso `ads.edit`**.
- Una pregunta sin responder sigue abierta; el agente no la repite.

### Datos — migración `003_ad_questions.sql`
```sql
CREATE TABLE ad_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES ad_runs(id) ON DELETE SET NULL,
  question text NOT NULL,
  why text NOT NULL DEFAULT '',
  quick_answers jsonb NOT NULL DEFAULT '[]',   -- array de strings, máx 4
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','dismissed')),
  answer text,
  answered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_questions_open ON ad_questions (created_at DESC) WHERE status = 'open';
```

### Agente
- Herramienta nueva `ask_team` (no es acción de Meta; se ejecuta directo en el dispatcher):
  `question` (requerido), `why` (requerido: qué decisión destraba), `quick_answers` (opcional, ≤4 strings cortos).
  Devuelve `{ ok: true, question_id }`.
- Contexto (`buildContext`) suma:
  - `openQuestions`: abiertas (id, question, created_at).
  - `answeredQuestions`: respondidas desde la última corrida terminada (`done`) — question, answer, answered_at,
    nombre de quien respondió.
- Prompt (`systemPrompt.js`), sección nueva:
  - Cuando te falta un dato que solo tiene el equipo, usá `ask_team` con una pregunta concreta y respondible en una
    línea; si hay respuestas típicas, sugerilas en `quick_answers`.
  - No repitas una pregunta que esté en `openQuestions`.
  - Usá `answeredQuestions` en el análisis; si una respuesta vale a futuro, guardala con `save_learning`.
  - En el informe, **Qué necesito** menciona las preguntas en una línea ("Te dejé 2 preguntas abajo") en vez de
    repetirlas.

### API (`routes/ads.js`)
| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/ads/questions?status=open\|answered` | view | Lista (answered: últimas 30) |
| POST | `/ads/questions/:id/answer` | edit | Body `{ answer (1–2000), analyze?: boolean }`. Solo si está `open` (si no, 409). Si `analyze` y hay agente: arranca corrida `manual`; si ya hay una corriendo, guarda igual y responde `{ question, run: null, note: 'Ya hay un análisis corriendo: el agente la toma en el próximo.' }` |
| POST | `/ads/questions/:id/dismiss` | edit | Pasa a `dismissed` |

`/ads/overview` suma `openQuestions` (count) para el contador de la pestaña.

### Panel (`AdsPage.jsx`)
- Resumen, debajo del informe: bloque **"El agente pregunta"** con una tarjeta por pregunta abierta: pregunta, por
  qué (texto chico), chips de respuestas rápidas, textarea, botones **Guardar**, **Guardar y analizar ahora**,
  **Descartar** (con confirmación). Sin permiso de edición: solo lectura.
- Contador de preguntas abiertas en la pestaña Resumen.
- "Respondidas" plegado debajo: pregunta, respuesta, quién y cuándo.

### Tests
- Dispatcher: `ask_team` crea la pregunta con `run_id`; `quick_answers` > 4 se recorta.
- Rutas: responder (ok, 409 si no está abierta, 403 sin `ads.edit`), `analyze` arranca corrida, `analyze` con corrida
  en curso guarda igual, descartar.
- `buildContext` incluye `openQuestions` y solo las `answeredQuestions` posteriores a la última corrida terminada.

---

## 3. Parte C — Promocionar posts y reels de IG

### Requisito previo (configuración en Meta, no código)
La cuenta publicitaria tiene que tener acceso a la cuenta de Instagram **@uniform.ar** (Business Manager →
Cuentas de Instagram → asignar la cuenta publicitaria) y el token necesita `instagram_basic` (+ `instagram_manage_insights`
para el alcance orgánico). El respaldo con la cuenta de IG de la página **no aplica** acá: el post existe solo en @uniform.ar.

### Meta (`services/meta.js`)
- `getIgMedia(igUserId, limit = 25)`: `GET /{ig-user-id}/media` con
  `id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count`.
  Alcance orgánico vía `/{media-id}/insights?metric=reach` best-effort: si falla por permisos, `reach: null` sin cortar.
- Creative con post existente (`creativeSpec.js` → `buildIgPostCreativeSpec`):
  `{ name, object_id: pageId, instagram_user_id: igUserId, source_instagram_media_id: mediaId,
  call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
  degrees_of_freedom_spec: NO_AI_ENHANCEMENTS }`. El texto es el caption del post (no se edita).
- Si Meta responde error de acceso a Instagram: error claro "La cuenta publicitaria no tiene acceso a @uniform.ar:
  asignala en el Business Manager." — **sin** caer al respaldo de la página.

### Datos — migración `004_ad_ig_promotions.sql`
```sql
CREATE TABLE ad_ig_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_media_id text NOT NULL,
  permalink text NOT NULL DEFAULT '',
  meta_ad_id text NOT NULL,
  meta_adset_id text NOT NULL,
  adset_name text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,   -- null si lo ejecutó una decisión aprobada sin usuario
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_ig_promotions_media ON ad_ig_promotions (ig_media_id);
```

### Ejecución
- Acción nueva `promote_ig_post` en el executor: `{ ig_media_id, adset_id, adset_name }` → crea creative + anuncio
  ACTIVO en el conjunto (nombre con `buildAdName`, pieza = `IG` + últimos 6 dígitos del id del post), registra en `ad_ig_promotions`.
  Rechaza si ese post ya está promocionado en ese conjunto.
- Agente: herramienta `promote_ig_post` (`ig_media_id`, `adset_id`, `adset_name` + title/reason/expected_impact),
  en `META_ACTIONS` → siempre queda **pendiente de aprobación** (no es autónoma).
- Contexto: `igPosts` = últimos posts con tipo, caption (recortado a 300), fecha, likes, comentarios, reach y
  `promotedIn` (conjuntos donde ya está). Si Meta falla, `igPosts: { error }` y el análisis sigue.
- Prompt: cuándo conviene promocionar (anduvo bien orgánicamente, encaja con el público del conjunto, el caption se
  entiende para alguien que no conoce la marca e invita a escribir); preferir reels para historias/reels.

### API
| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/ads/ig-posts` | view | Posts + `promotedIn` (cache 5 min como el snapshot; `?refresh=1`) |
| POST | `/ads/ig-posts/:mediaId/promote` | edit | Body `{ adset_id, adset_name }` → ejecuta en el momento y registra la decisión como `executed` (igual que publicar una pieza a mano) |

### Panel
- Pestaña de piezas: sección **"Posts de Instagram"** — grilla con miniatura, tipo (Post/Carrusel/Reel), fecha,
  likes/comentarios/alcance, etiqueta "Promocionado en X". Botón **Promocionar** → Sheet con selector de conjunto
  (los del snapshot) y confirmación.
- `TOOL_LABEL.promote_ig_post = 'Promocionar post'` en recomendaciones; la tarjeta muestra la miniatura del post.

### Tests
- `buildIgPostCreativeSpec` (unitario).
- Executor: promoción crea creative/anuncio y registra; duplicado en el mismo conjunto → error; error de acceso a
  Instagram no reintenta con la cuenta de la página.
- Dispatcher: `promote_ig_post` queda pendiente aunque el modo autónomo esté prendido.
- Ruta `promote` (ok, 403) y `ig-posts` con `promotedIn`; reach `null` si insights falla.

---

## 4. Parte B — Videos en las piezas

### Decisiones
- Feed y historia aceptan **imagen JPG/PNG (≤8 MB) o video MP4/MOV (≤200 MB)**. Un archivo por lugar.
- El video se sube **directo del navegador a R2** con URL firmada; el backend nunca lo carga en memoria.
- Meta descarga el video desde una URL firmada de R2 (`file_url`); miniatura = la que genera Meta.

### Archivos (`services/files.js`, `services/storage.js`, `routes/files.js`)
- `OWNER_TYPES.ad_feed/ad_story`: `kinds: ['image','video']`, video `accept: ['video/mp4','video/quicktime']`,
  `maxBytes` video 200 MB. Migración `005_files_video.sql`: `files.kind` hoy tiene `CHECK (kind IN ('image','pdf'))`
  → se reemplaza por `('image','pdf','video')`. Se agrega `video/mp4 → mp4` y `video/quicktime → mov` a `EXT`.
- Storage: `presignPut(key, mime, bytes)` (S3: `PutObjectCommand` firmado 15 min con `ContentType` y
  `ContentLength`), `head(key)` → `{ bytes }`, `readRange(key, 0, 4100)` para detectar el tipo real.
  Local: `presignPut` devuelve una URL del backend (`PUT /api/files/local-upload/:token`) que escribe en disco
  con stream.
- Rutas nuevas:
  - `POST /files/upload-url` `{ owner_type, owner_id, mime, bytes, original_name }` → valida dueño, tipo,
    tamaño y cupo; devuelve `{ upload_url, token }` (token firmado con JWT_SECRET, 30 min, lleva key/mime/bytes/dueño).
  - `POST /files/complete` `{ token }` → `head` confirma que existe y el tamaño coincide; `file-type` sobre los
    primeros bytes confirma el mime; inserta en `files`. Si algo no coincide, borra el objeto y responde 415/400.
- **Configuración manual:** CORS del bucket R2 permitiendo `PUT` desde `FRONTEND_URL` con header `Content-Type`.

### Meta
- `meta.uploadVideo(fileUrl, name)`: `POST {account}/advideos` `{ file_url, name }` → `video_id`.
- `meta.waitVideoReady(videoId, { timeoutMs = 10 min })`: consulta `?fields=status` cada 10 s hasta
  `video_status = 'ready'`; `error` → excepción con el detalle; timeout → "Meta sigue procesando el video, probá
  publicar de nuevo en unos minutos."
- `meta.videoThumbnail(videoId)`: `/{video_id}/thumbnails`, la `is_preferred` (o la primera).
- `creativeSpec.js` → `buildWhatsappCreativeSpec` recibe `feed` y `story` como `{ type: 'image', hash }` o
  `{ type: 'video', videoId, thumbnailUrl }`:
  - Solo feed, imagen: igual que hoy (`link_data`).
  - Solo feed, video: `object_story_spec.video_data` `{ video_id, image_url: thumbnail, message, title,
    call_to_action WHATSAPP_MESSAGE }`.
  - Feed + historia, mismo tipo: `asset_feed_spec` con `images` o `videos` (con `thumbnail_url`), `ad_formats`
    `SINGLE_IMAGE` / `SINGLE_VIDEO`, reglas por ubicación con `image_label` / `video_label`.
  - Feed + historia, tipos mezclados: **se valida contra Meta al implementar** (`asset_feed_spec` con imágenes y
    videos, `ad_formats: ['AUTOMATIC_FORMAT']`). Si Meta no lo acepta, se apaga la constante `ALLOW_MIXED_MEDIA`
    (backend y frontend): el formulario lo impide y publicar falla con "Feed e historia tienen que ser los dos imagen
    o los dos video".
- `publishCreative` sube cada archivo según su tipo; mantiene opt-out de IA, respaldo de IG de la página y
  convención de nombres.

### Panel
- Formulario de pieza: cada campo acepta imagen o video, con vista previa (`<img>` / `<video muted>`) y barra de
  progreso de subida (XHR con `upload.onprogress`).
- `lib/upload.js`: `kind: 'video'` → flujo upload-url → PUT → complete.
- Lista de piezas: miniatura de video con ícono de play.

### Agente
- `unusedCreatives` pasa de `hasFeed/hasStory` a `feed: 'image'|'video'|null`, `story: ...`.
- Prompt: puede pedir videos en `request_creative` y recomendar pieza de video para historias/reels.

### Tests
- `files`: upload-url valida tipo/tamaño/cupo/permisos; complete rechaza tamaño o tipo real distinto y borra el
  objeto; token vencido o adulterado → 400.
- `creativeSpec`: las 4 combinaciones (unitario).
- Meta (fetch simulado): `waitVideoReady` listo, error y timeout.
- Executor: pieza con video sube por `file_url` y espera procesamiento.

---

## 5. Fuera de alcance
- Chat libre con el agente.
- Editar el texto de un post de IG al promocionarlo.
- Subir videos a otras secciones (ideas, calendario, proyectos).
- Recortar/convertir videos en el navegador.
- Carruseles armados desde el panel (los carruseles de IG sí se pueden promocionar como post existente).

## 6. Deploy y configuración
- Migraciones `003_ad_questions.sql` (A), `004_ad_ig_promotions.sql` (C), `005_files_video.sql` (B); se aplican
  solas al arrancar.
- Parte C: acceso de la cuenta publicitaria a @uniform.ar + permisos `instagram_basic` / `instagram_manage_insights`
  en el token (`META_ACCESS_TOKEN`).
- Parte B: CORS del bucket R2.
