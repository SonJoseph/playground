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



This app will consist of implementing multiple important concepts of system design. 
Namely, idempotency, atomic transactions, pagination, and locks. 

We will do this by implementing core features of Venmo.
For sake of practice, we assume that we update account balances in our database (not interact with banks).

Functional requirements:
1. User should be able to send money to another user. 
2. User should be able to see their transaction history in reverse chronological order.

Non-functional requirements:
1. System should support 50,000 DAU.
2. System should support 1,000 TPS.
3. Read > Write. 
4. Prioritize consistency > availability. 
 - No double payment.
5. Low latency in sending payments and recieving transaction history. 

Idempotency:
 - In case of a network failure, we shouldn't process a payment multiple times.
 - Solution: As part of the request, generate an Idempotency Key to ensure payments aren't processed twice.
  - Need to clarify the details here.
 
Atomicity: 
 - If user A sends money to user B, we should 1) decrement the account balance from user A and 2) increment the account balance of user B. If the server crashes between the two steps, the entire state should be reverted.

Pagination:
 - When fetching transaction history, user should be able to see max 10 transactions at a time, and retrieve the next 10 transactions when they scroll down (For implementation sake, we can make a button to fetch the next 10 transactions.)

Locks:
 - To explore the idea of locks, we make it a requirement that two users shouldn't be able to send money to one user at a single time. 

Let's define our core entities.
Schema:
1. Accounts
 - id (pk), balance
2. Payments
 - id (pk), from_id (sk), to_id, created_at, amount

APIs:

This gets the 10 timestamps older than the last seen timestamp.
For the initial request, the last seen timestamp is the current time. 
```
GET /payment_history/{user}?last_seen_timestamp={timestamp}&limit=10
-> List[Payment]
```
```
SELECT * FROM payments WHERE id = 'A' AND timestamp < last_seen_timestamp ORDER BY timestamp DESC LIMIT 10
```

```
PUT /send_payment
{
 from: int,
 to: int,
 amount: int,
 created_at: timestamp
 idempotency_key: str
}
```
The payment should be atomic and prevent double-spending. 
Transactions in SQLite are atomic and using FOR UPDATE will lock the payer and payee rows during the duration of the transaction.
We use this instead of SERIALIZABLE which will abort concurrent transactions instead of locking and waiting.
```
BEGIN;

-- Lock sender and receiver rows to prevent concurrent updates
SELECT balance 
FROM accounts 
WHERE account_id = 'A' 
FOR UPDATE;

SELECT balance 
FROM accounts 
WHERE account_id = 'B' 
FOR UPDATE;

-- Check sufficient funds
IF (SELECT balance FROM accounts WHERE account_id = 'A') < 100 THEN
    ROLLBACK;
    RAISE NOTICE 'Insufficient funds';
    RETURN;
END IF;

-- Perform the transfer
UPDATE accounts
SET balance = balance - 100
WHERE account_id = 'A';

UPDATE accounts
SET balance = balance + 100
WHERE account_id = 'B';

-- Insert payment history
INSERT INTO payments(sender_id, receiver_id, amount)
VALUES ('A', 'B', 100);

COMMIT;
```

In order to ensure payments are idempotent, e.g. in the case of retry on network failure, we need to store idempotency_keys in a table and check if the request has already been made. If so, 
The idempotency key is generated per-request and is unique among requests for the same user.
Storing the status and response of the request allows us to return the appopriate response to the user.
```
CREATE TABLE idempotency_keys (
    user_id INT,
    key VARCHAR PRIMARY KEY,
    status VARCHAR,       -- in_progress, success, failed
    response JSONB,
    created_at TIMESTAMP
);
```

Example usage of idempotency keys and status/response fields:

Client sends payment with key "abc123"
1. Middleware inserts key with status="in_progress"
2. Processes payment transaction
3. Updates key status="success", stores response
4. Server crashes and no response is returned to the client
5. Client automatically retries the request.
6a. Middleware sees status="in_progress"
    - Waits until status is "success"
    - Returns stored response to client
6b. Middleware sees status="success"
    - Returns stored response to client
6c. Middleware sees status="failure"
    - Retries request.
    - Waits for response.
