import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { api } from '../../api/client.js';
import { uploadFile } from '../../lib/upload.js';
import { aspectWarning } from '../../lib/sizes.js';
import { toastBus } from '../../state/toastBus.js';
import { useConfirm } from '../ui/ConfirmDialog.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Gallery } from './Gallery.jsx';
import { Lightbox } from './Lightbox.jsx';
import { SizeHint } from './SizeHint.jsx';
import s from './media.module.css';

export function ImageUploader({ ownerType, ownerId, files, invalidate = [], canEdit, canDelete, preset = 'photo', label = 'Agregar fotos', max = 20 }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const confirm = useConfirm();
  const [open, setOpen] = useState(null);
  const refresh = () => Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));

  const upload = useMutation({
    mutationFn: async (list) => {
      let ok = 0;
      try {
        for (const file of list) {
          const saved = await uploadFile({ ownerType, ownerId, file, kind: 'image' });
          ok++;
          const warn = saved.width && aspectWarning(saved.width, saved.height, preset);
          if (warn) toastBus.info(warn);
        }
      } finally {
        await refresh();
      }
      return ok;
    },
    meta: { success: false },
    onSuccess: (ok) => toastBus.success(ok === 1 ? 'Foto subida ✓' : `${ok} fotos subidas ✓`),
  });

  const remove = useMutation({
    mutationFn: (file) => api.del(`/files/${file.id}`),
    meta: { success: 'Foto borrada' },
    onSettled: refresh,
  });

  async function onDelete(file) {
    if (await confirm({ title: '¿Borrar esta foto?', confirmLabel: 'Borrar', danger: true })) remove.mutate(file);
  }

  function onPick(e) {
    const list = [...e.target.files];
    e.target.value = '';
    if (!list.length) return;
    if (files.length + list.length > max) {
      toastBus.error(`Máximo ${max} fotos acá.`);
      return;
    }
    upload.mutate(list);
  }

  return (
    <div className={s.uploader}>
      <Gallery files={files} onOpen={setOpen} onDelete={canEdit && canDelete ? onDelete : undefined}>
        {canEdit && files.length < max && (
          <button type="button" className={s.addTile} onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Spinner size={22} /> : <ImagePlus size={22} aria-hidden />}
            <span>{upload.isPending ? 'Subiendo…' : label}</span>
          </button>
        )}
      </Gallery>
      {canEdit && <SizeHint preset={preset} />}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={onPick} />
      {open != null && <Lightbox files={files} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
