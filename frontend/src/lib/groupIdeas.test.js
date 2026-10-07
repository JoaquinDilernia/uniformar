import { describe, it, expect } from 'vitest';
import { filterIdeas, groupIdeas, summarize } from './groupIdeas.js';

const idea = (o) => ({ id: Math.random().toString(36), kind: 'idea', format: 'video', category: 'domingo', status: 'por_decidir', text: 'x', client_name: null, created_at: '2026-10-01T10:00:00Z', ...o });

const ideas = [
  idea({ text: 'Fotos catálogo', kind: 'must', category: 'producto', format: 'photo', status: 'si_o_si' }),
  idea({ text: 'Humor delantal', status: 'por_hacer' }),
  idea({ text: 'Humor cocina', status: 'por_decidir' }),
  idea({ text: 'Entrega Wonder', category: 'viernes', client_name: 'Estudio Wonder' }),
  idea({ text: 'Entrega POSTA', category: 'viernes', client_name: 'POSTA', status: 'realizada' }),
  idea({ text: 'Sin cliente', category: 'viernes' }),
  idea({ text: 'Behind', category: 'otra', status: 'no_se_hace' }),
];

describe('agrupado de ideas', () => {
  it('orden: sí o sí → domingo → un grupo por cliente de viernes → producto → otros', () => {
    expect(groupIdeas(ideas).map((g) => g.title)).toEqual([
      '📌 Sí o sí', 'Domingo · humor', 'Viernes · Estudio Wonder', 'Viernes · POSTA', 'Viernes · sin cliente', 'Otros',
    ]);
  });

  it('dentro del grupo: por decidir antes que por hacer', () => {
    const domingo = groupIdeas(ideas).find((g) => g.key === 'domingo');
    expect(domingo.ideas.map((i) => i.text)).toEqual(['Humor cocina', 'Humor delantal']);
    expect(domingo.summary).toBe('1 por decidir · 1 por hacer');
  });

  it('filtros combinables y búsqueda sin acentos', () => {
    expect(filterIdeas(ideas, { format: 'photo' }).map((i) => i.text)).toEqual(['Fotos catálogo']);
    expect(filterIdeas(ideas, { category: 'viernes', status: 'realizada' }).map((i) => i.text)).toEqual(['Entrega POSTA']);
    expect(filterIdeas(ideas, { q: 'catalogo' }).map((i) => i.text)).toEqual(['Fotos catálogo']);
    expect(filterIdeas(ideas, { q: 'wonder' })).toHaveLength(1);
  });

  it('summarize omite estados en cero', () => {
    expect(summarize([idea({ status: 'realizada' })])).toBe('1 realizada');
    expect(summarize([idea({ status: 'no_se_hace' }), idea({ status: 'no_se_hace' })])).toBe('2 no se hacen');
  });
});
