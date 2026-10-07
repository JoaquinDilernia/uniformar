import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useOptimisticMutation } from '../../hooks/useOptimisticMutation.js';
import { deriveIdeaStatus } from '../../lib/ideaStatus.js';
import { toastBus } from '../../state/toastBus.js';

export const ideaKeys = { all: ['ideas'], one: (id) => ['ideas', id], activity: (id) => ['ideas', id, 'activity'] };

export const useIdeas = () => useQuery({ queryKey: ideaKeys.all, queryFn: () => api.get('/ideas').then((r) => r.ideas) });
export const useIdea = (id) => useQuery({ queryKey: ideaKeys.one(id), queryFn: () => api.get(`/ideas/${id}`).then((r) => r.idea), enabled: Boolean(id) && id !== 'nueva' });
export const useIdeaActivity = (id, enabled) => useQuery({ queryKey: ideaKeys.activity(id), queryFn: () => api.get(`/ideas/${id}/activity`).then((r) => r.activity), enabled });
export const useClients = () => useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.clients), staleTime: 5 * 60_000 });
export const useDirectory = () => useQuery({ queryKey: ['directory'], queryFn: () => api.get('/users/directory').then((r) => r.users), staleTime: 5 * 60_000 });

function invalidateIdeas(qc) {
  return Promise.all([['ideas'], ['home'], ['clients'], ['calendar']].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/ideas', body).then((r) => r.idea),
    meta: { success: 'Idea creada ✓' },
    onSuccess: () => invalidateIdeas(qc),
  });
}

export function useUpdateIdea(id, meta) {
  return useOptimisticMutation({
    mutationFn: (patch) => api.patch(`/ideas/${id}`, patch).then((r) => r.idea),
    queryKey: ideaKeys.one(id),
    apply: (old, patch) => ({ ...old, ...patch }),
    invalidate: [ideaKeys.all, ['home'], ['clients'], ideaKeys.activity(id)],
    meta,
  });
}

const ACTION_MSG = {
  decide: (b) => (b.decision === 'yes' ? '¡Buenísimo! Quedó en "Por hacer".' : 'Listo, queda como "No se hace".'),
  undecide: () => 'Decisión deshecha',
  complete: () => '¡Realizada! ✓',
  reopen: () => 'La idea volvió a "Por hacer"',
};

function applyAction(old, action, body = {}) {
  const next = { ...old };
  if (action === 'decide') next.decision = body.decision;
  if (action === 'undecide') next.decision = 'pending';
  if (action === 'complete') Object.assign(next, { done_at: new Date().toISOString(), result_url: body.result_url });
  if (action === 'reopen') next.done_at = null;
  return { ...next, status: deriveIdeaStatus(next) };
}

export function useIdeaAction(id) {
  return useOptimisticMutation({
    mutationFn: async ({ action, body }) => {
      const idea = (await api.post(`/ideas/${id}/${action}`, body)).idea;
      toastBus.success(ACTION_MSG[action](body ?? {}));
      return idea;
    },
    queryKey: ideaKeys.one(id),
    apply: (old, { action, body }) => applyAction(old, action, body),
    invalidate: [ideaKeys.all, ['home'], ideaKeys.activity(id)],
    meta: { success: false },
  });
}

export function useDeleteIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.del(`/ideas/${id}`),
    meta: { success: 'Idea borrada' },
    onSuccess: () => invalidateIdeas(qc),
  });
}
