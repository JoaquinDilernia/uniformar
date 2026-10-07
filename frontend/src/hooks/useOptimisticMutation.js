import { useMutation, useQueryClient } from '@tanstack/react-query';

// Cambia la caché al instante; si el backend falla, vuelve atrás (el toast de error lo pone el MutationCache)
export function useOptimisticMutation({ mutationFn, queryKey, apply, invalidate = [], meta }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    meta,
    onMutate: async (vars) => {
      if (!queryKey || !apply) return {};
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData(queryKey);
      if (previous !== undefined) qc.setQueryData(queryKey, (old) => apply(old, vars));
      return { previous, hadPrevious: previous !== undefined };
    },
    onError: (_err, _vars, ctx) => {
      if (queryKey && ctx?.hadPrevious) qc.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => Promise.all([queryKey, ...invalidate].filter(Boolean).map((k) => qc.invalidateQueries({ queryKey: k }))),
  });
}
