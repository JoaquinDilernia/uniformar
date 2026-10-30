import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { uploadFile } from '../../lib/upload.js';
import { toastBus } from '../../state/toastBus.js';

export const adsKeys = {
  overview: ['ads', 'overview'], runs: ['ads', 'runs'], decisions: ['ads', 'decisions'], creatives: ['ads', 'creatives'],
  requests: ['ads', 'requests'], learnings: ['ads', 'learnings'], questions: ['ads', 'questions'], igPosts: ['ads', 'ig-posts'], chats: ['ads', 'chats'],
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
    mutationFn: async ({ feed, story, onProgress, ...body }) => {
      const creative = (await api.post('/ads/creatives', body)).creative;
      try {
        await uploadFile({ ownerType: 'ad_feed', ownerId: creative.id, file: feed, kind: 'media', onProgress: (p) => onProgress?.('feed', p) });
        if (story) await uploadFile({ ownerType: 'ad_story', ownerId: creative.id, file: story, kind: 'media', onProgress: (p) => onProgress?.('story', p) });
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

export const useQuestions = (status = 'open') => useQuery({
  queryKey: [...adsKeys.questions, status],
  queryFn: () => api.get(`/ads/questions?status=${status}`).then((r) => r.questions),
});

export function useAnswerQuestion() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: ({ id, answer, analyze }) => api.post(`/ads/questions/${id}/answer`, { answer, analyze }),
    meta: { success: false },
    onSuccess: (r, vars) => {
      if (r.note) toastBus.info(r.note);
      else toastBus.success(vars.analyze ? 'Respuesta guardada. El agente arrancó a analizar.' : 'Respuesta guardada ✓');
    },
    onSettled: refresh,
  });
}

export function useDismissQuestion() {
  const refresh = useRefreshAds();
  return useMutation({ mutationFn: (id) => api.post(`/ads/questions/${id}/dismiss`), meta: { success: 'Pregunta descartada' }, onSettled: refresh });
}

// Si Instagram falla (p. ej. sin acceso a la cuenta), el error se muestra en la sección, no como toast
export const useIgPosts = () => useQuery({
  queryKey: adsKeys.igPosts,
  queryFn: () => api.get('/ads/ig-posts').then((r) => r.posts),
  meta: { silent: true },
  retry: false,
});

export function usePromoteIgPost() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: ({ id, adset_id, adset_name, permalink }) => api.post(`/ads/ig-posts/${id}/promote`, { adset_id, adset_name, permalink }),
    meta: { success: 'Post promocionado en Meta ✓' },
    onSettled: refresh,
  });
}

// Reporte de un período: el backend lo arma con Meta y lo cachea 15 min
export const useReport = ({ since, until }) => useQuery({
  queryKey: ['ads', 'report', since, until],
  queryFn: () => api.get(`/ads/report?since=${since}&until=${until}`),
  enabled: Boolean(since && until),
  meta: { silent: true },
  retry: false,
});

export function useRefreshReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ since, until }) => api.get(`/ads/report?since=${since}&until=${until}&refresh=1`),
    meta: { success: false },
    onSuccess: (data, { since, until }) => qc.setQueryData(['ads', 'report', since, until], data),
  });
}

export function useAnalyzeReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ since, until }) => api.post('/ads/report/analysis', { since, until }).then((r) => r.analysis),
    meta: { success: 'El agente leyó el período ✓' },
    onSuccess: (analysis, { since, until }) => qc.setQueryData(['ads', 'report', since, until], (old) => (old ? { ...old, analysis } : old)),
  });
}

// Consultas al agente: el chat contesta en el mismo pedido (tarda unos segundos)
export const useChats = () => useQuery({ queryKey: [...adsKeys.chats], queryFn: () => api.get('/ads/chats').then((r) => r.chats) });
export const useChat = (id) => useQuery({ queryKey: [...adsKeys.chats, id], queryFn: () => api.get(`/ads/chats/${id}`), enabled: !!id });

function useChatMutation(mutationFn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    meta: { success: false },
    onSuccess: (data) => qc.setQueryData([...adsKeys.chats, data.chat.id], data),
    // Lo que propuso el agente aparece en Recomendaciones; si falló, la consulta quedó guardada igual
    onSettled: () => qc.invalidateQueries({ queryKey: ['ads'], predicate: (q) => q.queryKey[1] !== 'report' }),
  });
}
export const useStartChat = () => useChatMutation(({ message }) => api.post('/ads/chats', { message }));
export const useSendChat = () => useChatMutation(({ id, message }) => api.post(`/ads/chats/${id}/messages`, { message }));
export const useRetryChat = () => useChatMutation(({ id }) => api.post(`/ads/chats/${id}/reply`));
export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.del(`/ads/chats/${id}`),
    meta: { success: 'Conversación borrada' },
    onSettled: () => qc.invalidateQueries({ queryKey: adsKeys.chats }),
  });
}
