import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { fakeMeta, fakeAnthropic, config, contextSection } from './helpers/adsFakes.js';
import { createAdsRepo } from '../src/repo/ads.js';
import { createDispatcher, buildContext } from '../src/ads/agent.js';

let ctx, repo, user;
beforeAll(async () => {
  ctx = await createTestContext();
  repo = createAdsRepo(ctx.db);
  user = await ctx.createUser({ name: 'Santi' });
});
afterAll(() => ctx.close());

const setTimes = (table, id, cols) => ctx.db.query(
  `UPDATE ${table} SET ${Object.keys(cols).map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
  [id, ...Object.values(cols)],
);

describe('ask_team', () => {
  it('crea la pregunta con la corrida y recorta las respuestas rápidas a 4', async () => {
    const run = await repo.startRun('manual', null);
    const dispatch = createDispatcher({ meta: fakeMeta(), repo, execute: async () => ({}) });
    const res = await dispatch('ask_team', {
      question: '¿Se están contestando los WhatsApp?', why: 'Para decidir entre conjuntos',
      quick_answers: ['Sí', 'No', 'A veces', 'No sé', 'Otra', ''],
    }, { runId: run.id, settings: {} });
    expect(res.ok).toBe(true);
    const q = await repo.getQuestion(res.question_id);
    expect(q).toMatchObject({ run_id: run.id, question: '¿Se están contestando los WhatsApp?', why: 'Para decidir entre conjuntos', status: 'open' });
    expect(q.quick_answers).toEqual(['Sí', 'No', 'A veces', 'No sé']);
  });

  it('sin pregunta devuelve error al modelo', async () => {
    const dispatch = createDispatcher({ meta: fakeMeta(), repo, execute: async () => ({}) });
    const res = await dispatch('ask_team', { question: '  ', why: 'x' }, { runId: null, settings: {} });
    expect(res.error).toBe('Falta la pregunta.');
  });
});

describe('preguntas en el repo', () => {
  it('responder solo una vez; descartar solo si está abierta', async () => {
    const q = await repo.addQuestion({ question: 'P1', why: '', quickAnswers: [] });
    const answered = await repo.answerQuestion(q.id, 'Sí, se contestan', user.id);
    expect(answered).toMatchObject({ status: 'answered', answer: 'Sí, se contestan', answered_by_name: 'Santi' });
    await expect(repo.answerQuestion(q.id, 'otra', user.id)).rejects.toMatchObject({ status: 409 });
    await expect(repo.dismissQuestion(q.id)).rejects.toMatchObject({ status: 409 });
    const q2 = await repo.addQuestion({ question: 'P2', why: '', quickAnswers: [] });
    expect((await repo.dismissQuestion(q2.id)).status).toBe('dismissed');
  });
});

describe('contexto del agente', () => {
  it('incluye las abiertas y las respondidas desde que arrancó la última corrida terminada', async () => {
    await ctx.db.query('DELETE FROM ad_questions');
    await ctx.db.query('DELETE FROM ad_runs');
    // Corrida A: arrancó 10:00, terminó 10:05. Una respuesta de las 10:02 (durante A) no la vio A.
    const a = await repo.startRun('daily', null);
    await repo.finishRun(a.id, { status: 'done', report: 'x' });
    await setTimes('ad_runs', a.id, { started_at: '2026-10-14T10:00:00Z', finished_at: '2026-10-14T10:05:00Z' });
    const during = await repo.addQuestion({ question: 'Durante A', why: '', quickAnswers: [] });
    await repo.answerQuestion(during.id, 'resp durante', user.id);
    await setTimes('ad_questions', during.id, { answered_at: '2026-10-14T10:02:00Z' });
    const before = await repo.addQuestion({ question: 'Antes de A', why: '', quickAnswers: [] });
    await repo.answerQuestion(before.id, 'resp antes', user.id);
    await setTimes('ad_questions', before.id, { answered_at: '2026-10-14T09:00:00Z' });
    const open = await repo.addQuestion({ question: 'Abierta', why: '', quickAnswers: ['Sí'] });

    const text = await buildContext({ meta: fakeMeta(), repo });
    expect(contextSection(text, 'openQuestions')).toEqual([{ id: open.id, question: 'Abierta', created_at: expect.any(String) }]);
    const answered = contextSection(text, 'answeredQuestions');
    expect(answered.map((q) => q.question)).toEqual(['Durante A']);
    expect(answered[0]).toMatchObject({ answer: 'resp durante', answered_by: 'Santi' });
  });
});

describe('rutas de preguntas', () => {
  let app, admin, equipo, adminUser;
  beforeAll(async () => {
    app = await createTestContext({ ads: { meta: fakeMeta(), anthropic: fakeAnthropic([]), config } });
    ({ agent: admin, user: adminUser } = await app.asUser({ template: 'admin', name: 'Sofi' }));
    ({ agent: equipo } = await app.asUser({ template: 'equipo' }));
  });
  afterAll(() => app.close());

  const newQuestion = (text = '¿Se contestan los WhatsApp?') => createAdsRepo(app.db).addQuestion({ question: text, why: 'decidir', quickAnswers: ['Sí', 'No'] });

  async function waitIdle() {
    for (let i = 0; i < 50; i++) {
      const { rows } = await app.db.query("SELECT 1 FROM ad_runs WHERE status = 'running'");
      if (!rows.length) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('la corrida no terminó');
  }

  it('lista abiertas, cuenta en el resumen y responde (una sola vez)', async () => {
    const q = await newQuestion();
    const list = await equipo.get('/api/ads/questions');
    expect(list.status).toBe(200);
    expect(list.body.questions[0]).toMatchObject({ id: q.id, quick_answers: ['Sí', 'No'] });
    expect((await equipo.get('/api/ads/overview')).body.openQuestions).toBe(1);

    expect((await equipo.post(`/api/ads/questions/${q.id}/answer`).send({ answer: 'Sí' })).status).toBe(403);
    expect((await admin.post(`/api/ads/questions/${q.id}/answer`).send({ answer: '  ' })).status).toBe(400);
    const res = await admin.post(`/api/ads/questions/${q.id}/answer`).send({ answer: 'Sí, todas' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ question: { status: 'answered', answer: 'Sí, todas', answered_by_name: 'Sofi' }, run: null, note: null });
    expect((await admin.post(`/api/ads/questions/${q.id}/answer`).send({ answer: 'otra' })).status).toBe(409);
    const answered = (await equipo.get('/api/ads/questions?status=answered')).body.questions;
    expect(answered[0].id).toBe(q.id);
  });

  it('guardar y analizar ahora arranca una corrida', async () => {
    const q = await newQuestion('P analizar');
    const res = await admin.post(`/api/ads/questions/${q.id}/answer`).send({ answer: '6 empresas reales', analyze: true });
    expect(res.status).toBe(200);
    expect(res.body.run).toMatchObject({ kind: 'manual', status: 'running', started_by: adminUser.id });
    await waitIdle();
  });

  it('si ya hay un análisis corriendo, guarda la respuesta y avisa', async () => {
    await createAdsRepo(app.db).startRun('manual', null); // queda "running"
    const q = await newQuestion('P con corrida');
    const res = await admin.post(`/api/ads/questions/${q.id}/answer`).send({ answer: 'Sí', analyze: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ question: { status: 'answered' }, run: null, note: 'Ya hay un análisis corriendo: el agente la toma en el próximo.' });
    await app.db.query("UPDATE ad_runs SET status = 'failed' WHERE status = 'running'");
  });

  it('descartar', async () => {
    const q = await newQuestion('P descartar');
    expect((await equipo.post(`/api/ads/questions/${q.id}/dismiss`)).status).toBe(403);
    const res = await admin.post(`/api/ads/questions/${q.id}/dismiss`);
    expect(res.body.question.status).toBe('dismissed');
    expect((await admin.post(`/api/ads/questions/${q.id}/dismiss`)).status).toBe(409);
  });
});
