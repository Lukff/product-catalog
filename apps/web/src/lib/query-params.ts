import {
  DEFAULT_PAGE_SIZE,
  listQuerySchema,
  type SortParam,
  type StockStatus,
} from '@catalog/shared';

/** The list's query state. Empty strings mean "not set", so they can bind straight to inputs. */
export interface CatalogParams {
  page: number;
  pageSize: number;
  q: string;
  category: string;
  brand: string;
  stockStatus: StockStatus | '';
  sort: SortParam | '';
}

export const DEFAULT_PARAMS: CatalogParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  q: '',
  category: '',
  brand: '',
  stockStatus: '',
  sort: '',
};

/**
 * Reads params from a URL query string using the API's own schema, so the link and the API
 * agree on what is valid. An invalid link (a hand-edited `?pageSize=1000`) shows the default list.
 */
export function paramsFromSearch(search: string): CatalogParams {
  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));
  if (!parsed.success) return { ...DEFAULT_PARAMS };

  const { page, pageSize, q, category, brand, stockStatus, sort } = parsed.data;
  return {
    page,
    pageSize,
    q: q ?? '',
    category: category ?? '',
    brand: brand ?? '',
    stockStatus: stockStatus ?? '',
    sort: sort ?? '',
  };
}

/** Writes only the params that differ from the defaults, so the plain catalog URL stays clean. */
export function paramsToSearch(params: CatalogParams): string {
  const search = new URLSearchParams();

  if (params.page !== DEFAULT_PARAMS.page) search.set('page', String(params.page));
  if (params.pageSize !== DEFAULT_PARAMS.pageSize) search.set('pageSize', String(params.pageSize));
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.brand) search.set('brand', params.brand);
  if (params.stockStatus) search.set('stockStatus', params.stockStatus);
  if (params.sort) search.set('sort', params.sort);

  return search.toString();
}
