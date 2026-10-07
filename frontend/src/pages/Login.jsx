import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../state/auth.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import s from './Login.module.css';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Completá tu email y tu contraseña.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className={s.page}>
      <form className={s.card} onSubmit={onSubmit} noValidate>
        <img src="/logo-ciruela.png" alt="Uniform.ar — Indumentaria de trabajo" className={s.logo} />
        <h1 className={s.title}>Entrá a la plataforma</h1>
        <Field label="Email">
          <Input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña" htmlFor="login-password">
          <div className={s.pwWrap}>
            <Input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className={s.eye} onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
        <Button type="submit" loading={loading} full>Entrar</Button>
        <p className={s.help}>¿Olvidaste tu contraseña? Pedile a Sofi que te la resetee.</p>
      </form>
    </main>
  );
}
