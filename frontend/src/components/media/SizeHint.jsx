import { Ruler } from 'lucide-react';
import { PRESETS, ratioLabel } from '../../lib/sizes.js';
import s from './media.module.css';

export function SizeHint({ preset = 'photo', pdf = false }) {
  const p = PRESETS[preset];
  const text = pdf
    ? 'PDF de hasta 10 MB.'
    : p?.w
      ? `Medida recomendada: ${p.w}×${p.h} (${ratioLabel(p.w, p.h)}). Se comprime sola a 2 MB máx.`
      : 'JPG, PNG o WebP. Se comprime sola a 2 MB máx. Los videos van como link (Drive, IG, TikTok).';
  return <p className={s.hint}><Ruler size={14} aria-hidden /> {text}</p>;
}
