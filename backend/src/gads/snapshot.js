import { artDate, addDays } from '../ads/metrics.js';

// La API devuelve int64 como string y doubles como number: todo pasa a Number
export const num = (v) => (v == null || v === '' ? 0 : Number(v));
// cost_micros → pesos redondeados
export const pesos = (micros) => Math.round(num(micros) / 1e6);

// Literal seguro para GAQL (fechas e ids; si llega una comilla se rechaza)
export function lit(v) {
  const s = String(v);
  if (/['\\]/.test(s)) throw new Error(`Valor inválido para GAQL: ${s}`);
  return `'${s}'`;
}
const between = (from, to) => `segments.date BETWEEN ${lit(from)} AND ${lit(to)}`;

// Métricas de Uniformar en Google: el resultado son las consultas (conversiones primarias:
// clic a WhatsApp y formulario Cotizá de la web), no las compras.
const empty = () => ({ costMicros: 0, clicks: 0, impressions: 0, conversions: 0 });
function add(raw, m = {}) {
  raw.costMicros += num(m.costMicros);
  raw.clicks += num(m.clicks);
  raw.impressions += num(m.impressions);
  raw.conversions += num(m.conversions);
  return raw;
}
export function summarize(raw = empty()) {
  const spend = pesos(raw.costMicros);
  const leads = Math.round(raw.conversions * 100) / 100;
  return {
    spend, clicks: raw.clicks, impressions: raw.impressions, leads,
    ctr: raw.impressions ? Math.round((raw.clicks / raw.impressions) * 10000) / 100 : null,
    cpc: raw.clicks ? Math.round(spend / raw.clicks) : null,
    costPerLead: leads > 0 ? Math.round(spend / leads) : null,
  };
}
const bucketOf = (map, key) => {
  if (!map.has(key)) map.set(key, empty());
  return map.get(key);
};
const idOf = (rn) => (rn ? String(rn).split('/').pop() : null);

// Foto de la cuenta: estructura en vivo + métricas (7 días, 7 anteriores, hoy, mes). 10 consultas.
export async function buildGoogleSnapshot(gads, { now = new Date() } = {}) {
  const today = artDate(now);
  const w7 = { from: addDays(today, -6), to: today };
  const prev = { from: addDays(today, -13), to: addDays(today, -7) };
  const d14 = { from: addDays(today, -13), to: today };
  const monthFrom = `${today.slice(0, 7)}-01`;
  const wide = { from: monthFrom < d14.from ? monthFrom : d14.from, to: today };

  const [campaignRows, campaignDaily, adGroupRows, adGroupMetrics, keywordRows, keywordMetrics, termRows, adRows, conversionRows, assetRows] = await Promise.all([
    gads.search(`SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.advertising_channel_type,
  campaign.bidding_strategy_type, campaign.campaign_budget, campaign_budget.amount_micros
FROM campaign WHERE campaign.status != 'REMOVED'`),
    gads.search(`SELECT campaign.id, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
FROM campaign WHERE ${between(wide.from, wide.to)}`),
    gads.search(`SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id
FROM ad_group WHERE ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'`),
    gads.search(`SELECT ad_group.id, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
FROM ad_group WHERE ${between(w7.from, w7.to)}`),
    gads.search(`SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type, ad_group_criterion.status
FROM keyword_view
WHERE ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'`),
    gads.search(`SELECT ad_group.id, ad_group_criterion.criterion_id, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
FROM keyword_view WHERE ad_group_criterion.negative = FALSE AND ${between(w7.from, w7.to)}`),
    gads.search(`SELECT search_term_view.search_term, campaign.id, ad_group.id, metrics.cost_micros, metrics.clicks, metrics.conversions
FROM search_term_view WHERE ${between(d14.from, d14.to)} AND metrics.impressions > 0
ORDER BY metrics.cost_micros DESC LIMIT 300`),
    gads.search(`SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status,
  ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.final_urls
FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND campaign.status != 'REMOVED'`),
    gads.search(`SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.status,
  conversion_action.primary_for_goal
FROM conversion_action WHERE conversion_action.status = 'ENABLED'`),
    gads.search(`SELECT campaign.id, campaign_asset.field_type, campaign_asset.status, asset.id, asset.sitelink_asset.link_text,
  asset.callout_asset.callout_text, asset.structured_snippet_asset.header, asset.name
FROM campaign_asset WHERE campaign_asset.status != 'REMOVED' AND campaign.status != 'REMOVED'`).catch(() => []),
  ]);

  const inRange = (d, r) => d >= r.from && d <= r.to;
  const c7 = new Map(); const cPrev = new Map();
  const todayRaw = empty(); const monthRaw = empty(); const last7 = empty();
  for (const r of campaignDaily) {
    const id = String(r.campaign?.id);
    const d = r.segments?.date;
    if (inRange(d, w7)) { add(bucketOf(c7, id), r.metrics); add(last7, r.metrics); }
    if (inRange(d, prev)) add(bucketOf(cPrev, id), r.metrics);
    if (d === today) add(todayRaw, r.metrics);
    if (d >= monthFrom) add(monthRaw, r.metrics);
  }

  const campaigns = campaignRows.map((r) => {
    const c = r.campaign || {};
    const id = String(c.id);
    return {
      id, name: c.name, status: c.status, primaryStatus: c.primaryStatus ?? null, channel: c.advertisingChannelType,
      bidding: c.biddingStrategyType, budgetId: idOf(c.campaignBudget),
      dailyBudgetArs: r.campaignBudget?.amountMicros != null ? pesos(r.campaignBudget.amountMicros) : null,
      last7d: summarize(c7.get(id)), prev7d: summarize(cPrev.get(id)),
    };
  }).sort((a, b) => b.last7d.spend - a.last7d.spend || String(a.name).localeCompare(String(b.name)));

  const ag7 = new Map();
  for (const r of adGroupMetrics) add(bucketOf(ag7, String(r.adGroup?.id)), r.metrics);
  const adGroups = adGroupRows.map((r) => ({
    id: String(r.adGroup?.id), name: r.adGroup?.name, status: r.adGroup?.status, campaignId: String(r.campaign?.id),
    last7d: summarize(ag7.get(String(r.adGroup?.id))),
  }));

  const kwId = (r) => `${r.adGroup?.id}~${r.adGroupCriterion?.criterionId}`;
  const kw7 = new Map();
  for (const r of keywordMetrics) add(bucketOf(kw7, kwId(r)), r.metrics);
  const keywords = keywordRows.map((r) => ({
    id: kwId(r), text: r.adGroupCriterion?.keyword?.text, matchType: r.adGroupCriterion?.keyword?.matchType,
    status: r.adGroupCriterion?.status, adGroupId: String(r.adGroup?.id), campaignId: String(r.campaign?.id),
    last7d: summarize(kw7.get(kwId(r))),
  })).sort((a, b) => b.last7d.spend - a.last7d.spend);

  // Términos de búsqueda reales (14 días): de acá salen las negativas y las palabras nuevas
  const terms = new Map();
  for (const r of termRows) {
    const k = `${r.adGroup?.id}|${r.searchTermView?.searchTerm}`;
    const t = terms.get(k) ?? { term: r.searchTermView?.searchTerm, campaignId: String(r.campaign?.id), adGroupId: String(r.adGroup?.id), raw: empty() };
    add(t.raw, r.metrics);
    terms.set(k, t);
  }
  const searchTerms = [...terms.values()]
    .map((t) => ({ term: t.term, campaignId: t.campaignId, adGroupId: t.adGroupId, ...summarize(t.raw) }))
    .sort((a, b) => b.spend - a.spend || b.clicks - a.clicks)
    .slice(0, 80);

  const ads = adRows.map((r) => {
    const a = r.adGroupAd || {};
    return {
      id: String(a.ad?.id), adGroupId: String(r.adGroup?.id), status: a.status, approval: a.policySummary?.approvalStatus ?? null,
      headlines: (a.ad?.responsiveSearchAd?.headlines ?? []).map((h) => h.text).slice(0, 15), finalUrl: a.ad?.finalUrls?.[0] ?? null,
    };
  });

  const conversionActions = conversionRows.map((r) => ({
    id: String(r.conversionAction?.id), name: r.conversionAction?.name, category: r.conversionAction?.category,
    primary: r.conversionAction?.primaryForGoal ?? null,
  }));

  // Recursos ya vinculados (vínculos, destacados, fragmentos, imágenes) para no repetirlos
  const assets = assetRows.map((r) => ({
    campaignId: String(r.campaign?.id), type: r.campaignAsset?.fieldType, status: r.campaignAsset?.status,
    text: r.asset?.sitelinkAsset?.linkText ?? r.asset?.calloutAsset?.calloutText ?? r.asset?.structuredSnippetAsset?.header ?? r.asset?.name ?? null,
  }));

  return {
    generatedAt: new Date(now).toISOString(),
    today,
    spendToday: pesos(todayRaw.costMicros),
    month: summarize(monthRaw),
    last7d: summarize(last7),
    campaigns, adGroups, keywords, ads, searchTerms, conversionActions, assets,
  };
}
