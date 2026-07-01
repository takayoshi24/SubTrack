import { useState } from 'react';
import type { BillingCycle, SubWithPrice } from '../types';
import { addSubscription, updateSubscription, updatePrice } from '../db';

interface Props {
  existing?: SubWithPrice;
  onDone: () => void;
  onCancel: () => void;
}

export default function SubscriptionForm({ existing, onDone, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [owner, setOwner] = useState(existing?.owner ?? '');
  const [cycle, setCycle] = useState<BillingCycle>(existing?.cycle ?? 'monthly');
  const [anchorDate, setAnchorDate] = useState(existing?.anchor_date ?? '');
  const [amount, setAmount] = useState(existing?.current_amount?.toString() ?? '');
  const [newPrice, setNewPrice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!existing;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !owner || !anchorDate || !amount) {
      setError('All fields are required.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateSubscription(existing.id, name, owner, cycle, anchorDate);
        const parsedNew = parseFloat(newPrice);
        if (newPrice && !isNaN(parsedNew) && parsedNew > 0 && parsedNew !== existing.current_amount) {
          await updatePrice(existing.id, parsedNew);
        }
      } else {
        await addSubscription(name, owner, cycle, anchorDate, parsedAmount);
      }
      onDone();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Edit Subscription' : 'Add Subscription'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix" />
          </div>
          <div className="form-group">
            <label>Owner</label>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="John" />
          </div>
          <div className="form-group">
            <label>Billing Cycle</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
            />
          </div>
          {!isEdit && (
            <div className="form-group">
              <label>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="9.99"
              />
            </div>
          )}
          {isEdit && (
            <div className="form-group">
              <label>
                Update Price (current: ${existing.current_amount.toFixed(2)})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Leave blank to keep current price"
              />
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Subscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
