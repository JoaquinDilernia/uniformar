import { describe, it, expect } from 'vitest';
import { aspectWarning, ratioLabel, presetForChannels } from './sizes.js';

describe('medidas recomendadas', () => {
  it('ratioLabel reconoce proporciones comunes', () => {
    expect(ratioLabel(1080, 1080)).toBe('1:1');
    expect(ratioLabel(1080, 1350)).toBe('4:5');
    expect(ratioLabel(1080, 1920)).toBe('9:16');
    expect(ratioLabel(1000, 1777)).toBe('9:16');
    expect(ratioLabel(1000, 1234)).toBe('1000×1234');
  });

  it('avisa si la proporción no coincide con el canal', () => {
    expect(aspectWarning(1080, 1080, 'ig_reel')).toBe('Esta imagen es 1:1; para Reel IG se recomienda 9:16 (1080×1920).');
    expect(aspectWarning(2048, 2560, 'ig_post')).toBeNull();
    expect(aspectWarning(1080, 1080, 'photo')).toBeNull();
  });

  it('preset según canales: historia/reel/tiktok → 9:16; post → 4:5', () => {
    expect(presetForChannels(['ig_story'])).toBe('ig_story');
    expect(presetForChannels(['ig_post', 'tiktok'])).toBe('ig_reel');
    expect(presetForChannels(['ig_post'])).toBe('ig_post');
    expect(presetForChannels([])).toBe('ig_post');
  });
});
