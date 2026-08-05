import argparse
import sys
from pathlib import Path

import webview

from kv import init, load, save


class Api:
    """Exposed to the UI as window.pywebview.api."""

    def get_data(self):
        return load()

    def set_data(self, json_str):
        save(json_str)
        return "ok"


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