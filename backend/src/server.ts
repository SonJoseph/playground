import express, { Request, Response } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';

const app = express();
const PORT: number = Number(process.env.PORT) || 4000;
const FRONTEND_ORIGIN: string = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: false }));
app.use(express.json());

// File-backed SQLite database (default: ./data.db)
const DB_PATH: string = process.env.DB_PATH || 'data.db';
const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Health check
app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// List latest messages
app.get('/api/messages/latest', (req: Request, res: Response) => {
  const limitParam = Number.parseInt(String(req.query.limit ?? '10'), 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 10;

  const rows = db
    .prepare(
      'SELECT id, content, created_at FROM messages ORDER BY datetime(created_at) DESC LIMIT ?'
    )
    .all(limit) as Array<{ id: number; content: string; created_at: string }>;

  res.json(rows);
});

// Create a message
app.post('/api/messages', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { content?: unknown };
  const content =
    typeof body.content === 'string' && body.content.trim().length > 0
      ? body.content.trim()
      : 'Hello World';

  const insert = db.prepare('INSERT INTO messages (content) VALUES (?)');
  const result = insert.run(content);

  const row = db
    .prepare('SELECT id, content, created_at FROM messages WHERE id = ?')
    .get(result.lastInsertRowid) as { id: number; content: string; created_at: string };

  res.status(201).json(row);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`SQLite database: ${DB_PATH}`);
});
