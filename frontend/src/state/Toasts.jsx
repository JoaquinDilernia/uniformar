import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { toastBus } from './toastBus.js';
import s from './Toasts.module.css';

const DURATION = { success: 2500, info: 4000, error: 7000 };
const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastViewport() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => toastBus.subscribe((t) => {
    setToasts((list) => [...list.filter((x) => x.message !== t.message), t].slice(-4));
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), DURATION[t.kind]);
  }), []);

  const dismiss = (id) => setToasts((list) => list.filter((x) => x.id !== id));

  return (
    <div className={s.viewport} aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div key={t.id} className={`${s.toast} ${s[t.kind]}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden className={s.icon} />
            <p className={s.msg}>{t.message}</p>
            <button type="button" className={s.close} onClick={() => dismiss(t.id)} aria-label="Cerrar aviso"><X size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}
