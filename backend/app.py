import argparse
import json
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
    """Absolute path to the built UI. When frozen (onefile), it lives inside the
    extracted bundle at sys._MEIPASS; in dev it's the repo's dist/."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "dist" / "index.html"
    return Path(__file__).resolve().parent.parent / "dist" / "index.html"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dev", action="store_true", help="load Vite dev server instead of built dist/")
    args = parser.parse_args()

    init()

    if args.dev:
        url = "http://localhost:5173"
    else:
        url = str(_dist_index())

    webview.create_window(
        "Ledger Book",
        url,
        js_api=Api(),
        width=1180,
        height=760,
        min_size=(860, 600),
    )
    webview.start()


if __name__ == "__main__":
    main()