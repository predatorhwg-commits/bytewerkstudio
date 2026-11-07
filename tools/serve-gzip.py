#!/usr/bin/env python3
"""Statischer Server mit gzip — fuer realistische Uebertragungsgroessen.

python3 -m http.server liefert unkomprimiert; damit sind Messungen etwa
dreimal so gross wie in Produktion (GitHub Pages, Netlify und jeder
normale Webserver komprimieren). Dieses Skript komprimiert wie ein
normaler Server und setzt die passenden Header.

Aufruf:
    python3 tools/serve-gzip.py <verzeichnis> [port]
"""
from __future__ import annotations

import gzip
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

COMPRESSIBLE = {
    ".html", ".css", ".js", ".mjs", ".svg", ".json", ".xml", ".txt", ".webmanifest",
}


class GzipHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Vary", "Accept-Encoding")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()

        ext = os.path.splitext(path)[1].lower()
        accepts = "gzip" in (self.headers.get("Accept-Encoding") or "")
        if ext not in COMPRESSIBLE or not accepts:
            return super().send_head()

        with open(path, "rb") as handle:
            raw = handle.read()

        body = gzip.compress(raw, compresslevel=6)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        import io

        return io.BytesIO(body)


def main() -> None:
    directory = sys.argv[1] if len(sys.argv) > 1 else "."
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 9503
    os.chdir(directory)
    server = ThreadingHTTPServer(("127.0.0.1", port), GzipHandler)
    print(f"gzip-Server auf http://127.0.0.1:{port} · {os.getcwd()}")
    server.serve_forever()


if __name__ == "__main__":
    main()
