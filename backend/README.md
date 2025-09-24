# Playground Backend (Express + SQLite in-memory)

## Setup

```bash
cd playground/backend
nvm use || true   # ensure Node 22/20/18; Node 24 may fail native builds
npm install
npm run dev
```

Server starts on `http://localhost:4000`.

TypeScript:

- Dev: `npm run dev` (ts-node via nodemon)
- Build: `npm run build` then `npm start`

Database:

- Uses SQLite file by default at `./data.db` in the backend folder.
- Override path with env var: `DB_PATH=/absolute/or/relative/path.sqlite npm run dev`.

Query the DB from the CLI:

```bash
# Install sqlite3 if you don't have it
# macOS (Homebrew): brew install sqlite

cd /Users/joseph/workplace/playground/backend

# If you used a custom path, substitute it for ./data.db
sqlite3 ./data.db <<'SQL'
.headers on
.mode column
SELECT COUNT(*) AS message_count FROM messages;
SELECT id, content, created_at FROM messages ORDER BY datetime(created_at) DESC LIMIT 10;
SQL

# Open an interactive session instead:
sqlite3 ./data.db
# then inside the shell:
# .headers on
# .mode box
# .tables
# PRAGMA table_info(messages);
# SELECT * FROM messages LIMIT 5;
# .quit
```

## Endpoints

- `GET /healthz` – health check
- `GET /api/messages/latest?limit=10` – list latest messages
- `POST /api/messages` – create a message
  - Body: `{ "content": "Hello World" }` (optional; defaults to "Hello World")


