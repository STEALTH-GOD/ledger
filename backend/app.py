import argparse
import json
import sys
from pathlib import Path

import webview

from kv import init, load, save
from xlsx import build_workbook, parse_workbook, parse_legacy_xls

import traceback


def _log_error(label, exc):
    log_path = Path(sys.executable).parent / "ledger-error.log" if getattr(sys, "frozen", False) \
        else Path(__file__).resolve().parent / "ledger-error.log"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"\n--- {label} ---\n")
        traceback.print_exc(file=f)


class Api:
    """Exposed to the UI as window.pywebview.api."""

    def get_data(self):
        return load()

    def set_data(self, json_str):
        save(json_str)
        return "ok"

    def _win(self):
        return webview.windows[0]

    def export_xlsx(self, payload_str):
        try:
            data = json.loads(payload_str)
            chosen = self._win().create_file_dialog(
                webview.SAVE_DIALOG, save_filename=data.get("defaultName", "ledger.xlsx"))
            if not chosen:
                return ""
            path = chosen[0] if isinstance(chosen, (tuple, list)) else chosen
            out = Path(path)
            out.write_bytes(build_workbook(data["rows"]).getvalue())
            return str(out)
        except Exception as e:
            _log_error("export_xlsx", e)
            return f"ERROR: {e}"

    def import_xlsx(self):
        try:
            chosen = self._win().create_file_dialog(
                webview.OPEN_DIALOG, file_types=("Excel Files (*.xls;*.xlsx)", "All Files (*.*)"))
            if not chosen:
                return ""
            path = chosen[0] if isinstance(chosen, (tuple, list)) else chosen
            if Path(path).suffix.lower() == ".xls":
                return parse_legacy_xls(Path(path))
            return parse_workbook(Path(path))
        except Exception as e:
            _log_error("import_xlsx", e)
            return f"ERROR: {e}"

def _dist_index():
    """Absolute path to the built UI index.html."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "dist" / "index.html"
    return Path(__file__).resolve().parent.parent / "dist" / "index.html"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dev", action="store_true",
                        help="Load Vite dev server instead of built dist/")
    args = parser.parse_args()

    init()

    url = "http://localhost:5173" if args.dev else str(_dist_index())

    webview.create_window(
        "Ledger Book",
        url,
        js_api=Api(),
        width=1180,
        height=760,
        min_size=(860, 600),
    )
    webview.start(debug=args.dev)


if __name__ == "__main__":
    main()