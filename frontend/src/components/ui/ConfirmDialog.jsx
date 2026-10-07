import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.jsx';
import s from './ConfirmDialog.module.css';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((o) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOpts(o);
  }), []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && createPortal(
        <div className={s.root} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } }}>
          <div className={s.backdrop} onClick={() => close(false)} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className={s.dialog}>
            <h2 id="confirm-title" className={s.title}>{opts.title}</h2>
            {opts.message && <p className={s.message}>{opts.message}</p>}
            <div className={s.actions}>
              <Button variant="secondary" onClick={() => close(false)}>Cancelar</Button>
              <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{opts.confirmLabel ?? 'Confirmar'}</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
