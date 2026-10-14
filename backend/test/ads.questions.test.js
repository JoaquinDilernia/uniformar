import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { fakeMeta, contextSection } from './helpers/adsFakes.js';
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
