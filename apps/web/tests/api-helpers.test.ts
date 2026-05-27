import { describe, expect, it } from 'vitest';
import { getPagination } from '../lib/api-helpers';

describe('getPagination', () => {
  it('defaults to the first page with a safe limit', () => {
    expect(getPagination(new URLSearchParams())).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('clamps invalid values and maximum page size', () => {
    expect(getPagination(new URLSearchParams('page=-1&limit=500'))).toEqual({
      page: 1,
      limit: 100,
      offset: 0,
    });
  });

  it('calculates offsets from page and limit', () => {
    expect(getPagination(new URLSearchParams('page=3&limit=25'))).toEqual({
      page: 3,
      limit: 25,
      offset: 50,
    });
  });
});
