import json
import os
import shutil
import sqlite3
import sys
from pathlib import Path


def db_path():
    """Path to ledger.db. Frozen: %APPDATA%/LedgerBook/ledger.db so PyInstaller rebuilds —
    which wipe dist/ and everything in it — never touch user data. Dev: project dir."""
    if not getattr(sys, "frozen", False):
        return Path(__file__).resolve().parent.parent / "ledger.db"
    p = Path(os.environ.get("APPDATA", str(Path(sys.executable).parent))) / "LedgerBook" / "ledger.db"
    p.parent.mkdir(parents=True, exist_ok=True)
    # Old placement kept the db beside the exe; migrate it once so existing data survives.
    old = Path(sys.executable).parent / "ledger.db"
    if old.exists() and not p.exists():
        shutil.move(str(old), str(p))
    return p


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
    # SQL columns are snake_case; the UI reads camelCase keys (accountId, createdAt).
    # Map back so load() returns the same shape save() accepts — keeps the round-trip consistent.
    def account_row(r):
        return {"id": r["id"], "name": r["name"], "currency": r["currency"], "opening": r["opening"], "createdAt": r["created_at"]}

    def tx_row(r):
        return {"id": r["id"], "accountId": r["account_id"], "type": r["type"], "amount": r["amount"], "desc": r["desc"], "date": r["date"], "createdAt": r["created_at"]}

    conn = _conn()
    accounts = [account_row(r) for r in conn.execute("SELECT * FROM accounts").fetchall()]
    txs = [tx_row(r) for r in conn.execute("SELECT * FROM transactions").fetchall()]
    conn.close()
    return json.dumps(
        {"accounts": accounts, "transactions": txs},
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