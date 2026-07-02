import { describe, it, expect, vi } from 'vitest';
import { getNextBillingDate, toISODate, formatCurrency, daysUntil, normalizeToMonthly } from './billing';

describe('toISODate', () => {
  it('returns the local calendar date, not the UTC date', () => {
    // Simulate a UTC+ scenario: local midnight is "yesterday" in UTC.
    // new Date(2026, 6, 1) = July 1 at local midnight.
    // In UTC+1, that moment is Jun 30 23:00 UTC, so toISOString() returns "2026-06-30...".
    // We mock toISOString to reproduce this regardless of the test runner's timezone.
    const d = new Date(2026, 6, 1);
    vi.spyOn(d, 'toISOString').mockReturnValue('2026-06-30T23:00:00.000Z');

    expect(toISODate(d)).toBe('2026-07-01');
  });

  it('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('getNextBillingDate', () => {
  const anchor = '2024-01-15';
  const from = new Date('2024-06-01T00:00:00');

  it('throws for an unknown cycle value instead of looping forever', () => {
    expect(() =>
      getNextBillingDate(anchor, 'biannual' as never, from)
    ).toThrow('Unknown billing cycle: biannual');
  });

  it('returns next monthly billing date after today', () => {
    const result = getNextBillingDate(anchor, 'monthly', from);
    // anchor is Jan 15, from is Jun 1 — next is Jun 15
    expect(result).toEqual(new Date(2024, 5, 15));
  });

  it('returns next quarterly billing date after today', () => {
    const result = getNextBillingDate(anchor, 'quarterly', from);
    // anchor is Jan 15, quarters: Jan 15, Apr 15, Jul 15 — next after Jun 1 is Jul 15
    expect(result).toEqual(new Date(2024, 6, 15));
  });

  it('returns next yearly billing date after today', () => {
    const result = getNextBillingDate(anchor, 'yearly', from);
    // anchor Jan 15, last was Jan 15 2024 which is before Jun 1 — next is Jan 15 2025
    expect(result).toEqual(new Date(2025, 0, 15));
  });

  it('returns next weekly billing date after today', () => {
    // anchor 2024-01-15 (Monday), from 2024-06-03 (Monday)
    const weeklyFrom = new Date('2024-06-03T00:00:00');
    const result = getNextBillingDate('2024-01-15', 'weekly', weeklyFrom);
    // next Monday after Jun 3 is Jun 10
    expect(result).toEqual(new Date(2024, 5, 10));
  });

  it('clamps day to month-end for short months (month-end anchor)', () => {
    // anchor Jan 31 — Feb billing should be Feb 28 (2024 is a leap year → Feb 29)
    const result = getNextBillingDate('2024-01-31', 'monthly', new Date('2024-02-01T00:00:00'));
    expect(result).toEqual(new Date(2024, 1, 29)); // Feb 29, 2024 (leap year)
  });
});

describe('normalizeToMonthly', () => {
  it('passes through monthly amounts unchanged', () => {
    expect(normalizeToMonthly(10, 'monthly')).toBe(10);
  });

  it('divides quarterly by 3', () => {
    expect(normalizeToMonthly(30, 'quarterly')).toBeCloseTo(10);
  });

  it('divides yearly by 12', () => {
    expect(normalizeToMonthly(120, 'yearly')).toBeCloseTo(10);
  });

  it('divides weekly by months-per-week ratio', () => {
    expect(normalizeToMonthly(10, 'weekly')).toBeCloseTo(10 * (52 / 12));
  });
});

describe('formatCurrency', () => {
  it('formats whole dollar amounts', () => {
    expect(formatCurrency(10)).toBe('$10.00');
  });

  it('formats cents correctly', () => {
    expect(formatCurrency(9.99)).toBe('$9.99');
  });
});

describe('daysUntil', () => {
  it('returns 0 for today', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    expect(daysUntil(`${yyyy}-${mm}-${dd}`)).toBe(0);
  });
});
