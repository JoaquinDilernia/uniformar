import { fileUrl } from '../../api/client.js';
import { presetForChannels } from '../../lib/sizes.js';
import s from './calendar.module.css';

// Cómo se va a ver la pieza: marco de feed (4:5) o de historia/reel (9:16), con carrusel deslizable
export function PreviewMockup({ files, channels, copy }) {
  const vertical = presetForChannels(channels) !== 'ig_post';
  return (
    <div className={`${s.mock} ${vertical ? s.mockStory : s.mockFeed}`} aria-label="Previsualización de la pieza">
      <div className={s.mockHead}>
        <img src="/logo-ciruela.png" alt="" className={s.mockAvatar} />
        <strong>uniform.ar</strong>
      </div>
      <div className={s.mockMedia}>
        {files.map((f) => <img key={f.id} src={fileUrl(f.url)} alt="" />)}
      </div>
      {files.length > 1 && <div className={s.mockDots} aria-hidden>{files.map((f) => <span key={f.id} />)}</div>}
      {!vertical && copy && <p className={`${s.mockCopy} prewrap`}><strong>uniform.ar</strong> {copy}</p>}
    </div>
  );
}
