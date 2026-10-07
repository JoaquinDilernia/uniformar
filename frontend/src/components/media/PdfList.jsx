import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Trash2, ExternalLink } from 'lucide-react';
import { api, fileUrl } from '../../api/client.js';
import { uploadFile } from '../../lib/upload.js';
import { useConfirm } from '../ui/ConfirmDialog.jsx';
import { Sheet } from '../ui/Sheet.jsx';
import { Button } from '../ui/Button.jsx';
import { SizeHint } from './SizeHint.jsx';
import s from './media.module.css';

// iOS no muestra bien PDFs dentro de un iframe: ahí se ofrece abrirlo
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function PdfList({ ownerType, ownerId, files, invalidate = [], canEdit, canDelete }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const confirm = useConfirm();
  const [viewing, setViewing] = useState(null);
  const refresh = () => Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));

  const upload = useMutation({
    mutationFn: (file) => uploadFile({ ownerType, ownerId, file, kind: 'pdf' }),
    meta: { success: 'PDF subido ✓' },
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (f) => api.del(`/files/${f.id}`), meta: { success: 'PDF borrado' }, onSettled: refresh });

  return (
    <div className={s.pdfs}>
      {files.map((f) => (
        <div key={f.id} className={s.pdfRow}>
          <button type="button" className={s.pdfOpen} onClick={() => setViewing(f)}>
            <FileText size={20} aria-hidden />
            <span className={s.pdfName}>{f.original_name || 'Documento.pdf'}</span>
            <span className={s.pdfSize}>{mb(f.bytes)}</span>
          </button>
          {canEdit && canDelete && (
            <button type="button" className={s.pdfDel} aria-label={`Borrar ${f.original_name}`}
              onClick={async () => (await confirm({ title: '¿Borrar este PDF?', confirmLabel: 'Borrar', danger: true })) && remove.mutate(f)}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <Button variant="secondary" size="sm" icon={Upload} loading={upload.isPending} onClick={() => input.current?.click()}>Subir PDF</Button>
          <SizeHint pdf />
          <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
        </>
      )}
      <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.original_name ?? 'PDF'} size="lg"
        footer={viewing && <Button variant="secondary" icon={ExternalLink} onClick={() => window.open(fileUrl(viewing.url), '_blank', 'noopener')}>Abrir en otra pestaña</Button>}>
        {viewing && (isIOS()
          ? <p className="muted">En iPhone el PDF se ve mejor fuera del sistema. Tocá “Abrir en otra pestaña”.</p>
          : <iframe title={`PDF ${viewing.original_name}`} src={fileUrl(viewing.url)} className={s.pdfFrame} />)}
      </Sheet>
    </div>
  );
}
