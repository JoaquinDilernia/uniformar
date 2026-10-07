export function parseEmbed(url) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const openUrl = u.toString();

  if (host === 'instagram.com') {
    const m = u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/);
    if (m) {
      const kind = m[1] === 'p' ? 'p' : 'reel';
      return { provider: 'instagram', host, openUrl: `https://www.instagram.com/${kind}/${m[2]}/`, embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed`, aspect: kind === 'p' ? 'post' : 'vertical' };
    }
  }
  if (host === 'tiktok.com') {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) return { provider: 'tiktok', host, openUrl, embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`, aspect: 'vertical' };
  }
  if (host === 'youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') ?? u.pathname.match(/^\/shorts\/([\w-]+)/)?.[1];
    if (id && /^[\w-]{6,}$/.test(id)) return { provider: 'youtube', host, openUrl, embedUrl: `https://www.youtube.com/embed/${id}`, aspect: u.pathname.startsWith('/shorts') ? 'vertical' : 'wide' };
  }
  if (host === 'drive.google.com') return { provider: 'drive', host, openUrl };
  return { provider: 'link', host, openUrl };
}
