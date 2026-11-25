import { describe, it, expect } from 'vitest';
import { buildGoogleSnapshot } from '../src/gads/snapshot.js';

// Imita lo que respondió Google en producción para campaign_asset: todo campo filtrado en
// WHERE tiene que estar también en el SELECT (si no, 400 y la campaña parecía sin recursos).
function strictSearch(rowsFor) {
  return async (q) => {
    if (!q.includes('FROM campaign_asset')) return rowsFor(q);
    const [, select = '', where = ''] = q.match(/SELECT([\s\S]*?)FROM[\s\S]*?(?:WHERE([\s\S]*))?$/) || [];
    for (const f of where.match(/\b[a-z_]+\.[a-z_.]+/g) || []) {
      if (f.startsWith('segments.') || f.startsWith('metrics.')) continue;
      if (!select.includes(f)) throw new Error(`Google Ads 400: The following field must be present in SELECT clause: '${f}'.`);
    }
    return rowsFor(q);
  };
}

const assetRows = [
  { campaign: { id: '11', status: 'ENABLED' }, campaignAsset: { fieldType: 'SITELINK', status: 'ENABLED', primaryStatus: 'ELIGIBLE' }, asset: { sitelinkAsset: { linkText: 'Catálogo de prendas' } } },
  { campaign: { id: '11', status: 'ENABLED' }, campaignAsset: { fieldType: 'CALLOUT', status: 'ENABLED', primaryStatus: 'NOT_ELIGIBLE', primaryStatusReasons: ['ASSET_DISAPPROVED'] }, asset: { calloutAsset: { calloutText: 'Envío gratis al país' } } },
  { campaign: { id: '11', status: 'ENABLED' }, campaignAsset: { fieldType: 'STRUCTURED_SNIPPET', status: 'ENABLED' }, asset: { structuredSnippetAsset: { header: 'Tipos' } } },
];

describe('buildGoogleSnapshot: recursos de la campaña', () => {
  it('lee los vínculos, destacados y fragmentos vinculados a la campaña', async () => {
    const gads = { search: strictSearch((q) => (q.includes('FROM campaign_asset') ? assetRows : [])) };
    const snap = await buildGoogleSnapshot(gads, { now: new Date('2026-11-25T15:00:00Z') });
    expect(snap.assetsError).toBeNull();
    expect(snap.assets).toEqual([
      { campaignId: '11', type: 'SITELINK', status: 'ENABLED', approval: 'ELIGIBLE', approvalReasons: [], text: 'Catálogo de prendas' },
      { campaignId: '11', type: 'CALLOUT', status: 'ENABLED', approval: 'NOT_ELIGIBLE', approvalReasons: ['ASSET_DISAPPROVED'], text: 'Envío gratis al país' },
      { campaignId: '11', type: 'STRUCTURED_SNIPPET', status: 'ENABLED', approval: null, approvalReasons: [], text: 'Tipos' },
    ]);
  });

  it('si la consulta falla no dice "sin recursos": deja assets en null y el error a la vista', async () => {
    const gads = {
      search: async (q) => {
        if (q.includes('FROM campaign_asset')) throw new Error('Google Ads 400: algo');
        return [];
      },
    };
    const snap = await buildGoogleSnapshot(gads, { now: new Date('2026-11-25T15:00:00Z') });
    expect(snap.assets).toBeNull();
    expect(snap.assetsError).toMatch(/Google Ads 400/);
  });
});
