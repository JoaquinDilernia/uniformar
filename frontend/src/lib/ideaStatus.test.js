import { describe, it, expect } from 'vitest';
import { deriveIdeaStatus } from './ideaStatus.js';

describe('deriveIdeaStatus (espejo del backend)', () => {
  it.each([
    [{ kind: 'idea', decision: 'pending', done_at: null }, 'por_decidir'],
    [{ kind: 'idea', decision: 'yes', done_at: null }, 'por_hacer'],
    [{ kind: 'idea', decision: 'no', done_at: null }, 'no_se_hace'],
    [{ kind: 'idea', decision: 'yes', done_at: '2026-10-07T10:00:00Z' }, 'realizada'],
    [{ kind: 'must', decision: 'pending', done_at: null }, 'si_o_si'],
    [{ kind: 'must', decision: 'pending', done_at: '2026-10-07T10:00:00Z' }, 'realizada'],
  ])('%o → %s', (idea, expected) => expect(deriveIdeaStatus(idea)).toBe(expected));
});
