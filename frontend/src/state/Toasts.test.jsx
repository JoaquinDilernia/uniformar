import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastViewport } from './Toasts.jsx';
import { toastBus } from './toastBus.js';

describe('toasts', () => {
  it('muestra éxito y error, y el éxito se va solo', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => { toastBus.success('Guardado ✓'); toastBus.error('No tenés permiso para editar Proyectos'); });
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No tenés permiso para editar Proyectos');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('Guardado ✓')).not.toBeInTheDocument();
    expect(screen.getByText('No tenés permiso para editar Proyectos')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText('No tenés permiso para editar Proyectos')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
