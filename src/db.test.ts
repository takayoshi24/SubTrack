import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const mockExecute = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 })
);

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      execute: mockExecute,
      select: vi.fn().mockResolvedValue([]),
    }),
  },
}));

import { updatePrice } from './db';

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
