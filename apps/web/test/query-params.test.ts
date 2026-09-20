import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, paramsFromSearch, paramsToSearch } from '../src/lib/query-params.js';

describe('paramsFromSearch', () => {
  it('returns the defaults for an empty query string', () => {
    expect(paramsFromSearch('')).toEqual(DEFAULT_PARAMS);
  });

  it('reads every param, with or without the leading ?', () => {
    const expected = {
      page: 3,
      pageSize: 50,
      q: 'flux',
      category: 'kitchen',
      brand: 'Acme Corp',
      stockStatus: 'low',
      sort: '-price',
    };
    const search =
      'page=3&pageSize=50&q=flux&category=kitchen&brand=Acme+Corp&stockStatus=low&sort=-price';

    expect(paramsFromSearch(`?${search}`)).toEqual(expected);
    expect(paramsFromSearch(search)).toEqual(expected);
  });

  it('falls back to the defaults when a value is invalid, as in a hand-edited link', () => {
    expect(paramsFromSearch('?pageSize=1000')).toEqual(DEFAULT_PARAMS);
    expect(paramsFromSearch('?sort=bogus&q=flux')).toEqual(DEFAULT_PARAMS);
    expect(paramsFromSearch('?stockStatus=bogus&q=flux')).toEqual(DEFAULT_PARAMS);
    expect(paramsFromSearch('?page=abc')).toEqual(DEFAULT_PARAMS);
  });
});

describe('paramsToSearch', () => {
  it('is empty for the defaults, so the plain URL stays clean', () => {
    expect(paramsToSearch(DEFAULT_PARAMS)).toBe('');
  });

  it('writes only the params that differ from the defaults', () => {
    expect(paramsToSearch({ ...DEFAULT_PARAMS, q: 'flux', sort: '-price' })).toBe(
      'q=flux&sort=-price',
    );
    expect(paramsToSearch({ ...DEFAULT_PARAMS, page: 2, pageSize: 10 })).toBe('page=2&pageSize=10');
    expect(paramsToSearch({ ...DEFAULT_PARAMS, stockStatus: 'out' })).toBe('stockStatus=out');
    expect(paramsToSearch({ ...DEFAULT_PARAMS, brand: 'Acme Corp' })).toBe('brand=Acme+Corp');
  });

  it('round-trips through paramsFromSearch, including characters that need encoding', () => {
    const params = {
      page: 2,
      pageSize: 10,
      q: 'flux & capacitor 50%',
      category: 'home-decor',
      brand: 'Acme & Sons',
      stockStatus: 'low',
      sort: 'stock',
    } as const;

    expect(paramsFromSearch(paramsToSearch(params))).toEqual(params);
  });
});
