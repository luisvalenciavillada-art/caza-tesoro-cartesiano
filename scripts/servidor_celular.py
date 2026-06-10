#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sirve el juego en la red local (0.0.0.0) para probar en celular por Wi-Fi."""

from __future__ import annotations

import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _path_only(self) -> str:
        p = self.path.split("?", 1)[0].strip()
        if p != "/" and p.endswith("/"):
            p = p.rstrip("/")
        return p or "/"

    def do_GET(self):
        if self._path_only() == "/ctc-health":
            payload = b'{"ok":true,"game":"caza-tesoro-cartesiano"}\n'
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def log_message(self, format, *args):
        sys.stderr.write(
            "%s - - [%s] %s\n"
            % (self.address_string(), self.log_date_time_string(), format % args)
        )


def _lan_ips() -> list[str]:
    ips: list[str] = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    os.chdir(ROOT)
    bind = (os.environ.get("CTC_BIND") or "0.0.0.0").strip() or "0.0.0.0"
    try:
        httpd = ThreadingHTTPServer((bind, port), Handler)
    except OSError as e:
        sys.stderr.write(
            "No se pudo abrir el puerto %s (%s). Cierra otra ventana del servidor "
            "o cambia el puerto: py -3 scripts/servidor_celular.py 8766\n" % (port, e)
        )
        raise SystemExit(1) from e

    ips = _lan_ips()
    celular_url = (
        "http://%s:%s/index.html" % (ips[0], port) if ips else "http://TU-IP-WiFi:%s/index.html" % port
    )
    try:
        (ROOT / "URL-CELULAR.txt").write_text(celular_url + "\n", encoding="utf-8")
    except OSError:
        pass

    print("Carpeta:", ROOT)
    print("")
    print("  >>> CELULAR (barra de direccion, no Google):")
    print("  ", celular_url)
    print("")
    print("PC prueba la misma URL arriba. Si no abre: Permitir-firewall-celular.bat")
    print("Deja esta ventana abierta. Ctrl+C para cerrar.")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
