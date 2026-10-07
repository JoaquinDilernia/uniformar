import { ExternalLink, Link2, HardDrive } from 'lucide-react';
import { parseEmbed } from '../../lib/embed.js';
import s from './media.module.css';

const NAMES = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', drive: 'Drive', link: null };

export function EmbedPreview({ url }) {
  const e = parseEmbed(url);
  if (!e) return <span className="prewrap">{String(url)}</span>;
  const name = NAMES[e.provider] ?? e.host;
  return (
    <div className={s.embed}>
      {e.embedUrl && (
        <div className={`${s.embedFrame} ${s[e.aspect]}`}>
          <iframe title={`Vista previa de ${name}`} src={e.embedUrl} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}
      <a className={s.embedLink} href={e.openUrl} target="_blank" rel="noreferrer">
        {e.provider === 'drive' ? <HardDrive size={16} aria-hidden /> : e.embedUrl ? <ExternalLink size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
        <span>Abrir en {name}</span>
      </a>
    </div>
  );
}
