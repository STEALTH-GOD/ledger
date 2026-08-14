"""PDF report build for export. Pure fpdf2, no webview dependency.

Mirrors the xlsx.py builder: rows are already-formatted display rows from the
frontend (money as en-IN grouped strings, sign baked in) so the PDF matches the
UI exactly. build_pdf(...) → BytesIO of an A4 portrait report.
"""
import io
from datetime import date as _date

from fpdf import FPDF
from fpdf.fonts import FontFace

MARGIN = 14


def build_pdf(rows, summary, single=False):
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, margin=18)
    pdf.set_margins(MARGIN, 16, MARGIN)
    pdf.add_page()

    # Header
    pdf.set_font("helvetica", "B", 15)
    pdf.cell(0, 8, "Ledger Book", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 6, "All Accounts" if not single else f"Account: {rows[0]['account'] if rows else ''}",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(110, 110, 110)
    pdf.cell(0, 5, f"Generated {_date.today().isoformat()}", new_x="LMARGIN", new_y="NEXT")
    if summary:
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("helvetica", "", 10)
        pdf.ln(3)
        pdf.cell(0, 6,
                 f"Credit: {summary.get('credit', '')}   |   "
                 f"Debit: {summary.get('debit', '')}   |   "
                 f"Balance: {summary.get('balance', '')}",
                 new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Table. Numeric columns right-aligned; heading row bold; headings repeat
    # automatically across page breaks (fpdf2 table() default).
    widths = [24, 34, 82, 24, 24, 25]
    head = ["Date", "Account", "Description", "Credit", "Debit", "Balance"]
    if single:
        widths.remove(34)
        head = ["Date", "Description", "Credit", "Debit", "Balance"]

    bold = FontFace(emphasis="BOLD")
    with pdf.table(
        col_widths=widths,
        repeat_headings=1,
        cell_fill_mode="ROWS",
        cell_fill_color=(242, 242, 244),
    ) as table:
        row = table.row()
        for h in head:
            row.cell(h, style=bold)
        for r in rows:
            row = table.row()
            row.cell(r["date"])
            if not single:
                row.cell(r["account"])
            row.cell(r["desc"])
            for key in ("credit", "debit", "balance"):
                row.cell(r.get(key, ""), align="RIGHT")

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf


if __name__ == "__main__":
    # ponytail: runnable check — build yields a valid, non-empty multi-object PDF.
    sample = [
        {"date": "2026-08-04", "account": "Cash", "desc": "sale of goods", "credit": "Rs. 50.00", "debit": "", "balance": "Rs. 150.00"},
        {"date": "2026-08-05", "account": "Cash", "desc": "shop rent", "credit": "", "debit": "Rs. 30.00", "balance": "Rs. 120.00"},
    ]
    summary = {"credit": "Rs. 50.00", "debit": "Rs. 30.00", "balance": "Rs. 120.00"}
    buf = build_pdf(sample, summary)
    raw = buf.getvalue()
    assert raw[:4] == b"%PDF", "PDF magic missing"
    assert raw.count(b"/Type /Page") >= 1, "no page objects"
    assert len(raw) > 1000, "PDF suspiciously small"
    print("pdf build OK")