import { cloneElement, forwardRef, useId, useLayoutEffect, useRef } from 'react';
import s from './Field.module.css';

// Si el control va envuelto (p. ej. input + botón de ojo), pasar htmlFor y poner ese id en el input
export function Field({ label, hint, error, required, htmlFor, children, className = '' }) {
  const auto = useId();
  const id = htmlFor ?? children.props.id ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={`${s.field} ${className}`}>
      {label && (
        <label htmlFor={id} className={s.label}>
          {label}{required && <span className={s.req} aria-hidden> *</span>}
        </label>
      )}
      {htmlFor ? children : cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && !error && <p id={hintId} className={s.hint}>{hint}</p>}
      {error && <p id={errId} className={s.error}>{error}</p>}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`${s.input} ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ className = '', ...props }, ref) {
  return <select ref={ref} className={`${s.input} ${s.select} ${className}`} {...props} />;
});

// Crece con el contenido: los textos largos se ven completos mientras se escriben
export const Textarea = forwardRef(function Textarea({ minRows = 3, className = '', value, ...props }, ref) {
  const inner = useRef(null);
  const setRefs = (el) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={setRefs} rows={minRows} value={value} className={`${s.input} ${s.textarea} ${className}`} {...props} />;
});
