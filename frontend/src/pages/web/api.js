import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';

const qs = (status) => (status ? `?status=${status}` : '');

export const useWebSummary = () => useQuery({ queryKey: ['web', 'summary'], queryFn: () => api.get('/web/summary') });
export const useQuotes = (status) => useQuery({ queryKey: ['web', 'quotes', status ?? 'all'], queryFn: () => api.get(`/web/quotes${qs(status)}`).then((r) => r.quotes) });
export const useReviews = (status) => useQuery({ queryKey: ['web', 'reviews', status ?? 'all'], queryFn: () => api.get(`/web/reviews${qs(status)}`).then((r) => r.reviews) });

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['web'] });
}

export function usePatchQuote() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: ({ id, ...patch }) => api.patch(`/web/quotes/${id}`, patch).then((r) => r.quote), meta: { success: 'Guardado ✓' }, onSuccess: refresh });
}

export function useSetReviewStatus() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, status }) => api.patch(`/web/reviews/${id}`, { status }).then((r) => r.review),
    meta: { success: 'Reseña actualizada ✓' },
    onSuccess: refresh,
  });
}

export function useDeleteReview() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id) => api.del(`/web/reviews/${id}`), meta: { success: 'Reseña borrada' }, onSuccess: refresh });
}
