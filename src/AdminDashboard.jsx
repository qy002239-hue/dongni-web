import React, { useEffect, useMemo, useState } from 'react';
import './AdminDashboard.css';

const storedPasswordKey = 'dongni.admin.password';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatCurrency(amount, currency = 'twd') {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0
  }).format((amount || 0) / 100);
}

function formatTrial(user) {
  if (!user.trial_ends_at) return '-';
  const active = new Date(user.trial_ends_at).getTime() > Date.now();
  return active ? `Active until ${formatDate(user.trial_ends_at)}` : `Ended ${formatDate(user.trial_ends_at)}`;
}

function MetricCard({ label, value }) {
  return (
    <div className="admin-metric-card">
      <div className="admin-metric-label">{label}</div>
      <div className="admin-metric-value">{value}</div>
    </div>
  );
}

function DataTable({ columns, rows, emptyText }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={row.id || row.stripe_session_id || `${row.user_id}-${row.created_at}-${rowIndex}`}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="admin-empty">{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboard() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(storedPasswordKey) || '');
  const [draftPassword, setDraftPassword] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadDashboard = async (nextPassword = password) => {
    if (!nextPassword) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin-dashboard', {
        headers: {
          'X-Admin-Password': nextPassword
        }
      });
      const nextData = await response.json();
      if (!response.ok) throw new Error(nextData.error || 'Dashboard data failed to load.');
      setData(nextData);
      setPassword(nextPassword);
      sessionStorage.setItem(storedPasswordKey, nextPassword);
    } catch (err) {
      setError(err.message || 'Dashboard data failed to load.');
      setData(null);
      sessionStorage.removeItem(storedPasswordKey);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (password) loadDashboard(password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = data?.metrics;
  const recentUsers = useMemo(() => data?.users || [], [data]);
  const recentPayments = useMemo(() => data?.payments || [], [data]);
  const recentSessions = useMemo(() => data?.sessions || [], [data]);
  const recentEvents = useMemo(() => data?.events || [], [data]);

  if (!data) {
    return (
      <div className="admin-screen">
        <form className="admin-login" onSubmit={(event) => {
          event.preventDefault();
          loadDashboard(draftPassword);
        }}>
          <div className="admin-title">Dongni Admin</div>
          <input
            className="admin-input"
            type="password"
            value={draftPassword}
            onChange={(event) => setDraftPassword(event.target.value)}
            placeholder="Admin password"
          />
          <button className="admin-button" type="submit" disabled={isLoading || !draftPassword.trim()}>
            {isLoading ? 'Loading...' : 'Enter dashboard'}
          </button>
          {error ? <p className="admin-error">{error}</p> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="admin-screen">
      <div className="admin-shell">
        <div className="admin-header">
          <div>
            <div className="admin-eyebrow">Dongni Ops</div>
            <h1>Dongni Admin</h1>
          </div>
          <div className="admin-actions">
            <button className="admin-secondary-button" type="button" onClick={() => loadDashboard(password)} disabled={isLoading}>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="admin-secondary-button" type="button" onClick={() => {
              sessionStorage.removeItem(storedPasswordKey);
              setPassword('');
              setDraftPassword('');
              setData(null);
            }}>
              Sign out
            </button>
          </div>
        </div>

        {error ? <div className="admin-banner">{error}</div> : null}

        <div className="admin-metrics">
          <MetricCard label="Total users" value={metrics.users} />
          <MetricCard label="Active trials" value={metrics.activeTrials} />
          <MetricCard label="Active sessions" value={metrics.activeSessions} />
          <MetricCard label="Unused credits" value={metrics.unusedCredits} />
          <MetricCard label="Payments today" value={metrics.paymentsToday} />
          <MetricCard label="Revenue today" value={formatCurrency(metrics.revenueToday)} />
          <MetricCard label="Total payments" value={metrics.paymentsTotal} />
          <MetricCard label="Total revenue" value={formatCurrency(metrics.revenueTotal)} />
          <MetricCard label="Sessions today" value={metrics.sessionsToday} />
        </div>

        <section className="admin-section">
          <h2>Recent users</h2>
          <DataTable
            emptyText="No users yet"
            rows={recentUsers}
            columns={[
              { key: 'email', label: 'Email', render: (row) => row.email || row.user_id },
              { key: 'credits', label: 'Credits' },
              { key: 'trial', label: 'Trial', render: formatTrial },
              { key: 'updated_at', label: 'Updated', render: (row) => formatDate(row.updated_at) }
            ]}
          />
        </section>

        <section className="admin-section">
          <h2>Recent payments</h2>
          <DataTable
            emptyText="No payments yet"
            rows={recentPayments}
            columns={[
              { key: 'customer_email', label: 'Email', render: (row) => row.customer_email || row.user_id },
              { key: 'plan', label: 'Plan' },
              { key: 'credits', label: 'Credits' },
              { key: 'amount_total', label: 'Amount', render: (row) => formatCurrency(row.amount_total, row.currency) },
              { key: 'status', label: 'Status' },
              { key: 'created_at', label: 'Time', render: (row) => formatDate(row.created_at) }
            ]}
          />
        </section>

        <section className="admin-section">
          <h2>Recent sessions</h2>
          <DataTable
            emptyText="No sessions yet"
            rows={recentSessions}
            columns={[
              { key: 'user_id', label: 'User' },
              { key: 'started_at', label: 'Started', render: (row) => formatDate(row.started_at) },
              { key: 'last_message_at', label: 'Last message', render: (row) => formatDate(row.last_message_at) },
              { key: 'expires_at', label: 'Idle ends', render: (row) => formatDate(row.expires_at) }
            ]}
          />
        </section>

        <section className="admin-section">
          <h2>Recent credit events</h2>
          <DataTable
            emptyText="No credit events yet"
            rows={recentEvents}
            columns={[
              { key: 'user_id', label: 'User' },
              { key: 'delta', label: 'Delta' },
              { key: 'reason', label: 'Reason' },
              { key: 'created_at', label: 'Time', render: (row) => formatDate(row.created_at) }
            ]}
          />
        </section>
      </div>
    </div>
  );
}
