import json
import sqlite3
import sys
from pathlib import Path


def db_path():
    """Path to ledger.db. Beside the exe when frozen (user-writable), else project dir."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / "ledger.db"
    return Path(__file__).resolve().parent.parent / "ledger.db"


def _conn():
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init():
    conn = _conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'NPR',
            opening REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            desc TEXT NOT NULL,
            date TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def load():
    conn = _conn()
    accounts = conn.execute("SELECT * FROM accounts").fetchall()
    txs = conn.execute("SELECT * FROM transactions").fetchall()
    conn.close()
    return json.dumps(
        {
            "accounts": [dict(r) for r in accounts],
            "transactions": [dict(r) for r in txs],
        },
        allow_nan=False,
    )


def save(json_str):
    data = json.loads(json_str)
    accounts = data.get("accounts") or []
    txs = data.get("transactions") or []
    conn = _conn()
    # Replace-all: delete and reinsert. Matches frontend's bulk-save model; small data.
    # ponytail: full-table replace, fine at ledger scale. Per-row upsert if data grows.
    conn.execute("DELETE FROM transactions")
    conn.execute("DELETE FROM accounts")
    conn.executemany(
        "INSERT INTO accounts (id, name, currency, opening, created_at) VALUES (?,?,?,?,?)",
        [(a["id"], a["name"], a.get("currency", "NPR"), a.get("opening", 0), a.get("created_at", "")) for a in accounts],
    )
    conn.executemany(
        "INSERT INTO transactions (id, account_id, type, amount, desc, date, created_at) VALUES (?,?,?,?,?,?,?)",
        [
            (t["id"], t["accountId"], t["type"], t["amount"], t["desc"], t["date"], t.get("createdAt", ""))
            for t in txs
        ],
    )
    conn.commit()
    conn.close()
    return "ok"


if __name__ == "__main__":
    # ponytail: this is the runnable check. Confirm save/load round-trips.
    import tempfile

    tmpfile = Path(tempfile.mkdtemp()) / "ledger.db"

    def fake():
        return tmpfile

    import kv as kv

    kv.db_path = fake
    kv.init()
    payload = {"accounts": [{"id": "a1", "name": "Cash", "currency": "NPR", "opening": 100, "created_at": "x"}],
               "transactions": [{"id": "t1", "accountId": "a1", "type": "credit", "amount": 50, "desc": "sale", "date": "2026-08-04", "createdAt": "y"}]}
    kv.save(json.dumps(payload))
    out = json.loads(kv.load())
    assert len(out["accounts"]) == 1 and out["accounts"][0]["name"] == "Cash"
    assert len(out["transactions"]) == 1 and out["transactions"][0]["amount"] == 50
    print("kv roundtrip OK")