import { addDays, artDate, daysBetween, summarizeRow, totals } from './metrics.js';

// Reporte de un período: todos los números salen de Meta calculados acá. El agente después
// los interpreta (reportAnalysis.js) pero no produce ninguna cifra.

const BREAKDOWNS = {
  placement: 'publisher_platform,platform_position',
  age: 'age',
  gender: 'gender',
  region: 'region',
  hour: 'hourly_stats_aggregated_by_advertiser_time_zone',
};
const PLATFORM = { facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads' };
const POSITION = {
  feed: 'feed', story: 'historias', instagram_stories: 'historias', facebook_stories: 'historias', instagram_reels: 'reels',
  facebook_reels: 'reels', reels: 'reels', explore: 'explorar', instagram_explore: 'explorar', instagram_explore_grid_home: 'explorar',
  marketplace: 'marketplace', video_feeds: 'videos', search: 'búsqueda', right_hand_column: 'columna derecha',
  instream_video: 'videos in-stream', facebook_reels_overlay: 'reels (overlay)', profile_feed: 'perfil', instagram_profile_feed: 'perfil',
};
const GENDER = { male: 'Hombres', female: 'Mujeres', unknown: 'Sin dato' };

const breakdownLabel = {
  placement: (r) => `${PLATFORM[r.publisher_platform] ?? r.publisher_platform} · ${POSITION[r.platform_position] ?? r.platform_position?.replaceAll('_', ' ')}`,
  age: (r) => r.age,
  gender: (r) => GENDER[r.gender] ?? r.gender,
  region: (r) => r.region,
  hour: (r) => `${r.hourly_stats_aggregated_by_advertiser_time_zone?.slice(0, 2)} h`,
};

// Agrupa por etiqueta (Meta puede devolver la misma ubicación en dos filas) y ordena por resultado
export function groupBreakdown(kind, rows) {
  const groups = new Map();
  for (const r of rows) {
    const label = breakdownLabel[kind](r);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(r);
  }
  const list = [...groups].map(([label, rs]) => {
    const t = totals(rs);
    return { label, spend: t.spend, impressions: t.impressions, clicks: t.clicks, conversations: t.conversations, costPerConversation: t.costPerConversation };
  });
  if (kind === 'hour' || kind === 'age') return list.sort((a, b) => a.label.localeCompare(b.label));
  return list.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);
}

// Mejores: los que traen conversaciones al menor costo. Peores: los que gastaron al menos lo que
// cuesta una conversación promedio y rinden peor (o no trajeron ninguna).
export function rank(items, avgCost, n = 3) {
  const best = items.filter((i) => i.conversations > 0 && (avgCost == null || i.costPerConversation <= avgCost))
    .sort((a, b) => a.costPerConversation - b.costPerConversation || b.conversations - a.conversations)
    .slice(0, n);
  const bestIds = new Set(best.map((i) => i.id));
  const cost = (i) => (i.conversations > 0 ? i.costPerConversation : Infinity);
  const worst = items.filter((i) => !bestIds.has(i.id) && i.spend > 0 && i.spend >= (avgCost ?? 0))
    .filter((i) => avgCost == null || cost(i) > avgCost)
    .sort((a, b) => cost(b) - cost(a) || b.spend - a.spend)
    .slice(0, n);
  return { best, worst };
}

function fillDays(since, until, rows) {
  const byDate = new Map(rows.map((r) => [r.date_start, summarizeRow(r)]));
  const out = [];
  for (let d = since; d <= until; d = addDays(d, 1)) {
    const s = byDate.get(d);
    out.push({ date: d, spend: s?.spend ?? 0, conversations: s?.conversations ?? 0 });
  }
  return out;
}

const windowTotals = (days, from, to) => {
  const ds = days.filter((d) => d.date >= from && d.date <= to);
  const spend = ds.reduce((a, d) => a + d.spend, 0);
  const conversations = ds.reduce((a, d) => a + d.conversations, 0);
  return { days: ds.length, spend, conversations, costPerConversation: conversations > 0 ? Math.round(spend / conversations) : null };
};

// Sobre qué conjunto actuó la decisión (si fue sobre un conjunto que tiene datos); si no, se mide la cuenta
function decisionAdset(d, adsetSeries) {
  const ids = [d.input?.adset_id, d.input?.object_id, d.result?.adset_id].filter(Boolean);
  return ids.find((id) => adsetSeries.has(id)) ?? null;
}

// Antes y después de cada acción ejecutada en el período: 7 días previos contra los días siguientes
// (hasta 7). Los números son de Meta; el texto "outcome" es la lectura que dejó el agente.
export function decisionImpact(decisions, { accountDays, adsetSeries, adsetNames, today }) {
  return decisions.map((d) => {
    const date = artDate(new Date(d.decided_at ?? d.created_at));
    const adsetId = decisionAdset(d, adsetSeries);
    const series = adsetId ? adsetSeries.get(adsetId) : accountDays;
    const afterEnd = addDays(date, 6) < today ? addDays(date, 6) : today;
    return {
      id: d.id, title: d.title, tool: d.tool, date, byAgent: Boolean(d.run_id), decidedBy: d.decided_by_name ?? null, outcome: d.outcome ?? null,
      scope: adsetId ? `Conjunto ${adsetNames.get(adsetId) ?? adsetId}` : 'Toda la cuenta',
      before: windowTotals(series, addDays(date, -7), addDays(date, -1)),
      // el día de la acción no cuenta: el cambio entra a mitad de día
      after: date < today ? windowTotals(series, addDays(date, 1), afterEnd) : null,
    };
  });
}

const TYPE_LABEL = { reel: 'Reels', post: 'Posts', carousel: 'Carruseles' };

function organicTotals(posts) {
  const withReach = posts.filter((p) => p.reach != null);
  const sum = (list, k) => list.reduce((a, p) => a + (p[k] ?? 0), 0);
  return {
    posts: posts.length, likes: sum(posts, 'likes'), comments: sum(posts, 'comments'),
    // alcance solo de los que lo tienen (sin instagram_manage_insights viene null)
    reach: withReach.length ? sum(withReach, 'reach') : null,
    avgReach: withReach.length ? Math.round(sum(withReach, 'reach') / withReach.length) : null,
  };
}

// Orgánico de Instagram del período: posts publicados en esas fechas, comparados con el período anterior
export function organicSummary(posts, { since, until }, previousRange) {
  const inRange = (r) => (p) => {
    const d = artDate(new Date(p.timestamp));
    return d >= r.since && d <= r.until;
  };
  const current = posts.filter(inRange({ since, until }));
  const engagement = (p) => p.likes + p.comments;
  const byType = Object.entries(TYPE_LABEL).map(([type, label]) => {
    const list = current.filter((p) => p.type === type);
    return { type, label, ...organicTotals(list), avgEngagement: list.length ? Math.round(list.reduce((a, p) => a + engagement(p), 0) / list.length) : null };
  }).filter((t) => t.posts > 0);
  return {
    current: organicTotals(current),
    previous: organicTotals(posts.filter(inRange(previousRange))),
    byType,
    top: [...current].sort((a, b) => engagement(b) - engagement(a) || (b.reach ?? 0) - (a.reach ?? 0)).slice(0, 5).map((p) => ({
      id: p.id, type: p.type, caption: p.caption.slice(0, 140), thumbnail: p.thumbnail, permalink: p.permalink, date: artDate(new Date(p.timestamp)),
      likes: p.likes, comments: p.comments, reach: p.reach,
      engagementRate: p.reach ? Number(((engagement(p) / p.reach) * 100).toFixed(1)) : null,
    })),
  };
}

export async function buildReport(meta, { since, until }, { decisions = [], igUserId, now = new Date() } = {}) {
  const today = artDate(now);
  const days = daysBetween(since, until);
  const prevUntil = addDays(since, -1);
  const prevSince = addDays(since, -days);
  // Para medir las acciones hacen falta 7 días antes de la primera
  const executed = decisions.filter((d) => d.status === 'executed' && artDate(new Date(d.decided_at ?? d.created_at)) >= since
    && artDate(new Date(d.decided_at ?? d.created_at)) <= until).slice(0, 20);
  const impactSince = executed.reduce((min, d) => {
    const from = addDays(artDate(new Date(d.decided_at ?? d.created_at)), -7);
    return from < min ? from : min;
  }, since);

  const [current, previous, impactDays, impactAdsetDays, byAd, byAdset, ads] = await Promise.all([
    meta.getInsights('account', since, until),
    meta.getInsights('account', prevSince, prevUntil),
    meta.getInsights('account', impactSince, today, { daily: true }),
    executed.length ? meta.getInsights('adset', impactSince, today, { daily: true }) : [],
    meta.getInsights('ad', since, until),
    meta.getInsights('adset', since, until),
    meta.getAds(),
  ]);
  // Si Instagram falla (permisos), el resto del reporte sale igual
  let organic = null;
  if (igUserId && meta.getIgMedia) {
    try {
      organic = organicSummary(await meta.getIgMedia(igUserId, 50), { since, until }, { since: prevSince, until: prevUntil });
    } catch (err) {
      organic = { error: String(err.message || err) };
    }
  }
  // Un desglose que Meta no da no tira el reporte entero
  const breakdowns = Object.fromEntries(await Promise.all(Object.entries(BREAKDOWNS).map(async ([kind, b]) => {
    try {
      return [kind, groupBreakdown(kind, await meta.getInsights('account', since, until, { breakdowns: b }))];
    } catch (err) {
      return [kind, { error: String(err.message || err) }];
    }
  })));

  const cur = summarizeRow(current[0] ?? {});
  const adInfo = new Map(ads.map((a) => [a.id, a]));
  const adItems = byAd.map((r) => ({
    ...summarizeRow(r), id: r.ad_id, name: r.ad_name, adset: r.adset_name,
    thumbnail: adInfo.get(r.ad_id)?.creative?.thumbnail_url ?? null, status: adInfo.get(r.ad_id)?.effective_status ?? null,
  }));
  const adsetItems = byAdset.map((r) => ({ ...summarizeRow(r), id: r.adset_id, name: r.adset_name, campaign: r.campaign_name }));

  const adsetSeries = new Map();
  const adsetNames = new Map();
  for (const r of impactAdsetDays) {
    if (!adsetSeries.has(r.adset_id)) adsetSeries.set(r.adset_id, []);
    adsetSeries.get(r.adset_id).push(r);
    adsetNames.set(r.adset_id, r.adset_name);
  }
  for (const [id, rows] of adsetSeries) adsetSeries.set(id, fillDays(impactSince, today, rows));
  const accountDays = fillDays(impactSince, today, impactDays);

  return {
    generatedAt: now.toISOString(),
    range: { since, until, days },
    previousRange: { since: prevSince, until: prevUntil },
    totals: { current: cur, previous: summarizeRow(previous[0] ?? {}) },
    daily: accountDays.filter((d) => d.date >= since && d.date <= until),
    ads: { ...rank(adItems, cur.costPerConversation), count: adItems.length },
    adsets: { ...rank(adsetItems, cur.costPerConversation), all: adsetItems.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend) },
    breakdowns,
    actions: decisionImpact(executed, { accountDays, adsetSeries, adsetNames, today }),
    organic,
  };
}
