import { useState } from 'react';
import { Copy, KeyRound, UserX, UserCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { toastBus } from '../../state/toastBus.js';
import { PermissionMatrix } from './PermissionMatrix.jsx';
import { useCreateUser, usePatchUser, useResetPassword, useSetPermissions } from './api.js';
import s from './users.module.css';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const TEMPLATES = [
  { value: 'equipo', label: 'Equipo' },
  { value: 'lectura', label: 'Solo lectura' },
  { value: 'admin', label: 'Admin' },
];
export const TEMPLATE_INFO = {
  equipo: 'Ve y edita ideas, calendario y proyectos. No borra. Ve pauta y web.',
  lectura: 'Ve todo, no cambia nada.',
  admin: 'Edita y borra todo, y gestiona usuarios.',
};

function Credentials({ email, password, onClose }) {
  const text = `Entrá a https://uniformar.techdi.com.ar\nUsuario: ${email}\nContraseña: ${password}\n(Te va a pedir que la cambies)`;
  return (
    <div className={s.creds}>
      <p><strong>Pasale estos datos:</strong></p>
      <pre className={s.credsBox}>{text}</pre>
      <div className={s.row}>
        <Button icon={Copy} onClick={() => navigator.clipboard.writeText(text).then(() => toastBus.success('Copiado ✓'), () => toastBus.error('No se pudo copiar. Seleccioná el texto y copialo a mano.'))}>Copiar</Button>
        <Button variant="secondary" onClick={onClose}>Listo</Button>
      </div>
    </div>
  );
}

export function NewUserSheet({ onClose }) {
  const create = useCreateUser();
  const [form, setForm] = useState({ name: '', email: '', password: generatePassword(), template: 'equipo' });
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  function submit(e) {
    e.preventDefault();
    if (create.isPending) return;
    setErrors({});
    create.mutate(form, { onSuccess: () => setDone({ email: form.email, password: form.password }), onError: (err) => setErrors(err.fields ?? {}) });
  }

  return (
    <Sheet open onClose={onClose} title="Nuevo usuario"
      footer={!done && <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="user-new" loading={create.isPending}>Crear usuario</Button></>}>
      {done ? <Credentials {...done} onClose={onClose} /> : (
        <form id="user-new" className={s.form} onSubmit={submit} noValidate>
          <Field label="Nombre" required error={errors.name}><Input value={form.name} onChange={set('name')} placeholder="Ej.: Santi" /></Field>
          <Field label="Email" required error={errors.email}><Input type="email" inputMode="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Contraseña inicial" hint="Se la pasás; al entrar la tiene que cambiar." error={errors.password} htmlFor="new-pw">
            <div className={s.row}>
              <Input id="new-pw" value={form.password} onChange={set('password')} />
              <Button variant="secondary" icon={RefreshCw} aria-label="Generar otra" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))} />
            </div>
          </Field>
          <div>
            <p className={s.label}>Permisos</p>
            <Segmented label="Plantilla de permisos" value={form.template} onChange={set('template')} options={TEMPLATES} />
            <p className={s.help}>{TEMPLATE_INFO[form.template]} Después podés ajustarlos sección por sección.</p>
          </div>
        </form>
      )}
    </Sheet>
  );
}

export function EditUserSheet({ user: target, onClose }) {
  const { user: me } = useAuth();
  const isSelf = me?.id === target.id;
  const patch = usePatchUser(target.id);
  const setPerms = useSetPermissions(target.id);
  const reset = useResetPassword(target.id);
  const confirm = useConfirm();
  const [perms, setPermsState] = useState(target.permissions);
  const [temp, setTemp] = useState(null);
  const dirty = JSON.stringify(perms) !== JSON.stringify(target.permissions);

  function savePerms() {
    if (setPerms.isPending) return;
    setPerms.mutate(perms);
  }

  async function onReset() {
    if (reset.isPending) return;
    if (!(await confirm({ title: `¿Resetear la contraseña de ${target.name}?`, message: 'Se cierran sus sesiones y le vas a tener que pasar una contraseña temporal.', confirmLabel: 'Resetear' }))) return;
    if (reset.isPending) return;
    reset.mutate(undefined, { onSuccess: (r) => setTemp(r.temporaryPassword) });
  }

  async function toggleActive() {
    if (patch.isPending) return;
    const deactivate = target.is_active;
    if (deactivate && !(await confirm({ title: `¿Desactivar a ${target.name}?`, message: 'No va a poder entrar. Sus tareas e historial se conservan.', confirmLabel: 'Desactivar', danger: true }))) return;
    if (patch.isPending) return;
    patch.mutate({ is_active: !deactivate }, { onSuccess: () => toastBus.success(deactivate ? 'Usuario desactivado' : 'Usuario reactivado') });
  }

  function setFlag(flag, value) {
    if (patch.isPending) return;
    patch.mutate({ [flag]: value }, { onSuccess: () => toastBus.success('Guardado ✓') });
  }

  return (
    <Sheet open onClose={onClose} title={target.name} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button disabled={!dirty} loading={setPerms.isPending} onClick={savePerms}>Guardar permisos</Button></>}>
      <div className={s.form}>
        <p className="muted">{target.email}</p>
        {temp && <Credentials email={target.email} password={temp} onClose={() => setTemp(null)} />}
        <PermissionMatrix value={perms} onChange={setPermsState} />
        <label className={s.flag}>
          <input type="checkbox" checked={target.can_delete} disabled={patch.isPending} onChange={(e) => setFlag('can_delete', e.target.checked)} />
          <span><strong>Puede borrar</strong><br /><span className="muted">Ideas, piezas, proyectos, tareas y archivos.</span></span>
        </label>
        <label className={s.flag}>
          <input type="checkbox" checked={target.manage_users} disabled={isSelf || patch.isPending} onChange={(e) => setFlag('manage_users', e.target.checked)} />
          <span><strong>Gestiona usuarios</strong><br /><span className="muted">Crea usuarios y cambia permisos.</span></span>
        </label>
        <div className={s.row}>
          <Button variant="secondary" icon={KeyRound} onClick={onReset} loading={reset.isPending}>Resetear contraseña</Button>
          {!isSelf && (
            <Button variant={target.is_active ? 'danger' : 'secondary'} icon={target.is_active ? UserX : UserCheck} onClick={toggleActive} disabled={patch.isPending}>
              {target.is_active ? 'Desactivar' : 'Reactivar'}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
