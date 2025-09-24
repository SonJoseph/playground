'use client';

import { useEffect, useState } from 'react';

type RestMessage = { id: number; content: string; created_at: string };
type UiMessage = { id: number; content: string; createdAt: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export default function HomePage() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchLatest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/messages/latest?limit=10`);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data: RestMessage[] = await res.json();
      setMessages(data.map(m => ({ id: m.id, content: m.content, createdAt: m.created_at })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function createMessage() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello World' }),
      });
      if (!res.ok) throw new Error(`Failed to create: ${res.status}`);
      await fetchLatest();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    fetchLatest();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Playground</h1>
      <p>Express + SQLite (in-memory) backend, Next.js frontend</p>

      <div style={{ marginTop: 16 }}>
        <button onClick={createMessage} disabled={creating}>
          {creating ? 'Creating…' : 'Create Hello World Message'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, color: 'crimson' }}>Error: {error}</div>
      )}

      <section style={{ marginTop: 24 }}>
        <h2>Latest Messages</h2>
        {loading ? (
          <div>Loading…</div>
        ) : messages.length === 0 ? (
          <div>No messages yet</div>
        ) : (
          <ul>
            {messages.map(m => (
              <li key={m.id}>
                <strong>{m.content}</strong> <em>({new Date(m.createdAt).toLocaleString()})</em>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}


