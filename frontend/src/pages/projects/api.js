import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useOptimisticMutation } from '../../hooks/useOptimisticMutation.js';

export const projectKeys = { all: ['projects'], one: (id) => ['projects', id], activity: (id) => ['projects', id, 'activity'] };

export const useProjects = () => useQuery({ queryKey: projectKeys.all, queryFn: () => api.get('/projects').then((r) => r.projects) });
export const useProject = (id) => useQuery({ queryKey: projectKeys.one(id), queryFn: () => api.get(`/projects/${id}`).then((r) => r.project), enabled: Boolean(id) });
export const useProjectActivity = (id, enabled) => useQuery({ queryKey: projectKeys.activity(id), queryFn: () => api.get(`/projects/${id}/activity`).then((r) => r.activity), enabled });

function useRefresh(id) {
  const qc = useQueryClient();
  return () => Promise.all([projectKeys.all, ['home'], ...(id ? [projectKeys.one(id), projectKeys.activity(id)] : [])].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateProject() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (body) => api.post('/projects', body).then((r) => r.project), meta: { success: 'Proyecto creado ✓' }, onSuccess: refresh });
}

export function useUpdateProject(id) {
  return useOptimisticMutation({
    mutationFn: (patch) => api.patch(`/projects/${id}`, patch).then((r) => r.project),
    queryKey: projectKeys.one(id),
    apply: (old, patch) => ({ ...old, ...patch }),
    invalidate: [projectKeys.all, ['home'], projectKeys.activity(id)],
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.del(`/projects/${id}`),
    meta: { success: 'Proyecto borrado' },
    onSuccess: (_data, id) => {
      // Sacamos el detalle de la caché antes de invalidar: así no se vuelve a pedir y no aparece un error 404
      qc.removeQueries({ queryKey: projectKeys.activity(id) });
      qc.removeQueries({ queryKey: projectKeys.one(id) });
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useCreateTask(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (body) => api.post(`/projects/${projectId}/tasks`, body).then((r) => r.task), meta: { success: 'Tarea agregada ✓' }, onSettled: refresh });
}

export function useUpdateTask(projectId) {
  return useOptimisticMutation({
    mutationFn: ({ id, patch }) => api.patch(`/tasks/${id}`, patch).then((r) => r.task),
    queryKey: projectKeys.one(projectId),
    apply: (old, { id, patch }) => ({ ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
    invalidate: [projectKeys.all, ['home'], projectKeys.activity(projectId)],
    meta: { success: false },
  });
}

export function useDeleteTask(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (id) => api.del(`/tasks/${id}`), meta: { success: 'Tarea borrada' }, onSettled: refresh });
}

export function useCreateUpdate(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (body) => api.post(`/projects/${projectId}/updates`, { body }).then((r) => r.update), meta: { success: 'Novedad publicada ✓' }, onSettled: refresh });
}

export function useDeleteUpdate(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (id) => api.del(`/updates/${id}`), meta: { success: 'Novedad borrada' }, onSettled: refresh });
}
