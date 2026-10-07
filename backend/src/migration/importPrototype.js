const isHttp = (v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
const url = (v) => (isHttp(v) ? v.trim() : null);
const dateOnly = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const CHANNEL_MAP = { historiasIG: 'ig_story', posteoIG: 'ig_post', reelIG: 'ig_reel', tiktok: 'tiktok' };
const STATUS_MAP = { activo: 'active', propuesta: 'proposal', proximo: 'upcoming', próximo: 'upcoming', terminado: 'done' };

async function insertIgnore(q, table, values) {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  const { rows } = await q.query(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (legacy_id) DO NOTHING RETURNING id`,
    keys.map((k) => values[k]),
  );
  return rows[0]?.id ?? null;
}

async function upsertClient(q, name) {
  const n = name.trim().replace(/\s+/g, ' ');
  const found = await q.query('SELECT id FROM clients WHERE lower(name) = lower($1)', [n]);
  if (found.rows[0]) return found.rows[0].id;
  return (await q.query('INSERT INTO clients (name) VALUES ($1) RETURNING id', [n])).rows[0].id;
}

export async function importPrototype(db, data, { users, defaultAssignee = 'Santi', creator = 'Sofi' }) {
  const userByName = (n) => {
    const key = Object.keys(users).find((k) => k.toLowerCase() === String(n ?? '').trim().toLowerCase());
    return key ? users[key] : null;
  };
  const namesIn = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/,|\by\b|\//)).map((s) => s.trim()).filter(Boolean);
  const summary = { ideas: 0, projects: 0, tasks: 0, calendar: 0, skipped: 0 };

  await db.tx(async (q) => {
    for (const it of data.ideas ?? []) {
      const kind = it.encargo ? 'must' : 'idea';
      const category = ['domingo', 'viernes', 'producto'].includes(it.categoria) ? it.categoria : 'otra';
      let decision = { si: 'yes', no: 'no' }[it.decision] ?? 'pending';
      if (kind === 'must') decision = 'pending';
      if (it.hecha && kind === 'idea' && decision === 'pending') decision = 'yes';
      const id = await insertIgnore(q, 'ideas', {
        legacy_id: `idea:${it.id}`,
        kind,
        format: it.formato === 'foto' ? 'photo' : 'video',
        category,
        client_id: category === 'viernes' && text(it.cliente) ? await upsertClient(q, it.cliente) : null,
        assignee_id: userByName(it.responsable) ?? userByName(defaultAssignee),
        text: text(it.texto) ?? '(sin texto)',
        reference_url: url(it.link),
        decision,
        done_at: it.hecha ? (it.hechaEn || it.creado || new Date().toISOString()) : null,
        result_url: url(it.linkResultado),
        due_date: kind === 'must' ? dateOnly(it.fechaLimite) : null,
        note_santi: text(it.nota),
        note_santi_by: text(it.nota) ? userByName('Santi') : null,
        note_sofi: text(it.notaSofi),
        note_sofi_by: text(it.notaSofi) ? userByName('Sofi') : null,
        created_by: userByName(creator),
        created_at: it.creado || undefined,
      });
      if (id) summary.ideas++;
    }

    for (const p of data.proyectos ?? []) {
      const projectId = await insertIgnore(q, 'projects', {
        legacy_id: `project:${p.id}`,
        name: text(p.nombre) ?? '(sin nombre)',
        status: p.terminado ? 'done' : STATUS_MAP[p.estado] ?? 'active',
        start_date: dateOnly(p.fechaInicio),
        end_date: dateOnly(p.fechaCierre),
        goal_text: p.queQueremos ?? '',
        doing_text: p.queSeEsta ?? '',
        how_text: p.comoSeVa ?? '',
        created_by: userByName(creator),
        created_at: p.creado || undefined,
      });
      if (!projectId) continue;
      summary.projects++;
      for (const [i, t] of (p.tareas ?? []).entries()) {
        const taskId = await insertIgnore(q, 'project_tasks', {
          legacy_id: `task:${p.id}:${t.id}`,
          project_id: projectId,
          text: text(t.texto) ?? '(sin texto)',
          done: Boolean(t.hecho),
          done_at: t.hecho ? new Date().toISOString() : null,
          sort: i,
          created_at: t.creado || undefined,
        });
        if (!taskId) continue;
        summary.tasks++;
        const ids = new Set([...namesIn(t.asignados), ...namesIn(t.asignado)].map(userByName).filter(Boolean));
        for (const userId of ids) await q.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [taskId, userId]);
      }
    }

    const days = Array.isArray(data.calendar)
      ? data.calendar
      : Object.entries(data.calendar ?? {}).map(([id, d]) => ({ id, ...d }));
    for (const d of days) {
      const date = dateOnly(d.id ?? d.fecha);
      const channels = Object.entries(d.canales ?? {}).filter(([, on]) => on).map(([k]) => CHANNEL_MAP[k]).filter(Boolean);
      const empty = !text(d.quePublica) && !channels.length && !url(d.linkPieza) && !text(d.referencias);
      if (!date || empty) { summary.skipped++; continue; }
      const id = await insertIgnore(q, 'calendar_items', {
        legacy_id: `cal:${date}`,
        date,
        title: d.quePublica ?? '',
        channels,
        piece_url: url(d.linkPieza),
        refs: text(d.referencias),
        status: 'draft',
        created_by: userByName(creator),
      });
      if (id) summary.calendar++;
    }
  });

  return summary;
}
