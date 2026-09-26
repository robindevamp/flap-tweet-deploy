#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
print('Use this locally: python3 server.py')
print('On Vercel the static files are enough.')
ROOT = Path(__file__).resolve().parent
class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)
if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8787), H).serve_forever()
