import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { VERSION } from './index';

describe('publish-gate setup', () => {
  it('exports a version string', () => {
    expect(VERSION).toBe('1.0.0');
  });

  it('fast-check is available for property-based testing', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return typeof n === 'number';
      }),
      { numRuns: 100 }
    );
  });
});
