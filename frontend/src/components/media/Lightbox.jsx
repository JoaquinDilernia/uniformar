import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ExternalLink } from 'lucide-react';
import s from './media.module.css';

export function Lightbox({ files, index, onClose }) {
  const [i, setI] = useState(index);
  const prev = () => setI((n) => (n - 1 + files.length) % files.length);
  const next = () => setI((n) => (n + 1) % files.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const file = files[i];
  return createPortal(
    <div className={s.lightbox} role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={onClose}>
      <img src={file.url} alt={file.original_name} className={s.lightboxImg} onClick={(e) => e.stopPropagation()} />
      <div className={s.lightboxBar} onClick={(e) => e.stopPropagation()}>
        <span>{i + 1} / {files.length}</span>
        <a href={file.url} target="_blank" rel="noreferrer" className={s.lbBtn} aria-label="Abrir original"><ExternalLink size={20} /></a>
        <button type="button" className={s.lbBtn} onClick={onClose} aria-label="Cerrar"><X size={22} /></button>
      </div>
      {files.length > 1 && (
        <>
          <button type="button" className={`${s.lbNav} ${s.lbPrev}`} onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Anterior"><ChevronLeft size={28} /></button>
          <button type="button" className={`${s.lbNav} ${s.lbNext}`} onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Siguiente"><ChevronRight size={28} /></button>
        </>
      )}
    </div>,
    document.body,
  );
}
