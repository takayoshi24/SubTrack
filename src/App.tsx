import { useState } from 'react';
import Dashboard from './components/Dashboard';
import SubscriptionsView from './components/SubscriptionsView';
import './App.css';

type View = 'dashboard' | 'subscriptions';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">SubTrack</div>
        <ul className="nav-list">
          <li>
            <button
              className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
              onClick={() => setView('dashboard')}
            >
              Dashboard
            </button>
          </li>
          <li>
            <button
              className={`nav-item ${view === 'subscriptions' ? 'active' : ''}`}
              onClick={() => setView('subscriptions')}
            >
              Subscriptions
            </button>
          </li>
        </ul>
      </nav>
      <main className="content">
        {view === 'dashboard' && (
          <Dashboard refreshKey={refreshKey} onRefresh={refresh} />
        )}
        {view === 'subscriptions' && (
          <SubscriptionsView refreshKey={refreshKey} onRefresh={refresh} />
        )}
      </main>
    </div>
  );
}
