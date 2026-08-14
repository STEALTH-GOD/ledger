"""Excel build/parse for export & import. Pure openpyxl, no webview dependency."""
import io
from datetime import datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font

HEADERS = ["Date", "Account", "Description", "Credit", "Debit", "Balance"]


def build_workbook(rows):
    """rows: [{date, account, desc, credit, debit, balance}] → BytesIO holding an .xlsx."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Transactions"
    ws.append(HEADERS)
    for r in rows:
        ws.append([
            r["date"], r["account"], r["desc"],
            r["credit"] or 0, r["debit"] or 0, r["balance"],
        ])
    # Header + presentation
    for cell in ws[1]:
        cell.font = Font(bold=True)
    ws.freeze_panes = "A2"
    for col, w in zip("ABCDEF", (12, 22, 36, 14, 14, 14)):
        ws.column_dimensions[col].width = w
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def parse_workbook(path):
    """Read an exported .xlsx → [{account, date, desc, type, amount}], skipping the header row."""
    ws = load_workbook(path, read_only=True, data_only=True).active
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or not any(v is not None and str(v).strip() for v in r):
            continue
        # Columns: Date, Account, Description, Credit, Debit, Balance
        date = r[0]; account = r[1]; desc = r[2]; credit = r[3]; debit = r[4]
        if date is None or account is None or desc is None:
            continue
        date = str(date).strip()[:10]  # Excel may give a datetime → take the YYYY-MM-DD part
        account = str(account).strip()
        desc = str(desc).strip()
        credit = float(credit or 0)
        debit = float(debit or 0)
        rows.append({
            "account": account, "date": date, "desc": desc,
            "type": "credit" if credit > 0 else "debit",
            "amount": credit if credit > 0 else debit,
        })
    return rows


def parse_legacy_xls(path):
    import xlrd
    wb = xlrd.open_workbook(str(path))
    sheet = wb.sheet_by_index(0)
    account = sheet.name.strip()
    out = []
    for r in range(1, sheet.nrows):  # row 0 = header
        row = sheet.row_values(r)
        desc = str(row[2]).strip() if len(row) > 2 else ""
        if not desc:
            continue  # blank / Total / Balance / footer
        date = str(row[1]).strip() if len(row) > 1 else ""
        try:
            date = datetime.strptime(date, "%d-%m-%Y").strftime("%Y-%m-%d")
        except ValueError:
            pass  # keep as-is
        debit = float(row[3]) if len(row) > 3 else 0.0
        credit = float(row[4]) if len(row) > 4 else 0.0
        out.append({
            "account": account,
            "date": date,
            "desc": desc,
            "type": "credit" if credit > 0 else "debit",
            "amount": credit if credit > 0 else debit,
        })
    return out


if __name__ == "__main__":
    # ponytail: runnable check — build → parse round-trips the model fields.
    import tempfile
    from pathlib import Path

    sample = [
        {"date": "2026-08-04", "account": "Cash", "desc": "sale", "credit": 50, "debit": 0, "balance": 150},
        {"date": "2026-08-05", "account": "Cash", "desc": "rent", "credit": 0, "debit": 30, "balance": 120},
    ]
    tmp = Path(tempfile.mkdtemp()) / "out.xlsx"
    tmp.write_bytes(build_workbook(sample).getvalue())
    out = parse_workbook(tmp)
    assert out[0] == {"account": "Cash", "date": "2026-08-04", "desc": "sale", "type": "credit", "amount": 50}, out[0]
    assert out[1] == {"account": "Cash", "date": "2026-08-05", "desc": "rent", "type": "debit", "amount": 30}, out[1]
    assert len(out) == 2
    print("xlsx roundtrip OK")

    # Legacy .xls: parse the repo fixture if present.
    xls = Path(__file__).resolve().parent.parent / "sample.xls"
    if xls.exists():
        legacy = parse_legacy_xls(xls)
        assert legacy[0] == {"account": "trex sheet", "date": "2026-08-04", "desc": "t", "type": "debit", "amount": 15555.0}, legacy[0]
        assert legacy[1] == {"account": "trex sheet", "date": "2026-08-04", "desc": "cookers", "type": "credit", "amount": 12000.0}, legacy[1]
        assert all(x["account"] == "trex sheet" for x in legacy)
        assert len(legacy) == 2, legacy
        print("legacy .xls parse OK")
