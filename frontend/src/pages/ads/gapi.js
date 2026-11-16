import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';

// Agente de Google Ads: mismas piezas que Meta, bajo /gads
const keys = { overview: ['gads', 'overview'], decisions: ['gads', 'decisions'], learnings: ['gads', 'learnings'] };

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['gads'] });
}

export const useGoogleOverview = ({ enabled = true } = {}) => useQuery({
  queryKey: keys.overview,
  enabled,
  queryFn: () => api.get('/gads/overview'),
  refetchInterval: (q) => (q.state.data?.lastRun?.status === 'running' ? 5000 : false),
});
export const useGoogleDecisions = () => useQuery({ queryKey: keys.decisions, queryFn: () => api.get('/gads/decisions').then((r) => r.decisions) });
export const useGoogleLearnings = () => useQuery({ queryKey: keys.learnings, queryFn: () => api.get('/gads/learnings').then((r) => r.learnings) });

export function useRefreshGoogle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.get('/gads/overview?refresh=1'), meta: { success: false }, onSuccess: (data) => qc.setQueryData(keys.overview, data) });
}
export function useStartGoogleRun() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => api.post('/gads/runs'), meta: { success: 'El agente de Google arrancó a analizar. Tarda unos minutos.' }, onSettled: refresh });
}
export function useGoogleDecide() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, approve }) => api.post(`/gads/decisions/${id}/${approve ? 'approve' : 'reject'}`).then((r) => r.decision),
    meta: { success: false },
    onSettled: refresh,
  });
}
export function useGoogleSetStatus() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: ({ id, level, status, name }) => api.post(`/gads/objects/${id}/status`, { level, status, name }), meta: { success: 'Listo ✓' }, onSettled: refresh });
}
export function useDeleteGoogleLearning() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id) => api.del(`/gads/learnings/${id}`), meta: { success: false }, onSettled: refresh });
}
export function useSaveGoogleSettings() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (patch) => api.put('/gads/settings', patch).then((r) => r.settings), meta: { success: 'Ajustes guardados ✓' }, onSettled: refresh });
}
