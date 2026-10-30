import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, toolTurn, contextSection } from './helpers/adsFakes.js';
import { createAdsRepo } from '../src/repo/ads.js';
import { buildContext } from '../src/ads/agent.js';

// Claude falso que se puede reprogramar entre tests: cada respuesta sale de la cola; vacía, contesta "listo"
const queue = [];
const calls = [];
const anthropic = {
  beta: {
    messages: {
      stream: (params) => ({
        finalMessage: async () => {
          calls.push(structuredClone(params));
          const next = queue.shift() ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'listo' }] };
          if (next instanceof Error) throw next;
          return next;
        },
      }),
    },
  },
};
const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

let ctx, meta, repo, admin, equipo;
beforeAll(async () => {
  meta = fakeMeta();
  ctx = await createTestContext({ ads: { meta, anthropic, config } });
  repo = createAdsRepo(ctx.db);
  admin = (await ctx.asUser({ template: 'admin', name: 'Joaquín' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo', name: 'Marketing' })).agent;
});
afterAll(() => ctx.close());
beforeEach(() => { queue.length = 0; calls.length = 0; meta.calls.length = 0; });

describe('chat con el agente de pauta', () => {
  it('quien solo ve la pauta puede consultar: arma la conversación con la pregunta y la respuesta', async () => {
    queue.push(say('El anuncio AD1 trae 3 conversaciones a $3.000 cada una.'));
    const res = await equipo.post('/api/ads/chats').send({ message: '¿Qué anuncio trae las conversaciones más baratas?' });
    expect(res.status).toBe(201);
    expect(res.body.chat).toMatchObject({ title: '¿Qué anuncio trae las conversaciones más baratas?', created_by_name: 'Marketing' });
    expect(res.body.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', '¿Qué anuncio trae las conversaciones más baratas?'],
      ['assistant', 'El anuncio AD1 trae 3 conversaciones a $3.000 cada una.'],
    ]);
    // El agente recibe los datos de la cuenta en el system, cacheados, y sin herramientas de la corrida diaria
    const p = calls[0];
    expect(p.system[1].text).toContain('## campaigns');
    expect(p.system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(p.tools.map((t) => t.name)).not.toContain('ask_team');
    expect(p.tools.map((t) => t.name)).not.toContain('record_outcome');
    expect(p.messages).toEqual([{ role: 'user', content: '¿Qué anuncio trae las conversaciones más baratas?' }]);
  });

  it('sigue la charla con el historial y no vuelve a pedirle los datos a Meta enseguida', async () => {
    queue.push(say('Primera'), say('Segunda'));
    const { body } = await admin.post('/api/ads/chats').send({ message: 'Hola' });
    const before = meta.calls.length;
    const res = await admin.post(`/api/ads/chats/${body.chat.id}/messages`).send({ message: '¿Y el conjunto?' });
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m) => m.content)).toEqual(['Hola', 'Primera', '¿Y el conjunto?', 'Segunda']);
    expect(calls[1].messages).toEqual([
      { role: 'user', content: 'Hola' }, { role: 'assistant', content: 'Primera' }, { role: 'user', content: '¿Y el conjunto?' },
    ]);
    expect(calls[1].system[1].text).toBe(calls[0].system[1].text);
    expect(meta.calls.length).toBe(before);
  });

  it('no ejecuta nada en Meta: pausar queda como recomendación pendiente del chat, aunque el modo autónomo esté prendido', async () => {
    await ctx.db.query('UPDATE ad_settings SET autonomous = true WHERE id = 1');
    queue.push(
      toolTurn(['pause_ad', { ad_id: '902', ad_name: 'AD1', title: 'Pausar AD1', reason: 'caro', expected_impact: 'baja el costo' }]),
      say('Te dejé en Recomendaciones pausar AD1.'),
    );
    const res = await equipo.post('/api/ads/chats').send({ message: '¿Pausamos AD1?' });
    await ctx.db.query('UPDATE ad_settings SET autonomous = false WHERE id = 1');
    expect(res.status).toBe(201);
    expect(meta.calls.filter((c) => c[0] === 'setStatus')).toEqual([]);
    const answer = res.body.messages.at(-1);
    expect(answer.actions).toEqual([{ type: 'recommendation', id: expect.any(String), title: 'Pausar AD1' }]);
    const d = await repo.getDecision(answer.actions[0].id);
    expect(d).toMatchObject({ status: 'pending', tool: 'pause_ad', chat_id: res.body.chat.id, run_id: null });
  });

  it('aprende de lo que le cuentan y lo deja anotado en la respuesta', async () => {
    queue.push(
      toolTurn(['save_learning', { text: 'Las consultas de gastronomía cierran más', evidence: 'Lo contó marketing en el chat' }]),
      say('Anotado.'),
    );
    const res = await equipo.post('/api/ads/chats').send({ message: 'Las de gastronomía son las que más cierran' });
    const answer = res.body.messages.at(-1);
    expect(answer.actions).toEqual([{ type: 'learning', id: expect.any(String), title: 'Las consultas de gastronomía cierran más' }]);
    expect((await repo.listLearnings()).map((l) => l.text)).toContain('Las consultas de gastronomía cierran más');
  });

  it('si el agente falla, la consulta queda guardada y se puede reintentar', async () => {
    queue.push(new Error('se cortó'));
    const res = await equipo.post('/api/ads/chats').send({ message: '¿Cómo venimos?' });
    expect(res.status).toBe(502);
    const { body: list } = await equipo.get('/api/ads/chats');
    const chat = list.chats.find((c) => c.title === '¿Cómo venimos?');
    expect(chat.message_count).toBe(1);
    queue.push(say('Venimos bien.'));
    const retry = await equipo.post(`/api/ads/chats/${chat.id}/reply`);
    expect(retry.body.messages.map((m) => m.content)).toEqual(['¿Cómo venimos?', 'Venimos bien.']);
    // Sin consulta pendiente no hay nada que contestar
    expect((await equipo.post(`/api/ads/chats/${chat.id}/reply`)).status).toBe(409);
  });

  it('valida la consulta y solo quien edita la pauta borra conversaciones', async () => {
    expect((await equipo.post('/api/ads/chats').send({ message: '   ' })).status).toBe(400);
    queue.push(say('ok'));
    const { body } = await equipo.post('/api/ads/chats').send({ message: 'Para borrar' });
    expect((await equipo.delete(`/api/ads/chats/${body.chat.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/ads/chats/${body.chat.id}`)).status).toBe(200);
    expect((await admin.get(`/api/ads/chats/${body.chat.id}`)).status).toBe(404);
  });

  it('la corrida diaria ve lo que el equipo escribió en el chat desde la última corrida', async () => {
    await ctx.db.query('DELETE FROM ad_runs');
    const run = await repo.startRun('daily', null);
    await repo.finishRun(run.id, { status: 'done', report: 'x' });
    queue.push(say('ok'));
    await equipo.post('/api/ads/chats').send({ message: 'Esta semana entraron muchas consultas de particulares' });
    const text = await buildContext({ meta, repo, config });
    const team = contextSection(text, 'teamChat');
    expect(team).toEqual([expect.objectContaining({ said: 'Esta semana entraron muchas consultas de particulares', by: 'Marketing' })]);
  });
});
