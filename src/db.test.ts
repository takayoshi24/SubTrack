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

import { updatePrice, getYearTotal, getUpcomingPayments } from './db';

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

describe('getUpcomingPayments', () => {
  // Anchor 2026-01-06 monthly → next_due 2026-07-06 when today is 2026-07-02.
  const SUB = { id: 1, name: 'Netflix', owner: 'Me', cycle: 'monthly', anchor_date: '2026-01-06', cancelled_at: null };
  const PRICE = [{ amount: 15, valid_to: null }];

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
    mockSelect
      .mockResolvedValueOnce([SUB])   // getSubscriptions: all subs
      .mockResolvedValueOnce(PRICE)   // getSubscriptions: price for sub 1
      .mockResolvedValueOnce([]);     // getUpcomingPayments: paid dates (none)

    const result = await getUpcomingPayments(30);
    expect(result).toHaveLength(1);
    expect(result[0].due_date).toBe('2026-07-06');
  });

  it('excludes a subscription whose next due date is already paid', async () => {
    mockSelect
      .mockResolvedValueOnce([SUB])
      .mockResolvedValueOnce(PRICE)
      .mockResolvedValueOnce([{ subscription_id: 1, due_date: '2026-07-06' }]); // already paid

    const result = await getUpcomingPayments(30);
    expect(result).toHaveLength(0);
  });

  it('only excludes the matching subscription when multiple exist', async () => {
    const SUB2 = { id: 2, name: 'Spotify', owner: 'Me', cycle: 'monthly', anchor_date: '2026-01-10', cancelled_at: null };
    mockSelect
      .mockResolvedValueOnce([SUB, SUB2])
      .mockResolvedValueOnce(PRICE)          // price for sub 1
      .mockResolvedValueOnce(PRICE)          // price for sub 2
      .mockResolvedValueOnce([{ subscription_id: 1, due_date: '2026-07-06' }]); // only sub 1 paid

    const result = await getUpcomingPayments(30);
    expect(result).toHaveLength(1);
    expect(result[0].subscription_id).toBe(2);
  });
});
