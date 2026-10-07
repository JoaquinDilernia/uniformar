import { hashPassword } from './auth.js';
import { TEMPLATES } from './permissions.js';

// Crea el superadmin si no existe. Nunca pisa una contraseña existente.
export async function ensureSuperadmin({ usersRepo, email, password, name = 'Joaquín' }) {
  if (!email || !password) return null;
  const existing = await usersRepo.findByEmail(email);
  if (existing) return existing;
  const t = TEMPLATES.admin;
  return usersRepo.create({
    email, name, passwordHash: await hashPassword(password), mustChangePassword: true,
    canDelete: t.can_delete, manageUsers: t.manage_users, permissions: t.permissions,
  });
}
