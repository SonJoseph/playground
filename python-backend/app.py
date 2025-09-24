import os
import sqlite3
from contextlib import closing
from flask import Flask, jsonify, request
from flask_cors import CORS

# Configuration
PORT = int(os.getenv("PORT", "4000"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "../backend/data.db"))
DB_PATH = os.path.abspath(DB_PATH)

app = Flask(__name__)
CORS(app, resources={r"*": {"origins": FRONTEND_ORIGIN}}, supports_credentials=False)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# Initialize schema
with closing(get_db_connection()) as conn:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """
    )
    conn.commit()


@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})


@app.get("/api/messages/latest")
def list_latest_messages():
    limit_param = request.args.get("limit", default="10")
    try:
        limit = int(limit_param)
        if limit <= 0:
            raise ValueError
    except ValueError:
        limit = 10

    with closing(get_db_connection()) as conn:
        cur = conn.execute(
            "SELECT id, content, created_at FROM messages ORDER BY datetime(created_at) DESC LIMIT ?",
            (limit,),
        )
        rows = [dict(row) for row in cur.fetchall()]
    return jsonify(rows)


@app.post("/api/messages")
def create_message():
    data = request.get_json(silent=True) or {}
    raw_content = data.get("content")
    content = raw_content.strip() if isinstance(raw_content, str) and raw_content.strip() else "Hello World"

    with closing(get_db_connection()) as conn:
        cur = conn.execute("INSERT INTO messages (content) VALUES (?)", (content,))
        new_id = cur.lastrowid
        conn.commit()
        cur = conn.execute(
            "SELECT id, content, created_at FROM messages WHERE id = ?",
            (new_id,),
        )
        row = cur.fetchone()
        assert row is not None
        result = dict(row)

    return jsonify(result), 201


if __name__ == "__main__":
    print(f"Backend listening on http://localhost:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    app.run(host="0.0.0.0", port=PORT)
