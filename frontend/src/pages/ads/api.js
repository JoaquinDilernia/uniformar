import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { uploadFile } from '../../lib/upload.js';

export const adsKeys = {
  overview: ['ads', 'overview'], runs: ['ads', 'runs'], decisions: ['ads', 'decisions'], creatives: ['ads', 'creatives'],
  requests: ['ads', 'requests'], learnings: ['ads', 'learnings'],
};

function useRefreshAds() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['ads'] });
}

// Mientras el agente analiza, el resumen se vuelve a pedir solo cada 5 s
export const useAdsOverview = () => useQuery({
  queryKey: adsKeys.overview,
  queryFn: () => api.get('/ads/overview'),
  refetchInterval: (q) => (q.state.data?.lastRun?.status === 'running' ? 5000 : false),
});
export const useRuns = () => useQuery({ queryKey: adsKeys.runs, queryFn: () => api.get('/ads/runs').then((r) => r.runs) });
export const useDecisions = () => useQuery({ queryKey: adsKeys.decisions, queryFn: () => api.get('/ads/decisions').then((r) => r.decisions) });
export const useCreatives = () => useQuery({ queryKey: adsKeys.creatives, queryFn: () => api.get('/ads/creatives').then((r) => r.creatives) });
export const useRequests = () => useQuery({ queryKey: adsKeys.requests, queryFn: () => api.get('/ads/requests').then((r) => r.requests) });
export const useLearnings = () => useQuery({ queryKey: adsKeys.learnings, queryFn: () => api.get('/ads/learnings').then((r) => r.learnings) });

export function useRefreshMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.get('/ads/overview?refresh=1'),
    meta: { success: false },
    onSuccess: (data) => qc.setQueryData(adsKeys.overview, data),
  });
}

export function useStartRun() {
  const refresh = useRefreshAds();
  return useMutation({ mutationFn: () => api.post('/ads/runs'), meta: { success: 'El agente arrancó a analizar. Tarda unos minutos.' }, onSettled: refresh });
}

export function useDecide() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: ({ id, approve }) => api.post(`/ads/decisions/${id}/${approve ? 'approve' : 'reject'}`).then((r) => r.decision),
    meta: { success: false },
    onSettled: refresh,
  });
}

export function useSetStatus() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: ({ id, level, status, name }) => api.post(`/ads/objects/${id}/status`, { level, status, name }),
    meta: { success: 'Listo ✓' },
    onSettled: refresh,
  });
}

export function useCreateCreative() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: async ({ feed, story, ...body }) => {
      const creative = (await api.post('/ads/creatives', body)).creative;
      try {
        await uploadFile({ ownerType: 'ad_feed', ownerId: creative.id, file: feed, kind: 'raw' });
        if (story) await uploadFile({ ownerType: 'ad_story', ownerId: creative.id, file: story, kind: 'raw' });
      } catch (err) {
        await api.patch(`/ads/creatives/${creative.id}`, { status: 'archived' }).catch(() => {});
        throw err;
      }
      return creative;
    },
    meta: { success: 'Pieza cargada ✓' },
    onSettled: refresh,
  });
}

export function useArchiveCreative() {
  const refresh = useRefreshAds();
  return useMutation({ mutationFn: (id) => api.patch(`/ads/creatives/${id}`, { status: 'archived' }), meta: { success: 'Pieza archivada' }, onSettled: refresh });
}

export function usePublishCreative() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: ({ id, adset_id, adset_name }) => api.post(`/ads/creatives/${id}/publish`, { adset_id, adset_name }),
    meta: { success: 'Anuncio publicado en Meta ✓' },
    onSettled: refresh,
  });
}

export function useCloseRequest() {
  const refresh = useRefreshAds();
  return useMutation({ mutationFn: (id) => api.post(`/ads/requests/${id}/done`), meta: { success: 'Pedido cerrado' }, onSettled: refresh });
}

export function useDeleteLearning() {
  const refresh = useRefreshAds();
  return useMutation({ mutationFn: (id) => api.del(`/ads/learnings/${id}`), meta: { success: 'Aprendizaje borrado' }, onSettled: refresh });
}

export function useSaveAdSettings() {
  const refresh = useRefreshAds();
  return useMutation({ mutationFn: (patch) => api.put('/ads/settings', patch).then((r) => r.settings), meta: { success: 'Ajustes guardados ✓' }, onSettled: refresh });
}
