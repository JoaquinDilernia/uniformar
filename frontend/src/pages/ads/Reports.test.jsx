import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { Reports, periodRange } from './Reports.jsx';

const t = (o) => ({ spend: 0, conversations: 0, replied: 0, reach: 0, frequency: null, ctr: null, cpm: null, costPerConversation: null, ...o });
const report = {
  generatedAt: '2026-10-22T12:00:00Z',
  range: { since: '2026-10-16', until: '2026-10-22', days: 7 },
  previousRange: { since: '2026-10-09', until: '2026-10-15' },
  totals: { current: t({ spend: 12000, conversations: 4, costPerConversation: 3000 }), previous: t({ spend: 15000, conversations: 2, costPerConversation: 7500 }) },
  daily: [{ date: '2026-10-16', spend: 2000, conversations: 1 }, { date: '2026-10-17', spend: 3000, conversations: 2 }],
  ads: {
    count: 2,
    best: [{ id: 'a1', name: 'Barato', adset: 'Conjunto 1', spend: 2000, conversations: 2, costPerConversation: 1000, thumbnail: null }],
    worst: [{ id: 'a3', name: 'Sin nada', adset: 'Conjunto 1', spend: 4000, conversations: 0, costPerConversation: null, thumbnail: null }],
  },
  adsets: { all: [{ id: 's1', name: 'Conjunto 1', campaign: 'C', spend: 12000, conversations: 4, costPerConversation: 3000 }] },
  breakdowns: {
    placement: [
      { label: 'Instagram · reels', spend: 3000, conversations: 2, costPerConversation: 1500 },
      { label: 'Facebook · feed', spend: 6000, conversations: 1, costPerConversation: 6000 },
    ],
    age: [], gender: [], region: { error: 'no soportado' }, hour: [],
  },
  actions: [{
    id: 'd1', title: 'Pausar anuncio caro', tool: 'pause_ad', date: '2026-10-18', byAgent: true, decidedBy: null, scope: 'Toda la cuenta', outcome: 'Bajó el costo',
    before: { days: 7, spend: 14000, conversations: 2, costPerConversation: 7000 }, after: { days: 3, spend: 6000, conversations: 3, costPerConversation: 2000 },
  }],
};
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('períodos del reporte', () => {
  it('calcula los rangos en días de calendario', () => {
    expect(periodRange('7d', '2026-10-22')).toEqual({ since: '2026-10-16', until: '2026-10-22' });
    expect(periodRange('30d', '2026-10-22')).toEqual({ since: '2026-09-23', until: '2026-10-22' });
    expect(periodRange('month', '2026-10-22')).toEqual({ since: '2026-10-01', until: '2026-10-22' });
    expect(periodRange('prev_month', '2026-03-05')).toEqual({ since: '2026-02-01', until: '2026-02-28' });
  });
});

describe('Reportes', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn((url, opts = {}) => {
      if (url.startsWith('/api/ads/report?')) return json({ report, analysis: null, canAnalyze: true });
      if (url === '/api/ads/report/analysis' && opts.method === 'POST') {
        return json({ analysis: { text: '**Cómo nos fue** mejor que antes', created_at: '2026-10-22T12:00:00Z', created_by_name: 'Sofi' } });
      }
      return json({});
    });
  });

  it('muestra números, comparación, ranking, desgloses y acciones; pide la lectura del agente', async () => {
    render(<QueryClientProvider client={createQueryClient()}><Reports canEdit /></QueryClientProvider>);
    expect(await screen.findByText('$3.000')).toBeInTheDocument();
    // el costo bajó: es bueno
    expect(screen.getByText('-60% vs. antes')).toBeInTheDocument();
    expect(screen.getByText('+100% vs. antes')).toBeInTheDocument();
    expect(screen.getByText('Barato')).toBeInTheDocument();
    expect(screen.getByText('Sin nada')).toBeInTheDocument();
    expect(screen.getByText(/Más barato:/)).toHaveTextContent('Instagram · reels a $1.500');
    expect(screen.getByText('Pausar anuncio caro')).toBeInTheDocument();
    expect(screen.getByText('$2.000 c/conv.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pedir lectura al agente' }));
    expect(await screen.findByText('Cómo nos fue')).toBeInTheDocument();
    const call = global.fetch.mock.calls.find(([u]) => u === '/api/ads/report/analysis');
    expect(JSON.parse(call[1].body)).toEqual(periodRange('7d'));
  });

  it('sin permiso de edición no ofrece pedir la lectura', async () => {
    render(<QueryClientProvider client={createQueryClient()}><Reports canEdit={false} /></QueryClientProvider>);
    expect(await screen.findByText('Barato')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pedir lectura/ })).not.toBeInTheDocument();
  });
});
