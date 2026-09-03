#!/usr/bin/env python3
"""Measure existing API reads on-host; output timings/counts, never user content."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
import sqlite3
import statistics
import time
from urllib import request, parse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base', default='http://127.0.0.1:8522')
parser.add_argument('--gzip', action='store_true', help='Measure compressed bytes on the wire')
args = parser.parse_args()
db = sqlite3.connect('/var/lib/business-control/business-control.db', timeout=15)
owner = db.execute("SELECT id FROM users WHERE username='artkozk'").fetchone()[0]
token = secrets.token_urlsafe(32)
hashed = hashlib.sha256(token.encode()).hexdigest()
now = datetime.now(timezone.utc)
stamp = lambda value: value.isoformat(timespec='microseconds').replace('+00:00', 'Z')
db.execute('INSERT INTO sessions(user_id,token_hash,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)',
           (owner, hashed, stamp(now+timedelta(minutes=10)), stamp(now), stamp(now)))
db.commit()
paths = ['/api/workspaces','/api/users','/api/records?includeArchived=true','/api/notifications',
         '/api/activity?limit=200','/api/section-definitions','/api/questions/pending','/api/saved-views',
         '/api/chat/threads','/api/planning/cycles','/api/collections',
         '/api/interface/preferences?device=desktop','/api/interface/preferences?device=mobile',
         '/api/workspace/navigation','/api/workspace/pages?includeArchived=true',
         '/api/personal/overview','/api/team/capacity','/api/quality']
cursor = stamp(now-timedelta(minutes=1))
paths.append('/api/sync?'+parse.urlencode({'recordsSince':cursor,'activitySince':cursor}))
record_id = db.execute("SELECT id FROM records WHERE workspace_id='bizflow-team' AND type='task' ORDER BY updated_at DESC LIMIT 1").fetchone()[0]
paths.append('/api/records/'+record_id)

def measure(path):
    start = time.perf_counter()
    req = request.Request(args.base+path, headers={'Cookie':'business_session='+token,'X-Workspace-ID':'bizflow-team', 'Accept-Encoding':'gzip' if args.gzip else 'identity'})
    try:
        with request.build_opener(request.ProxyHandler({})).open(req, timeout=20) as response:
            data = response.read()
            return {'path':path.split('?')[0], 'status':response.status, 'ms':round((time.perf_counter()-start)*1000,2), 'bytes':len(data), 'encoding':response.headers.get('Content-Encoding','identity')}
    except Exception as exc:
        return {'path':path.split('?')[0], 'error':str(exc), 'ms':round((time.perf_counter()-start)*1000,2)}

try:
    print(json.dumps({'base':args.base,'records':db.execute('SELECT count(*) FROM records').fetchone()[0],
          'activity':db.execute('SELECT count(*) FROM activity').fetchone()[0],
          'users':db.execute('SELECT count(*) FROM users').fetchone()[0]}), flush=True)
    for path in paths:
        runs = [measure(path) for _ in range(3)]
        print(json.dumps({'mode':'sequential',**runs[-1], 'minMs':min(r['ms'] for r in runs),
                          'medianMs':statistics.median(r['ms'] for r in runs),'maxMs':max(r['ms'] for r in runs)}), flush=True)
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=14) as pool:
        results = list(pool.map(measure,paths[1:15]))
    print(json.dumps({'mode':'bootstrap-parallel','totalMs':round((time.perf_counter()-start)*1000,2),'requests':results}), flush=True)
    tasks = db.execute("SELECT id,title,status FROM records WHERE workspace_id='bizflow-team' AND (title LIKE '%загруз%' OR title LIKE '%скорост%' OR title LIKE '%производитель%' OR title LIKE '%задерж%')").fetchall()
    print(json.dumps({'matchingTasks':tasks},ensure_ascii=False),flush=True)
finally:
    db.execute('DELETE FROM sessions WHERE token_hash=?',(hashed,))
    db.commit()
    db.close()
