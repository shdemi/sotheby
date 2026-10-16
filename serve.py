#!/usr/bin/env python3
"""Static server for the app and the data editor.

Python's http.server sends `Last-Modified` and answers conditional requests with
304, so an edited app.js or editor.css keeps being served from the browser cache
and the page silently runs stale code. That is confusing during development.

This server disables caching for text assets (html/js/css) while still letting
images be cached, since those are large and rarely change.

    python serve.py [port]        # default 8000
"""
from __future__ import annotations

import functools
import http.server
import os
import socketserver
import sys

NO_CACHE_EXT = {".html", ".js", ".mjs", ".css", ".json"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        path = self.path.split("?")[0].lower()
        ext = os.path.splitext(path)[1]
        if ext in NO_CACHE_EXT:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        # Strip the query string so a cache-busting ?v= still resolves to a file.
        if "?" in self.path:
            self.path = self.path.split("?")[0]
        return super().send_head()

    def log_message(self, fmt: str, *args) -> None:
        # Keep the console readable: only report problems.
        status = args[1] if len(args) > 1 else ""
        if str(status).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {root}")
        print(f"  app    http://127.0.0.1:{port}/index.html")
        print(f"  editor http://127.0.0.1:{port}/editor/index.html")
        print("Text assets are served no-store, so edits show up on a plain reload.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
