import { AppError, badRequest } from '../lib/errors.js';

const NUMERIC_ID = /^\d+$/;
const KEYWORD_ID = /^\d+~\d+$/;
const MATCH = ['EXACT', 'PHRASE', 'BROAD'];
const ARGENTINA = '2032';
const SPANISH = 'languageConstants/1003';

function numericId(v, label) {
  const id = String(v ?? '').trim();
  if (!NUMERIC_ID.test(id)) throw badRequest(`Id de ${label} inválido.`);
  return id;
}
function texts(list, { min, max, maxLen, label }) {
  const out = (Array.isArray(list) ? list : []).map((t) => String(t ?? '').trim()).filter(Boolean);
  if (out.length < min || out.length > max) throw badRequest(`Hacen falta entre ${min} y ${max} ${label}.`);
  const long = out.find((t) => [...t].length > maxLen);
  if (long) throw badRequest(`"${long}" tiene ${[...long].length} caracteres: el máximo para ${label} es ${maxLen}.`);
  return out;
}
function keywordList(list, max = 30) {
  const seen = new Set();
  const out = [];
  for (const k of Array.isArray(list) ? list : []) {
    const text = String(k?.text ?? '').trim().toLowerCase();
    const matchType = MATCH.includes(k?.match_type) ? k.match_type : null;
    if (!text || !matchType) throw badRequest('Cada palabra clave necesita texto y concordancia (EXACT, PHRASE o BROAD).');
    if (text.length > 80 || text.split(/\s+/).length > 10) throw badRequest(`La palabra clave "${text}" es demasiado larga (hasta 80 caracteres y 10 palabras).`);
    const key = `${matchType}|${text}`;
    if (!seen.has(key)) { seen.add(key); out.push({ text, matchType }); }
  }
  if (!out.length || out.length > max) throw badRequest(`Hacen falta entre 1 y ${max} palabras clave.`);
  return out;
}
const pesosToMicros = (ars, label) => {
  const v = Math.round(Number(ars));
  if (!Number.isFinite(v) || v <= 0) throw badRequest(`${label} tiene que ser un monto en pesos mayor a 0.`);
  return String(v * 1e6);
};

// El destino tiene que ser la web de Uniformar (https)
export function landingUrl(url, allowedHost) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { throw badRequest('El link del anuncio no es válido.'); }
  const host = u.hostname.replace(/^www\./, '');
  if (u.protocol !== 'https:' || host !== allowedHost) throw badRequest(`El anuncio tiene que llevar a https://${allowedHost}/.`);
  return u.toString();
}

// Ejecuta (o valida, con validateOnly) una acción sobre Google Ads
export function createGoogleExecutor({ gads, landingHost = 'uniformar.ar' }) {
  const C = `customers/${gads.customerId}`;
  const rsa = (adGroup, { headlines, descriptions, final_url: url }) => ({
    adGroupAdOperation: {
      create: {
        adGroup, status: 'ENABLED',
        ad: {
          finalUrls: [landingUrl(url, landingHost)],
          responsiveSearchAd: {
            headlines: texts(headlines, { min: 3, max: 15, maxLen: 30, label: 'títulos' }).map((text) => ({ text })),
            descriptions: texts(descriptions, { min: 2, max: 4, maxLen: 90, label: 'descripciones' }).map((text) => ({ text })),
          },
        },
      },
    },
  });
  const keywordOps = (adGroup, list) => keywordList(list).map((keyword) => ({ adGroupCriterionOperation: { create: { adGroup, status: 'ENABLED', keyword } } }));

  // Campaña de búsqueda completa en un solo pedido atómico: si algo falla no queda nada a medias
  function campaignOps(input) {
    const groups = Array.isArray(input.ad_groups) ? input.ad_groups : [];
    if (!groups.length || groups.length > 6) throw badRequest('La campaña necesita entre 1 y 6 grupos de anuncios.');
    const name = String(input.name ?? '').trim().slice(0, 120);
    if (!name) throw badRequest('Falta el nombre de la campaña.');
    const strategy = input.bidding?.strategy;
    let bidding;
    if (strategy === 'MAXIMIZE_CLICKS') {
      bidding = { targetSpend: input.bidding.max_cpc_ars ? { cpcBidCeilingMicros: pesosToMicros(input.bidding.max_cpc_ars, 'El tope de CPC') } : {} };
    } else if (strategy === 'MAXIMIZE_CONVERSIONS') {
      bidding = { maximizeConversions: {} };
    } else {
      throw badRequest('Estrategia de puja inválida: MAXIMIZE_CLICKS o MAXIMIZE_CONVERSIONS.');
    }
    const locations = (input.location_ids?.length ? input.location_ids : [ARGENTINA]).map((id) => numericId(id, 'ubicación'));
    const negatives = [...new Set((input.negative_keywords ?? []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 50);

    const budget = `${C}/campaignBudgets/-1`;
    const campaign = `${C}/campaigns/-2`;
    const ops = [
      { campaignBudgetOperation: { create: { resourceName: budget, name: `${name} · presupuesto`, amountMicros: pesosToMicros(input.daily_budget_ars, 'El presupuesto diario'), deliveryMethod: 'STANDARD', explicitlyShared: false } } },
      {
        campaignOperation: {
          create: {
            resourceName: campaign, name, status: 'ENABLED', advertisingChannelType: 'SEARCH', campaignBudget: budget, ...bidding,
            containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
            networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
            geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
          },
        },
      },
      ...locations.map((id) => ({ campaignCriterionOperation: { create: { campaign, location: { geoTargetConstant: `geoTargetConstants/${id}` } } } })),
      { campaignCriterionOperation: { create: { campaign, language: { languageConstant: SPANISH } } } },
      ...negatives.map((text) => ({ campaignCriterionOperation: { create: { campaign, negative: true, keyword: { text, matchType: 'BROAD' } } } })),
    ];
    groups.forEach((g, i) => {
      const adGroup = `${C}/adGroups/-${10 + i}`;
      const gname = String(g.name ?? '').trim().slice(0, 120);
      if (!gname) throw badRequest('Cada grupo necesita un nombre.');
      ops.push({ adGroupOperation: { create: { resourceName: adGroup, name: gname, campaign, status: 'ENABLED', type: 'SEARCH_STANDARD' } } });
      ops.push(...keywordOps(adGroup, g.keywords));
      ops.push(rsa(adGroup, g));
    });
    return ops;
  }

  // Recursos de campaña: cada recurso se crea y se vincula a la campaña en el mismo pedido (ids temporales)
  function assetOps(input) {
    const campaign = `${C}/campaigns/${numericId(input.campaign_id, 'campaña')}`;
    const ops = [];
    let tmp = -100;
    const link = (asset, fieldType) => {
      const resourceName = `${C}/assets/${tmp--}`;
      ops.push({ assetOperation: { create: { resourceName, ...asset } } });
      ops.push({ campaignAssetOperation: { create: { campaign, asset: resourceName, fieldType } } });
    };
    const len = (v, max, label) => {
      const s = String(v ?? '').trim();
      if (!s) throw badRequest(`Falta el texto de ${label}.`);
      if ([...s].length > max) throw badRequest(`"${s}" tiene ${[...s].length} caracteres: el máximo para ${label} es ${max}.`);
      return s;
    };
    for (const sl of input.sitelinks ?? []) {
      const d1 = String(sl.description1 ?? '').trim();
      const d2 = String(sl.description2 ?? '').trim();
      if (Boolean(d1) !== Boolean(d2)) throw badRequest(`El vínculo "${sl.text}" necesita las dos descripciones o ninguna.`);
      link({
        finalUrls: [landingUrl(sl.url, landingHost)],
        sitelinkAsset: { linkText: len(sl.text, 25, 'un vínculo'), ...(d1 ? { description1: len(d1, 35, 'una descripción de vínculo'), description2: len(d2, 35, 'una descripción de vínculo') } : {}) },
      }, 'SITELINK');
    }
    for (const c of [...new Set((input.callouts ?? []).map((x) => String(x).trim()).filter(Boolean))]) {
      link({ calloutAsset: { calloutText: len(c, 25, 'un texto destacado') } }, 'CALLOUT');
    }
    if (input.structured_snippet) {
      const values = texts(input.structured_snippet.values, { min: 3, max: 10, maxLen: 25, label: 'valores del fragmento' });
      link({ structuredSnippetAsset: { header: String(input.structured_snippet.header), values } }, 'STRUCTURED_SNIPPET');
    }
    // Imágenes: la API de Google no deja vincular AD_IMAGE (UNSUPPORTED_FIELD_TYPE en campaña, grupo y cuenta);
    // se cargan a mano en Google Ads desde la biblioteca del panel.
    if (!ops.length) throw badRequest('No hay recursos para agregar.');
    return ops;
  }

  function opsFor(tool, input) {
    switch (tool) {
      case 'propose_search_campaign':
        return campaignOps(input);
      case 'add_keywords':
        return keywordOps(`${C}/adGroups/${numericId(input.ad_group_id, 'grupo')}`, input.keywords);
      case 'propose_search_ad':
        return [rsa(`${C}/adGroups/${numericId(input.ad_group_id, 'grupo')}`, input)];
      case 'add_negative_keywords': {
        if (!MATCH.includes(input.match_type)) throw badRequest('Concordancia inválida.');
        const list = [...new Set(texts(input.keywords, { min: 1, max: 20, maxLen: 80, label: 'palabras negativas' }).map((k) => k.toLowerCase()))];
        const keyword = (text) => ({ text, matchType: input.match_type });
        if (input.level === 'campaign') {
          const campaign = `${C}/campaigns/${numericId(input.target_id, 'campaña')}`;
          return list.map((text) => ({ campaignCriterionOperation: { create: { campaign, negative: true, keyword: keyword(text) } } }));
        }
        if (input.level === 'ad_group') {
          const adGroup = `${C}/adGroups/${numericId(input.target_id, 'grupo')}`;
          return list.map((text) => ({ adGroupCriterionOperation: { create: { adGroup, negative: true, keyword: keyword(text) } } }));
        }
        throw badRequest(`Nivel inválido: ${input.level}`);
      }
      case 'set_status': {
        if (!['ENABLED', 'PAUSED'].includes(input.status)) throw badRequest('Estado inválido.');
        const id = String(input.object_id ?? '').trim();
        if (input.level === 'campaign') return [{ campaignOperation: { update: { resourceName: `${C}/campaigns/${numericId(id, 'campaña')}`, status: input.status }, updateMask: 'status' } }];
        if (input.level === 'ad_group') return [{ adGroupOperation: { update: { resourceName: `${C}/adGroups/${numericId(id, 'grupo')}`, status: input.status }, updateMask: 'status' } }];
        if (input.level === 'keyword') {
          if (!KEYWORD_ID.test(id)) throw badRequest('Id de palabra clave inválido.');
          return [{ adGroupCriterionOperation: { update: { resourceName: `${C}/adGroupCriteria/${id}`, status: input.status }, updateMask: 'status' } }];
        }
        throw badRequest(`Nivel inválido: ${input.level}`);
      }
      default:
        return null;
    }
  }

  async function setBudget({ campaign_id: campaignId, proposed_budget_ars: ars }, { validateOnly }) {
    const id = numericId(campaignId, 'campaña');
    const amountMicros = pesosToMicros(ars, 'El presupuesto propuesto');
    const rows = await gads.search(`SELECT campaign.id, campaign.campaign_budget, campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = ${id}`);
    const row = rows[0];
    if (!row?.campaign?.campaignBudget) throw new AppError(404, 'NOT_FOUND', `No encontré la campaña ${id} en Google Ads.`);
    if (row.campaignBudget?.explicitlyShared === true) throw new AppError(409, 'CONFLICT', 'La campaña usa un presupuesto compartido: cambialo a mano en Google Ads.');
    await gads.mutateAll([{ campaignBudgetOperation: { update: { resourceName: row.campaign.campaignBudget, amountMicros }, updateMask: 'amount_micros' } }], { validateOnly });
    return { [id]: Math.round(Number(ars)) };
  }

  async function run(tool, input = {}, { validateOnly = false } = {}) {
    if (tool === 'propose_budget_change') return setBudget(input, { validateOnly });
    const ops = tool === 'propose_assets' ? await assetOps(input) : opsFor(tool, input);
    if (!ops) throw new Error(`Acción desconocida: ${tool}`);
    const res = await gads.mutateAll(ops, { validateOnly });
    if (validateOnly) return { valid: true };
    const created = res.map((r) => Object.values(r)[0]?.resourceName).filter(Boolean);
    if (tool === 'propose_search_campaign') {
      const campaign = created.find((rn) => rn.includes('/campaigns/'));
      return { campaign_id: campaign?.split('/').pop() ?? null, status: 'ENABLED', created: created.length };
    }
    if (tool === 'propose_assets') return { created: created.filter((rn) => rn.includes('/assets/')).length };
    return { created: created.length, resources: created.slice(0, 30) };
  }

  const execute = (tool, input) => run(tool, input);
  execute.validate = (tool, input) => run(tool, input, { validateOnly: true });
  return execute;
}
