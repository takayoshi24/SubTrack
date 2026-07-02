import { useEffect, useState } from 'react';
import type { UpcomingPayment } from '../types';
import { getSubscriptions, getUpcomingPayments, getYearTotal, logPayment } from '../db';
import { formatCurrency, formatDate, daysUntil, monthlyTotal } from '../utils/billing';

interface Props {
  onRefresh: () => void;
  refreshKey: number;
}

export default function Dashboard({ onRefresh, refreshKey }: Props) {
  const [upcoming, setUpcoming] = useState<UpcomingPayment[]>([]);
  const [monthlyCost, setMonthlyCost] = useState(0);
  const [yearTotal, setYearTotal] = useState(0);
  const [paying, setPaying] = useState<number | null>(null);

  useEffect(() => {
    getSubscriptions().then((subs) => {
      setMonthlyCost(monthlyTotal(subs));
      getUpcomingPayments(subs, 30).then(setUpcoming);
    });
    getYearTotal(new Date().getFullYear()).then(setYearTotal);
  }, [refreshKey]);

  async function handleMarkPaid(payment: UpcomingPayment) {
    setPaying(payment.subscription_id);
    try {
      await logPayment(payment.subscription_id, payment.amount, payment.due_date);
      onRefresh();
    } catch (err) {
      console.error('Failed to mark payment:', err);
    } finally {
      setPaying(null);
    }
  }

  return (
    <div className="dashboard">
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Monthly Cost</span>
          <span className="stat-value">{formatCurrency(monthlyCost)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">{new Date().getFullYear()} Spent</span>
          <span className="stat-value">{formatCurrency(yearTotal)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Due in 30 Days</span>
          <span className="stat-value">{upcoming.length}</span>
        </div>
      </div>

      <h3 className="section-title">Upcoming Payments</h3>
      {upcoming.length === 0 ? (
        <p className="empty-state">No payments due in the next 30 days.</p>
      ) : (
        <div className="upcoming-list">
          {upcoming.map((p) => {
            const days = daysUntil(p.due_date);
            return (
              <div key={`${p.subscription_id}-${p.due_date}`} className="upcoming-row">
                <div className="upcoming-info">
                  <span className="upcoming-name">{p.subscription_name}</span>
                  <span className="upcoming-date">{formatDate(p.due_date)}</span>
                </div>
                <div className="upcoming-right">
                  <span className={`days-badge ${days <= 3 ? 'urgent' : days <= 7 ? 'soon' : ''}`}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                  </span>
                  <span className="upcoming-amount">{formatCurrency(p.amount)}</span>
                  <button
                    className="btn-small"
                    disabled={paying === p.subscription_id}
                    onClick={() => handleMarkPaid(p)}
                  >
                    {paying === p.subscription_id ? '…' : 'Mark Paid'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
