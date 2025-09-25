'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

type Payment = { id: number; from_id: number; to_id: number; amount: number; created_at: string };
type HistoryResponse = { items: Payment[]; oldest_timestamp: string | null };

type Account = { id: number; balance: number };

export default function UserPage() {
  const params = useParams();
  const accountId = useMemo(() => {
    const raw: unknown = (params as any).id;
    const idStr = Array.isArray(raw) ? raw[0] : raw;
    return Number.parseInt(String(idStr), 10);
  }, [params]);
  const [account, setAccount] = useState<Account | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toId, setToId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [sending, setSending] = useState(false);

  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    async function load() {
      if (!Number.isFinite(accountId) || accountId <= 0) {
        setError('Invalid account id');
        setLoading(false);
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const nowIso = new Date().toISOString();
        const [acctRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/api/accounts/${accountId}`),
          fetch(`${API_BASE}/payment_history/${accountId}?limit=20&last_seen_timestamp=${encodeURIComponent(nowIso)}`),
        ]);
        if (!acctRes.ok) throw new Error(`Account fetch failed: ${acctRes.status}`);
        if (!histRes.ok) throw new Error(`History fetch failed: ${histRes.status}`);
        const acct: Account = await acctRes.json();
        const hist: HistoryResponse = await histRes.json();
        setAccount(acct);
        setPayments(hist.items);
        setCursor(hist.oldest_timestamp);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <h1>User {Number.isFinite(accountId) ? accountId : ''}</h1>

      {error && <div style={{ marginTop: 8, color: 'crimson' }}>Error: {error}</div>}

      {loading ? (
        <div>Loading…</div>
      ) : account ? (
        <section style={{ marginTop: 16 }}>
          <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
            <strong>Balance:</strong> {account.balance}
          </div>
        </section>
      ) : (
        <div>Account not found.</div>
      )}

      {/* Send payment form */}
      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Send payment</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={toId}
            onChange={e => setToId(e.target.value)}
            placeholder="To account id"
            inputMode="numeric"
            style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4, width: 160 }}
          />
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Amount"
            inputMode="numeric"
            style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4, width: 120 }}
          />
          <button
            onClick={async () => {
              setError(null);
              const toNum = Number.parseInt(toId, 10);
              const amtNum = Number.parseInt(amount, 10);
              if (!Number.isFinite(toNum) || toNum <= 0) {
                setError('Enter a valid destination account id');
                return;
              }
              if (!Number.isFinite(amtNum) || amtNum <= 0) {
                setError('Enter a valid positive amount');
                return;
              }
              if (!Number.isFinite(accountId) || accountId <= 0) {
                setError('Invalid source account');
                return;
              }
              setSending(true);
              try {
                const idempotencyKey = (typeof globalThis !== 'undefined' && (globalThis as any).crypto && typeof ((globalThis as any).crypto.randomUUID) === 'function')
                  ? (globalThis as any).crypto.randomUUID()
                  : `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                const res = await fetch(`${API_BASE}/send_payment`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ from: accountId, to: toNum, amount: amtNum, idempotency_key: idempotencyKey }),
                });
                if (!res.ok) {
                  const maybe = await res.json().catch(() => ({} as any));
                  const msg = (maybe && maybe.error) ? String(maybe.error) : `Transfer failed: ${res.status}`;
                  throw new Error(msg);
                }
                // Refresh balance and history
                const nowIso = new Date().toISOString();
                const [acctRes, histRes] = await Promise.all([
                  fetch(`${API_BASE}/api/accounts/${accountId}`),
                  fetch(`${API_BASE}/payment_history/${accountId}?limit=20&last_seen_timestamp=${encodeURIComponent(nowIso)}`),
                ]);
                if (acctRes.ok) setAccount(await acctRes.json());
                if (histRes.ok) {
                  const data: HistoryResponse = await histRes.json();
                  setPayments(data.items);
                  // Reset cursor to "now" after sending a payment
                  setCursor(nowIso);
                }
                setToId('');
                setAmount('');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Unknown error');
              } finally {
                setSending(false);
              }
            }}
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Transaction history</h2>
        {payments.length === 0 ? (
          <div>No transactions yet</div>
        ) : (
          <ul>
            {payments.map(p => (
              <li key={p.id}>
                <span>
                  {p.from_id === accountId ? 'Sent' : 'Received'} {p.amount} {p.from_id === accountId ? 'to' : 'from'}{' '}
                  {p.from_id === accountId ? p.to_id : p.from_id}
                </span>
                <em style={{ marginLeft: 8 }}>({new Date(p.created_at).toLocaleString()})</em>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={async () => {
                if (!cursor) return;
                setLoadingMore(true);
                setError(null);
                try {
                  const res = await fetch(
                    `${API_BASE}/payment_history/${accountId}?limit=20&last_seen_timestamp=${encodeURIComponent(cursor)}`
                  );
                  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
                  const data: HistoryResponse = await res.json();
                  setPayments(prev => [...prev, ...data.items]);
                  setCursor(data.oldest_timestamp);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Unknown error');
                } finally {
                  setLoadingMore(false);
                }
              }}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'View more'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
