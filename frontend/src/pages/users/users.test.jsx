import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionMatrix } from './PermissionMatrix.jsx';
import { generatePassword } from './UserSheet.jsx';

describe('PermissionMatrix', () => {
  it('cambia el nivel de una sección', async () => {
    const onChange = vi.fn();
    const value = { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'view', ads: 'none', web: 'none' };
    render(<PermissionMatrix value={value} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radiogroup', { name: 'Proyectos' }).querySelector('input[value="edit"]'));
    expect(onChange).toHaveBeenCalledWith({ ...value, projects: 'edit' });
  });
});

describe('generatePassword', () => {
  it('10 caracteres sin ambiguos', () => {
    expect(generatePassword()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
  });
});
