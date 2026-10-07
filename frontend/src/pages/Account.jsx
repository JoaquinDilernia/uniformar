import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, LogOut } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../state/auth.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { ChangePasswordForm } from './ChangePassword.jsx';
import s from './settings.module.css';
import p from './pages.module.css';

export const AVATAR_COLORS = ['#775D66', '#366497', '#2D7A57', '#9A640F', '#B23A3C', '#5B4B8A', '#1F7A80', '#4A4346'];
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;

function InstallApp() {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  if (isStandalone()) return <p className="muted">Ya la tenés instalada ✓</p>;
  if (prompt) return <Button icon={Download} onClick={() => prompt.prompt()}>Instalar en este dispositivo</Button>;
  if (isIOS()) return <p className="muted">En iPhone: tocá <strong>Compartir</strong> y después <strong>Agregar a inicio</strong>.</p>;
  return <p className="muted">En Android/Chrome: menú ⋮ → <strong>Instalar app</strong>.</p>;
}

export function AccountPage() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [color, setColor] = useState(user?.avatar_color ?? AVATAR_COLORS[0]);
  const save = useMutation({
    mutationFn: (body) => api.patch('/auth/me', body).then((r) => r.user),
    meta: { success: 'Perfil guardado ✓' },
    onSuccess: setUser,
  });
  if (!user) return <div className={s.center}><Spinner size={28} label="Cargando" /></div>;

  function onSave() {
    if (save.isPending || !name.trim()) return;
    save.mutate({ name: name.trim(), avatar_color: color });
  }

  return (
    <>
      <PageHeader title="Mi cuenta" subtitle={user.email} />
      <div className={`${p.page} ${s.stack}`}>
        <section className={s.card}>
          <h2>Perfil</h2>
          <div className={s.profile}>
            <Avatar user={{ name, avatar_color: color }} size={56} />
            <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </div>
          <div role="radiogroup" aria-label="Color" className={s.colors}>
            {AVATAR_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} className={`${s.swatch} ${color === c ? s.swatchOn : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className={s.actions}><Button onClick={onSave} loading={save.isPending} disabled={save.isPending || !name.trim()}>Guardar perfil</Button></div>
        </section>
        <section className={s.card}>
          <h2>Contraseña</h2>
          <ChangePasswordForm />
        </section>
        <section className={s.card}>
          <h2>App en el celular</h2>
          <InstallApp />
        </section>
        <Button variant="ghost" icon={LogOut} onClick={logout}>Salir</Button>
      </div>
    </>
  );
}
