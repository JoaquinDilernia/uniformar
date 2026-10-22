import { badRequest } from '../lib/errors.js';

// Publicación orgánica en Instagram de las piezas del calendario.
export const IG_CHANNELS = ['ig_post', 'ig_reel', 'ig_story'];
const CHANNEL_NAME = { ig_post: 'El post', ig_reel: 'El reel', ig_story: 'La historia' };
// Si el servidor estuvo caído, no se publica algo que se pasó más de esto de su hora: se hace a mano
const LATE_LIMIT = '12 hours';
// Una reserva "publicando" más vieja que esto se considera trabada y se puede reintentar
const STUCK = '20 minutes';

// Qué archivos van en cada canal. Con reel y post en la misma pieza, el video va al reel y las imágenes al post.
export function planChannel(channel, media, channels) {
  const videos = media.filter((f) => f.kind === 'video');
  const images = media.filter((f) => f.kind === 'image');
  if (!media.length) throw badRequest(`${CHANNEL_NAME[channel]} no tiene archivos: subilos en "Archivos para publicar".`);
  if (media.some((f) => !/^https:\/\//.test(f.url))) throw badRequest('Instagram no puede descargar los archivos: falta la URL pública del servidor (PUBLIC_API_URL).');
  if (channel === 'ig_reel') {
    if (!videos.length) throw badRequest('El reel necesita un video en "Archivos para publicar".');
    return { type: 'reel', files: [videos[0]] };
  }
  if (channel === 'ig_story') return { type: 'stories', files: media };
  const files = channels.includes('ig_reel') ? images : media;
  if (!files.length) throw badRequest('El post necesita al menos una imagen (el video va al reel).');
  if (files.length === 1) return { type: files[0].kind === 'video' ? 'reel' : 'image', files };
  return { type: 'carousel', files: files.slice(0, 10) };
}

const mediaParam = (f) => (f.kind === 'video' ? { video_url: f.url } : { image_url: f.url });

// publicBaseUrl: URL pública del backend, para los links firmados cuando el storage es local
export function createIgPublisher({ db, meta, files, igUserId, publicBaseUrl }) {
  async function container(params) {
    const id = await meta.createIgContainer(igUserId, params);
    await meta.waitIgContainer(id);
    return id;
  }

  // Devuelve los ids publicados (una historia por archivo; el resto, uno solo)
  async function publishPlan(plan, caption) {
    const publish = async (params) => meta.publishIgContainer(igUserId, await container(params));
    if (plan.type === 'image') return [await publish({ ...mediaParam(plan.files[0]), caption })];
    if (plan.type === 'reel') return [await publish({ media_type: 'REELS', video_url: plan.files[0].url, caption, share_to_feed: true })];
    if (plan.type === 'stories') {
      const ids = [];
      for (const f of plan.files) ids.push(await publish({ media_type: 'STORIES', ...mediaParam(f) }));
      return ids;
    }
    const children = [];
    for (const f of plan.files) {
      children.push(await container({ ...(f.kind === 'video' ? { media_type: 'VIDEO' } : {}), ...mediaParam(f), is_carousel_item: true }));
    }
    return [await publish({ media_type: 'CAROUSEL', children: children.join(','), caption })];
  }

  // Reserva el canal. Programado: solo si nunca se intentó (un fallo no se reintenta solo en loop).
  // A mano: también si falló o quedó trabado.
  async function claim(itemId, channel, userId, manual) {
    const { rows } = await db.query(
      `INSERT INTO calendar_publications (item_id, channel, status, started_by) VALUES ($1, $2, 'publishing', $3)
       ON CONFLICT (item_id, channel) DO UPDATE SET status = 'publishing', attempts = calendar_publications.attempts + 1,
         error = NULL, started_by = EXCLUDED.started_by, started_at = now()
       WHERE $4::boolean AND (calendar_publications.status = 'failed'
         OR (calendar_publications.status = 'publishing' AND calendar_publications.started_at < now() - interval '${STUCK}'))
       RETURNING *`,
      [itemId, channel, userId ?? null, manual],
    );
    return rows[0] ?? null;
  }

  const fail = (id, err) => db.query("UPDATE calendar_publications SET status = 'failed', error = $2 WHERE id = $1", [id, String(err.message || err).slice(0, 1000)]);

  async function finishItem(item) {
    const { rows } = await db.query("SELECT channel, permalink FROM calendar_publications WHERE item_id = $1 AND status = 'published' ORDER BY published_at", [item.id]);
    const done = new Set(rows.map((r) => r.channel));
    // Con TikTok u otro canal manual la pieza queda "lista": falta subirla a mano
    if (!item.channels.every((c) => done.has(c))) return;
    await db.query(
      "UPDATE calendar_items SET status = 'published', piece_url = coalesce(piece_url, $2), updated_at = now() WHERE id = $1 AND status <> 'published'",
      [item.id, rows.find((r) => r.permalink)?.permalink ?? null],
    );
  }

  async function runClaimed(item, claimed, media) {
    for (const pub of claimed) {
      try {
        const plan = planChannel(pub.channel, media, item.channels);
        const ids = await publishPlan(plan, item.copy ?? '');
        const permalink = await meta.igPermalink(ids[0]).catch(() => null);
        await db.query(
          "UPDATE calendar_publications SET status = 'published', ig_media_ids = $2, permalink = $3, error = NULL, published_at = now() WHERE id = $1",
          [pub.id, ids, permalink],
        );
      } catch (err) {
        console.error(`[ig] no se pudo publicar ${pub.channel} de ${item.id}:`, err.message);
        await fail(pub.id, err);
      }
    }
    await finishItem(item);
  }

  const itemChannels = (item) => IG_CHANNELS.filter((c) => item.channels.includes(c));
  const mediaOf = (item) => files.listPublic(['calendar_media'], [item.id], publicBaseUrl);

  // "Publicar ahora": valida antes de reservar (el error vuelve al panel) y publica en segundo plano
  async function publishNow(item, userId) {
    const channels = itemChannels(item);
    if (!channels.length) throw badRequest('Esta pieza no tiene canales de Instagram.');
    const media = await mediaOf(item);
    channels.forEach((c) => planChannel(c, media, item.channels));
    const claimed = (await Promise.all(channels.map((c) => claim(item.id, c, userId, true)))).filter(Boolean);
    if (!claimed.length) throw badRequest('Ya está publicada o publicándose en todos sus canales.');
    return { claimed, done: runClaimed(item, claimed, media) };
  }

  // Lo que ya llegó a su hora (y no se pasó demasiado): lo llama el cron cada minuto
  let running = null;
  async function runDue() {
    if (running) return running;
    running = (async () => {
      const { rows } = await db.query(
        `SELECT * FROM calendar_items
         WHERE status = 'ready' AND publish_time IS NOT NULL AND channels && $1::text[]
           AND (date::text || ' ' || publish_time)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires' <= now()
           AND (date::text || ' ' || publish_time)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires' > now() - interval '${LATE_LIMIT}'
         ORDER BY date, publish_time`,
        [IG_CHANNELS],
      );
      let n = 0;
      for (const item of rows) {
        const claimed = (await Promise.all(itemChannels(item).map((c) => claim(item.id, c, null, false)))).filter(Boolean);
        if (!claimed.length) continue;
        n += claimed.length;
        await runClaimed(item, claimed, await mediaOf(item));
      }
      return n;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  return { publishNow, runDue };
}
