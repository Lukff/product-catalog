import { describe, expect, it } from 'vitest';
import { pageItems } from '../src/lib/pagination.js';

describe('pageItems', () => {
  it('is empty when there are no pages', () => {
    expect(pageItems(1, 0)).toEqual([]);
  });

  it('lists every page when there are few', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('collapses the far pages behind a gap at the start', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(pageItems(3, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
  });

  it('shows the neighbours of a page in the middle', () => {
    expect(pageItems(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
  });

  it('collapses behind a gap at the end', () => {
    expect(pageItems(20, 20)).toEqual([1, 'gap', 19, 20]);
  });

  it('fills a single missing page instead of showing a gap for it', () => {
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
  });
});
