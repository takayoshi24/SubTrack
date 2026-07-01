import { useEffect, useState } from 'react';
import type { SubWithPrice } from '../types';
import { getSubscriptions, cancelSubscription } from '../db';
import { formatCurrency, formatDate, daysUntil } from '../utils/billing';
import SubscriptionForm from './SubscriptionForm';
import PaymentHistoryModal from './PaymentHistoryModal';

interface Props {
  refreshKey: number;
  onRefresh: () => void;
}

export default function SubscriptionsView({ refreshKey, onRefresh }: Props) {
  const [subs, setSubs] = useState<SubWithPrice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SubWithPrice | undefined>();
  const [viewingHistory, setViewingHistory] = useState<SubWithPrice | undefined>();
  const [cancelConfirm, setCancelConfirm] = useState<number | null>(null);

  useEffect(() => {
    getSubscriptions().then(setSubs);
  }, [refreshKey]);

  function handleFormDone() {
    setShowForm(false);
    setEditing(undefined);
    onRefresh();
  }

  async function handleCancel(id: number) {
    await cancelSubscription(id);
    setCancelConfirm(null);
    onRefresh();
  }

  const cycleLabel: Record<string, string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  };

  return (
    <div className="subscriptions-view">
      <div className="view-header">
        <h2>Subscriptions</h2>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Add
        </button>
      </div>

      {subs.length === 0 ? (
        <p className="empty-state">No active subscriptions. Add one to get started.</p>
      ) : (
        <div className="cards-grid">
          {subs.map((sub) => {
            const days = daysUntil(sub.next_due);
            return (
              <div key={sub.id} className="sub-card">
                <div className="sub-card-header">
                  <span className="sub-name">{sub.name}</span>
                  <span className="sub-amount">{formatCurrency(sub.current_amount)}</span>
                </div>
                <div className="sub-meta">
                  <span>{cycleLabel[sub.cycle]}</span>
                  <span className="dot">·</span>
                  <span>{sub.owner}</span>
                </div>
                <div className="sub-due">
                  <span>Next: {formatDate(sub.next_due)}</span>
                  <span className={`days-badge ${days <= 3 ? 'urgent' : days <= 7 ? 'soon' : ''}`}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                  </span>
                </div>
                <div className="sub-actions">
                  <button
                    className="btn-link"
                    onClick={() => { setEditing(sub); setShowForm(true); }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-link"
                    onClick={() => setViewingHistory(sub)}
                  >
                    History
                  </button>
                  {cancelConfirm === sub.id ? (
                    <>
                      <span className="cancel-confirm-text">Cancel subscription?</span>
                      <button
                        className="btn-link danger"
                        onClick={() => handleCancel(sub.id)}
                      >
                        Yes
                      </button>
                      <button
                        className="btn-link"
                        onClick={() => setCancelConfirm(null)}
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn-link danger"
                      onClick={() => setCancelConfirm(sub.id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <SubscriptionForm
          existing={editing}
          onDone={handleFormDone}
          onCancel={() => { setShowForm(false); setEditing(undefined); }}
        />
      )}

      {viewingHistory && (
        <PaymentHistoryModal
          sub={viewingHistory}
          onClose={() => setViewingHistory(undefined)}
        />
      )}
    </div>
  );
}
