import { Router } from 'express';
import { z } from 'zod';
import { parse, dateStr } from '../lib/validate.js';
import { todayART, weekRange, weekdayOf, addDays, artDayStartISO } from '../lib/dates.js';
import { hasLevel, requirePermission } from '../services/permissions.js';

function dayState(items) {
  if (!items.length) return 'empty';
  if (items.every((i) => i.status === 'published')) return 'published';
  if (items.every((i) => i.status !== 'draft')) return 'ready';
  return 'planned';
}

export function createHomeRouter({ homeRepo, storage }) {
  const r = Router();

  r.get('/home', requirePermission('home', 'view'), async (req, res) => {
    const { week } = parse(z.object({ week: dateStr.optional() }), req.query);
    const range = weekRange(week ?? todayART());
    const u = req.user;
    const can = { ideas: hasLevel(u, 'ideas', 'view'), calendar: hasLevel(u, 'calendar', 'view'), projects: hasLevel(u, 'projects', 'view') };
    const fromISO = artDayStartISO(range.start);
    const toISO = artDayStartISO(addDays(range.end, 1));

    const [rules, items, counters, toDecide, openIdeas, done, tasks, projects, users] = await Promise.all([
      can.calendar ? homeRepo.rules() : null,
      can.calendar ? homeRepo.weekItems(range.start, range.end) : null,
      can.ideas ? homeRepo.ideaCounters(fromISO, toISO) : null,
      can.ideas ? homeRepo.toDecide() : null,
      can.ideas ? homeRepo.openAssignedIdeas() : [],
      can.ideas ? homeRepo.recentlyDone() : null,
      can.projects ? homeRepo.openTasksInActiveProjects() : [],
      can.projects ? homeRepo.projectsSummary() : null,
      homeRepo.activeUsers(),
    ]);

    res.json({
      week: {
        start: range.start,
        end: range.end,
        days: can.calendar
          ? range.days.map((date) => {
            const dayItems = items.filter((i) => i.date === date);
            return { date, weekday: weekdayOf(date), rules: rules.filter((x) => x.weekday === weekdayOf(date)), items: dayItems, state: dayState(dayItems) };
          })
          : null,
      },
      counters: {
        new_ideas_week: counters?.new_ideas_week ?? null,
        to_decide: counters?.to_decide ?? null,
        done_week: counters?.done_week ?? null,
        active_projects: projects ? projects.filter((p) => p.status === 'active').length : null,
      },
      mine: {
        to_decide: (toDecide ?? []).filter((i) => i.assignee_id === u.id),
        to_do: openIdeas.filter((i) => i.assignee_id === u.id),
        tasks: tasks.filter((t) => t.assignee_ids.includes(u.id)),
      },
      to_decide: toDecide,
      recently_done: done
        ? await Promise.all(done.map(async ({ thumb_file_id, thumb_key, ...d }) => ({
          ...d, thumb_url: thumb_file_id ? await storage.urlFor({ id: thumb_file_id, storage_key: thumb_key }) : null,
        })))
        : null,
      pending_by_user: users.map((user) => ({
        user,
        ideas: openIdeas.filter((i) => i.assignee_id === user.id),
        tasks: tasks.filter((t) => t.assignee_ids.includes(user.id)),
      })),
      projects: projects
        ? {
          active: projects.filter((p) => p.status === 'active').map(({ id, name, task_total, task_done }) => ({ id, name, task_total, task_done })),
          proposals: projects.filter((p) => p.status === 'proposal').map(({ id, name }) => ({ id, name })),
          upcoming: projects.filter((p) => p.status === 'upcoming').map(({ id, name }) => ({ id, name })),
        }
        : null,
    });
  });

  return r;
}
