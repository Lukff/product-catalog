import { describe, expect, it } from 'vitest';
import { LOW_STOCK_THRESHOLD, stockStatus } from '../src/index.js';

describe('stockStatus', () => {
  it('is out of stock at zero', () => {
    expect(stockStatus(0)).toBe('out');
  });

  it('is low from 1 up to and including the threshold', () => {
    expect(stockStatus(1)).toBe('low');
    expect(stockStatus(LOW_STOCK_THRESHOLD)).toBe('low');
  });

  it('is in stock above the threshold', () => {
    expect(stockStatus(LOW_STOCK_THRESHOLD + 1)).toBe('in');
    expect(stockStatus(500)).toBe('in');
  });

  it('uses a threshold of 5, matching the seed data (low stock is 1-5)', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5);
  });
});
