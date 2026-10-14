# Pauta: preguntas del agente, posts de IG y videos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el equipo pueda contestarle al agente de pauta desde el panel, promocionar posts/reels existentes de @uniform.ar y subir videos como piezas de anuncio.

**Architecture:** Todo vive en el módulo de pauta existente (`backend/src/ads/*`, `backend/src/repo/ads.js`, `backend/src/routes/ads.js`, `frontend/src/pages/ads/*`). Preguntas: herramienta nueva del agente + tabla `ad_questions` + tarjetas en el Resumen. Posts de IG: lectura de `/{ig-user}/media` + creative con `source_instagram_media_id` + tabla `ad_ig_promotions`. Videos: subida directa navegador → R2 con URL firmada (token JWT de subida), Meta descarga el video por `file_url`.

**Tech Stack:** Node 20 ESM, Express 5, Postgres (PGlite en tests), zod, vitest + supertest; React 18 + TanStack Query, vitest + Testing Library; Meta Graph API v23.0; Cloudflare R2 vía `@aws-sdk/client-s3`.

**Spec:** `docs/superpowers/specs/2026-10-14-pauta-preguntas-videos-ig-design.md`

## Global Constraints

- Textos de UI, errores y prompt en español rioplatense (vos), igual que el resto del panel.
- Sin dependencias nuevas: usar `jsonwebtoken`, `file-type`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` que ya están.
- Meta Graph API `v23.0` (constante `V` en `services/meta.js`).
- Imágenes de piezas: JPG/PNG ≤ 8 MB (sin cambios). Videos de piezas: MP4 (`video/mp4`) o MOV (`video/quicktime`) ≤ 200 MB.
- Toda acción nueva sobre Meta que proponga el agente queda **pendiente de aprobación** (solo `pause_ad` puede ser autónoma, como hoy).
- Preguntas: responder/descartar requiere `ads.edit`; ver requiere `ads.view`.
- Cada parte (A, C, B) se puede mergear sola: migraciones `003_ad_questions.sql`, `004_ad_ig_promotions.sql`, `005_files_video.sql`.
- Commits: mensajes en español con prefijo convencional (`feat(pauta): …`) y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests backend: `cd backend && npx vitest run <archivo>`; frontend: `cd frontend && npx vitest run <archivo>`.

## Review Focus

- Una respuesta dada **mientras corre un análisis** tiene que llegarle a la corrida siguiente (no perderse porque esa corrida terminó después) → test en Task 1.
- "Guardar y analizar ahora" con un análisis ya corriendo guarda la respuesta y avisa, sin error → test en Task 2.
- Promocionar dos veces el mismo post en el mismo conjunto (doble toque o el agente que lo vuelve a proponer) → 409, sin anuncio duplicado → test en Task 5.
- Confirmar dos veces la misma subida de video (reintento/doble clic) devuelve el mismo archivo, no un 500 → test en Task 8.
- Video subido incompleto o que no es video de verdad → se rechaza y se borra del storage → test en Task 8.

---

## Parte A — Preguntas del agente

### Task 1: Preguntas en la base y en el agente

**Files:**
- Create: `backend/src/db/migrations/003_ad_questions.sql`
- Create: `backend/test/helpers/adsFakes.js`
- Create: `backend/test/ads.questions.test.js`
- Modify: `backend/test/ads.test.js` (usar los fakes compartidos)
- Modify: `backend/src/repo/ads.js`
- Modify: `backend/src/ads/tools.js`
- Modify: `backend/src/ads/agent.js` (`createDispatcher`, `buildContext`)
- Modify: `backend/src/ads/systemPrompt.js`

**Interfaces:**
- Produces (repo): `addQuestion({ runId, question, why, quickAnswers }) → row`, `getQuestion(id) → row` (con `answered_by_name`), `listQuestions({ status = 'open', limit = 30 }) → rows`, `countOpenQuestions() → number`, `answerQuestion(id, answer, userId) → row` (409 si no está `open`), `dismissQuestion(id) → row` (409 si no está `open`), `answeredSinceLastRun() → [{ question, answer, answered_at, answered_by_name }]`.
- Produces (agente): herramienta `ask_team` `{ question, why, quick_answers? }`; secciones de contexto `openQuestions`, `answeredQuestions`.
- Produces (tests): `backend/test/helpers/adsFakes.js` exporta `config`, `fakeMeta()`, `fakeAnthropic(script)`, `toolTurn(...)`, `contextSection(text, name)`.

- [ ] **Step 1: Mover los fakes de `ads.test.js` a un helper compartido**

Crear `backend/test/helpers/adsFakes.js` con el contenido que hoy está arriba de `backend/test/ads.test.js` (líneas `const config …` hasta `const toolTurn …`), exportado, más un parser de secciones del contexto:

```js
import { CONVERSATION } from '../../src/ads/metrics.js';

export const config = { accountId: 'act_1', pageId: '111', igUserId: '222', pageBackedIgId: '333', whatsappNumber: '5491100000000' };

export function fakeMeta() {
  const calls = [];
  const log = (name) => (...args) => { calls.push([name, ...args]); };
  return {
    calls,
    getCampaigns: async () => [{ id: '900', name: 'UNIFORMAR | MENSAJES WPP', objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', effective_status: 'PAUSED', daily_budget: '650000' }],
    getAdsets: async () => [{ id: '901', name: 'WPP_INTERESES_AMBA_20261009', campaign_id: '900', status: 'ACTIVE', effective_status: 'CAMPAIGN_PAUSED', optimization_goal: 'CONVERSATIONS' }],
    getAds: async () => [{ id: '902', name: 'AD1', adset_id: '901', campaign_id: '900', status: 'ACTIVE', effective_status: 'ACTIVE' }],
    getInsights: async (level) => (level === 'ad'
      ? [{ ad_id: '902', spend: '9000', impressions: '1000', actions: [{ action_type: CONVERSATION, value: '3' }] }]
      : [{ adset_id: '901', date_start: '2026-10-09', spend: '9000', actions: [{ action_type: CONVERSATION, value: '3' }] }]),
    setStatus: async (...a) => { log('setStatus')(...a); return { success: true }; },
    updateDailyBudget: async (...a) => { log('updateDailyBudget')(...a); return { success: true }; },
    createAdset: async (p) => { log('createAdset')(p); return { id: '903' }; },
    uploadImage: async () => { log('uploadImage')(); return `hash${calls.filter((c) => c[0] === 'uploadImage').length}`; },
    createCreative: async (spec) => { log('createCreative')(spec); return { id: '904' }; },
    createAd: async (a) => { log('createAd')(a); return { id: '905' }; },
    searchInterests: async () => [{ id: '6003436950375', name: 'Restaurantes' }],
  };
}

// Simula a Claude: devuelve los turnos del guion en orden; después, un informe "fin"
export function fakeAnthropic(script) {
  let turn = 0;
  return {
    beta: {
      messages: {
        stream: (params) => ({
          finalMessage: async () => {
            fakeAnthropic.lastParams = params;
            return script[turn++] ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'fin' }] };
          },
        }),
      },
    },
  };
}

export const toolTurn = (...blocks) => ({ stop_reason: 'tool_use', content: blocks.map(([name, input], i) => ({ type: 'tool_use', id: `t${i}`, name, input })) });

// El contexto del agente es "## nombre\n{json}" por sección
export function contextSection(text, name) {
  const m = text.match(new RegExp(`## ${name}\\n(.*)`));
  if (!m) throw new Error(`no está la sección ${name}`);
  return JSON.parse(m[1]);
}
```

En `backend/test/ads.test.js` borrar esas definiciones (`config`, `fakeMeta`, `fakeAnthropic`, `toolTurn`) y reemplazar los imports del principio por:

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1 } from './helpers/fixtures.js';
import { config, fakeMeta, fakeAnthropic, toolTurn } from './helpers/adsFakes.js';
import { buildWhatsappCreativeSpec, buildAdName } from '../src/ads/creativeSpec.js';
import { summarizeRow, totals, CONVERSATION } from '../src/ads/metrics.js';
```

- [ ] **Step 2: Correr los tests de pauta para confirmar que el refactor no rompió nada**

Run: `cd backend && npx vitest run test/ads.test.js`
Expected: PASS (los mismos tests que antes)

- [ ] **Step 3: Escribir los tests que fallan**

Crear `backend/test/ads.questions.test.js`:

```js
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
```

- [ ] **Step 4: Correr los tests y ver que fallan**

Run: `cd backend && npx vitest run test/ads.questions.test.js`
Expected: FAIL (`repo.addQuestion is not a function` / no existe `ad_questions`)

- [ ] **Step 5: Migración**

Crear `backend/src/db/migrations/003_ad_questions.sql`:

```sql
-- Preguntas del agente de pauta al equipo (se contestan desde el Resumen)
CREATE TABLE ad_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES ad_runs(id) ON DELETE SET NULL,
  question text NOT NULL,
  why text NOT NULL DEFAULT '',
  quick_answers jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','dismissed')),
  answer text,
  answered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_questions_open ON ad_questions (created_at DESC) WHERE status = 'open';
```

- [ ] **Step 6: Repo**

En `backend/src/repo/ads.js`, agregar arriba (debajo de `DECISION_COLS`):

```js
const QUESTION_SELECT = 'SELECT q.*, u.name AS answered_by_name FROM ad_questions q LEFT JOIN users u ON u.id = q.answered_by';
```

y dentro del objeto que devuelve `createAdsRepo`, después de `deleteLearning`:

```js
    // quick_answers es jsonb: el array va serializado (pg mandaría un array de Postgres)
    addQuestion: (q) => one(
      'INSERT INTO ad_questions (run_id, question, why, quick_answers) VALUES ($1, $2, $3, $4) RETURNING *',
      [q.runId ?? null, q.question, q.why ?? '', JSON.stringify(q.quickAnswers ?? [])],
    ),
    getQuestion: (id) => one(`${QUESTION_SELECT} WHERE q.id = $1`, [id], 'No existe esa pregunta.'),
    async listQuestions({ status = 'open', limit = 30 } = {}) {
      const { rows } = await db.query(
        `${QUESTION_SELECT} WHERE q.status = $1 ORDER BY coalesce(q.answered_at, q.created_at) DESC LIMIT $2`,
        [status, limit],
      );
      return rows;
    },
    countOpenQuestions: async () => (await one("SELECT count(*)::int AS n FROM ad_questions WHERE status = 'open'")).n,
    // Solo si sigue abierta: evita que dos personas respondan la misma
    async answerQuestion(id, answer, userId) {
      const { rows } = await db.query(
        "UPDATE ad_questions SET status = 'answered', answer = $2, answered_by = $3, answered_at = now() WHERE id = $1 AND status = 'open' RETURNING id",
        [id, answer, userId],
      );
      if (!rows[0]) {
        await this.getQuestion(id);
        throw conflict('Esta pregunta ya fue respondida o descartada.');
      }
      return this.getQuestion(id);
    },
    async dismissQuestion(id) {
      const { rows } = await db.query("UPDATE ad_questions SET status = 'dismissed' WHERE id = $1 AND status = 'open' RETURNING id", [id]);
      if (!rows[0]) {
        await this.getQuestion(id);
        throw conflict('Esta pregunta ya fue respondida o descartada.');
      }
      return this.getQuestion(id);
    },
    // Respondidas desde que ARRANCÓ la última corrida terminada: lo que se contestó durante esa corrida no lo vio
    async answeredSinceLastRun() {
      const { rows } = await db.query(
        `SELECT q.question, q.answer, q.answered_at, u.name AS answered_by_name
         FROM ad_questions q LEFT JOIN users u ON u.id = q.answered_by
         WHERE q.status = 'answered'
           AND q.answered_at > coalesce((SELECT max(started_at) FROM ad_runs WHERE status = 'done'), '-infinity'::timestamptz)
         ORDER BY q.answered_at LIMIT 20`,
      );
      return rows;
    },
```

- [ ] **Step 7: Herramienta `ask_team`**

En `backend/src/ads/tools.js`, agregar al final de `TOOL_DEFINITIONS` (antes del `];`):

```js
  {
    name: 'ask_team',
    description: 'Hacerle una pregunta al equipo cuando te falta un dato que solo ellos tienen (calidad de las consultas que llegan, si se contestan los WhatsApp, stock, promos, ventas). La ven en el panel y la contestan; la respuesta te llega en answeredQuestions en una próxima corrida. Una pregunta por llamada, concreta y que se pueda contestar en una o dos líneas. No repitas preguntas que sigan en openQuestions.',
    input_schema: {
      type: 'object',
      properties: {
        question: s('La pregunta, concreta (ej. "De las 20 conversaciones de esta semana, ¿cuántas fueron empresas con +30 prendas y de qué conjunto vinieron?")'),
        why: s('Qué decisión destraba la respuesta'),
        quick_answers: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Opcional: hasta 4 respuestas típicas cortas para contestar con un toque (ej. "Sí", "No")' },
      },
      required: ['question', 'why'],
    },
  },
```

- [ ] **Step 8: Dispatcher y contexto**

En `backend/src/ads/agent.js`, dentro de `createDispatcher`, después del bloque de `record_outcome`:

```js
      if (name === 'ask_team') {
        const question = String(input.question ?? '').trim();
        if (!question) return { error: 'Falta la pregunta.' };
        const quickAnswers = (Array.isArray(input.quick_answers) ? input.quick_answers : [])
          .filter((a) => typeof a === 'string' && a.trim())
          .slice(0, 4)
          .map((a) => a.trim().slice(0, 80));
        const q = await repo.addQuestion({ runId, question, why: String(input.why ?? ''), quickAnswers });
        return { ok: true, question_id: q.id, note: 'La pregunta quedó en el panel; la respuesta te llega en una próxima corrida.' };
      }
```

En `buildContext`, sumar dos consultas al `Promise.all` y dos secciones:

```js
  const [snapshot, settings, unusedCreatives, openRequests, learnings, pending, recent, toEvaluate, openQuestions, answeredQuestions] = await Promise.all([
    buildSnapshot(meta),
    repo.getSettings(),
    repo.listCreatives({ status: 'unused' }),
    repo.listRequests({ status: 'open' }),
    repo.listLearnings({ activeOnly: true }),
    repo.listDecisions({ status: 'pending', limit: 30 }),
    repo.listDecisions({ limit: 30 }),
    repo.executedWithoutOutcome(48),
    repo.listQuestions({ status: 'open', limit: 30 }),
    repo.answeredSinceLastRun(),
  ]);
```

y dentro de `sections`, después de `decisionsToEvaluate: toEvaluate,`:

```js
    openQuestions: openQuestions.map((q) => ({ id: q.id, question: q.question, created_at: q.created_at })),
    answeredQuestions: answeredQuestions.map((q) => ({ question: q.question, answer: q.answer, answered_by: q.answered_by_name, answered_at: q.answered_at })),
```

- [ ] **Step 9: Prompt**

En `backend/src/ads/systemPrompt.js`, agregar antes de `# El informe`:

```
# Preguntas al equipo
- Si te falta un dato que solo tiene el equipo (si las consultas son de empresas reales, si se contestan los WhatsApp, stock, promos), preguntalo con ask_team: una pregunta concreta por llamada, que se conteste en una o dos líneas. Si hay respuestas típicas, sugerilas en quick_answers.
- No repitas preguntas que estén en openQuestions: siguen esperando respuesta.
- Usá answeredQuestions en el análisis de hoy. Si una respuesta vale para adelante (ej. "el conjunto abierto trae más empresas reales"), guardala con save_learning.
```

y reemplazar la línea del informe `**Qué necesito** — piezas o datos que le faltan al equipo (si no falta nada, decilo).` por:

```
**Qué necesito** — piezas que faltan; si dejaste preguntas con ask_team, mencionalo en una línea ("Te dejé 2 preguntas abajo") sin repetirlas. Si no falta nada, decilo.
```

- [ ] **Step 10: Correr los tests**

Run: `cd backend && npx vitest run test/ads.questions.test.js test/ads.test.js`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add backend/src/db/migrations/003_ad_questions.sql backend/src/repo/ads.js backend/src/ads/tools.js backend/src/ads/agent.js backend/src/ads/systemPrompt.js backend/test/helpers/adsFakes.js backend/test/ads.test.js backend/test/ads.questions.test.js
git commit -m "feat(pauta): el agente deja preguntas al equipo y lee las respuestas en la próxima corrida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rutas para responder y descartar

**Files:**
- Modify: `backend/src/routes/ads.js`
- Test: `backend/test/ads.questions.test.js`

**Interfaces:**
- Consumes: repo de Task 1 (`listQuestions`, `answerQuestion`, `dismissQuestion`, `countOpenQuestions`, `addQuestion`).
- Produces (API): `GET /api/ads/questions?status=open|answered → { questions }`; `POST /api/ads/questions/:id/answer` body `{ answer, analyze? } → { question, run, note }`; `POST /api/ads/questions/:id/dismiss → { question }`; `GET /api/ads/overview` suma `openQuestions: number`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `backend/test/ads.questions.test.js`:

```js
import { fakeAnthropic, config } from './helpers/adsFakes.js';

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
```

(Mover el `import { fakeAnthropic, config } …` arriba junto con los otros imports del archivo.)

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/ads.questions.test.js`
Expected: FAIL (404 en `/api/ads/questions`, `openQuestions` undefined)

- [ ] **Step 3: Implementar las rutas**

En `backend/src/routes/ads.js`, junto a los otros esquemas:

```js
const answerSchema = z.object({
  answer: z.string().trim().min(1, 'Escribí la respuesta').max(2000),
  analyze: z.boolean().default(false),
});
```

En `/ads/overview`, sumar el conteo:

```js
    const [settings, runs, pending, openQuestions] = await Promise.all([
      repo.getSettings(), repo.listRuns(1), repo.listDecisions({ status: 'pending', limit: 100 }), repo.countOpenQuestions(),
    ]);
```

y en el `res.json` agregar `openQuestions,` después de `pendingCount: pending.length,`.

Antes de `r.get('/ads/settings', …)`:

```js
  r.get('/ads/questions', view, async (req, res) => {
    const status = req.query.status ? parse(z.enum(['open', 'answered']), req.query.status) : 'open';
    res.json({ questions: await repo.listQuestions({ status, limit: 30 }) });
  });

  r.post('/ads/questions/:id/answer', edit, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(answerSchema, req.body);
    const question = await repo.answerQuestion(id, body.answer, req.user.id);
    let run = null;
    let note = null;
    if (body.analyze) {
      if (!startRun || !meta) {
        note = 'Respuesta guardada. El agente no está configurado para analizar ahora.';
      } else {
        try {
          const started = await startRun('manual', req.user.id);
          started.done.finally(invalidate);
          run = started.run;
        } catch (err) {
          if (err.status !== 409) throw err;
          note = 'Ya hay un análisis corriendo: el agente la toma en el próximo.';
        }
      }
    }
    res.json({ question, run, note });
  });

  r.post('/ads/questions/:id/dismiss', edit, async (req, res) => {
    res.json({ question: await repo.dismissQuestion(parse(uuid, req.params.id)) });
  });
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx vitest run test/ads.questions.test.js test/ads.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/ads.js backend/test/ads.questions.test.js
git commit -m "feat(pauta): rutas para responder y descartar preguntas del agente, con opción de analizar ahora

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tarjetas de preguntas en el Resumen

**Files:**
- Create: `frontend/src/pages/ads/format.js`
- Create: `frontend/src/pages/ads/Questions.jsx`
- Create: `frontend/src/pages/ads/Questions.test.jsx`
- Modify: `frontend/src/pages/ads/api.js`
- Modify: `frontend/src/pages/ads/AdsPage.jsx`

**Interfaces:**
- Consumes: API de Task 2.
- Produces: `format.js` exporta `ars(n)` y `when(iso)` (movidos desde `AdsPage.jsx`); `api.js` exporta `useQuestions(status)`, `useAnswerQuestion()`, `useDismissQuestion()`; `Questions.jsx` exporta `AgentQuestions({ canEdit })`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/pages/ads/Questions.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { AgentQuestions } from './Questions.jsx';

const open = [{ id: 'q1', question: '¿Se contestan los WhatsApp?', why: 'Para decidir entre conjuntos', quick_answers: ['Sí', 'No'], created_at: '2026-10-14T12:00:00Z' }];
const answered = [{ id: 'q0', question: '¿Hay stock de chaquetas?', answer: 'Sí, 200', answered_by_name: 'Sofi', answered_at: '2026-10-13T12:00:00Z', quick_answers: [] }];
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const renderIt = (canEdit) => render(
  <QueryClientProvider client={createQueryClient()}><ConfirmProvider><AgentQuestions canEdit={canEdit} /></ConfirmProvider></QueryClientProvider>,
);

describe('Preguntas del agente', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/ads/questions?status=open') return json({ questions: open });
      if (url === '/api/ads/questions?status=answered') return json({ questions: answered });
      if (url === '/api/ads/questions/q1/answer' && opts.method === 'POST') return json({ question: { ...open[0], status: 'answered' }, run: { id: 'r1' }, note: null });
      return json({});
    });
  });

  it('la respuesta rápida completa el campo y "Guardar y analizar ahora" manda analyze', async () => {
    renderIt(true);
    expect(await screen.findByText('¿Se contestan los WhatsApp?')).toBeInTheDocument();
    expect(screen.getByText('Para decidir entre conjuntos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí' }));
    expect(screen.getByLabelText('Tu respuesta')).toHaveValue('Sí');
    await userEvent.type(screen.getByLabelText('Tu respuesta'), ', 6 eran empresas');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y analizar ahora' }));
    const post = fetch.mock.calls.find(([u, o]) => u === '/api/ads/questions/q1/answer' && o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ answer: 'Sí, 6 eran empresas', analyze: true });
  });

  it('sin permiso de edición solo se lee', async () => {
    renderIt(false);
    expect(await screen.findByText('¿Se contestan los WhatsApp?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tu respuesta')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('muestra las respondidas plegadas', async () => {
    renderIt(true);
    await userEvent.click(await screen.findByRole('button', { name: /Respondidas/ }));
    expect(screen.getByText('Sí, 200')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd frontend && npx vitest run src/pages/ads/Questions.test.jsx`
Expected: FAIL (no existe `./Questions.jsx`)

- [ ] **Step 3: Formato compartido**

Crear `frontend/src/pages/ads/format.js`:

```js
export const ars = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`);
export const when = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
```

En `AdsPage.jsx`, borrar las definiciones de `ars` y `when` y agregar `import { ars, when } from './format.js';`.

- [ ] **Step 4: Hooks**

En `frontend/src/pages/ads/api.js`:
- agregar `import { toastBus } from '../../state/toastBus.js';`
- en `adsKeys` agregar `questions: ['ads', 'questions'],`
- al final:

```js
export const useQuestions = (status = 'open') => useQuery({
  queryKey: [...adsKeys.questions, status],
  queryFn: () => api.get(`/ads/questions?status=${status}`).then((r) => r.questions),
});

export function useAnswerQuestion() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: ({ id, answer, analyze }) => api.post(`/ads/questions/${id}/answer`, { answer, analyze }),
    meta: { success: false },
    onSuccess: (r, vars) => {
      if (r.note) toastBus.info(r.note);
      else toastBus.success(vars.analyze ? 'Respuesta guardada. El agente arrancó a analizar.' : 'Respuesta guardada ✓');
    },
    onSettled: refresh,
  });
}

export function useDismissQuestion() {
  const refresh = useRefreshAds();
  return useMutation({ mutationFn: (id) => api.post(`/ads/questions/${id}/dismiss`), meta: { success: 'Pregunta descartada' }, onSettled: refresh });
}
```

- [ ] **Step 5: Componente**

Crear `frontend/src/pages/ads/Questions.jsx`:

```jsx
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Chip, ChipGroup } from '../../components/ui/Chip.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Field, Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { useAnswerQuestion, useDismissQuestion, useQuestions } from './api.js';
import { when } from './format.js';
import s from './ads.module.css';

// Preguntas que el agente deja con ask_team: se contestan acá y las lee en la próxima corrida
export function AgentQuestions({ canEdit }) {
  const open = useQuestions('open');
  const answered = useQuestions('answered');
  const list = open.data ?? [];
  const done = answered.data ?? [];
  if (!open.isLoading && list.length === 0 && done.length === 0) return null;

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2>El agente pregunta</h2>
        {list.length > 0 && <small>{list.length} sin responder</small>}
      </div>
      {open.isLoading && <Spinner size={20} />}
      {!open.isLoading && list.length === 0 && <p className="muted">No hay preguntas pendientes.</p>}
      {list.map((q) => <QuestionCard key={q.id} q={q} canEdit={canEdit} />)}
      {done.length > 0 && (
        <Collapsible title="Respondidas" count={done.length}>
          {done.map((q) => (
            <div key={q.id} className={s.histRow}>
              <div className={s.grow}>
                <span>{q.question}</span>
                <small className={s.answer}>{q.answer}</small>
                <small>{q.answered_by_name ?? 'Alguien del equipo'} · {when(q.answered_at)}</small>
              </div>
            </div>
          ))}
        </Collapsible>
      )}
    </section>
  );
}

function QuestionCard({ q, canEdit }) {
  const [answer, setAnswer] = useState('');
  const answerQ = useAnswerQuestion();
  const dismiss = useDismissQuestion();
  const confirm = useConfirm();
  const busy = answerQ.isPending || dismiss.isPending;
  const empty = !answer.trim();
  const send = (analyze) => answerQ.mutate({ id: q.id, answer: answer.trim(), analyze });

  async function discard() {
    const ok = await confirm({ title: '¿Descartar la pregunta?', message: 'El agente la ve como descartada y no la vuelve a hacer.', confirmLabel: 'Descartar' });
    if (ok) dismiss.mutate(q.id);
  }

  return (
    <article className={s.reco}>
      <div className={s.recoHead}><span className={s.kind}>Pregunta</span><small>{when(q.created_at)}</small></div>
      <h3>{q.question}</h3>
      {q.why && <p className="muted">{q.why}</p>}
      {canEdit && (
        <>
          {q.quick_answers?.length > 0 && (
            <ChipGroup label="Respuestas rápidas">
              {q.quick_answers.map((a) => <Chip key={a} selected={answer === a} onClick={() => setAnswer(a)}>{a}</Chip>)}
            </ChipGroup>
          )}
          <Field label="Tu respuesta">
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} minRows={2} maxLength={2000} />
          </Field>
          <div className={s.actions}>
            <Button size="sm" disabled={empty || busy} loading={answerQ.isPending && !answerQ.variables?.analyze} onClick={() => send(false)}>Guardar</Button>
            <Button size="sm" variant="secondary" icon={Sparkles} disabled={empty || busy} loading={answerQ.isPending && answerQ.variables?.analyze} onClick={() => send(true)}>
              Guardar y analizar ahora
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={discard}>Descartar</Button>
          </div>
        </>
      )}
    </article>
  );
}
```

En `frontend/src/pages/ads/ads.module.css` agregar:

```css
.answer { color: var(--c-text-2); white-space: pre-wrap; }
```

- [ ] **Step 6: Integrar en la página**

En `AdsPage.jsx`:
- `import { AgentQuestions } from './Questions.jsx';`
- en `Summary`, justo después del `</section>` del "Último informe del agente": `<AgentQuestions canEdit={canEdit} />`
- en las opciones del `Segmented`, cambiar la de resumen por:

```jsx
          { value: 'summary', label: `Resumen${data?.openQuestions ? ` (${data.openQuestions})` : ''}` },
```

- [ ] **Step 7: Correr los tests y el build**

Run: `cd frontend && npx vitest run src/pages/ads/Questions.test.jsx && npm run build`
Expected: PASS y build sin errores

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ads
git commit -m "feat(pauta): responder las preguntas del agente desde el Resumen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Parte C — Promocionar posts y reels de IG

### Task 4: Meta — posts de IG y creative con post existente

**Files:**
- Create: `backend/test/meta.test.js`
- Modify: `backend/src/services/meta.js`
- Modify: `backend/src/ads/creativeSpec.js`
- Test: `backend/test/ads.test.js` (describe 'métricas y piezas')

**Interfaces:**
- Produces: `meta.getIgMedia(igUserId, limit = 25) → Promise<[{ id, type: 'post'|'carousel'|'reel', caption, thumbnail, permalink, timestamp, likes, comments, reach: number|null }]>`; `buildIgPostCreativeSpec({ name, pageId, igUserId, mediaId }) → spec`; constante exportada `IG_ACCESS_MSG` en `creativeSpec.js`.

- [ ] **Step 1: Tests que fallan**

Crear `backend/test/meta.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMetaClient } from '../src/services/meta.js';

// fetch falso: handler(url: URL, opts) → JSON de respuesta
function fakeFetch(handler) {
  const fn = async (url, opts = {}) => {
    const u = new URL(url);
    fn.calls.push({ url: u, opts });
    return { json: async () => handler(u, opts) };
  };
  fn.calls = [];
  return fn;
}

describe('posts de Instagram', () => {
  it('normaliza tipo, métricas y alcance; si insights falla, reach queda null', async () => {
    const fetchFn = fakeFetch((u) => {
      if (u.pathname.endsWith('/222/media')) {
        return { data: [
          { id: 'm1', media_type: 'VIDEO', media_product_type: 'REELS', caption: 'Reel', thumbnail_url: 'https://t/1.jpg', permalink: 'https://ig/1', timestamp: '2026-10-10T10:00:00+0000', like_count: 40, comments_count: 3 },
          { id: 'm2', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', media_url: 'https://t/2.jpg', permalink: 'https://ig/2', timestamp: '2026-10-09T10:00:00+0000' },
        ] };
      }
      if (u.pathname.endsWith('/m1/insights')) return { data: [{ name: 'reach', values: [{ value: 1200 }] }] };
      if (u.pathname.endsWith('/m2/insights')) return { error: { code: 10, message: 'Application does not have permission' } };
      return {};
    });
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    const posts = await meta.getIgMedia('222');
    expect(posts).toEqual([
      { id: 'm1', type: 'reel', caption: 'Reel', thumbnail: 'https://t/1.jpg', permalink: 'https://ig/1', timestamp: '2026-10-10T10:00:00+0000', likes: 40, comments: 3, reach: 1200 },
      { id: 'm2', type: 'carousel', caption: '', thumbnail: 'https://t/2.jpg', permalink: 'https://ig/2', timestamp: '2026-10-09T10:00:00+0000', likes: 0, comments: 0, reach: null },
    ]);
    expect(fetchFn.calls[0].url.searchParams.get('limit')).toBe('25');
    expect(fetchFn.calls.find((c) => c.url.pathname.endsWith('/m1/insights')).url.searchParams.get('metric')).toBe('reach');
  });
});
```

En `backend/test/ads.test.js`, sumar al import de `creativeSpec.js` `buildIgPostCreativeSpec` y dentro de `describe('métricas y piezas', …)`:

```js
  it('arma el creative que promociona un post existente de Instagram', () => {
    const spec = buildIgPostCreativeSpec({ name: 'X', pageId: '111', igUserId: '222', mediaId: '1789' });
    expect(spec).toMatchObject({
      name: 'X', object_id: '111', instagram_user_id: '222', source_instagram_media_id: '1789',
      call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
    });
    expect(spec.degrees_of_freedom_spec.creative_features_spec.enhance_cta).toEqual({ enroll_status: 'OPT_OUT' });
    expect(spec.object_story_spec).toBeUndefined();
  });
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/meta.test.js test/ads.test.js`
Expected: FAIL (`meta.getIgMedia is not a function`, `buildIgPostCreativeSpec` no exportado)

- [ ] **Step 3: Implementar `getIgMedia`**

En `backend/src/services/meta.js`, en `FIELDS` agregar:

```js
    igMedia: 'id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count',
```

y en el objeto devuelto, después de `searchInterests`:

```js
    // Últimos posts/reels de la cuenta de IG. El alcance orgánico necesita instagram_manage_insights:
    // si no está, se devuelve null sin cortar.
    async getIgMedia(igUserId, limit = 25) {
      const media = await list(`${igUserId}/media`, FIELDS.igMedia, limit);
      return Promise.all(media.map(async (m) => {
        let reach = null;
        try {
          const ins = await reqOnce(`${m.id}/insights`, { params: { metric: 'reach' } });
          reach = ins.data?.[0]?.values?.[0]?.value ?? null;
        } catch {
          reach = null;
        }
        return {
          id: m.id,
          type: m.media_product_type === 'REELS' ? 'reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'post',
          caption: m.caption ?? '',
          thumbnail: m.thumbnail_url ?? m.media_url ?? null,
          permalink: m.permalink ?? '',
          timestamp: m.timestamp,
          likes: m.like_count ?? 0,
          comments: m.comments_count ?? 0,
          reach,
        };
      }));
    },
```

- [ ] **Step 4: Implementar el creative**

En `backend/src/ads/creativeSpec.js`, al final:

```js
export const IG_ACCESS_MSG = 'La cuenta publicitaria no tiene acceso a @uniform.ar: asignala en el Business Manager (Configuración del negocio → Cuentas de Instagram → Activos conectados).';

// Promocionar un post/reel que ya está en Instagram: el anuncio usa el post original (suma likes y comentarios)
// y le agrega el botón de WhatsApp. El texto es el del post.
export function buildIgPostCreativeSpec({ name, pageId, igUserId, mediaId }) {
  return {
    name,
    object_id: pageId,
    instagram_user_id: igUserId,
    source_instagram_media_id: mediaId,
    call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link: WHATSAPP_LINK } },
    degrees_of_freedom_spec: NO_AI_ENHANCEMENTS,
  };
}
```

- [ ] **Step 5: Correr los tests**

Run: `cd backend && npx vitest run test/meta.test.js test/ads.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/meta.js backend/src/ads/creativeSpec.js backend/test/meta.test.js backend/test/ads.test.js
git commit -m "feat(pauta): leer posts de Instagram y armar el creative para promocionarlos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Promocionar un post — ejecución, registro y rutas

**Files:**
- Create: `backend/src/db/migrations/004_ad_ig_promotions.sql`
- Create: `backend/src/ads/igPosts.js`
- Create: `backend/test/ads.ig.test.js`
- Modify: `backend/src/repo/ads.js`
- Modify: `backend/src/ads/agent.js` (`createExecutor`)
- Modify: `backend/src/routes/ads.js`
- Modify: `backend/src/buildApp.js`
- Modify: `backend/test/helpers/adsFakes.js` (`getIgMedia` en `fakeMeta`)

**Interfaces:**
- Consumes: `meta.getIgMedia`, `buildIgPostCreativeSpec`, `IG_ACCESS_MSG` (Task 4).
- Produces (repo): `addIgPromotion({ igMediaId, permalink, adId, adsetId, adsetName, userId }) → row`, `findIgPromotion(mediaId, adsetId) → row|undefined`, `listIgPromotions() → rows`.
- Produces: `execute(tool, input, ctx = {})` — ahora con tercer parámetro `{ userId }`; acción `promote_ig_post` con input `{ ig_media_id, adset_id, adset_name?, permalink? } → { ad_id, name }`.
- Produces: `loadIgPosts({ meta, repo, igUserId }) → posts con promotedIn: [{ adset_id, adset_name, ad_id, created_at }]` en `backend/src/ads/igPosts.js`.
- Produces (API): `GET /api/ads/ig-posts[?refresh=1] → { posts }`; `POST /api/ads/ig-posts/:mediaId/promote` body `{ adset_id, adset_name?, permalink? } → { ok, ad_id, name }`.
- `createAdsRouter` recibe además `config`.

- [ ] **Step 1: Agregar `getIgMedia` al fake de Meta**

En `backend/test/helpers/adsFakes.js`, dentro de `fakeMeta()` después de `searchInterests`:

```js
    getIgMedia: async () => [
      { id: '17900000000123456', type: 'reel', caption: 'Así quedó el equipo de Panadería Maná', thumbnail: 'https://t/1.jpg', permalink: 'https://ig/1', timestamp: '2026-10-10T10:00:00+0000', likes: 40, comments: 3, reach: 1200 },
      { id: '17900000000654321', type: 'post', caption: 'Chaquetas bordadas', thumbnail: 'https://t/2.jpg', permalink: 'https://ig/2', timestamp: '2026-10-09T10:00:00+0000', likes: 12, comments: 0, reach: null },
    ],
```

- [ ] **Step 2: Tests que fallan**

Crear `backend/test/ads.ig.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, fakeAnthropic } from './helpers/adsFakes.js';

const REEL = '17900000000123456';
let ctx, meta, admin, equipo;
beforeAll(async () => {
  meta = fakeMeta();
  ctx = await createTestContext({ ads: { meta, anthropic: fakeAnthropic([]), config } });
  admin = (await ctx.asUser({ template: 'admin', name: 'Sofi' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
});
afterAll(() => ctx.close());
beforeEach(() => { meta.calls.length = 0; });

describe('posts de Instagram', () => {
  it('lista los posts', async () => {
    const res = await equipo.get('/api/ads/ig-posts');
    expect(res.status).toBe(200);
    expect(res.body.posts[0]).toMatchObject({ id: REEL, type: 'reel', likes: 40, promotedIn: [] });
  });

  it('promocionar crea creative con el post original + anuncio, y lo registra', async () => {
    expect((await equipo.post(`/api/ads/ig-posts/${REEL}/promote`).send({ adset_id: '901' })).status).toBe(403);
    const res = await admin.post(`/api/ads/ig-posts/${REEL}/promote`).send({ adset_id: '901', adset_name: 'WPP_INTERESES_AMBA_20261009', permalink: 'https://ig/1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, ad_id: '905', name: expect.stringMatching(/^WPPINTERESESAMBA_IG123456_\d{8}$/) });
    const spec = meta.calls.find((c) => c[0] === 'createCreative')[1];
    expect(spec).toMatchObject({ source_instagram_media_id: REEL, instagram_user_id: '222', object_id: '111' });
    expect(meta.calls.find((c) => c[0] === 'createAd')[1]).toMatchObject({ adsetId: '901', creativeId: '904', status: 'ACTIVE' });

    const posts = (await equipo.get('/api/ads/ig-posts')).body.posts;
    expect(posts[0].promotedIn).toEqual([{ adset_id: '901', adset_name: 'WPP_INTERESES_AMBA_20261009', ad_id: '905', created_at: expect.any(String) }]);
    const [d] = (await admin.get('/api/ads/decisions')).body.decisions;
    expect(d).toMatchObject({ tool: 'promote_ig_post', status: 'executed' });
    const { rows: [promo] } = await ctx.db.query('SELECT p.*, u.name FROM ad_ig_promotions p JOIN users u ON u.id = p.created_by');
    expect(promo).toMatchObject({ ig_media_id: REEL, permalink: 'https://ig/1', name: 'Sofi' });
  });

  it('el mismo post en el mismo conjunto no se promociona dos veces', async () => {
    const res = await admin.post(`/api/ads/ig-posts/${REEL}/promote`).send({ adset_id: '901' });
    expect(res.status).toBe(409);
    expect(meta.calls.find((c) => c[0] === 'createAd')).toBeUndefined();
  });

  it('sin acceso a @uniform.ar: error claro y NO usa la cuenta de la página', async () => {
    const original = meta.createCreative;
    meta.createCreative = async (spec) => {
      meta.calls.push(['createCreative', spec]);
      throw new Error('Meta 200: Permissions error (La cuenta publicitaria no tiene acceso a esta cuenta de Instagram.)');
    };
    try {
      const res = await admin.post('/api/ads/ig-posts/17900000000654321/promote').send({ adset_id: '901' });
      expect(res.status).toBe(502);
      expect(res.body.error.message).toContain('La cuenta publicitaria no tiene acceso a @uniform.ar');
      expect(meta.calls.filter((c) => c[0] === 'createCreative')).toHaveLength(1);
    } finally {
      meta.createCreative = original;
    }
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/ads.ig.test.js`
Expected: FAIL (404 en `/api/ads/ig-posts`)

- [ ] **Step 4: Migración**

Crear `backend/src/db/migrations/004_ad_ig_promotions.sql`:

```sql
-- Posts/reels de Instagram promocionados como anuncio (para marcar "ya promocionado" y no duplicar)
CREATE TABLE ad_ig_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_media_id text NOT NULL,
  permalink text NOT NULL DEFAULT '',
  meta_ad_id text NOT NULL,
  meta_adset_id text NOT NULL,
  adset_name text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_ig_promotions_media ON ad_ig_promotions (ig_media_id);
```

- [ ] **Step 5: Repo**

En `backend/src/repo/ads.js`, al final del objeto:

```js
    addIgPromotion: (p) => one(
      `INSERT INTO ad_ig_promotions (ig_media_id, permalink, meta_ad_id, meta_adset_id, adset_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [p.igMediaId, p.permalink ?? '', p.adId, p.adsetId, p.adsetName ?? '', p.userId ?? null],
    ),
    findIgPromotion: (mediaId, adsetId) => one('SELECT * FROM ad_ig_promotions WHERE ig_media_id = $1 AND meta_adset_id = $2 LIMIT 1', [mediaId, adsetId]),
    async listIgPromotions() {
      const { rows } = await db.query('SELECT * FROM ad_ig_promotions ORDER BY created_at DESC LIMIT 500');
      return rows;
    },
```

- [ ] **Step 6: `loadIgPosts`**

Crear `backend/src/ads/igPosts.js`:

```js
// Posts de IG con dónde ya se promocionaron (lo usan el panel y el contexto del agente)
export async function loadIgPosts({ meta, repo, igUserId }) {
  const [posts, promos] = await Promise.all([meta.getIgMedia(igUserId), repo.listIgPromotions()]);
  return posts.map((p) => ({
    ...p,
    promotedIn: promos
      .filter((x) => x.ig_media_id === p.id)
      .map((x) => ({ adset_id: x.meta_adset_id, adset_name: x.adset_name, ad_id: x.meta_ad_id, created_at: x.created_at })),
  }));
}
```

- [ ] **Step 7: Executor**

En `backend/src/ads/agent.js`:
- cambiar el import de `creativeSpec.js` a `import { buildAdName, buildWhatsappCreativeSpec, buildIgPostCreativeSpec, IG_ACCESS_MSG } from './creativeSpec.js';`
- dentro de `createExecutor`, después de `publishCreative`:

```js
  async function promoteIgPost({ ig_media_id: mediaId, adset_id: adsetId, adset_name: adsetName, permalink }, { userId } = {}) {
    if (await repo.findIgPromotion(mediaId, adsetId)) throw conflict('Ese post ya está promocionado en ese conjunto.');
    const name = buildAdName({ adsetName: adsetName || adsetId, creativeName: `IG${mediaId.slice(-6)}`, date: artDate() });
    let creative;
    try {
      creative = await meta.createCreative(buildIgPostCreativeSpec({ name, pageId: config.pageId, igUserId: config.igUserId, mediaId }));
    } catch (err) {
      // Acá no hay respaldo con la cuenta de la página: el post existe solo en @uniform.ar
      if (/instagram/i.test(err.message)) throw new Error(`${IG_ACCESS_MSG} (${err.message})`);
      throw err;
    }
    const ad = await meta.createAd({ name, adsetId, creativeId: creative.id, status: 'ACTIVE' });
    await repo.addIgPromotion({ igMediaId: mediaId, permalink, adId: ad.id, adsetId, adsetName, userId });
    return { ad_id: ad.id, name };
  }
```

- cambiar la firma devuelta a `return async function execute(tool, input, ctx = {}) {` y agregar el caso antes de `default:`:

```js
      case 'promote_ig_post':
        return promoteIgPost(input, ctx);
```

- [ ] **Step 8: Rutas**

En `backend/src/routes/ads.js`:
- `import { loadIgPosts } from '../ads/igPosts.js';`
- esquema:

```js
const promoteSchema = z.object({ adset_id: metaId, adset_name: z.string().max(200).default(''), permalink: z.string().max(500).default('') });
```

- firma: `export function createAdsRouter({ repo, meta, startRun, execute, config }) {`
- debajo de `invalidate`:

```js
  let igCache = null;
  async function igPosts(force) {
    if (!force && igCache && Date.now() - igCache.at < SNAPSHOT_TTL_MS) return igCache.data;
    const data = await loadIgPosts({ meta, repo, igUserId: config.igUserId });
    igCache = { at: Date.now(), data };
    return data;
  }
```

- en el approve, pasar el usuario: `const result = await execute(d.tool, d.input, { userId: req.user.id });` y después de `invalidate();` agregar `igCache = null;`
- antes de `r.get('/ads/requests', …)`:

```js
  r.get('/ads/ig-posts', view, needMeta, async (req, res) => {
    try {
      res.json({ posts: await igPosts(req.query.refresh === '1') });
    } catch (err) {
      throw new AppError(502, 'META_ERROR', `Instagram no respondió: ${err.message}`);
    }
  });

  r.post('/ads/ig-posts/:mediaId/promote', edit, needMeta, async (req, res) => {
    const mediaId = parse(metaId, req.params.mediaId);
    const body = parse(promoteSchema, req.body);
    const input = { ig_media_id: mediaId, adset_id: body.adset_id, adset_name: body.adset_name, permalink: body.permalink };
    const base = { tool: 'promote_ig_post', input, title: `Promocionar post de Instagram en ${body.adset_name || body.adset_id}`, reason: 'Hecho a mano desde el panel.' };
    try {
      const result = await execute('promote_ig_post', input, { userId: req.user.id });
      await repo.addDecision({ ...base, status: 'executed', result });
      invalidate();
      igCache = null;
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err.status === 409) throw err;
      await repo.addDecision({ ...base, status: 'failed', error: String(err.message || err) });
      throw new AppError(502, 'META_ERROR', `Meta rechazó el anuncio: ${err.message}`);
    }
  });
```

En `backend/src/buildApp.js`, pasar `config`:

```js
  api.use(createAdsRouter({ repo: adsRepo, meta: ads.meta, startRun, execute, config: adsConfig }));
```

- [ ] **Step 9: Correr los tests**

Run: `cd backend && npx vitest run test/ads.ig.test.js test/ads.test.js test/ads.questions.test.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/db/migrations/004_ad_ig_promotions.sql backend/src/ads/igPosts.js backend/src/ads/agent.js backend/src/repo/ads.js backend/src/routes/ads.js backend/src/buildApp.js backend/test/ads.ig.test.js backend/test/helpers/adsFakes.js
git commit -m "feat(pauta): promocionar posts y reels de Instagram en un conjunto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: El agente ve los posts y puede recomendar promocionarlos

**Files:**
- Modify: `backend/src/ads/tools.js`
- Modify: `backend/src/ads/agent.js` (`buildContext`, `createAgentRunner`)
- Modify: `backend/src/ads/systemPrompt.js`
- Modify: `backend/src/buildApp.js`
- Test: `backend/test/ads.ig.test.js`

**Interfaces:**
- Consumes: `loadIgPosts` (Task 5), `execute(..., ctx)` (Task 5).
- Produces: `buildContext({ meta, repo, config })` — sección `igPosts`; herramienta `promote_ig_post` en `TOOL_DEFINITIONS` y `META_ACTIONS`; `createAgentRunner({ anthropic, meta, repo, execute, model, config })`.

- [ ] **Step 1: Tests que fallan**

Agregar a `backend/test/ads.ig.test.js` (imports arriba: `import { createAdsRepo } from '../src/repo/ads.js';`, `import { createDispatcher, buildContext } from '../src/ads/agent.js';`, y `contextSection` desde `./helpers/adsFakes.js`):

```js
describe('agente y posts de IG', () => {
  it('promote_ig_post queda pendiente aunque el modo autónomo esté prendido', async () => {
    const repo = createAdsRepo(ctx.db);
    const executed = [];
    const dispatch = createDispatcher({ meta, repo, execute: async (...a) => { executed.push(a); return {}; } });
    const res = await dispatch('promote_ig_post', {
      ig_media_id: '17900000000654321', adset_id: '901', adset_name: 'WPP_INTERESES_AMBA_20261009',
      title: 'Promocionar el post de chaquetas', reason: '12 likes orgánicos', expected_impact: 'más conversaciones',
    }, { runId: null, settings: { autonomous: true } });
    expect(res).toMatchObject({ queued: true });
    expect(executed).toHaveLength(0);
    const pending = (await admin.get('/api/ads/decisions?status=pending')).body.decisions;
    expect(pending.find((d) => d.tool === 'promote_ig_post')).toBeTruthy();
  });

  it('el contexto trae los posts con dónde ya se promocionaron', async () => {
    const text = await buildContext({ meta, repo: createAdsRepo(ctx.db), config });
    const posts = contextSection(text, 'igPosts');
    expect(posts[0]).toMatchObject({ id: REEL, type: 'reel', likes: 40, reach: 1200, promotedIn: ['WPP_INTERESES_AMBA_20261009'] });
    expect(posts[0].caption.length).toBeLessThanOrEqual(300);
  });

  it('si Instagram falla, el contexto avisa y el análisis sigue', async () => {
    const broken = { ...meta, getIgMedia: async () => { throw new Error('Meta 10: sin permiso'); } };
    const text = await buildContext({ meta: broken, repo: createAdsRepo(ctx.db), config });
    expect(contextSection(text, 'igPosts')).toEqual({ error: 'Meta 10: sin permiso' });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/ads.ig.test.js`
Expected: FAIL (`promote_ig_post` devuelve "Herramienta desconocida"; no está la sección `igPosts`)

- [ ] **Step 3: Herramienta**

En `backend/src/ads/tools.js`, en `TOOL_DEFINITIONS` después de `create_ad`:

```js
  {
    name: 'promote_ig_post',
    description: 'Proponer promocionar un post o reel que ya está publicado en @uniform.ar (lista igPosts) como anuncio en un conjunto, con botón de WhatsApp. Usa el post original: suma sus likes y comentarios, y el texto es el del post (no se edita). No lo propongas si ya está en promotedIn para ese conjunto.',
    input_schema: {
      type: 'object',
      properties: {
        ig_media_id: s('id del post (de igPosts)'), adset_id: s('ID del conjunto destino'), adset_name: s('Nombre del conjunto'),
        permalink: s('Link del post (de igPosts)'),
        ...why,
      },
      required: ['ig_media_id', 'adset_id', ...whyReq],
    },
  },
```

y `export const META_ACTIONS = new Set(['pause_ad', 'set_status', 'propose_budget_change', 'propose_adset', 'create_ad', 'promote_ig_post']);`

- [ ] **Step 4: Contexto y runner**

En `backend/src/ads/agent.js`:
- `import { loadIgPosts } from './igPosts.js';`
- arriba de `buildContext`:

```js
async function igPostsForContext({ meta, repo, config }) {
  if (!config?.igUserId || !meta.getIgMedia) return [];
  try {
    const posts = await loadIgPosts({ meta, repo, igUserId: config.igUserId });
    return posts.map((p) => ({
      id: p.id, type: p.type, caption: p.caption.slice(0, 300), timestamp: p.timestamp, permalink: p.permalink,
      likes: p.likes, comments: p.comments, reach: p.reach, promotedIn: p.promotedIn.map((x) => x.adset_name || x.adset_id),
    }));
  } catch (err) {
    return { error: String(err.message || err) };
  }
}
```

- cambiar la firma y el `Promise.all` de `buildContext` (que ya tiene las consultas de preguntas de la Task 1) a:

```js
export async function buildContext({ meta, repo, config }) {
  const [snapshot, settings, unusedCreatives, openRequests, learnings, pending, recent, toEvaluate, openQuestions, answeredQuestions, igPosts] = await Promise.all([
    buildSnapshot(meta),
    repo.getSettings(),
    repo.listCreatives({ status: 'unused' }),
    repo.listRequests({ status: 'open' }),
    repo.listLearnings({ activeOnly: true }),
    repo.listDecisions({ status: 'pending', limit: 30 }),
    repo.listDecisions({ limit: 30 }),
    repo.executedWithoutOutcome(48),
    repo.listQuestions({ status: 'open', limit: 30 }),
    repo.answeredSinceLastRun(),
    igPostsForContext({ meta, repo, config }),
  ]);
```

  y en `sections`, después de la línea `unusedCreatives: …`, agregar `igPosts,`.
- `export function createAgentRunner({ anthropic, meta, repo, execute, model = DEFAULT_MODEL, config }) {` y en `process`: `const context = await buildContext({ meta, repo, config });`

En `backend/src/buildApp.js`:

```js
    ? createAgentRunner({ anthropic: ads.anthropic, meta: ads.meta, repo: adsRepo, execute, model: ads.model, config: adsConfig })
```

- [ ] **Step 5: Prompt**

En `backend/src/ads/systemPrompt.js`, en `# Criterio` agregar al final:

```
- Posts orgánicos (igPosts): un post o reel que anduvo bien en Instagram (likes, comentarios, alcance contra el resto) y que le habla al público de un conjunto es buen candidato para promocionar con promote_ig_post. El texto del post tiene que entenderse para alguien que no conoce la marca e invitar a escribir. Para historias y reels preferí reels. No propongas un post que ya está en promotedIn para ese conjunto.
```

y en `# Cómo actuar`, en la lista de acciones sobre Meta, agregar `promote_ig_post`:

```
- Todas las acciones sobre Meta (pause_ad, set_status, propose_budget_change, propose_adset, create_ad, promote_ig_post) quedan como recomendaciones pendientes …
```

(conservar el resto de esa línea igual).

- [ ] **Step 6: Correr todos los tests del backend**

Run: `cd backend && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/ads backend/src/buildApp.js backend/test/ads.ig.test.js
git commit -m "feat(pauta): el agente ve los posts de Instagram y puede recomendar promocionarlos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Panel — sección "Posts de Instagram"

**Files:**
- Create: `frontend/src/pages/ads/IgPosts.jsx`
- Create: `frontend/src/pages/ads/IgPosts.test.jsx`
- Modify: `frontend/src/pages/ads/api.js`
- Modify: `frontend/src/pages/ads/AdsPage.jsx`
- Modify: `frontend/src/pages/ads/ads.module.css`

**Interfaces:**
- Consumes: `GET /api/ads/ig-posts`, `POST /api/ads/ig-posts/:id/promote` (Task 5); `format.js` (Task 3).
- Produces: `useIgPosts()`, `usePromoteIgPost()` en `api.js`; `IgPosts({ snapshot, canEdit })` en `IgPosts.jsx`.

- [ ] **Step 1: Test que falla**

Crear `frontend/src/pages/ads/IgPosts.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { IgPosts } from './IgPosts.jsx';

const posts = [
  { id: 'm1', type: 'reel', caption: 'Equipo de Panadería Maná', thumbnail: 'https://t/1.jpg', permalink: 'https://ig/1', timestamp: '2026-10-10T10:00:00+0000', likes: 40, comments: 3, reach: 1200, promotedIn: [] },
  { id: 'm2', type: 'post', caption: 'Chaquetas', thumbnail: 'https://t/2.jpg', permalink: 'https://ig/2', timestamp: '2026-10-09T10:00:00+0000', likes: 12, comments: 0, reach: null, promotedIn: [{ adset_id: '901', adset_name: 'WPP_ABIERTO', ad_id: '5', created_at: '2026-10-11T10:00:00Z' }] },
];
const snapshot = { adsets: [{ id: '901', name: 'WPP_ABIERTO', effectiveStatus: 'ACTIVE' }, { id: '902', name: 'WPP_INTERESES', effectiveStatus: 'PAUSED' }] };
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const renderIt = (props = {}) => render(<QueryClientProvider client={createQueryClient()}><IgPosts snapshot={snapshot} canEdit {...props} /></QueryClientProvider>);

describe('Posts de Instagram', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/ads/ig-posts') return json({ posts });
      if (url === '/api/ads/ig-posts/m1/promote' && opts.method === 'POST') return json({ ok: true, ad_id: '9' });
      return json({});
    });
  });

  it('muestra tipo, métricas y dónde ya está promocionado', async () => {
    renderIt();
    const reel = (await screen.findByText('Equipo de Panadería Maná')).closest('article');
    expect(within(reel).getByText('Reel')).toBeInTheDocument();
    expect(within(reel).getByText(/40 me gusta/)).toBeInTheDocument();
    expect(within(reel).getByText(/1\.200 de alcance/)).toBeInTheDocument();
    const post = screen.getByText('Chaquetas').closest('article');
    expect(within(post).getByText('Promocionado en WPP_ABIERTO')).toBeInTheDocument();
  });

  it('promocionar manda el conjunto elegido', async () => {
    renderIt();
    const reel = (await screen.findByText('Equipo de Panadería Maná')).closest('article');
    await userEvent.click(within(reel).getByRole('button', { name: 'Promocionar' }));
    await userEvent.selectOptions(screen.getByLabelText('Conjunto'), '902');
    await userEvent.click(screen.getByRole('button', { name: 'Promocionar en Meta' }));
    const call = fetch.mock.calls.find(([u, o]) => u === '/api/ads/ig-posts/m1/promote' && o?.method === 'POST');
    expect(JSON.parse(call[1].body)).toEqual({ adset_id: '902', adset_name: 'WPP_INTERESES', permalink: 'https://ig/1' });
  });

  it('si Instagram falla, muestra el motivo', async () => {
    fetch.mockImplementation(() => json({ error: { code: 'META_ERROR', message: 'Instagram no respondió: sin acceso' } }, 502));
    renderIt();
    expect(await screen.findByText('Instagram no respondió: sin acceso')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd frontend && npx vitest run src/pages/ads/IgPosts.test.jsx`
Expected: FAIL (no existe `./IgPosts.jsx`)

- [ ] **Step 3: Hooks**

En `frontend/src/pages/ads/api.js`, en `adsKeys` agregar `igPosts: ['ads', 'ig-posts'],` y al final:

```js
// Si Instagram falla (p. ej. sin acceso a la cuenta), el error se muestra en la sección, no como toast
export const useIgPosts = () => useQuery({
  queryKey: adsKeys.igPosts,
  queryFn: () => api.get('/ads/ig-posts').then((r) => r.posts),
  meta: { silent: true },
  retry: false,
});

export function usePromoteIgPost() {
  const refresh = useRefreshAds();
  return useMutation({
    mutationFn: ({ id, adset_id, adset_name, permalink }) => api.post(`/ads/ig-posts/${id}/promote`, { adset_id, adset_name, permalink }),
    meta: { success: 'Post promocionado en Meta ✓' },
    onSettled: refresh,
  });
}
```

- [ ] **Step 4: Componente**

Crear `frontend/src/pages/ads/IgPosts.jsx`:

```jsx
import { useState } from 'react';
import { AlertTriangle, Instagram } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { usePromoteIgPost, useIgPosts } from './api.js';
import s from './ads.module.css';

const TYPE_LABEL = { reel: 'Reel', carousel: 'Carrusel', post: 'Post' };
const num = (n) => n.toLocaleString('es-AR');
const day = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

// Posts y reels ya publicados en @uniform.ar, para promocionarlos como anuncio
export function IgPosts({ snapshot, canEdit }) {
  const posts = useIgPosts();
  const [promoting, setPromoting] = useState(null);

  return (
    <section className={s.card}>
      <div className={s.cardHead}><h2><Instagram size={18} aria-hidden /> Posts de Instagram</h2></div>
      {posts.isLoading && <Spinner size={20} />}
      {posts.error && <div className={s.alert}><AlertTriangle size={18} aria-hidden /> {posts.error.message}</div>}
      {posts.data?.length === 0 && <p className="muted">No hay posts en la cuenta.</p>}
      <div className={s.grid}>
        {(posts.data ?? []).map((p) => (
          <article key={p.id} className={s.piece}>
            {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <div className={s.noImg}>Sin vista previa</div>}
            <div className={s.pieceBody}>
              <div className={s.row}><span className={s.kind}>{TYPE_LABEL[p.type]}</span><small className={s.grow}>{day(p.timestamp)}</small></div>
              <p className={s.copy}>{p.caption}</p>
              <small>
                {num(p.likes)} me gusta · {num(p.comments)} comentarios{p.reach != null ? ` · ${num(p.reach)} de alcance` : ''}
              </small>
              {p.promotedIn.map((x) => <span key={x.adset_id} className={`${s.badge} ${s.ok}`}>Promocionado en {x.adset_name || x.adset_id}</span>)}
              <div className={s.actions}>
                {canEdit && <Button size="sm" disabled={!snapshot} onClick={() => setPromoting(p)}>Promocionar</Button>}
                <a className={s.link} href={p.permalink} target="_blank" rel="noreferrer">Ver en Instagram</a>
              </div>
            </div>
          </article>
        ))}
      </div>
      {promoting && <Promote post={promoting} snapshot={snapshot} onClose={() => setPromoting(null)} />}
    </section>
  );
}

function Promote({ post, snapshot, onClose }) {
  const promote = usePromoteIgPost();
  const already = new Set(post.promotedIn.map((x) => x.adset_id));
  const adsets = (snapshot?.adsets ?? []).filter((a) => !already.has(a.id));
  const [adsetId, setAdsetId] = useState(adsets[0]?.id ?? '');
  const adset = adsets.find((a) => a.id === adsetId);
  const submit = () => promote.mutate({ id: post.id, adset_id: adsetId, adset_name: adset?.name ?? '', permalink: post.permalink }, { onSuccess: onClose });
  return (
    <Sheet open onClose={onClose} title={`Promocionar ${TYPE_LABEL[post.type].toLowerCase()}`}
      footer={<Button full loading={promote.isPending} disabled={!adsetId} onClick={submit}>Promocionar en Meta</Button>}>
      <div className={s.form}>
        <p className={s.copy}>{post.caption}</p>
        {adsets.length === 0
          ? <p className="muted">Ya está promocionado en todos los conjuntos.</p>
          : (
            <Field label="Conjunto" hint="Se usa el post original con botón de WhatsApp. El anuncio queda activo dentro del conjunto: si el conjunto o la campaña están pausados, no gasta.">
              <Select value={adsetId} onChange={(e) => setAdsetId(e.target.value)}>
                {adsets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
      </div>
    </Sheet>
  );
}
```

En `ads.module.css` agregar:

```css
.link { font-size: var(--fs-s); color: var(--c-accent-text); align-self: center; }
.card h2 { display: flex; align-items: center; gap: 6px; }
```

Si `lucide-react@0.460` no exporta `Instagram`, usar `Camera` en su lugar (verificar con `node -e "import('lucide-react').then(m=>console.log(!!m.Instagram))"` desde `frontend/`).

- [ ] **Step 5: Integrar en la página y en las recomendaciones**

En `AdsPage.jsx`:
- `import { IgPosts } from './IgPosts.jsx';` y sumar `useIgPosts` al import de `./api.js`.
- en `Creatives`, al final del `<div className={s.stack}>` (después de los Sheets): `<IgPosts snapshot={snapshot} canEdit={canEdit} />`
- en `TOOL_LABEL` agregar `promote_ig_post: 'Promocionar post',`
- en `Recommendations`, agregar `const igPosts = useIgPosts();` y dentro de cada tarjeta pendiente, debajo del `<h3>`:

```jsx
            {d.tool === 'promote_ig_post' && (() => {
              const post = igPosts.data?.find((p) => p.id === d.input.ig_media_id);
              return post?.thumbnail ? <img src={post.thumbnail} alt="" className={s.recoThumb} /> : null;
            })()}
```

y en `ads.module.css`: `.recoThumb { width: 96px; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 8px; }`

- [ ] **Step 6: Correr tests y build**

Run: `cd frontend && npx vitest run src/pages/ads && npm run build`
Expected: PASS y build sin errores

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ads
git commit -m "feat(pauta): sección de posts de Instagram para promocionarlos desde el panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Parte B — Videos en las piezas

### Task 8: Subida directa de videos al storage

**Files:**
- Create: `backend/src/db/migrations/005_files_video.sql`
- Create: `backend/test/files.video.test.js`
- Modify: `backend/src/services/storage.js`
- Modify: `backend/src/services/files.js`
- Modify: `backend/src/routes/files.js`
- Modify: `backend/src/buildApp.js`
- Modify: `backend/test/helpers/fixtures.js`

**Interfaces:**
- Produces (storage, ambos drivers): `head(key) → Promise<{ bytes } | null>`, `readHead(key, n) → Promise<Buffer>`; S3: `presignPut(key, mime) → Promise<string>`; local: `putStream(key, readable, maxBytes) → Promise<void>` (error con `code = 'TOO_LARGE'` si se pasa).
- Produces (files service): `createFilesService({ db, storage, uploadSecret })`; `prepareUpload({ ownerType, ownerId, mime, bytes, originalName, userId }) → { upload_url, token }`; `receiveLocalUpload(token, readable) → void`; `completeUpload(token, userId) → fileDTO` (DTO con `kind: 'video'`).
- Produces (API): `POST /api/files/upload-url` body `{ owner_type, owner_id, mime, bytes, original_name } → { upload_url, token }`; `PUT /api/files/local-upload/:token` (cuerpo = bytes del video, solo con storage local); `POST /api/files/complete` body `{ token } → 201 { file }`.
- `OWNER_TYPES.ad_feed/ad_story.video = { accept: ['video/mp4','video/quicktime'], maxBytes: 200 MB }`.

- [ ] **Step 1: Fixture de MP4**

En `backend/test/helpers/fixtures.js` agregar:

```js
// Encabezado mínimo de un MP4 (caja ftyp "isom"): alcanza para que file-type lo reconozca como video/mp4
export const MP4_MIN = Buffer.concat([Buffer.from('000000186674797069736f6d0000020069736f6d6d703431', 'hex'), Buffer.alloc(200)]);
```

- [ ] **Step 2: Tests que fallan**

Crear `backend/test/files.video.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTestContext } from './helpers/testApp.js';
import { MP4_MIN } from './helpers/fixtures.js';

const MB = 1024 * 1024;
let ctx, admin, equipo, creativeId;
beforeAll(async () => {
  ctx = await createTestContext();
  ({ agent: admin } = await ctx.asUser({ template: 'admin' }));
  ({ agent: equipo } = await ctx.asUser({ template: 'equipo' }));
  creativeId = (await admin.post('/api/ads/creatives').send({ name: 'Video', copy: 'texto' })).body.creative.id;
});
afterAll(() => ctx.close());

const ask = (agent, o = {}) => agent.post('/api/files/upload-url').send({
  owner_type: 'ad_feed', owner_id: creativeId, mime: 'video/mp4', bytes: MP4_MIN.length, original_name: 'reel.mp4', ...o,
});
const putLocal = (agent, url, body) => agent.put(url).set('Content-Type', 'video/mp4').send(body);

describe('subida de videos', () => {
  it('valida permisos, tipo y tamaño antes de dar el link', async () => {
    expect((await ask(equipo)).status).toBe(403);
    expect((await ask(admin, { mime: 'video/webm' })).status).toBe(415);
    expect((await ask(admin, { bytes: 200 * MB + 1 })).status).toBe(413);
    expect((await ask(admin, { owner_type: 'idea_ref' })).status).toBe(400);
  });

  it('pide link, sube y confirma; confirmar dos veces devuelve el mismo archivo', async () => {
    const res = await ask(admin);
    expect(res.status).toBe(200);
    expect(res.body.upload_url).toMatch(/^\/api\/files\/local-upload\//);
    expect((await putLocal(admin, res.body.upload_url, MP4_MIN)).status).toBe(200);
    const done = await admin.post('/api/files/complete').send({ token: res.body.token });
    expect(done.status).toBe(201);
    expect(done.body.file).toMatchObject({ owner_type: 'ad_feed', owner_id: creativeId, kind: 'video', mime: 'video/mp4', bytes: MP4_MIN.length, original_name: 'reel.mp4' });
    const again = await admin.post('/api/files/complete').send({ token: res.body.token });
    expect(again.status).toBe(201);
    expect(again.body.file.id).toBe(done.body.file.id);
    const { rows } = await ctx.db.query("SELECT count(*)::int AS n FROM files WHERE owner_id = $1 AND kind = 'video'", [creativeId]);
    expect(rows[0].n).toBe(1);
    // Cupo: ad_feed admite un archivo
    expect((await ask(admin)).status).toBe(409);
    await ctx.app.locals.files.remove(done.body.file.id); // borra fila y archivo del disco
  });

  it('si lo subido no coincide con lo declarado o no es video, se rechaza y se borra', async () => {
    const short = await ask(admin, { bytes: MP4_MIN.length + 10 });
    await putLocal(admin, short.body.upload_url, MP4_MIN);
    const r1 = await admin.post('/api/files/complete').send({ token: short.body.token });
    expect(r1.status).toBe(400);
    expect(r1.body.error.message).toBe('El video no se subió completo. Probá de nuevo.');

    const fake = Buffer.alloc(300, 1);
    const notVideo = await ask(admin, { bytes: fake.length });
    await putLocal(admin, notVideo.body.upload_url, fake);
    const r2 = await admin.post('/api/files/complete').send({ token: notVideo.body.token });
    expect(r2.status).toBe(415);

    const left = await fs.readdir(path.join(ctx.dir, 'ad_feed', creativeId)).catch(() => []);
    expect(left).toEqual([]);
  });

  it('subir más bytes de los declarados corta la subida', async () => {
    const res = await ask(admin, { bytes: 50 });
    expect((await putLocal(admin, res.body.upload_url, MP4_MIN)).status).toBe(413);
  });

  it('token adulterado, vencido o de otro usuario', async () => {
    expect((await admin.post('/api/files/complete').send({ token: 'x.y.z' })).status).toBe(400);
    const res = await ask(admin);
    await putLocal(admin, res.body.upload_url, MP4_MIN);
    const other = (await ctx.asUser({ template: 'admin' })).agent;
    expect((await other.post('/api/files/complete').send({ token: res.body.token })).status).toBe(403);
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/files.video.test.js`
Expected: FAIL (404 en `/api/files/upload-url`)

- [ ] **Step 4: Migración**

Crear `backend/src/db/migrations/005_files_video.sql`:

```sql
-- Las piezas de pauta pueden ser videos (MP4/MOV)
ALTER TABLE files DROP CONSTRAINT files_kind_check;
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('image','pdf','video'));
```

- [ ] **Step 5: Storage**

En `backend/src/services/storage.js`:
- imports: agregar `import { createWriteStream } from 'node:fs';`, `import { Transform } from 'node:stream';`, `import { pipeline } from 'node:stream/promises';` y `HeadObjectCommand` al import de `@aws-sdk/client-s3`.
- actualizar el comentario de interfaz: `// Interfaz común: { driver, put, read, remove, urlFor, head(key) → {bytes}|null, readHead(key, n) → Buffer } + s3: presignPut(key, mime) · local: putStream(key, stream, maxBytes)`
- en `createLocalStorage`, agregar al objeto:

```js
    // Subida de videos sin cargarlos en memoria; corta si llegan más bytes de los declarados
    async putStream(key, stream, maxBytes) {
      const p = full(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      let n = 0;
      const limit = new Transform({
        transform(chunk, _enc, cb) {
          n += chunk.length;
          if (n > maxBytes) {
            const err = new Error('El archivo es más grande de lo declarado.');
            err.code = 'TOO_LARGE';
            return cb(err);
          }
          cb(null, chunk);
        },
      });
      try {
        await pipeline(stream, limit, createWriteStream(p));
      } catch (err) {
        await fs.rm(p, { force: true });
        throw err;
      }
    },
    async head(key) {
      try {
        return { bytes: (await fs.stat(full(key))).size };
      } catch {
        return null;
      }
    },
    async readHead(key, n) {
      const fh = await fs.open(full(key));
      try {
        const buf = Buffer.alloc(n);
        const { bytesRead } = await fh.read(buf, 0, n, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    },
```

- en `createS3Storage`, agregar al objeto:

```js
    // El navegador sube directo a R2 (el bucket necesita CORS para PUT desde el front)
    presignPut: (key, mime) => getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime }), { expiresIn: 900 }),
    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { bytes: out.ContentLength };
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async readHead(key, n) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${n - 1}` }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
```

- [ ] **Step 6: Servicio de archivos**

En `backend/src/services/files.js`:
- imports: `import jwt from 'jsonwebtoken';` y sumar `forbidden` al import de `../lib/errors.js`.
- en `OWNER_TYPES`, a `ad_feed` y `ad_story` agregarles `video: VIDEO_DEF,` y definir arriba:

```js
// Videos de piezas de pauta: se suben directo al storage (no pasan por la memoria del servidor)
const VIDEO_DEF = { accept: ['video/mp4', 'video/quicktime'], maxBytes: 200 * 1024 * 1024 };
```

- en `EXT` agregar `'video/mp4': 'mp4', 'video/quicktime': 'mov'`.
- firma: `export function createFilesService({ db, storage, uploadSecret }) {`
- antes del `return { listFor, … }`:

```js
  async function checkSlot(def, ownerType, ownerId) {
    const { rows: owner } = await db.query(`SELECT id FROM ${def.table} WHERE id = $1`, [ownerId]);
    if (!owner[0]) throw notFound('No existe el elemento al que querés adjuntar el archivo.');
    const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM files WHERE owner_type = $1 AND owner_id = $2', [ownerType, ownerId]);
    if (n >= def.max) throw new AppError(409, 'TOO_MANY_FILES', `Máximo ${def.max} archivos acá.`);
    return n;
  }

  async function prepareUpload({ ownerType, ownerId, mime, bytes, originalName, userId }) {
    const def = OWNER_TYPES[ownerType];
    if (!def?.video) throw badRequest('Acá no se pueden subir videos.');
    if (!def.video.accept.includes(mime)) throw new AppError(415, 'UNSUPPORTED_FILE', 'Solo se aceptan videos MP4 o MOV.');
    if (bytes > def.video.maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `El video pesa más de ${def.video.maxBytes / 1024 / 1024} MB.`);
    await checkSlot(def, ownerType, ownerId);
    const key = `${ownerType}/${ownerId}/${crypto.randomUUID()}.${EXT[mime]}`;
    const token = jwt.sign(
      { p: 'upload', k: key, ot: ownerType, oi: ownerId, m: mime, b: bytes, n: String(originalName ?? '').slice(0, 200), u: userId },
      uploadSecret, { expiresIn: '30m' },
    );
    const uploadUrl = storage.driver === 's3' ? await storage.presignPut(key, mime) : `/api/files/local-upload/${token}`;
    return { upload_url: uploadUrl, token };
  }

  function verifyUploadToken(token) {
    try {
      const t = jwt.verify(token, uploadSecret, { algorithms: ['HS256'] });
      if (t.p !== 'upload') throw new Error('no es de subida');
      return t;
    } catch {
      throw badRequest('El permiso de subida venció o no es válido. Probá subir de nuevo.');
    }
  }

  async function receiveLocalUpload(token, stream) {
    if (storage.driver !== 'local') throw notFound();
    const t = verifyUploadToken(token);
    try {
      await storage.putStream(t.k, stream, t.b);
    } catch (err) {
      if (err.code === 'TOO_LARGE') throw new AppError(413, 'FILE_TOO_LARGE', 'El video es más grande de lo que se declaró.');
      throw err;
    }
  }

  async function completeUpload(token, userId) {
    const t = verifyUploadToken(token);
    if (t.u !== userId) throw forbidden('Este video lo empezó a subir otra persona.');
    // Idempotente: si ya se confirmó (reintento, doble clic) devuelve el mismo archivo
    const { rows: existing } = await db.query('SELECT * FROM files WHERE storage_key = $1', [t.k]);
    if (existing[0]) return (await toDTO(existing))[0];

    const def = OWNER_TYPES[t.ot];
    const head = await storage.head(t.k);
    if (!head) throw badRequest('No encontramos el video subido. Probá de nuevo.');
    const reject = async (err) => {
      await purgeKeys([t.k]);
      throw err;
    };
    if (head.bytes !== t.b) return reject(badRequest('El video no se subió completo. Probá de nuevo.'));
    const mime = (await fileTypeFromBuffer(await storage.readHead(t.k, 4100)))?.mime;
    if (!def.video.accept.includes(mime)) return reject(new AppError(415, 'UNSUPPORTED_FILE', 'El archivo no es un video MP4 o MOV.'));
    let n;
    try {
      n = await checkSlot(def, t.ot, t.oi);
    } catch (err) {
      return reject(err);
    }
    const { rows } = await db.query(
      `INSERT INTO files (owner_type, owner_id, kind, storage_key, mime, bytes, original_name, sort, uploaded_by)
       VALUES ($1, $2, 'video', $3, $4, $5, $6, $7, $8) RETURNING *`,
      [t.ot, t.oi, t.k, mime, head.bytes, t.n, n, userId],
    );
    return (await toDTO(rows))[0];
  }
```

- sumar `prepareUpload, receiveLocalUpload, completeUpload` al objeto devuelto.

- [ ] **Step 7: Rutas**

En `backend/src/routes/files.js`:

```js
const videoSchema = z.object({
  owner_type: z.enum(Object.keys(OWNER_TYPES)), owner_id: uuid,
  mime: z.string().max(100), bytes: z.number().int().positive(), original_name: z.string().max(200).default(''),
});
const tokenSchema = z.object({ token: z.string().min(1).max(2000) });
```

y dentro de `createFilesRouter`, antes de `r.patch('/files/order', …)`:

```js
  // Videos: el navegador pide un link, sube directo al storage y después confirma
  r.post('/files/upload-url', async (req, res) => {
    const body = parse(videoSchema, req.body);
    checkSection(req.user, body.owner_type, 'edit');
    res.json(await files.prepareUpload({
      ownerType: body.owner_type, ownerId: body.owner_id, mime: body.mime, bytes: body.bytes, originalName: body.original_name, userId: req.user.id,
    }));
  });

  // Solo con storage local (desarrollo): recibe el video en streaming
  r.put('/files/local-upload/:token', async (req, res) => {
    await files.receiveLocalUpload(req.params.token, req);
    res.json({ ok: true });
  });

  r.post('/files/complete', async (req, res) => {
    const { token } = parse(tokenSchema, req.body);
    res.status(201).json({ file: await files.completeUpload(token, req.user.id) });
  });
```

En `backend/src/buildApp.js`: `const files = createFilesService({ db, storage, uploadSecret: jwtSecret });`

- [ ] **Step 8: Correr los tests**

Run: `cd backend && npx vitest run test/files.video.test.js test/files.test.js`
Expected: PASS. Si el test de "confirma" da 415, `file-type` no reconoció el fixture: probar `node -e "import('file-type').then(async m=>console.log(await m.fileTypeFromBuffer(Buffer.concat([Buffer.from('000000186674797069736f6d0000020069736f6d6d703431','hex'),Buffer.alloc(200)]))))"` desde `backend/` y ajustar los bytes del fixture hasta que devuelva `{ ext: 'mp4', mime: 'video/mp4' }`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/db/migrations/005_files_video.sql backend/src/services/storage.js backend/src/services/files.js backend/src/routes/files.js backend/src/buildApp.js backend/test/files.video.test.js backend/test/helpers/fixtures.js
git commit -m "feat(archivos): subida directa de videos al storage con link firmado y confirmación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Meta — subir video, esperar el procesamiento y miniatura

**Files:**
- Modify: `backend/src/services/meta.js`
- Test: `backend/test/meta.test.js`

**Interfaces:**
- Produces: `meta.uploadVideo({ fileUrl } | { buffer, name }) → Promise<videoId>` (`name` opcional con `fileUrl`); `meta.waitVideoReady(videoId, { timeoutMs = 600000, intervalMs = 10000 } = {}) → Promise<void>`; `meta.videoThumbnail(videoId) → Promise<string|null>`.

- [ ] **Step 1: Tests que fallan**

Agregar a `backend/test/meta.test.js` (`fakeFetch` ya está definido arriba en el archivo):

```js
describe('videos', () => {
  it('sube por URL o por archivo', async () => {
    const fetchFn = fakeFetch(() => ({ id: 'v1' }));
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    expect(await meta.uploadVideo({ fileUrl: 'https://r2/x.mp4', name: 'Reel' })).toBe('v1');
    expect(fetchFn.calls[0].url.pathname).toBe('/v23.0/act_1/advideos');
    expect(JSON.parse(fetchFn.calls[0].opts.body)).toEqual({ file_url: 'https://r2/x.mp4', name: 'Reel' });
    expect(await meta.uploadVideo({ buffer: Buffer.from('abc'), name: 'Reel' })).toBe('v1');
    const form = fetchFn.calls[1].opts.body;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('name')).toBe('Reel');
    expect(form.get('source')).toBeInstanceOf(Blob);
  });

  it('espera a que Meta procese el video', async () => {
    const states = ['processing', 'processing', 'ready'];
    const fetchFn = fakeFetch(() => ({ status: { video_status: states.shift() } }));
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    await meta.waitVideoReady('v1', { intervalMs: 1 });
    expect(fetchFn.calls).toHaveLength(3);
    expect(fetchFn.calls[0].url.searchParams.get('fields')).toBe('status');
  });

  it('error de procesamiento y tiempo agotado', async () => {
    const failing = createMetaClient({ accessToken: 't', accountId: 'act_1', retryDelayMs: 0,
      fetchFn: fakeFetch(() => ({ status: { video_status: 'error', processing_phase: { errors: [{ message: 'codec no soportado' }] } } })) });
    await expect(failing.waitVideoReady('v1', { intervalMs: 1 })).rejects.toThrow('Meta no pudo procesar el video: codec no soportado');
    const slow = createMetaClient({ accessToken: 't', accountId: 'act_1', retryDelayMs: 0,
      fetchFn: fakeFetch(() => ({ status: { video_status: 'processing' } })) });
    await expect(slow.waitVideoReady('v1', { intervalMs: 1, timeoutMs: 20 }))
      .rejects.toThrow('Meta sigue procesando el video, probá publicar de nuevo en unos minutos.');
  });

  it('miniatura preferida', async () => {
    const fetchFn = fakeFetch(() => ({ data: [{ uri: 'https://t/a.jpg' }, { uri: 'https://t/b.jpg', is_preferred: true }] }));
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    expect(await meta.videoThumbnail('v1')).toBe('https://t/b.jpg');
    expect(fetchFn.calls[0].url.pathname).toBe('/v23.0/v1/thumbnails');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/meta.test.js`
Expected: FAIL (`meta.uploadVideo is not a function`)

- [ ] **Step 3: Implementar**

En `backend/src/services/meta.js`, cambiar `reqOnce` para aceptar formularios:

```js
  async function reqOnce(path, { method = 'GET', params = {}, body, form } = {}) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('access_token', accessToken);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    const res = await fetchFn(url, {
      method,
      ...(form ? { body: form } : body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
```

(el resto de `reqOnce` igual), y agregar al objeto devuelto después de `uploadImage`:

```js
    // Con fileUrl (R2 firmado) Meta descarga el video; con buffer (storage local en desarrollo) se manda el archivo
    async uploadVideo({ fileUrl, buffer, name }) {
      if (fileUrl) return (await req(`${accountId}/advideos`, { method: 'POST', body: { file_url: fileUrl, ...(name ? { name } : {}) } })).id;
      const form = new FormData();
      if (name) form.append('name', name);
      form.append('source', new Blob([buffer]), 'video.mp4');
      return (await req(`${accountId}/advideos`, { method: 'POST', form })).id;
    },
    async waitVideoReady(videoId, { timeoutMs = 10 * 60_000, intervalMs = 10_000 } = {}) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const { status } = await req(videoId, { params: { fields: 'status' } });
        if (status?.video_status === 'ready') return;
        if (status?.video_status === 'error') {
          throw new Error(`Meta no pudo procesar el video: ${status.processing_phase?.errors?.[0]?.message ?? 'error desconocido'}`);
        }
        if (Date.now() >= until) throw new Error('Meta sigue procesando el video, probá publicar de nuevo en unos minutos.');
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
    async videoThumbnail(videoId) {
      const { data = [] } = await req(`${videoId}/thumbnails`);
      return (data.find((t) => t.is_preferred) ?? data[0])?.uri ?? null;
    },
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx vitest run test/meta.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/meta.js backend/test/meta.test.js
git commit -m "feat(pauta): subir videos a Meta, esperar el procesamiento y tomar la miniatura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Publicar piezas con video

**Files:**
- Modify: `backend/src/ads/creativeSpec.js`
- Modify: `backend/src/ads/agent.js` (`publishCreative`, `buildContext`)
- Modify: `backend/src/repo/ads.js` (`listCreatives`)
- Modify: `backend/src/routes/ads.js` (`GET /ads/creatives`)
- Modify: `backend/src/buildApp.js`
- Modify: `backend/src/ads/systemPrompt.js`
- Modify: `backend/test/helpers/adsFakes.js`
- Test: `backend/test/ads.test.js`, `backend/test/ads.video.test.js` (nuevo)

**Interfaces:**
- Consumes: `meta.uploadVideo/waitVideoReady/videoThumbnail` (Task 9); archivos `kind: 'video'` (Task 8).
- Produces: `buildWhatsappCreativeSpec({ name, pageId, igUserId, message, headline, feed, story })` donde `feed`/`story` son `{ type: 'image', hash }` o `{ type: 'video', videoId, thumbnailUrl }` (`story` opcional) — **reemplaza** `feedImageHash`/`storyImageHash`; `ALLOW_MIXED_MEDIA` (boolean) exportado de `creativeSpec.js`; `listCreatives` suma `feed_kind`, `story_kind`; `GET /api/ads/creatives` suma `feed: { id, kind, url } | null` y `story` igual; contexto `unusedCreatives[].feed/story: 'image'|'video'|null`; `createAdsRouter` recibe `files`.

- [ ] **Step 1: Fakes de video**

En `backend/test/helpers/adsFakes.js`, dentro de `fakeMeta()`:

```js
    uploadVideo: async (a) => { log('uploadVideo')(a); return 'vid1'; },
    waitVideoReady: async (id) => { log('waitVideoReady')(id); },
    videoThumbnail: async () => 'https://t/thumb.jpg',
```

- [ ] **Step 2: Tests que fallan**

En `backend/test/ads.test.js`, reemplazar el test `'arma el creative de WhatsApp simple o por ubicación'` por:

```js
  it('arma el creative de WhatsApp para imagen y video, solo feed o por ubicación', () => {
    const img = (hash) => ({ type: 'image', hash });
    const vid = (videoId) => ({ type: 'video', videoId, thumbnailUrl: `https://t/${videoId}.jpg` });
    const base = { name: 'X', pageId: '1', igUserId: '2', message: 'hola', headline: 'Título' };

    const simple = buildWhatsappCreativeSpec({ ...base, feed: img('h1') });
    expect(simple.object_story_spec.link_data).toMatchObject({ image_hash: 'h1', name: 'Título', call_to_action: { type: 'WHATSAPP_MESSAGE' } });

    const video = buildWhatsappCreativeSpec({ ...base, feed: vid('v1') });
    expect(video.object_story_spec.video_data).toMatchObject({
      video_id: 'v1', image_url: 'https://t/v1.jpg', message: 'hola', title: 'Título',
      call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
    });

    const placed = buildWhatsappCreativeSpec({ ...base, feed: img('h1'), story: img('h2') });
    expect(placed.asset_feed_spec.ad_formats).toEqual(['SINGLE_IMAGE']);
    expect(placed.asset_feed_spec.call_to_action_types).toEqual(['WHATSAPP_MESSAGE']);
    expect(placed.asset_feed_spec.asset_customization_rules[1].image_label).toEqual({ name: 'story' });
    expect(placed.asset_feed_spec.videos).toBeUndefined();

    const videos = buildWhatsappCreativeSpec({ ...base, feed: vid('v1'), story: vid('v2') });
    expect(videos.asset_feed_spec.ad_formats).toEqual(['SINGLE_VIDEO']);
    expect(videos.asset_feed_spec.videos).toEqual([
      { video_id: 'v1', thumbnail_url: 'https://t/v1.jpg', adlabels: [{ name: 'feed' }] },
      { video_id: 'v2', thumbnail_url: 'https://t/v2.jpg', adlabels: [{ name: 'story' }] },
    ]);
    expect(videos.asset_feed_spec.asset_customization_rules.map((r) => r.video_label)).toEqual([{ name: 'feed' }, { name: 'story' }]);
    expect(videos.asset_feed_spec.images).toBeUndefined();

    const mixed = buildWhatsappCreativeSpec({ ...base, feed: img('h1'), story: vid('v2') });
    expect(mixed.asset_feed_spec.ad_formats).toEqual(['AUTOMATIC_FORMAT']);
    expect(mixed.asset_feed_spec.asset_customization_rules[0].image_label).toEqual({ name: 'feed' });
    expect(mixed.asset_feed_spec.asset_customization_rules[1].video_label).toEqual({ name: 'story' });

    expect(buildAdName({ adsetName: 'WPP_INTERESES_AMBA_20261009', creativeName: 'Panadería Maná', date: '2026-10-09' }))
      .toBe('WPPINTERESESAMBA_PANADERIAMANA_20261009');
  });
```

Crear `backend/test/ads.video.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, fakeAnthropic, contextSection } from './helpers/adsFakes.js';
import { MP4_MIN, PNG_1x1 } from './helpers/fixtures.js';
import { createAdsRepo } from '../src/repo/ads.js';
import { buildContext } from '../src/ads/agent.js';

let ctx, meta, admin;
beforeAll(async () => {
  meta = fakeMeta();
  ctx = await createTestContext({ ads: { meta, anthropic: fakeAnthropic([]), config } });
  admin = (await ctx.asUser({ template: 'admin' })).agent;
});
afterAll(() => ctx.close());

async function uploadVideo(creativeId, ownerType) {
  const link = await admin.post('/api/files/upload-url').send({ owner_type: ownerType, owner_id: creativeId, mime: 'video/mp4', bytes: MP4_MIN.length, original_name: 'reel.mp4' });
  await admin.put(link.body.upload_url).set('Content-Type', 'video/mp4').send(MP4_MIN);
  return (await admin.post('/api/files/complete').send({ token: link.body.token })).body.file;
}

describe('piezas con video', () => {
  it('feed imagen + historia video: sube cada uno como corresponde y publica', async () => {
    const id = (await admin.post('/api/ads/creatives').send({ name: 'Reel Maná', copy: 'Escribinos 👇' })).body.creative.id;
    await admin.post('/api/files').field('owner_type', 'ad_feed').field('owner_id', id).attach('file', PNG_1x1, 'feed.png');
    const video = await uploadVideo(id, 'ad_story');

    const list = (await admin.get('/api/ads/creatives')).body.creatives;
    const c = list.find((x) => x.id === id);
    expect(c.feed).toMatchObject({ kind: 'image' });
    expect(c.story).toMatchObject({ id: video.id, kind: 'video', url: `/api/files/${video.id}/raw` });

    const text = await buildContext({ meta, repo: createAdsRepo(ctx.db), config });
    expect(contextSection(text, 'unusedCreatives').find((x) => x.id === id)).toMatchObject({ feed: 'image', story: 'video' });

    meta.calls.length = 0;
    const pub = await admin.post(`/api/ads/creatives/${id}/publish`).send({ adset_id: '901', adset_name: 'WPP_X' });
    expect(pub.status).toBe(200);
    // Storage local: no hay URL pública, el video va como archivo
    const up = meta.calls.find((c) => c[0] === 'uploadVideo')[1];
    expect(Buffer.isBuffer(up.buffer)).toBe(true);
    expect(meta.calls).toContainEqual(['waitVideoReady', 'vid1']);
    const spec = meta.calls.find((c) => c[0] === 'createCreative')[1];
    expect(spec.asset_feed_spec.videos[0]).toMatchObject({ video_id: 'vid1', thumbnail_url: 'https://t/thumb.jpg' });
  });
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/ads.test.js test/ads.video.test.js`
Expected: FAIL

- [ ] **Step 4: `creativeSpec.js`**

Reemplazar `buildWhatsappCreativeSpec` por:

```js
// Si Meta no acepta feed y historia con distinto tipo (imagen/video) en el mismo anuncio, poner false:
// el formulario lo impide y publicar falla con un mensaje claro (ver frontend/src/pages/ads/media.js)
export const ALLOW_MIXED_MEDIA = true;

const CTA = { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link: WHATSAPP_LINK } };
const POSITIONS = {
  feed: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] },
  story: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story'], instagram_positions: ['story'] },
};

// feed/story: { type: 'image', hash } | { type: 'video', videoId, thumbnailUrl }
export function buildWhatsappCreativeSpec({ name, pageId, igUserId, message, headline, feed, story }) {
  const identity = { page_id: pageId, ...(igUserId ? { instagram_user_id: igUserId } : {}) };
  if (!story) {
    const data = feed.type === 'image'
      ? { link_data: { link: WHATSAPP_LINK, message, ...(headline ? { name: headline } : {}), image_hash: feed.hash, call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } } } }
      : { video_data: { video_id: feed.videoId, image_url: feed.thumbnailUrl, message, ...(headline ? { title: headline } : {}), call_to_action: CTA } };
    return { name, object_story_spec: { ...identity, ...data }, degrees_of_freedom_spec: NO_AI_ENHANCEMENTS };
  }

  const images = [];
  const videos = [];
  const rule = (media, label) => {
    if (media.type === 'image') {
      images.push({ hash: media.hash, adlabels: [{ name: label }] });
      return { customization_spec: POSITIONS[label], image_label: { name: label } };
    }
    videos.push({ video_id: media.videoId, thumbnail_url: media.thumbnailUrl, adlabels: [{ name: label }] });
    return { customization_spec: POSITIONS[label], video_label: { name: label } };
  };
  const rules = [rule(feed, 'feed'), rule(story, 'story')];
  const format = feed.type !== story.type ? 'AUTOMATIC_FORMAT' : feed.type === 'image' ? 'SINGLE_IMAGE' : 'SINGLE_VIDEO';
  return {
    name,
    object_story_spec: identity,
    asset_feed_spec: {
      ...(images.length ? { images } : {}),
      ...(videos.length ? { videos } : {}),
      bodies: [{ text: message }],
      titles: [{ text: headline || name }],
      link_urls: [{ website_url: WHATSAPP_LINK }],
      ad_formats: [format],
      call_to_action_types: ['WHATSAPP_MESSAGE'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: rules,
    },
    degrees_of_freedom_spec: NO_AI_ENHANCEMENTS,
  };
}
```

Actualizar el comentario del encabezado del archivo: `//  - con pieza de historia: customización por ubicación (feed 4:5 / historia 9:16), image_label / video_label como objeto`.

- [ ] **Step 5: Publicar con video**

En `backend/src/ads/agent.js`, sumar `ALLOW_MIXED_MEDIA` al import de `creativeSpec.js` y reemplazar el comienzo de `publishCreative` (desde `const imgs = …` hasta `const storyHash = …`) por:

```js
    const media = await files.listFor(['ad_feed', 'ad_story'], [creativeId]);
    const feedFile = media.find((f) => f.owner_type === 'ad_feed');
    const storyFile = media.find((f) => f.owner_type === 'ad_story');
    if (!feedFile) throw new Error(`La pieza "${creative.name}" no tiene imagen ni video de feed.`);
    if (!ALLOW_MIXED_MEDIA && storyFile && storyFile.kind !== feedFile.kind) {
      throw new Error('Feed e historia tienen que ser los dos imagen o los dos video.');
    }
    // Imagen: se sube el archivo y Meta devuelve un hash. Video: con R2 Meta lo descarga del link firmado
    // (el servidor no mueve los MB); con storage local se manda el archivo. Después hay que esperar el procesamiento.
    const toMeta = async (f) => {
      if (f.kind !== 'video') return { type: 'image', hash: await meta.uploadImage(await files.read(await files.get(f.id))) };
      const name = f.original_name || creative.name;
      const videoId = /^https:\/\//.test(f.url)
        ? await meta.uploadVideo({ fileUrl: f.url, name })
        : await meta.uploadVideo({ buffer: await files.read(await files.get(f.id)), name });
      await meta.waitVideoReady(videoId);
      return { type: 'video', videoId, thumbnailUrl: await meta.videoThumbnail(videoId) };
    };
    const feed = await toMeta(feedFile);
    const story = storyFile ? await toMeta(storyFile) : null;
```

y dentro de `publish`, cambiar el armado del spec a:

```js
      const spec = buildWhatsappCreativeSpec({
        name, pageId: config.pageId, igUserId, message: creative.copy, headline: creative.headline, feed, story,
      });
```

En `buildContext`, cambiar el mapeo de `unusedCreatives` a:

```js
    unusedCreatives: unusedCreatives.map((c) => ({ id: c.id, name: c.name, copy: c.copy, headline: c.headline, notes: c.notes, feed: c.feed_kind ?? null, story: c.story_kind ?? null })),
```

- [ ] **Step 6: Repo y ruta de piezas**

En `backend/src/repo/ads.js`, `listCreatives`, sumar al SELECT:

```sql
           (SELECT f.kind FROM files f WHERE f.owner_type = 'ad_feed' AND f.owner_id = c.id LIMIT 1) AS feed_kind,
           (SELECT f.kind FROM files f WHERE f.owner_type = 'ad_story' AND f.owner_id = c.id LIMIT 1) AS story_kind
```

(agregar una coma después de `story_file_id`).

En `backend/src/routes/ads.js`:
- firma `export function createAdsRouter({ repo, meta, startRun, execute, config, files }) {`
- reemplazar `r.get('/ads/creatives', …)` por:

```js
  // Cada pieza trae su feed/historia con tipo y URL (firmada en R2: los videos no pasan por el servidor)
  r.get('/ads/creatives', view, async (_req, res) => {
    const creatives = await repo.listCreatives();
    const media = await files.listFor(['ad_feed', 'ad_story'], creatives.map((c) => c.id));
    const pick = (type, id) => {
      const f = media.find((m) => m.owner_type === type && m.owner_id === id);
      return f ? { id: f.id, kind: f.kind, url: f.url } : null;
    };
    res.json({ creatives: creatives.map((c) => ({ ...c, feed: pick('ad_feed', c.id), story: pick('ad_story', c.id) })) });
  });
```

En `backend/src/buildApp.js`: `api.use(createAdsRouter({ repo: adsRepo, meta: ads.meta, startRun, execute, config: adsConfig, files }));`

- [ ] **Step 7: Prompt**

En `backend/src/ads/systemPrompt.js`, en `# Criterio`, en la viñeta de `request_creative`, cambiar `formato (feed 4:5 y/o historia 9:16)` por `formato (imagen o video; feed 4:5 y/o historia 9:16)` y agregar al final de `# Criterio`:

```
- Las piezas pueden ser imagen o video (unusedCreatives[].feed/story). Para historias y reels el video suele rendir mejor: si hay una pieza con video, consideralo al elegir conjunto, y pedí videos cortos (6-15 s, vertical) cuando falte material.
```

- [ ] **Step 8: Correr todos los tests del backend**

Run: `cd backend && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/test
git commit -m "feat(pauta): publicar piezas con video en feed e historia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Panel — subir videos en las piezas

**Files:**
- Create: `frontend/src/lib/putWithProgress.js`
- Create: `frontend/src/pages/ads/media.js`
- Modify: `frontend/src/lib/upload.js`
- Modify: `frontend/src/lib/upload.test.js`
- Modify: `frontend/src/pages/ads/api.js` (`useCreateCreative`)
- Modify: `frontend/src/pages/ads/AdsPage.jsx` (`Creatives`, `NewCreative`)
- Modify: `frontend/src/pages/ads/ads.module.css`

**Interfaces:**
- Consumes: `POST /api/files/upload-url`, `PUT` al `upload_url`, `POST /api/files/complete` (Task 8); `GET /api/ads/creatives` con `feed`/`story` (Task 10).
- Produces: `putWithProgress(url, file, { headers, onProgress }) → Promise<void>`; `uploadFile({ ownerType, ownerId, file, kind: 'media', onProgress })` (imagen JPG/PNG tal cual o video por subida directa); `VIDEO_MAX`, `VIDEO_TYPES` en `upload.js`; `ALLOW_MIXED_MEDIA`, `mediaKind(file)` en `pages/ads/media.js`.

- [ ] **Step 1: Tests que fallan**

En `frontend/src/lib/upload.test.js`, cambiar el mock de `../api/client.js` y sumar el de `putWithProgress`:

```js
vi.mock('../api/client.js', () => ({
  API_BASE: '',
  getToken: () => 'tok',
  api: {
    upload: vi.fn(async () => ({ file: { id: 'f1' } })),
    post: vi.fn(async (path) => (path === '/files/upload-url'
      ? { upload_url: 'https://r2.example/put?sig=1', token: 'up1' }
      : { file: { id: 'v1', kind: 'video' } })),
  },
}));
vi.mock('./putWithProgress.js', () => ({ putWithProgress: vi.fn(async (_u, _f, { onProgress }) => { onProgress?.(0.5); onProgress?.(1); }) }));
```

y después de los imports dinámicos existentes:

```js
const { putWithProgress } = await import('./putWithProgress.js');
const { VIDEO_MAX } = await import('./upload.js');
```

Agregar los tests:

```js
describe('uploadFile media (piezas de pauta)', () => {
  beforeEach(() => { api.upload.mockClear(); api.post.mockClear(); putWithProgress.mockClear(); });

  it('video: pide link, sube directo con progreso y confirma', async () => {
    const file = new File(['abc'], 'reel.mp4', { type: 'video/mp4' });
    const progress = [];
    const res = await uploadFile({ ownerType: 'ad_story', ownerId: 'c1', file, kind: 'media', onProgress: (p) => progress.push(p) });
    expect(api.post).toHaveBeenNthCalledWith(1, '/files/upload-url', { owner_type: 'ad_story', owner_id: 'c1', mime: 'video/mp4', bytes: 3, original_name: 'reel.mp4' });
    expect(putWithProgress.mock.calls[0][0]).toBe('https://r2.example/put?sig=1');
    expect(putWithProgress.mock.calls[0][2].headers).toEqual({ 'Content-Type': 'video/mp4' });
    expect(api.post).toHaveBeenNthCalledWith(2, '/files/complete', { token: 'up1' });
    expect(progress).toEqual([0.5, 1]);
    expect(res).toEqual({ id: 'v1', kind: 'video' });
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('con storage local el PUT va a la API con la sesión', async () => {
    api.post.mockImplementationOnce(async () => ({ upload_url: '/api/files/local-upload/xyz', token: 'up2' }));
    await uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', file: new File(['a'], 'a.mov', { type: 'video/quicktime' }), kind: 'media' });
    expect(putWithProgress.mock.calls[0][0]).toBe('/api/files/local-upload/xyz');
    expect(putWithProgress.mock.calls[0][2].headers).toEqual({ 'Content-Type': 'video/quicktime', Authorization: 'Bearer tok' });
  });

  it('video de más de 200 MB o de otro formato se rechaza antes de subir', async () => {
    await expect(uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', kind: 'media', file: { name: 'x.mp4', type: 'video/mp4', size: VIDEO_MAX + 1 } }))
      .rejects.toThrow('El video pesa más de 200 MB.');
    await expect(uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', kind: 'media', file: { name: 'x.webm', type: 'video/webm', size: 10 } }))
      .rejects.toThrow('Elegí una imagen JPG/PNG o un video MP4/MOV.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('imagen: va tal cual por el endpoint de siempre', async () => {
    await uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', file: new File(['a'], 'feed.png', { type: 'image/png' }), kind: 'media' });
    expect(api.upload.mock.calls[0][1].get('file').name).toBe('feed.png');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd frontend && npx vitest run src/lib/upload.test.js`
Expected: FAIL (no existe `./putWithProgress.js`; `kind: 'media'` no soportado)

- [ ] **Step 3: `putWithProgress`**

Crear `frontend/src/lib/putWithProgress.js`:

```js
// PUT con progreso (fetch no informa avance de subida). onProgress recibe 0..1
export function putWithProgress(url, file, { headers = {}, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(xhr.status === 413 ? 'El video es más grande de lo esperado.' : `No se pudo subir el video (${xhr.status}). Probá de nuevo.`)));
    xhr.onerror = () => reject(new Error('Se cortó la subida. Revisá internet y probá de nuevo.'));
    xhr.send(file);
  });
}
```

- [ ] **Step 4: `upload.js`**

En `frontend/src/lib/upload.js`:
- imports: `import { api, API_BASE, getToken } from '../api/client.js';` y `import { putWithProgress } from './putWithProgress.js';`
- constantes:

```js
export const VIDEO_MAX = 200 * 1024 * 1024;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const RAW_IMAGE_TYPES = ['image/jpeg', 'image/png'];
```

- función nueva:

```js
// Videos: el servidor da un link firmado, el navegador sube directo al storage y después se confirma
async function uploadVideo({ ownerType, ownerId, file, onProgress }) {
  if (file.size > VIDEO_MAX) throw new Error('El video pesa más de 200 MB.');
  const { upload_url: url, token } = await api.post('/files/upload-url', {
    owner_type: ownerType, owner_id: ownerId, mime: file.type, bytes: file.size, original_name: file.name,
  });
  const local = url.startsWith('/api/');
  const auth = local && getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
  await putWithProgress(local ? `${API_BASE}${url}` : url, file, { headers: { 'Content-Type': file.type, ...auth }, onProgress });
  return (await api.post('/files/complete', { token })).file;
}
```

- en `uploadFile`, cambiar la firma a `export async function uploadFile({ ownerType, ownerId, file, kind, onProgress }) {` y agregar al principio del cuerpo:

```js
  // Piezas de pauta: imagen JPG/PNG tal cual o video
  if (kind === 'media') {
    if (VIDEO_TYPES.includes(file.type)) return uploadVideo({ ownerType, ownerId, file, onProgress });
    if (!RAW_IMAGE_TYPES.includes(file.type)) throw new Error('Elegí una imagen JPG/PNG o un video MP4/MOV.');
    kind = 'raw';
  }
```

(`kind` es parámetro: reasignarlo está bien; si el linter se queja, usar una variable local `const k = …`).

- [ ] **Step 5: Correr los tests de upload**

Run: `cd frontend && npx vitest run src/lib/upload.test.js`
Expected: PASS

- [ ] **Step 6: Formulario y lista de piezas**

Crear `frontend/src/pages/ads/media.js`:

```js
// Debe coincidir con ALLOW_MIXED_MEDIA de backend/src/ads/creativeSpec.js
export const ALLOW_MIXED_MEDIA = true;
export const MEDIA_ACCEPT = 'image/jpeg,image/png,video/mp4,video/quicktime';
export const mediaKind = (file) => (file?.type?.startsWith('video/') ? 'video' : 'image');
```

En `frontend/src/pages/ads/api.js`, en `useCreateCreative`, cambiar el `mutationFn` a:

```js
    mutationFn: async ({ feed, story, onProgress, ...body }) => {
      const creative = (await api.post('/ads/creatives', body)).creative;
      try {
        await uploadFile({ ownerType: 'ad_feed', ownerId: creative.id, file: feed, kind: 'media', onProgress: (p) => onProgress?.('feed', p) });
        if (story) await uploadFile({ ownerType: 'ad_story', ownerId: creative.id, file: story, kind: 'media', onProgress: (p) => onProgress?.('story', p) });
      } catch (err) {
        await api.patch(`/ads/creatives/${creative.id}`, { status: 'archived' }).catch(() => {});
        throw err;
      }
      return creative;
    },
```

En `AdsPage.jsx`:
- `import { ALLOW_MIXED_MEDIA, MEDIA_ACCEPT, mediaKind } from './media.js';` y sumar `PlayCircle` al import de `lucide-react`.
- agregar el componente:

```jsx
// Vista previa del archivo elegido (imagen o video) antes de subirlo
function MediaPreview({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!file || !url) return null;
  return mediaKind(file) === 'video'
    ? <video src={url} className={s.preview} muted playsInline controls />
    : <img src={url} alt="" className={s.preview} />;
}

function PieceMedia({ media }) {
  if (!media) return <div className={s.noImg}>Sin imagen</div>;
  if (media.kind === 'video') {
    return (
      <div className={s.videoWrap}>
        <video src={fileUrl(media.url)} muted playsInline preload="metadata" />
        <PlayCircle size={40} className={s.play} aria-label="Video" />
      </div>
    );
  }
  return <img src={fileUrl(media.url)} alt="" />;
}
```

(sumar `useEffect` al import de `react`).
- en `Creatives`, reemplazar la línea de la imagen de la tarjeta por `<PieceMedia media={c.feed} />`, cambiar `{c.story_file_id && <small>Con versión historia 9:16</small>}` por `{c.story && <small>Con versión historia 9:16 ({c.story.kind === 'video' ? 'video' : 'imagen'})</small>}`, y el `disabled` de Publicar por `disabled={!snapshot || !c.feed}`; en el `EmptyState` cambiar el texto a `Subí la imagen o el video (feed 4:5 y, si hay, historia 9:16) con el texto del anuncio. Después la publicás en un conjunto o se la dejás al agente.`
- en `NewCreative`:

```jsx
  const [progress, setProgress] = useState(null);
  const mixed = feed && story && mediaKind(feed) !== mediaKind(story);
  const mixedError = !ALLOW_MIXED_MEDIA && mixed ? 'Feed e historia tienen que ser los dos imagen o los dos video.' : undefined;
  const ok = form.name.trim() && form.copy.trim() && feed && !mixedError;
  const hasVideo = [feed, story].some((f) => f && mediaKind(f) === 'video');
  const submit = () => create.mutate(
    { ...form, feed, story, onProgress: (slot, p) => setProgress({ slot, p }) },
    { onSuccess: onClose, onSettled: () => setProgress(null) },
  );
```

reemplazar los dos `Field` de imágenes por:

```jsx
        <Field label="Feed 4:5 (1080×1350)" required hint="Imagen JPG/PNG hasta 8 MB o video MP4/MOV hasta 200 MB">
          <Input type="file" accept={MEDIA_ACCEPT} onChange={(e) => setFeed(e.target.files[0] ?? null)} />
        </Field>
        <MediaPreview file={feed} />
        <Field label="Historia 9:16 (1080×1920)" hint="Opcional. Si no la subís, Meta adapta la de feed." error={mixedError}>
          <Input type="file" accept={MEDIA_ACCEPT} onChange={(e) => setStory(e.target.files[0] ?? null)} />
        </Field>
        <MediaPreview file={story} />
```

y el `footer` del `Sheet` por:

```jsx
      footer={(
        <>
          {progress && hasVideo && (
            <Progress value={Math.round(progress.p * 100)} max={100} label={`Subiendo ${progress.slot === 'feed' ? 'feed' : 'historia'}: ${Math.round(progress.p * 100)}%`} />
          )}
          <Button full loading={create.isPending} disabled={!ok} onClick={submit}>Guardar pieza</Button>
        </>
      )}
```

En `ads.module.css` agregar:

```css
.preview { width: 100%; max-height: 320px; object-fit: contain; border-radius: 10px; background: var(--c-surface-2); }
.videoWrap { position: relative; }
.videoWrap video { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; background: var(--c-surface-2); display: block; }
.play { position: absolute; inset: 0; margin: auto; color: #fff; filter: drop-shadow(0 1px 4px rgb(0 0 0 / 0.5)); pointer-events: none; }
```

- [ ] **Step 7: Tests y build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS y build sin errores

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib frontend/src/pages/ads
git commit -m "feat(pauta): subir videos en las piezas con vista previa y progreso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificación contra Meta y R2, y notas de deploy

Esta tarea no agrega código salvo que la verificación lo pida. La hace alguien con acceso al Business Manager, a Cloudflare y a un `.env` con `META_ACCESS_TOKEN`, `ANTHROPIC_API_KEY` y R2.

**Files:**
- Modify (solo si hace falta): `backend/src/ads/creativeSpec.js`, `frontend/src/pages/ads/media.js` (`ALLOW_MIXED_MEDIA`)
- Modify: `backend/.env.example`

- [ ] **Step 1: CORS de R2**

En Cloudflare → R2 → bucket `uniformar` → Settings → CORS policy, pegar (reemplazar el origen por el de `FRONTEND_URL`):

```json
[
  {
    "AllowedOrigins": ["https://<dominio-del-front>"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

- [ ] **Step 2: Acceso a @uniform.ar**

Business Manager → Configuración del negocio → Cuentas de Instagram → @uniform.ar → Activos conectados → agregar la cuenta publicitaria `act_1385921086504906`. Verificar que el token tenga `instagram_basic` e `instagram_manage_insights` (Graph API Explorer → Debug token).

- [ ] **Step 3: Probar en el panel, con un conjunto PAUSADO**

1. Responder una pregunta con "Guardar y analizar ahora" y revisar que el informe nuevo la use.
2. En Anuncios → Posts de Instagram: tienen que aparecer los posts con métricas. Promocionar un reel en un conjunto pausado; revisar en el Administrador de anuncios que el anuncio muestre el reel con el botón de WhatsApp. Si Meta rechaza el `call_to_action` con `link`, sacar `link: WHATSAPP_LINK` de `buildIgPostCreativeSpec` y del `CTA` de video, correr `npx vitest run` y commitear.
3. Crear una pieza con **video en feed y en historia** y publicarla en el conjunto pausado.
4. Crear una pieza con **imagen en feed y video en historia** y publicarla. Si Meta la rechaza por el formato mixto: poner `ALLOW_MIXED_MEDIA = false` en `backend/src/ads/creativeSpec.js` y en `frontend/src/pages/ads/media.js`, correr los tests de los dos lados y commitear `fix(pauta): feed e historia del mismo tipo (Meta no acepta mezclar imagen y video)`.
5. Anotar cuánto tardó Meta en procesar el video. Si una publicación tarda más de lo que aguanta el proxy del hosting (la request queda abierta mientras espera), dejarlo anotado como pendiente para pasar la publicación a segundo plano.

- [ ] **Step 4: `.env.example`**

En `backend/.env.example` agregar al final:

```
# Agente de pauta (opcional). El token de Meta necesita ads_management, instagram_basic e instagram_manage_insights.
META_ACCESS_TOKEN=
ANTHROPIC_API_KEY=
# Para subir videos a R2 desde el navegador, el bucket necesita CORS con PUT desde FRONTEND_URL.
```

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example
git commit -m "docs(pauta): variables y configuración de Meta/R2 para videos y posts de Instagram

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
