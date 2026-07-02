import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';

const mockExecute = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 })
);

const mockSelect = vi.hoisted(() =>
  vi.fn().mockResolvedValue([])
);

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      execute: mockExecute,
      select: mockSelect,
    }),
  },
}));

import type { SubWithPrice } from './types';
import { updatePrice, getSubscriptions, getYearTotal, getUpcomingPayments } from './db';

describe('updatePrice', () => {
  beforeAll(async () => {
    // Prime the DB singleton so initSchema runs exactly once before any test.
    // Individual tests then start with a clean mock (no schema-init noise in their call list).
    await updatePrice(0, 0);
  });

  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
  });

  it('wraps both writes in a BEGIN/COMMIT transaction on success', async () => {
    await updatePrice(1, 99.99);

    const sqls = mockExecute.mock.calls.map((c) => c[0] as string);
    expect(sqls).toHaveLength(4);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toMatch(/UPDATE subscription_prices/);
    expect(sqls[2]).toMatch(/INSERT INTO subscription_prices/);
    expect(sqls[3]).toBe('COMMIT');
  });

  it('rolls back and rethrows when the INSERT fails', async () => {
    mockExecute
      .mockResolvedValueOnce({ rowsAffected: 1 }) // BEGIN
      .mockResolvedValueOnce({ rowsAffected: 1 }) // UPDATE
      .mockRejectedValueOnce(new Error('disk full')); // INSERT fails

    await expect(updatePrice(1, 99.99)).rejects.toThrow('disk full');

    const sqls = mockExecute.mock.calls.map((c) => c[0] as string);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });

  it('rolls back and rethrows when the UPDATE fails', async () => {
    mockExecute
      .mockResolvedValueOnce({ rowsAffected: 1 }) // BEGIN
      .mockRejectedValueOnce(new Error('locked')); // UPDATE fails

    await expect(updatePrice(1, 50)).rejects.toThrow('locked');

    const sqls = mockExecute.mock.calls.map((c) => c[0] as string);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});

describe('getYearTotal', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockSelect.mockResolvedValue([{ total: 0 }]);
  });

  it('filters by paid_date year, not due_date year', async () => {
    await getYearTotal(2026);
    const sql = mockSelect.mock.calls[0][0] as string;
    expect(sql).toMatch(/paid_date/);
    expect(sql).not.toMatch(/due_date/);
  });

  it('returns the total from the query result', async () => {
    mockSelect.mockResolvedValue([{ total: 250.5 }]);
    const result = await getYearTotal(2026);
    expect(result).toBe(250.5);
  });

  it('returns 0 when no paid payments exist for the year', async () => {
    mockSelect.mockResolvedValue([{ total: 0 }]);
    expect(await getYearTotal(2025)).toBe(0);
  });

  it('passes the year as a string to the query', async () => {
    await getYearTotal(2026);
    expect(mockSelect.mock.calls[0][1]).toEqual(['2026']);
  });
});

describe('getSubscriptions', () => {
  // Anchor 2026-01-06 monthly → next_due 2026-07-06 when today is 2026-07-02.
  const JOINED_ROW = {
    id: 1, name: 'Netflix', owner: 'Me', cycle: 'monthly',
    anchor_date: '2026-01-06', cancelled_at: null, current_amount: 15,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T00:00:00'));
    mockSelect.mockReset();
    mockSelect.mockResolvedValue([]);
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a single SELECT for N subscriptions (no N+1 price queries)', async () => {
    mockSelect.mockResolvedValueOnce([JOINED_ROW]);

    const result = await getSubscriptions();

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].current_amount).toBe(15);
    expect(result[0].next_due).toBe('2026-07-06');
  });

  it('uses LEFT JOIN in the query so subscriptions without a price row are included', async () => {
    mockSelect.mockResolvedValueOnce([{ ...JOINED_ROW, current_amount: null }]);

    const result = await getSubscriptions();

    expect(mockSelect.mock.calls[0][0]).toMatch(/LEFT JOIN/i);
    expect(result[0].current_amount).toBe(0);
  });
});

describe('getUpcomingPayments', () => {
  // Subs are now passed in — no subscription queries inside getUpcomingPayments.
  const SUBS: SubWithPrice[] = [
    { id: 1, name: 'Netflix', owner: 'Me', cycle: 'monthly',
      anchor_date: '2026-01-06', cancelled_at: null, current_amount: 15, next_due: '2026-07-06' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T00:00:00'));
    mockSelect.mockReset();
    mockSelect.mockResolvedValue([]);
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes a subscription whose next due date has not been paid', async () => {
    mockSelect.mockResolvedValueOnce([]); // paid dates query returns nothing

    const result = await getUpcomingPayments(SUBS, 30);
    expect(result).toHaveLength(1);
    expect(result[0].due_date).toBe('2026-07-06');
  });

  it('excludes a subscription whose next due date is already paid', async () => {
    mockSelect.mockResolvedValueOnce([{ subscription_id: 1, due_date: '2026-07-06' }]);

    const result = await getUpcomingPayments(SUBS, 30);
    expect(result).toHaveLength(0);
  });

  it('only excludes the matching subscription when multiple exist', async () => {
    const SUBS2: SubWithPrice[] = [
      ...SUBS,
      { id: 2, name: 'Spotify', owner: 'Me', cycle: 'monthly',
        anchor_date: '2026-01-10', cancelled_at: null, current_amount: 10, next_due: '2026-07-10' },
    ];
    mockSelect.mockResolvedValueOnce([{ subscription_id: 1, due_date: '2026-07-06' }]);

    const result = await getUpcomingPayments(SUBS2, 30);
    expect(result).toHaveLength(1);
    expect(result[0].subscription_id).toBe(2);
  });
});
