import os
import json
import sqlite3
from contextlib import closing
from flask import Flask, jsonify, request
from flask_cors import CORS

# Configuration
PORT = int(os.getenv("PORT", "4000"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "data.db"))
DB_PATH = os.path.abspath(DB_PATH)

app = Flask(__name__)
CORS(app, resources={r"*": {"origins": FRONTEND_ORIGIN}}, supports_credentials=False)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enforce foreign key constraints per connection
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


# Initialize schema
with closing(get_db_connection()) as conn:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            balance INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            amount INTEGER NOT NULL CHECK (amount > 0),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (from_id) REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
            FOREIGN KEY (to_id) REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
        );
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_payments_from_created_at
        ON payments(from_id, datetime(created_at) DESC);
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_payments_to_created_at
        ON payments(to_id, datetime(created_at) DESC);
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS idempotency_keys (
            user_id INTEGER NOT NULL,
            key TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK (status IN ('in_progress','success','failed')),
            response TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """
    )
    conn.commit()

@app.post("/api/accounts")
def create_account():
    with closing(get_db_connection()) as conn:
        cur = conn.execute("INSERT INTO accounts (balance) VALUES (0)")
        new_id = cur.lastrowid
        conn.commit()
        row = conn.execute("SELECT id, balance FROM accounts WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(row)), 201


@app.get("/api/accounts/<int:account_id>")
def get_account(account_id: int):
    with closing(get_db_connection()) as conn:
        row = conn.execute("SELECT id, balance FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if row is None:
            return jsonify({"error": "account_not_found"}), 404
        return jsonify(dict(row))


@app.put("/send_payment")
def send_payment():
    data = request.get_json(silent=True) or {}
    try:
        from_id = int(data.get("from"))
        to_id = int(data.get("to"))
        amount = int(data.get("amount"))
        if amount <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_input"}), 400

    idempotency_key = data.get("idempotency_key")

    if from_id == to_id:
        return jsonify({"error": "same_account"}), 400

    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")

        # Idempotency: check existing record
        if isinstance(idempotency_key, str) and idempotency_key:
            existing = conn.execute(
                "SELECT status, response FROM idempotency_keys WHERE key = ?",
                (idempotency_key,),
            ).fetchone()
            if existing is not None:
                status = existing["status"]
                resp = existing["response"]
                if status == "success" and resp:
                    try:
                        parsed = json.loads(resp)
                    except Exception:
                        parsed = None
                    conn.rollback()
                    return jsonify(parsed if parsed else {"status": "success"}), 200
                if status == "in_progress":
                    conn.rollback()
                    return jsonify({"error": "request_in_progress"}), 409
                if status == "failed":
                    conn.rollback()
                    return jsonify({"error": "request_failed"}), 409
            else:
                conn.execute(
                    "INSERT INTO idempotency_keys (user_id, key, status) VALUES (?, ?, 'in_progress')",
                    (from_id, idempotency_key),
                )

        # Ensure both accounts exist
        if conn.execute("SELECT 1 FROM accounts WHERE id = ?", (from_id,)).fetchone() is None:
            conn.rollback()
            return jsonify({"error": "from_account_not_found"}), 404
        if conn.execute("SELECT 1 FROM accounts WHERE id = ?", (to_id,)).fetchone() is None:
            conn.rollback()
            return jsonify({"error": "to_account_not_found"}), 404

        # Debit with guard to prevent overdraft
        cur = conn.execute(
            "UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?",
            (amount, from_id, amount),
        )
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({"error": "insufficient_funds"}), 422

        # Credit
        conn.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, to_id))

        # Insert payment (created_at uses DB default)
        cur = conn.execute(
            "INSERT INTO payments (from_id, to_id, amount) VALUES (?, ?, ?)",
            (from_id, to_id, amount),
        )
        payment_id = cur.lastrowid

        row = conn.execute(
            "SELECT id, from_id, to_id, amount, created_at FROM payments WHERE id = ?",
            (payment_id,),
        ).fetchone()
        result = dict(row)

        # Mark idempotency success with stored response
        if isinstance(idempotency_key, str) and idempotency_key:
            conn.execute(
                "UPDATE idempotency_keys SET status = 'success', response = ? WHERE key = ?",
                (json.dumps(result), idempotency_key),
            )

        conn.commit()
        return jsonify(result), 201
    except Exception:
        # Mark idempotency failure
        try:
            if isinstance(idempotency_key, str) and idempotency_key:
                conn.rollback()
                conn.execute(
                    "UPDATE idempotency_keys SET status = 'failed' WHERE key = ?",
                    (idempotency_key,),
                )
                conn.commit()
            else:
                conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


@app.get("/payment_history/<int:user_id>")
def payment_history(user_id: int):
    limit_param = 3 # server level definition vs. request.args.get("limit", "10")
    ts = request.args.get("last_seen_timestamp")
    try:
        limit = int(limit_param)
        if limit <= 0:
            raise ValueError
    except ValueError:
        limit = 10

    base_sql = (
        "SELECT id, from_id, to_id, amount, created_at "
        "FROM payments "
        "WHERE (from_id = ? OR to_id = ?) "
    )
    params = [user_id, user_id]

    if ts:
        base_sql += "AND datetime(created_at) < datetime(?) "
        params.append(ts)

    base_sql += "ORDER BY datetime(created_at) DESC LIMIT ?"
    params.append(limit)

    with closing(get_db_connection()) as conn:
        rows = [dict(r) for r in conn.execute(base_sql, tuple(params)).fetchall()]
        oldest_timestamp = rows[-1]["created_at"] if rows else (ts or None)
        return jsonify({
            "items": rows,
            "oldest_timestamp": oldest_timestamp,
        })

if __name__ == "__main__":
    print(f"Backend listening on http://localhost:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    app.run(host="0.0.0.0", port=PORT)
