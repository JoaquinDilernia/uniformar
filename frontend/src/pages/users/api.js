import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.users) });

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([['users'], ['directory'], ['home']].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateUser() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (body) => api.post('/users', body).then((r) => r.user), meta: { success: 'Usuario creado ✓' }, onSuccess: refresh });
}
export function usePatchUser(id) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (patch) => api.patch(`/users/${id}`, patch).then((r) => r.user), meta: { success: false }, onSuccess: refresh });
}
export function useSetPermissions(id) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (perms) => api.put(`/users/${id}/permissions`, perms).then((r) => r.user), meta: { success: 'Permisos guardados ✓' }, onSuccess: refresh });
}
export function useResetPassword(id) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => api.post(`/users/${id}/reset-password`), meta: { success: false }, onSuccess: refresh });
}
