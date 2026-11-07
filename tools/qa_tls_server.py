#!/usr/bin/env python3
"""Kleiner HTTPS-Server für Browserprüfungen (nur lokal, selbstsigniert).

Warum: WebKit setzt `upgrade-insecure-requests` aus der CSP auch auf
localhost um und lädt sonst keine Datei. Über TLS misst man dieselben
Seiten wie in Produktion, ohne die Policy für den Test zu verändern.

Aufruf:
  openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/bw-key.pem \
      -out /tmp/bw-cert.pem -days 2 -subj "/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  python3 tools/qa_tls_server.py --port 8443 --dir .
"""
import argparse
import http.server
import ssl


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8443)
    ap.add_argument("--dir", default=".")
    ap.add_argument("--cert", default="/tmp/bw-cert.pem")
    ap.add_argument("--key", default="/tmp/bw-key.pem")
    args = ap.parse_args()

    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
        *a, directory=args.dir, **kw)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(args.cert, args.key)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    print(f"https://127.0.0.1:{args.port} aus {args.dir}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
