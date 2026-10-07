import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient.js';
import { useOptimisticMutation } from './useOptimisticMutation.js';
import { useDraft } from './useDraft.js';
import { toastBus } from '../state/toastBus.js';
import { ApiError } from '../api/client.js';

function wrapperWith(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useOptimisticMutation', () => {
  it('aplica el cambio al instante y lo revierte si falla, mostrando el error', async () => {
    const qc = createQueryClient();
    qc.setQueryData(['ideas'], [{ id: 1, text: 'viejo' }]);
    const errors = [];
    const unsub = toastBus.subscribe((t) => t.kind === 'error' && errors.push(t.message));
    let reject;
    const { result } = renderHook(() => useOptimisticMutation({
      mutationFn: () => new Promise((_, r) => { reject = r; }),
      queryKey: ['ideas'],
      apply: (old, vars) => old.map((i) => (i.id === vars.id ? { ...i, text: vars.text } : i)),
    }), { wrapper: wrapperWith(qc) });
    act(() => { result.current.mutate({ id: 1, text: 'nuevo' }); });
    await waitFor(() => expect(qc.getQueryData(['ideas'])[0].text).toBe('nuevo'));
    await act(async () => { reject(new ApiError(403, 'FORBIDDEN', 'No tenés permiso para editar Ideas')); });
    await waitFor(() => expect(qc.getQueryData(['ideas'])[0].text).toBe('viejo'));
    expect(errors).toContain('No tenés permiso para editar Ideas');
    unsub();
  });

  it('éxito muestra "Guardado ✓" salvo que se pida otra cosa', async () => {
    const qc = createQueryClient();
    const seen = [];
    const unsub = toastBus.subscribe((t) => seen.push(t.message));
    const { result } = renderHook(() => useOptimisticMutation({ mutationFn: async () => ({}) }), { wrapper: wrapperWith(qc) });
    await act(async () => { await result.current.mutateAsync({}); });
    const { result: r2 } = renderHook(() => useOptimisticMutation({ mutationFn: async () => ({}), meta: { success: false } }), { wrapper: wrapperWith(qc) });
    await act(async () => { await r2.current.mutateAsync({}); });
    expect(seen).toEqual(['Guardado ✓']);
    unsub();
  });
});

describe('useDraft', () => {
  it('guarda lo escrito y lo recupera si se recarga (p. ej. sesión vencida)', () => {
    const first = renderHook(() => useDraft('idea-nueva', { text: '' }));
    act(() => first.result.current[1]({ text: 'Lo que estaba escribiendo' }));
    first.unmount();
    const second = renderHook(() => useDraft('idea-nueva', { text: '' }));
    expect(second.result.current[0].text).toBe('Lo que estaba escribiendo');
    act(() => second.result.current[2]());
    second.unmount();
    const third = renderHook(() => useDraft('idea-nueva', { text: '' }));
    expect(third.result.current[0].text).toBe('');
  });

  it('si localStorage falla, funciona igual en memoria', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const { result } = renderHook(() => useDraft('x', { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
    spy.mockRestore();
  });
});
