'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

type CreatedAccount = { id: number; balance: number };

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputId, setInputId] = useState<string>('');

  async function createAccount() {
    setCreating(true);
    setError(null);
    setCreatedAccount(null);
    try {
      const res = await fetch(`${API_BASE}/api/accounts`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to create account: ${res.status}`);
      const data: CreatedAccount = await res.json();
      setCreatedAccount(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  function goToUser() {
    const idNum = Number.parseInt(inputId, 10);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      setError('Please enter a valid positive account id');
      return;
    }
    router.push(`/user/${idNum}`);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 640 }}>
      <h1>Simple Payments</h1>
      <p>Create an account or enter your account id to view history.</p>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Create a user account</h2>
        <button onClick={createAccount} disabled={creating}>
          {creating ? 'Creating…' : 'Create account'}
        </button>
        {createdAccount && (
          <div style={{ marginTop: 12 }}>
            Created account id: <strong>{createdAccount.id}</strong>{' '}
            <button onClick={() => router.push(`/user/${createdAccount.id}`)} style={{ marginLeft: 8 }}>
              Go to main page
            </button>
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Enter user id</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={inputId}
            onChange={e => setInputId(e.target.value)}
            placeholder="Account id"
            inputMode="numeric"
            style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4, width: 200 }}
          />
          <button onClick={goToUser}>Get user</button>
        </div>
      </section>

      {error && (
        <div style={{ marginTop: 16, color: 'crimson' }}>Error: {error}</div>
      )}
    </main>
  );
}
