import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../state/auth.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import s from './Login.module.css';

export function ChangePasswordForm({ onDone }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const mutation = useMutation({
    mutationFn: (body) => api.post('/auth/change-password', body),
    meta: { success: 'Contraseña actualizada ✓' },
    onSuccess: ({ user }) => {
      setUser(user);
      onDone?.();
    },
    onError: (err) => setErrors(err.fields ?? {}),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e) {
    e.preventDefault();
    if (form.newPassword.length < 8) return setErrors({ newPassword: 'Mínimo 8 caracteres' });
    if (form.newPassword !== form.confirm) return setErrors({ confirm: 'No coincide con la nueva contraseña' });
    setErrors({});
    mutation.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword });
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <Field label="Contraseña actual" error={errors.currentPassword}>
        <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} />
      </Field>
      <Field label="Contraseña nueva" hint="Mínimo 8 caracteres." error={errors.newPassword}>
        <Input type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} />
      </Field>
      <Field label="Repetí la contraseña nueva" error={errors.confirm}>
        <Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
      </Field>
      <Button type="submit" loading={mutation.isPending} full>Guardar contraseña</Button>
    </form>
  );
}

export function ChangePassword() {
  const { user, logout } = useAuth();
  return (
    <main className={s.page}>
      <div className={s.card}>
        <img src="/logo-ciruela.png" alt="Uniform.ar" className={s.logo} />
        <h1 className={s.title}>Hola, {user.name.split(' ')[0]}</h1>
        <p className="muted" style={{ textAlign: 'center' }}>Por seguridad, elegí una contraseña nueva para tu cuenta.</p>
        <ChangePasswordForm />
        <Button variant="ghost" onClick={logout}>Salir</Button>
      </div>
    </main>
  );
}
