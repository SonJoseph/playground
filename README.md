# Playground App

This is a simple full-stack playground with:

- Next.js frontend
- Express backend with in-memory SQLite (better-sqlite3)

## Getting Started

### Backend

```bash
cd playground/backend
npm install
npm run dev
```

Runs at `http://localhost:4000` by default.

### Frontend

```bash
cd playground/frontend
npm install
npm run dev
```

Runs at `http://localhost:3000`.

Optionally configure the backend origin:

```bash
# playground/frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```


