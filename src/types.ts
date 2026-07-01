export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type PaymentStatus = 'scheduled' | 'paid' | 'skipped' | 'failed';

export interface Subscription {
  id: number;
  name: string;
  owner: string;
  cycle: BillingCycle;
  anchor_date: string;
  cancelled_at: string | null;
}

export interface SubscriptionPrice {
  id: number;
  subscription_id: number;
  amount: number;
  valid_from: string;
  valid_to: string | null;
}

export interface Payment {
  id: number;
  subscription_id: number;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: PaymentStatus;
}

export interface SubWithPrice extends Subscription {
  current_amount: number;
  next_due: string;
}

export interface UpcomingPayment {
  subscription_id: number;
  subscription_name: string;
  amount: number;
  due_date: string;
}
