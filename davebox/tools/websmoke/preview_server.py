# dAVEBOx preview server: serves the davebox working tree, with / -> the app
# (python http.server would show a directory listing on the bare URL).
import http.server, functools
import os
DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"   # keep-alive: node/undici drops scripts against HTTP/1.0 close-per-request
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # working-tree preview: never serve stale JS
        super().end_headers()
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send_response(302); self.send_header("Location", "/web_ui.html"); self.end_headers(); return
        super().do_GET()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("", 8199), functools.partial(H, directory=DIR)).serve_forever()
