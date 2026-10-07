import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';

// Las piezas se piden por rango de fechas; no hay consulta por pieza (borrar no provoca refetch de algo inexistente).
export const calKeys = { range: (from, to) => ['calendar', from, to] };

export const useCalendarRange = (from, to) => useQuery({
  queryKey: calKeys.range(from, to),
  queryFn: () => api.get(`/calendar?from=${from}&to=${to}`).then((r) => r.items),
  placeholderData: keepPreviousData,
});

export const useRules = () => useQuery({ queryKey: ['rules'], queryFn: () => api.get('/settings/content-rules').then((r) => r.rules), staleTime: 5 * 60_000 });

function useInvalidateCalendar() {
  const qc = useQueryClient();
  return () => Promise.all([['calendar'], ['home'], ['ideas']].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateItem() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: (body) => api.post('/calendar', body).then((r) => r.item), meta: { success: 'Pieza agregada ✓' }, onSettled: invalidate });
}

export function useUpdateItem() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: ({ id, patch }) => api.patch(`/calendar/${id}`, patch).then((r) => r.item), meta: { success: 'Pieza guardada ✓' }, onSettled: invalidate });
}

export function useDeleteItem() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: (id) => api.del(`/calendar/${id}`), meta: { success: 'Pieza borrada' }, onSettled: invalidate });
}
