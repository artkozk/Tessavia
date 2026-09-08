"""Local UI test only. Forward to the synthetic localhost app and drop one SC-78 create response.

Run with the local audit app on 38526, then open http://localhost:38527.
No credentials or request bodies are logged. No production target is supported.
"""
import http.client
import http.server
import json
import socket
import threading

guard = threading.Lock()
dropped = None

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def forward(self):
        global dropped
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        upstream = http.client.HTTPConnection('127.0.0.1', 38526, timeout=20)
        try:
            upstream.request(self.command, self.path, body, dict(self.headers))
            response = upstream.getresponse()
            data = response.read()
            candidate = False
            if self.command == 'POST' and self.path == '/api/records' and self.headers.get('Idempotency-Key'):
                payload = json.loads(body)
                candidate = str(payload.get('title', '')).startswith('SC-78 ')
            if candidate and response.status in (200, 201):
                record = json.loads(data)
                with guard:
                    if dropped is None:
                        dropped = record['id']
                        print(json.dumps({'droppedStatus': response.status, 'recordId': dropped}), flush=True)
                        self.close_connection = True
                        self.connection.shutdown(socket.SHUT_RDWR)
                        self.connection.close()
                        return
                    print(json.dumps({'retryStatus': response.status, 'sameRecord': dropped == record['id'], 'replayed': response.getheader('Idempotency-Replayed')}), flush=True)
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() not in ('transfer-encoding', 'content-length', 'connection'):
                    self.send_header(key, value)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        finally:
            upstream.close()
    do_GET = do_POST = do_PATCH = do_PUT = do_DELETE = forward

print('LOCAL_RETRY_PROXY=127.0.0.1:38527 -> 127.0.0.1:38526', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', 38527), Handler).serve_forever()
