import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toastBus } from '../state/toastBus.js';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (n, err) => (err?.status === 0 || err?.status >= 500) && n < 2,
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (err?.status === 401 || query.meta?.silent) return;
        toastBus.error(err?.message ?? 'No se pudieron cargar los datos.');
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: (_data, _vars, _ctx, mutation) => {
        const msg = mutation.options.meta?.success;
        if (msg !== false) toastBus.success(msg ?? 'Guardado ✓');
      },
      onError: (err, _vars, _ctx, mutation) => {
        if (err?.status === 401) return; // lo maneja la sesión
        toastBus.error(mutation.options.meta?.error ?? err?.message ?? 'No se pudo guardar. Probá de nuevo.');
      },
    }),
  });
}
