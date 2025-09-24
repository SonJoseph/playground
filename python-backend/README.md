# Python Flask Backend (playground/python-backend)

A minimal Flask backend that mirrors the Express backend in `playground/backend`.

## Endpoints
- `GET /healthz` — health check
- `GET /api/messages/latest?limit=10` — list most recent messages
- `POST /api/messages` — create a message. Body: `{ "content": string }` (defaults to `"Hello World"`)

## SQLite Database
- Uses the same file-backed SQLite DB as the Node backend.
- Default path is `../backend/data.db` relative to this folder. Override with `DB_PATH`.

## Run
```bash
cd playground/python-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export FRONTEND_ORIGIN="http://localhost:3000"
# Optionally set custom DB or port
# export DB_PATH="/absolute/path/to/data.db"
# export PORT=4000
python app.py
```

You should see logs like:
```
Backend listening on http://localhost:4000
SQLite database: /absolute/path/to/playground/backend/data.db
```

