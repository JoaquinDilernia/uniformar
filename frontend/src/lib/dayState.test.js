import { describe, it, expect } from 'vitest';
import { dayState } from './dayState.js';

describe('dayState', () => {
  it.each([
    [[], 'empty'],
    [[{ status: 'draft' }], 'planned'],
    [[{ status: 'ready' }, { status: 'draft' }], 'planned'],
    [[{ status: 'ready' }, { status: 'published' }], 'ready'],
    [[{ status: 'published' }], 'published'],
  ])('%j → %s', (items, expected) => expect(dayState(items)).toBe(expected));
});
