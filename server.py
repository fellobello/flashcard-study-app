#!/usr/bin/env python3
"""Serves the Study Desk flashcards from this folder and saves progress to progress.json next to them.
Only listens on this computer (127.0.0.1), so nothing is reachable from the network."""
import http.server
import json
import os
import sys
import threading
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
SAVE = os.path.join(HERE, "progress.json")
CARDS = os.path.join(HERE, "cards.csv")
BUILTIN = os.path.join(HERE, "cards-builtin.js")
PAGE = "index.html"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=HERE, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/progress":
            body = b"null"
            if os.path.exists(SAVE):
                with open(SAVE, "rb") as f:
                    body = f.read() or b"null"
            return self.reply(200, body)
        if path == "/":
            self.path = "/" + PAGE
        return super().do_GET()

    def do_PUT(self):
        self.save()

    def do_POST(self):
        self.save()

    def save(self):
        path = self.path.split("?")[0]
        if path not in ("/api/progress", "/api/cards"):
            return self.reply(404, b'{"ok":false}')
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > 5_000_000:
            return self.reply(400, b'{"ok":false}')
        body = self.rfile.read(n)
        if path == "/api/progress":
            try:
                json.loads(body)
            except ValueError:
                return self.reply(400, b'{"ok":false}')
            write(SAVE, body)
        else:
            # only accept a card file with the expected header; keep the previous version as a backup
            head = body.lstrip(b"\xef\xbb\xbf")
            if not (head.startswith(b"section,tags,title,info,example") or head.startswith(b"category,tags,title,info,example")):
                return self.reply(400, b'{"ok":false}')
            if os.path.exists(CARDS):
                with open(CARDS, "rb") as f:
                    write(os.path.join(HERE, "cards.backup.csv"), f.read())
            write(CARDS, body)
            refresh_builtin()
        self.reply(200, b'{"ok":true}')

    def reply(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def write(path, data):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def refresh_builtin():
    """Copy cards.csv into cards-builtin.js so the app also works when index.html is opened directly."""
    try:
        with open(CARDS, encoding="utf-8-sig") as f:
            text = f.read()
    except OSError:
        return
    js = ("// Generated from cards.csv by server.py. Don't edit; edit cards.csv instead.\n"
          "// Used when index.html is opened without the server (browsers block reading cards.csv then).\n"
          "window.BUILTIN_CSV = " + json.dumps(text, ensure_ascii=False) + ";\n")
    write(BUILTIN, js.encode("utf-8"))


def ours(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/progress", timeout=1) as r:
            return r.status == 200 and "json" in r.headers.get("Content-Type", "")
    except Exception:
        return False


def main():
    refresh_builtin()
    first = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 4450
    for port in range(first, first + 10):
        url = f"http://127.0.0.1:{port}/"
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
        except OSError:
            if ours(port):
                print("The flashcards are already running. Opening them in your browser.")
                webbrowser.open(url)
                return
            continue
        print(f"Study Desk is running at {url}")
        print(f"Progress saves to: {SAVE}")
        print("Leave this window open while you study. Close it (or press Ctrl+C) when you're done.")
        if "--no-browser" not in sys.argv:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        return
    print(f"No free port between {first} and {first + 9}.")
    sys.exit(1)


if __name__ == "__main__":
    main()
