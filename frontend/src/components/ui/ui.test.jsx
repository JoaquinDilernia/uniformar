import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet.jsx';
import { ConfirmProvider, useConfirm } from './ConfirmDialog.jsx';
import { Collapsible } from './Collapsible.jsx';
import { StatusBadge } from './StatusBadge.jsx';
import { Segmented } from './Segmented.jsx';

describe('Sheet', () => {
  it('se cierra con Esc y con el fondo, no con un clic adentro', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Idea"><button type="button">adentro</button></Sheet>);
    expect(screen.getByRole('dialog', { name: 'Idea' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('adentro'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('cerrada no renderiza nada', () => {
    render(<Sheet open={false} onClose={() => {}} title="X">contenido</Sheet>);
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });
});

describe('useConfirm', () => {
  function Probe({ onResult }) {
    const confirm = useConfirm();
    return <button type="button" onClick={async () => onResult(await confirm({ title: '¿Borrar la idea?', confirmLabel: 'Borrar', danger: true }))}>abrir</button>;
  }

  it('resuelve true al confirmar y false al cancelar', async () => {
    const onResult = vi.fn();
    render(<ConfirmProvider><Probe onResult={onResult} /></ConfirmProvider>);
    await userEvent.click(screen.getByText('abrir'));
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(onResult).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText('abrir'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onResult).toHaveBeenLastCalledWith(false);
  });
});

describe('Collapsible', () => {
  it('arranca cerrado y muestra el resumen', async () => {
    render(<Collapsible title="Domingo · humor" count={4} summary="3 por decidir · 1 por hacer"><p>fila</p></Collapsible>);
    const btn = screen.getByRole('button', { name: /Domingo · humor/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('3 por decidir · 1 por hacer')).toBeInTheDocument();
    expect(screen.queryByText('fila')).not.toBeInTheDocument();
    await userEvent.click(btn);
    expect(screen.getByText('fila')).toBeInTheDocument();
  });
});

describe('StatusBadge y Segmented', () => {
  it('etiquetas en español', () => {
    render(<><StatusBadge kind="idea" status="por_decidir" /><StatusBadge kind="calendar" status="ready" /></>);
    expect(screen.getByText('Por decidir')).toBeInTheDocument();
    expect(screen.getByText('Listo para publicar')).toBeInTheDocument();
  });

  it('Segmented marca la opción activa', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Nivel" value="view" onChange={onChange} options={[{ value: 'none', label: 'Sin acceso' }, { value: 'view', label: 'Ver' }, { value: 'edit', label: 'Editar' }]} />);
    expect(screen.getByRole('radio', { name: 'Ver' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Editar' }));
    expect(onChange).toHaveBeenCalledWith('edit');
  });
});
