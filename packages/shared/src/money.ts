/**
 * Money is a single implicit currency (USD). On the wire it is a decimal number with at most two
 * decimal places, as in the brief (`19.99`). Everywhere else it is an integer count of cents, so
 * sums are exact. This file is the only place the two forms convert.
 */

const CENTS_PER_UNIT = 100;

/** A wire amount as integer cents. Only meaningful for values `isMoney` accepts. */
export function toCents(amount: number): number {
  return Math.round(amount * CENTS_PER_UNIT);
}

/** Integer cents as a wire amount. */
export function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

/** Adds integer cents. Kept as a function so callers never sum decimal amounts. */
export function sumCents(terms: readonly number[]): number {
  return terms.reduce((total, cents) => total + cents, 0);
}

/**
 * True when `amount` converts to a safe integer number of cents and back to exactly the same
 * number — i.e. it has at most two decimal places and is not too large to hold exactly.
 */
export function isMoney(amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  const cents = toCents(amount);
  return Number.isSafeInteger(cents) && fromCents(cents) === amount;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Display form of a wire amount, for example `$1,234.50`. */
export function formatMoney(amount: number): string {
  return usd.format(amount);
}
