import Database from '@tauri-apps/plugin-sql';
import type {
  Subscription,
  SubscriptionPrice,
  Payment,
  BillingCycle,
  SubWithPrice,
  UpcomingPayment,
} from './types';
import { getNextBillingDate, toISODate, normalizeToMonthly } from './utils/billing';

let _dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!_dbPromise) {
    _dbPromise = Database.load('sqlite:subtrack.db').then(async (db) => {
      await db.execute('PRAGMA journal_mode=WAL');
      await initSchema(db);
      return db;
    });
  }
  return _dbPromise;
}

async function initSchema(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      cycle TEXT NOT NULL CHECK(cycle IN ('weekly','monthly','quarterly','yearly')),
      anchor_date TEXT NOT NULL,
      cancelled_at TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS subscription_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
      amount REAL NOT NULL,
      valid_from TEXT NOT NULL,
      valid_to TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      paid_date TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled'
    )
  `);
}

export async function getSubscriptions(): Promise<SubWithPrice[]> {
  const db = await getDb();
  const subs = await db.select<Subscription[]>(
    `SELECT * FROM subscriptions WHERE cancelled_at IS NULL ORDER BY name`
  );
  return Promise.all(
    subs.map(async (sub) => {
      const prices = await db.select<SubscriptionPrice[]>(
        `SELECT * FROM subscription_prices WHERE subscription_id = ? AND valid_to IS NULL LIMIT 1`,
        [sub.id]
      );
      const current_amount = prices[0]?.amount ?? 0;
      const next_due = toISODate(getNextBillingDate(sub.anchor_date, sub.cycle as BillingCycle));
      return { ...sub, current_amount, next_due };
    })
  );
}

export async function addSubscription(
  name: string,
  owner: string,
  cycle: BillingCycle,
  anchor_date: string,
  amount: number
): Promise<void> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO subscriptions (name, owner, cycle, anchor_date) VALUES (?, ?, ?, ?)`,
    [name, owner, cycle, anchor_date]
  );
  await db.execute(
    `INSERT INTO subscription_prices (subscription_id, amount, valid_from) VALUES (?, ?, ?)`,
    [result.lastInsertId, amount, anchor_date]
  );
}

export async function updateSubscription(
  id: number,
  name: string,
  owner: string,
  cycle: BillingCycle,
  anchor_date: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE subscriptions SET name = ?, owner = ?, cycle = ?, anchor_date = ? WHERE id = ?`,
    [name, owner, cycle, anchor_date, id]
  );
}

export async function updatePrice(subscriptionId: number, newAmount: number): Promise<void> {
  const db = await getDb();
  const today = toISODate(new Date());
  await db.execute('BEGIN');
  try {
    await db.execute(
      `UPDATE subscription_prices SET valid_to = ? WHERE subscription_id = ? AND valid_to IS NULL`,
      [today, subscriptionId]
    );
    await db.execute(
      `INSERT INTO subscription_prices (subscription_id, amount, valid_from) VALUES (?, ?, ?)`,
      [subscriptionId, newAmount, today]
    );
    await db.execute('COMMIT');
  } catch (e) {
    await db.execute('ROLLBACK');
    throw e;
  }
}

export async function cancelSubscription(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE subscriptions SET cancelled_at = ? WHERE id = ?`,
    [toISODate(new Date()), id]
  );
}

export async function logPayment(
  subscriptionId: number,
  amount: number,
  dueDate: string
): Promise<void> {
  const db = await getDb();
  const today = toISODate(new Date());
  const existing = await db.select<Payment[]>(
    `SELECT * FROM payments WHERE subscription_id = ? AND due_date = ?`,
    [subscriptionId, dueDate]
  );
  if (existing.length > 0) {
    await db.execute(
      `UPDATE payments SET paid_date = ?, status = 'paid', amount = ? WHERE id = ?`,
      [today, amount, existing[0].id]
    );
  } else {
    await db.execute(
      `INSERT INTO payments (subscription_id, amount, due_date, paid_date, status) VALUES (?, ?, ?, ?, 'paid')`,
      [subscriptionId, amount, dueDate, today]
    );
  }
}

export async function getPaymentHistory(subscriptionId: number): Promise<Payment[]> {
  const db = await getDb();
  return db.select<Payment[]>(
    `SELECT * FROM payments WHERE subscription_id = ? ORDER BY due_date DESC`,
    [subscriptionId]
  );
}

export async function getPriceHistory(subscriptionId: number): Promise<SubscriptionPrice[]> {
  const db = await getDb();
  return db.select<SubscriptionPrice[]>(
    `SELECT * FROM subscription_prices WHERE subscription_id = ? ORDER BY valid_from DESC`,
    [subscriptionId]
  );
}

export async function getUpcomingPayments(days: number = 30): Promise<UpcomingPayment[]> {
  const db = await getDb();
  const subs = await getSubscriptions();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const paidRows = await db.select<{ subscription_id: number; due_date: string }[]>(
    `SELECT subscription_id, due_date FROM payments WHERE status = 'paid'`
  );
  const paidSet = new Set(paidRows.map((p) => `${p.subscription_id}:${p.due_date}`));

  return subs
    .filter((sub) => new Date(sub.next_due + 'T00:00:00') <= cutoff)
    .filter((sub) => !paidSet.has(`${sub.id}:${sub.next_due}`))
    .map((sub) => ({
      subscription_id: sub.id,
      subscription_name: sub.name,
      amount: sub.current_amount,
      due_date: sub.next_due,
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export async function getMonthlyTotal(): Promise<number> {
  const subs = await getSubscriptions();
  return subs.reduce(
    (sum, sub) => sum + normalizeToMonthly(sub.current_amount, sub.cycle as BillingCycle),
    0
  );
}

export async function getYearTotal(year: number): Promise<number> {
  const db = await getDb();
  const result = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid' AND paid_date IS NOT NULL AND strftime('%Y', paid_date) = ?`,
    [String(year)]
  );
  return result[0]?.total ?? 0;
}
