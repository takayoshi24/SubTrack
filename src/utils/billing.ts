import type { BillingCycle } from '../types';

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getNextBillingDate(anchorDate: string, cycle: BillingCycle, from: Date = new Date()): Date {
  const anchor = new Date(anchorDate + 'T00:00:00');
  const anchorDay = anchor.getDate();
  const anchorMonth = anchor.getMonth();
  const anchorYear = anchor.getFullYear();
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  if (cycle === 'weekly') {
    let candidate = new Date(anchor);
    while (candidate < today) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  const cycleMonths = { monthly: 1, quarterly: 3, yearly: 12 }[cycle];
  if (cycleMonths === undefined) throw new Error(`Unknown billing cycle: ${cycle}`);
  let n = 0;
  while (true) {
    const totalMonths = anchorMonth + n * cycleMonths;
    const year = anchorYear + Math.floor(totalMonths / 12);
    const month = totalMonths % 12;
    const day = Math.min(anchorDay, lastDayOfMonth(year, month));
    const candidate = new Date(year, month, day);
    if (candidate >= today) return candidate;
    n++;
  }
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function normalizeToMonthly(amount: number, cycle: BillingCycle): number {
  const multipliers: Record<BillingCycle, number> = {
    weekly: 52 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    yearly: 1 / 12,
  };
  return amount * multipliers[cycle];
}
