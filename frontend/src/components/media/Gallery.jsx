import { fileUrl } from '../../api/client.js';
import { X } from 'lucide-react';
import s from './media.module.css';

export function Gallery({ files, onOpen, onDelete, children }) {
  return (
    <div className={s.grid}>
      {files.map((f, i) => (
        <div key={f.id} className={s.thumb}>
          <button type="button" className={s.thumbBtn} onClick={() => onOpen(i)} aria-label={`Ver foto ${i + 1}`}>
            <img src={fileUrl(f.url)} alt="" loading="lazy" />
          </button>
          {onDelete && (
            <button type="button" className={s.thumbDel} onClick={() => onDelete(f)} aria-label="Borrar foto"><X size={14} /></button>
          )}
        </div>
      ))}
      {children}
    </div>
  );
}
