import { describe, expect, it } from 'vitest';
import { mobileBoundary } from '../index.js';

describe('@plotpoint/mobile', () => {
  it('exposes the placeholder mobile boundary', () => {
    expect(mobileBoundary.packageName).toBe('@plotpoint/mobile');
  });
});
