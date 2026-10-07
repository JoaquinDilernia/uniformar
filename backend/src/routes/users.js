import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { conflict, notFound } from '../lib/errors.js';
import { toPublicUser } from '../repo/users.js';
import { requireFlag, TEMPLATES, SECTIONS, LEVELS } from '../services/permissions.js';
import { hashPassword, generateTempPassword } from '../services/auth.js';
import { colorSchema } from './auth.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  template: z.enum(['admin', 'equipo', 'lectura']),
  avatar_color: colorSchema.optional(),
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email().optional(),
  avatar_color: colorSchema.optional(),
  is_active: z.boolean().optional(),
  can_delete: z.boolean().optional(),
  manage_users: z.boolean().optional(),
});
const permissionsSchema = z.record(z.enum(SECTIONS), z.enum(LEVELS));

export function createUsersRouter({ usersRepo }) {
  const r = Router();

  async function load(id) {
    if (!uuid.safeParse(id).success) throw notFound('No existe ese usuario.');
    const u = await usersRepo.findById(id);
    if (!u) throw notFound('No existe ese usuario.');
    return u;
  }

  r.get('/directory', async (_req, res) => res.json({ users: await usersRepo.directory() }));

  r.use(requireFlag('manage_users'));

  r.get('/', async (_req, res) => res.json({ users: (await usersRepo.list()).map(toPublicUser) }));

  r.post('/', async (req, res) => {
    const body = parse(createSchema, req.body);
    if (await usersRepo.findByEmail(body.email)) throw conflict('Ya existe un usuario con ese email.');
    const t = TEMPLATES[body.template];
    const user = await usersRepo.create({
      email: body.email, name: body.name, avatarColor: body.avatar_color,
      passwordHash: await hashPassword(body.password), mustChangePassword: true,
      canDelete: t.can_delete, manageUsers: t.manage_users, permissions: t.permissions,
    });
    res.status(201).json({ user: toPublicUser(user) });
  });

  r.patch('/:id', async (req, res) => {
    const target = await load(req.params.id);
    const patch = parse(patchSchema, req.body);
    const isSelf = target.id === req.user.id;
    if (isSelf && (patch.is_active === false || patch.manage_users === false)) {
      throw conflict('No podés desactivarte ni quitarte el permiso de gestionar usuarios a vos mismo.');
    }
    const losesManager = target.manage_users && target.is_active && (patch.is_active === false || patch.manage_users === false);
    if (losesManager && (await usersRepo.countActiveManagers(target.id)) === 0) {
      throw conflict('Tiene que quedar al menos un usuario activo que gestione usuarios.');
    }
    if (patch.email) {
      const other = await usersRepo.findByEmail(patch.email);
      if (other && other.id !== target.id) throw conflict('Ya existe un usuario con ese email.');
    }
    res.json({ user: toPublicUser(await usersRepo.update(target.id, patch)) });
  });

  r.put('/:id/permissions', async (req, res) => {
    const target = await load(req.params.id);
    const permissions = parse(permissionsSchema, req.body);
    res.json({ user: toPublicUser(await usersRepo.setPermissions(target.id, permissions)) });
  });

  r.post('/:id/reset-password', async (req, res) => {
    const target = await load(req.params.id);
    const temporaryPassword = generateTempPassword();
    await usersRepo.setPassword(target.id, await hashPassword(temporaryPassword), { mustChange: true });
    res.json({ user: toPublicUser(await usersRepo.findById(target.id)), temporaryPassword });
  });

  return r;
}
