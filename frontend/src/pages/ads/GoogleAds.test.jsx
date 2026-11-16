import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { GoogleAds } from './GoogleAds.jsx';

const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const m = (o = {}) => ({ spend: 0, clicks: 0, impressions: 0, leads: 0, ctr: null, cpc: null, costPerLead: null, ...o });
const data = {
  configured: { google: true, agent: true },
  settings: { agent_enabled: true, monthly_cap_ars: 50000, business_notes: '' },
  lastRun: { status: 'done', report: '**Cómo vamos** Arrancando en Google', finished_at: '2026-11-16T12:00:00Z' },
  pendingCount: 1, openQuestions: 0, projectedMonth: 45000, googleError: null,
  snapshot: {
    spendToday: 1200, month: m({ spend: 5000 }), last7d: m({ leads: 3, clicks: 40, spend: 5000, costPerLead: 1667, cpc: 125 }),
    campaigns: [{ id: '11', name: 'UNIFORMAR | SEARCH', status: 'ENABLED', dailyBudgetArs: 3000, last7d: m({ leads: 3, clicks: 40, spend: 5000 }) }],
    adGroups: [{ id: '21', name: 'Gastronomía', status: 'ENABLED', campaignId: '11', last7d: m() }],
    keywords: [], ads: [], searchTerms: [{ term: 'uniformes gastronomicos', adGroupId: '21', spend: 800, clicks: 5, leads: 1 }],
    conversionActions: [{ id: '1', name: 'WhatsApp (web)' }],
  },
};
const pending = {
  id: 'd1', status: 'pending', tool: 'propose_search_campaign', title: 'Lanzar búsqueda', reason: 'Cuenta nueva', created_at: '2026-11-16T12:00:00Z',
  input: { daily_budget_ars: 3000, bidding: { strategy: 'MAXIMIZE_CLICKS', max_cpc_ars: 600 }, negative_keywords: ['empleo'],
    ad_groups: [{ name: 'Gastronomía', keywords: [{ text: 'chaquetas de cocina', match_type: 'PHRASE' }], headlines: ['Uniformes con tu logo'], descriptions: ['d'] }] },
};

const renderIt = () => render(
  <QueryClientProvider client={createQueryClient()}><ConfirmProvider><GoogleAds data={data} canEdit running={false} /></ConfirmProvider></QueryClientProvider>,
);

describe('Pauta · Google', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/gads/decisions') return json({ decisions: [pending] });
      if (url === '/api/gads/decisions/d1/approve' && opts.method === 'POST') return json({ decision: { ...pending, status: 'executed' } });
      if (url.startsWith('/api/gads/questions')) return json({ questions: [] });
      return json({});
    });
  });

  it('muestra gasto contra el tope, consultas, campañas, búsquedas y el informe', async () => {
    renderIt();
    expect(screen.getByText('Arrancando en Google', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/cierra en ~\$45\.000/)).toBeInTheDocument();
    expect(screen.getByText('UNIFORMAR | SEARCH')).toBeInTheDocument();
    expect(screen.getByText('Gastronomía')).toBeInTheDocument();
    expect(screen.getByText('uniformes gastronomicos')).toBeInTheDocument();
  });

  it('la campaña propuesta muestra presupuesto y puja, y aprobarla pide confirmación', async () => {
    renderIt();
    await userEvent.click(screen.getByRole('radio', { name: /Recomendaciones/ }));
    expect(await screen.findByText('Lanzar búsqueda')).toBeInTheDocument();
    expect(screen.getByText(/\$3\.000 por día · maximizar clics \(tope \$600 por clic\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText(/arranca ACTIVA/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Aprobar' });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/gads/decisions/d1/approve', expect.objectContaining({ method: 'POST' })));
  });
});
