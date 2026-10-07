import { describe, it, expect } from 'vitest';
import { parseEmbed } from './embed.js';

describe('embeds', () => {
  it('Instagram reel y post', () => {
    expect(parseEmbed('https://www.instagram.com/reel/C9abc_12/?igsh=xyz')).toMatchObject({ provider: 'instagram', embedUrl: 'https://www.instagram.com/reel/C9abc_12/embed' });
    expect(parseEmbed('https://instagram.com/p/XYZ123/')).toMatchObject({ embedUrl: 'https://www.instagram.com/p/XYZ123/embed' });
    expect(parseEmbed('https://www.instagram.com/reels/AbC/')).toMatchObject({ embedUrl: 'https://www.instagram.com/reel/AbC/embed' });
  });
  it('TikTok', () => {
    expect(parseEmbed('https://www.tiktok.com/@uniform.ar/video/7412345678901234567?lang=es')).toMatchObject({ provider: 'tiktok', embedUrl: 'https://www.tiktok.com/embed/v2/7412345678901234567' });
    expect(parseEmbed('https://vm.tiktok.com/ZMabc/')).toMatchObject({ provider: 'link' });
  });
  it('YouTube', () => {
    expect(parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ').embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(parseEmbed('https://youtu.be/dQw4w9WgXcQ').embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(parseEmbed('https://youtube.com/shorts/abcDEF12345').embedUrl).toBe('https://www.youtube.com/embed/abcDEF12345');
  });
  it('Drive y otros', () => {
    expect(parseEmbed('https://drive.google.com/file/d/1abc/view')).toMatchObject({ provider: 'drive', host: 'drive.google.com' });
    expect(parseEmbed('https://pinterest.com/pin/1')).toMatchObject({ provider: 'link', host: 'pinterest.com' });
    expect(parseEmbed('no es link')).toBeNull();
  });
});
