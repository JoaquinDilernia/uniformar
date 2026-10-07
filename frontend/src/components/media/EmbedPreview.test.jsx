import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmbedPreview } from './EmbedPreview.jsx';

describe('EmbedPreview', () => {
  it('reel: iframe embebido + abrir en la app', () => {
    render(<EmbedPreview url="https://www.instagram.com/reel/ABC/" />);
    expect(screen.getByTitle('Vista previa de Instagram')).toHaveAttribute('src', 'https://www.instagram.com/reel/ABC/embed');
    expect(screen.getByRole('link', { name: /Abrir en Instagram/ })).toHaveAttribute('href', 'https://www.instagram.com/reel/ABC/');
  });

  it('url inválida (javascript:): texto plano, sin link', () => {
    render(<EmbedPreview url="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('Drive: tarjeta con link, sin iframe', () => {
    render(<EmbedPreview url="https://drive.google.com/file/d/1/view" />);
    expect(screen.queryByTitle(/Vista previa/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir en Drive/ })).toBeInTheDocument();
  });
});
