import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { importPrototype } from '../src/migration/importPrototype.js';

const data = {
  ideas: [
    { id: 'i1', texto: 'Reel humor delantal', categoria: 'domingo', formato: 'video', encargo: false, decision: 'pendiente', hecha: false, creado: '2026-09-01T12:00:00Z' },
    { id: 'i2', texto: 'Entrega POSTA', categoria: 'viernes', formato: 'video', cliente: 'POSTA', encargo: false, decision: 'si', hecha: true, hechaEn: '2026-09-10T15:00:00Z', linkResultado: 'https://drive.google.com/x', nota: 'Grabado con Santi\n2 tomas', notaSofi: 'Subir el viernes', creado: '2026-09-02T12:00:00Z' },
    { id: 'i3', texto: 'Fotos catálogo', categoria: 'producto', formato: 'foto', encargo: true, responsable: 'Santi', fechaLimite: '2026-10-20', decision: 'pendiente', hecha: false, link: 'no es un link', creado: '2026-09-03T12:00:00Z' },
    { id: 'i4', texto: 'Algo raro', categoria: 'zzz', formato: 'video', decision: 'no', creado: '2026-09-04T12:00:00Z' },
  ],
  proyectos: [
    { id: 'p1', nombre: 'Rediseño de la web', estado: 'activo', fechaInicio: '2026-09-01', queQueremos: 'Web nueva', tareas: [
      { id: 't1', texto: 'Brief al diseñador', asignados: ['Sofi', 'Bauti'], hecho: false },
      { id: 't2', texto: 'Comprar dominio', asignado: 'Santi y Bauti', hecho: true },
    ] },
    { id: 'p2', nombre: 'LinkedIn', estado: 'propuesta', tareas: [] },
    { id: 'p3', nombre: 'Viejo', estado: 'activo', terminado: true, tareas: [] },
  ],
  calendar: {
    '2026-10-10': { quePublica: 'Reel POSTA', canales: { reelIG: true, tiktok: true, historiasIG: false, posteoIG: false }, linkPieza: 'https://drive.google.com/p', referencias: 'https://a.com\nhttps://b.com' },
    '2026-10-11': { quePublica: '', canales: {}, linkPieza: '', referencias: '' },
  },
};

let ctx, users;
beforeAll(async () => {
  ctx = await createTestContext();
  const mk = (name) => ctx.createUser({ name, template: 'equipo' });
  const [sofi, santi, bauti] = await Promise.all([mk('Sofi'), mk('Santi'), mk('Bauti')]);
  users = { Sofi: sofi.id, Santi: santi.id, Bauti: bauti.id };
});
afterAll(() => ctx.close());

describe('migración del prototipo', () => {
  it('importa todo con los mapeos correctos', async () => {
    const summary = await importPrototype(ctx.db, data, { users });
    expect(summary).toEqual({ ideas: 4, projects: 3, tasks: 2, calendar: 1, skipped: 1 });

    const { rows: ideas } = await ctx.db.query('SELECT i.*, c.name AS client_name FROM ideas i LEFT JOIN clients c ON c.id = i.client_id ORDER BY legacy_id');
    const by = Object.fromEntries(ideas.map((i) => [i.legacy_id, i]));
    expect(by['idea:i1']).toMatchObject({ kind: 'idea', decision: 'pending', category: 'domingo', assignee_id: users.Santi, created_by: users.Sofi });
    expect(by['idea:i2']).toMatchObject({ decision: 'yes', client_name: 'POSTA', result_url: 'https://drive.google.com/x', note_santi: 'Grabado con Santi\n2 tomas', note_santi_by: users.Santi, note_sofi_by: users.Sofi });
    expect(by['idea:i2'].done_at).toBeTruthy();
    expect(by['idea:i3']).toMatchObject({ kind: 'must', format: 'photo', due_date: '2026-10-20', reference_url: null });
    expect(by['idea:i4']).toMatchObject({ category: 'otra', decision: 'no' });

    const { rows: projects } = await ctx.db.query('SELECT legacy_id, status, goal_text FROM projects ORDER BY legacy_id');
    expect(projects.map((p) => p.status)).toEqual(['active', 'proposal', 'done']);
    const { rows: assignees } = await ctx.db.query(
      `SELECT t.legacy_id, array_agg(ta.user_id::text ORDER BY ta.user_id) AS ids, bool_and(t.done) AS done
       FROM project_tasks t JOIN task_assignees ta ON ta.task_id = t.id GROUP BY t.legacy_id ORDER BY t.legacy_id`,
    );
    expect(assignees[0].ids.sort()).toEqual([users.Sofi, users.Bauti].sort());
    expect(assignees[1]).toMatchObject({ done: true });
    expect(assignees[1].ids.sort()).toEqual([users.Santi, users.Bauti].sort());

    const { rows: cal } = await ctx.db.query('SELECT * FROM calendar_items');
    expect(cal).toHaveLength(1);
    expect(cal[0]).toMatchObject({ date: '2026-10-10', title: 'Reel POSTA', channels: ['ig_reel', 'tiktok'], refs: 'https://a.com\nhttps://b.com', status: 'draft' });
  });

  it('correrla dos veces no duplica', async () => {
    const again = await importPrototype(ctx.db, data, { users });
    expect(again).toEqual({ ideas: 0, projects: 0, tasks: 0, calendar: 0, skipped: 1 });
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM ideas');
    expect(rows[0].n).toBe(4);
  });
});
