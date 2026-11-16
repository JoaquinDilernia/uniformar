import { useState } from 'react';
import { Download, ImagePlus, Images } from 'lucide-react';
import { fileUrl } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { toastBus } from '../../state/toastBus.js';
import { useCreatives } from './api.js';
import { downloadCrop, useArchiveGoogleImage, useGoogleImages, useImportFromMeta, useUploadGoogleImage } from './gapi.js';
import s from './ads.module.css';

// Imágenes para los anuncios de Google. La API de Google no deja agregarlas a la campaña de búsqueda:
// se bajan recortadas (cuadrada y horizontal) y se cargan en Google Ads → Recursos → Imágenes.
export function GoogleImages({ canEdit }) {
  const images = useGoogleImages();
  const archive = useArchiveGoogleImage();
  const [sheet, setSheet] = useState(null);
  const list = images.data ?? [];

  async function download(img, shape) {
    try { await downloadCrop(img, shape); } catch (err) { toastBus.error(err.message); }
  }

  return (
    <div className={s.stack}>
      <p className="muted">
        Fotos para sumar al anuncio de búsqueda. Google no deja cargarlas automáticamente: bajá la versión cuadrada y la horizontal
        y subilas en Google Ads → Recursos → Imágenes. El agente te dice cuáles conviene usar.
      </p>
      {canEdit && (
        <div className={s.actions}>
          <Button icon={ImagePlus} onClick={() => setSheet('upload')}>Subir imagen</Button>
          <Button variant="secondary" icon={Images} onClick={() => setSheet('meta')}>Traer de Meta</Button>
        </div>
      )}
      {images.isLoading && <Spinner size={20} />}
      {!images.isLoading && list.length === 0 && (
        <EmptyState icon={Images} title="Todavía no hay imágenes">Subí fotos de prendas con el logo o traé las piezas que ya usaron en Meta.</EmptyState>
      )}
      <div className={s.grid}>
        {list.map((img) => (
          <article key={img.id} className={s.piece}>
            {img.file ? <img src={fileUrl(img.file.url)} alt={img.name} /> : <div className={s.noImg}>Sin archivo</div>}
            <div className={s.pieceBody}>
              <strong>{img.name}</strong>
              <small>{img.source_name ? `De la pieza de Meta “${img.source_name}”` : 'Cargada para Google'}{img.file ? ` · ${img.file.width}×${img.file.height}` : ''}</small>
              {img.file && (
                <div className={s.actions}>
                  <Button size="sm" variant="secondary" icon={Download} onClick={() => download(img, 'cuadrada')}>Cuadrada</Button>
                  <Button size="sm" variant="secondary" icon={Download} onClick={() => download(img, 'horizontal')}>Horizontal</Button>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => archive.mutate(img.id)}>Archivar</Button>}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {sheet === 'upload' && <UploadImage onClose={() => setSheet(null)} />}
      {sheet === 'meta' && <FromMeta imported={new Set(list.map((i) => i.source_creative_id).filter(Boolean))} onClose={() => setSheet(null)} />}
    </div>
  );
}

function UploadImage({ onClose }) {
  const upload = useUploadGoogleImage();
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  return (
    <Sheet open title="Subir imagen para Google" onClose={onClose}>
      <div className={s.form}>
        <Field label="Nombre" hint="Para reconocerla (ej. Camisa grafa con logo)">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Imagen" hint="JPG o PNG, mínimo 600×314. Mejor si la prenda y el logo se ven bien en chico.">
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Button disabled={!name.trim() || !file} loading={upload.isPending}
          onClick={() => upload.mutate({ name: name.trim(), file }, { onSuccess: onClose })}>Guardar</Button>
      </div>
    </Sheet>
  );
}

// Piezas de Meta con imagen (los videos no sirven para Búsqueda)
function FromMeta({ imported, onClose }) {
  const creatives = useCreatives();
  const importIt = useImportFromMeta();
  const pieces = (creatives.data ?? []).filter((c) => c.status !== 'archived' && [c.feed, c.story].some((f) => f?.kind === 'image'));
  return (
    <Sheet open title="Traer imágenes de Meta" onClose={onClose}>
      {creatives.isLoading && <Spinner size={20} />}
      {!creatives.isLoading && pieces.length === 0 && <p className="muted">No hay piezas de Meta con imagen.</p>}
      <div className={s.grid}>
        {pieces.map((c) => {
          const media = [c.feed, c.story].find((f) => f?.kind === 'image');
          const done = imported.has(c.id);
          return (
            <article key={c.id} className={s.piece}>
              <img src={fileUrl(media.url)} alt={c.name} />
              <div className={s.pieceBody}>
                <strong>{c.name}</strong>
                <Button size="sm" variant={done ? 'ghost' : 'secondary'} disabled={done}
                  loading={importIt.isPending && importIt.variables === c.id} onClick={() => importIt.mutate(c.id)}>
                  {done ? 'Ya está en Google' : 'Usar en Google'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </Sheet>
  );
}
