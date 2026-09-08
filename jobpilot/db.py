import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = self.directory / 'jobpilot.sqlite3'
        with self.connect() as c:
            c.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, source TEXT NOT NULL,
                source_key TEXT NOT NULL, url TEXT UNIQUE NOT NULL, company TEXT NOT NULL,
                data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', last_seen TEXT NOT NULL,
                UNIQUE(source,source_key));
            CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL, company TEXT NOT NULL, day TEXT NOT NULL,
                state TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL, message TEXT NOT NULL, job_id TEXT, created TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, kind TEXT NOT NULL,
                sender TEXT NOT NULL, subject TEXT NOT NULL, preview TEXT NOT NULL,
                job_id TEXT, created TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0);
            ''')
        self.path.chmod(0o600)
        # Never re-submit an application whose previous process died mid-flight.
        with self.connect() as c:
            c.execute("UPDATE attempts SET state='uncertain', detail='Process stopped during application. Check employer portal before retrying.' WHERE state='running'")
            c.execute("UPDATE jobs SET status='uncertain' WHERE id IN (SELECT job_id FROM attempts WHERE state='uncertain') AND status='applying'")

    @contextmanager
    def connect(self):
        c = sqlite3.connect(self.path, timeout=30)
        c.row_factory = sqlite3.Row
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    def get(self, key, default=None):
        with self.connect() as c:
            row = c.execute('SELECT value FROM kv WHERE key=?', (key,)).fetchone()
            return json.loads(row['value']) if row else default

    def set(self, key, value):
        with self.connect() as c:
            c.execute('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key,json.dumps(value)))

    def event(self, kind, message, job_id=None):
        with self.connect() as c:
            c.execute('INSERT INTO events(kind,message,job_id,created) VALUES(?,?,?,?)', (kind,message,job_id,now()))

    def upsert_job(self, job):
        with self.connect() as c:
            existing = c.execute('SELECT id FROM jobs WHERE url=? OR (source=? AND source_key=?)', (job['url'],job['source'],job['source_key'])).fetchone()
            jid = existing['id'] if existing else job['id']
            job['id'] = jid
            c.execute('''INSERT INTO jobs(id,source,source_key,url,company,data,last_seen) VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen,company=excluded.company,
                source=excluded.source,source_key=excluded.source_key,url=excluded.url,
                status=CASE WHEN jobs.status='closed' THEN 'new' ELSE jobs.status END''',
                (jid,job['source'],job['source_key'],job['url'],job['company'],json.dumps(job),now()))
        return jid

    def jobs(self):
        with self.connect() as c:
            rows=c.execute('SELECT * FROM jobs ORDER BY last_seen DESC').fetchall()
        return [dict(json.loads(r['data']),status=r['status'],last_seen=r['last_seen']) for r in rows]

    def job(self, jid):
        with self.connect() as c:
            r=c.execute('SELECT * FROM jobs WHERE id=?',(jid,)).fetchone()
        if not r:
            raise ValueError('Job not found')
        return dict(json.loads(r['data']),status=r['status'],last_seen=r['last_seen'])

    def status(self, jid, status):
        with self.connect() as c:
            c.execute('UPDATE jobs SET status=? WHERE id=?',(status,jid))

    def reserve(self, jid, company, day, cap):
        """Atomic per-day budget and duplicate protection, including uncertain sends."""
        company = company.strip().casefold()
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT status FROM jobs WHERE id=?',(jid,)).fetchone()
            if not row or row['status'] not in ('new','prepared','queued','needs_input'):
                raise ValueError('This job is not available for automatic application')
            if c.execute("SELECT 1 FROM attempts WHERE job_id=? AND state IN ('running','submitted','uncertain')",(jid,)).fetchone():
                raise ValueError('Duplicate or uncertain application: check the employer portal')
            if c.execute('SELECT COUNT(*) FROM attempts WHERE day=?',(day,)).fetchone()[0] >= cap:
                raise ValueError('Daily application-attempt limit reached')
            if c.execute('SELECT 1 FROM attempts WHERE company=? AND day=?',(company,day)).fetchone():
                raise ValueError('One company has already been attempted today')
            cur=c.execute("INSERT INTO attempts(job_id,company,day,state,created) VALUES(?,?,?,'running',?)",(jid,company,day,now()))
            c.execute("UPDATE jobs SET status='applying' WHERE id=?",(jid,))
            return cur.lastrowid

    def finish(self, attempt, jid, state, detail):
        with self.connect() as c:
            c.execute('UPDATE attempts SET state=?,detail=? WHERE id=?',(state,detail,attempt))
            c.execute('UPDATE jobs SET status=? WHERE id=?',(state,jid))
        self.event(state,detail,jid)

    def rows(self, table, limit=100):
        if table not in ('events','attempts','messages'):
            raise ValueError('Invalid table')
        with self.connect() as c:
            return [dict(r) for r in c.execute(f'SELECT * FROM {table} ORDER BY created DESC LIMIT ?', (limit,))]
