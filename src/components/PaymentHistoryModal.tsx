import { useEffect, useState } from 'react';
import type { Payment, SubscriptionPrice, SubWithPrice } from '../types';
import { getPaymentHistory, getPriceHistory } from '../db';
import { formatCurrency, formatDate } from '../utils/billing';

interface Props {
  sub: SubWithPrice;
  onClose: () => void;
}

export default function PaymentHistoryModal({ sub, onClose }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [prices, setPrices] = useState<SubscriptionPrice[]>([]);
  const [tab, setTab] = useState<'payments' | 'prices'>('payments');

  useEffect(() => {
    getPaymentHistory(sub.id).then(setPayments);
    getPriceHistory(sub.id).then(setPrices);
  }, [sub.id]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{sub.name} — History</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="tab-bar">
          <button
            className={tab === 'payments' ? 'tab active' : 'tab'}
            onClick={() => setTab('payments')}
          >
            Payments ({payments.length})
          </button>
          <button
            className={tab === 'prices' ? 'tab active' : 'tab'}
            onClick={() => setTab('prices')}
          >
            Price History ({prices.length})
          </button>
        </div>

        {tab === 'payments' && (
          <div className="history-list">
            {payments.length === 0 ? (
              <p className="empty-state">No payments logged yet.</p>
            ) : (
              payments.map((p) => (
                <div key={p.id} className="history-row">
                  <span className="history-date">{formatDate(p.due_date)}</span>
                  <span className="history-amount">{formatCurrency(p.amount)}</span>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                  {p.paid_date && (
                    <span className="history-meta">paid {formatDate(p.paid_date)}</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'prices' && (
          <div className="history-list">
            {prices.map((p) => (
              <div key={p.id} className="history-row">
                <span className="history-amount">{formatCurrency(p.amount)}</span>
                <span className="history-meta">
                  from {formatDate(p.valid_from)}
                  {p.valid_to ? ` to ${formatDate(p.valid_to)}` : ' — current'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
