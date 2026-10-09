// Cliente mínimo de la Graph API de Meta (Marketing API) para el agente de pauta.
// Mismo patrón que agente-gineza: fetch directo, un reintento ante rate limit.
const V = 'v23.0';
const RETRYABLE = new Set([4, 17, 32, 613]);

export function createMetaClient({ accessToken, accountId, fetchFn = fetch, retryDelayMs = 2000 }) {
  const BASE = `https://graph.facebook.com/${V}`;

  async function reqOnce(path, { method = 'GET', params = {}, body } = {}) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('access_token', accessToken);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    const res = await fetchFn(url, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const json = await res.json();
    if (json.error) {
      const detail = json.error.error_user_msg || (json.error.error_subcode ? `subcode ${json.error.error_subcode}` : null);
      const err = new Error(`Meta ${json.error.code}: ${json.error.message}${detail ? ` (${detail})` : ''}`);
      err.code = json.error.code;
      throw err;
    }
    return json;
  }

  async function req(path, opts) {
    try {
      return await reqOnce(path, opts);
    } catch (err) {
      if (!RETRYABLE.has(err.code)) throw err;
      await new Promise((r) => setTimeout(r, retryDelayMs));
      return reqOnce(path, opts);
    }
  }

  const FIELDS = {
    campaign: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,created_time',
    adset: 'id,name,campaign_id,status,effective_status,daily_budget,optimization_goal,destination_type,targeting,learning_stage_info,start_time,created_time',
    ad: 'id,name,adset_id,campaign_id,status,effective_status,created_time,creative{id,body,title,thumbnail_url}',
    insights: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,clicks,ctr,cpm,actions,cost_per_action_type',
  };
  const list = async (path, fields, limit = 200) => (await req(path, { params: { fields, limit: String(limit) } })).data ?? [];

  return {
    accountId,
    getCampaigns: () => list(`${accountId}/campaigns`, FIELDS.campaign),
    getAdsets: () => list(`${accountId}/adsets`, FIELDS.adset),
    getAds: () => list(`${accountId}/ads`, FIELDS.ad, 500),
    // since/until en YYYY-MM-DD (hora de la cuenta). daily=true parte por día.
    async getInsights(level, since, until, { daily = false } = {}) {
      const params = { level, fields: FIELDS.insights, time_range: { since, until }, limit: '500' };
      if (daily) params.time_increment = '1';
      return (await req(`${accountId}/insights`, { params })).data ?? [];
    },
    setStatus: (objectId, status) => req(objectId, { method: 'POST', body: { status } }),
    updateDailyBudget: (objectId, dailyBudgetCents) => req(objectId, { method: 'POST', body: { daily_budget: dailyBudgetCents } }),
    createAdset: (payload) => req(`${accountId}/adsets`, { method: 'POST', body: payload }),
    async uploadImage(buffer) {
      const json = await req(`${accountId}/adimages`, { method: 'POST', body: { bytes: buffer.toString('base64') } });
      return Object.values(json.images)[0].hash;
    },
    createCreative: (spec) => req(`${accountId}/adcreatives`, { method: 'POST', body: spec }),
    createAd: ({ name, adsetId, creativeId, status }) =>
      req(`${accountId}/ads`, { method: 'POST', body: { name, adset_id: adsetId, creative: { creative_id: creativeId }, status } }),
    async searchInterests(query) {
      // La búsqueda de segmentación NO va bajo la cuenta publicitaria
      const json = await req('search', { params: { type: 'adinterest', q: query, limit: '15' } });
      return (json.data ?? []).map((d) => ({ id: d.id, name: d.name, audienceMin: d.audience_size_lower_bound, audienceMax: d.audience_size_upper_bound }));
    },
  };
}
