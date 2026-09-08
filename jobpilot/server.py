import argparse
import json
import mimetypes
import os
import re
import secrets
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from .service import Service
from .resume import model_status
from .locking import data_lock
from .db import now
from .service import tz
from datetime import datetime

STATIC=Path(__file__).parent/'static'


class Server(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,address,service):
        self.service=service; self.token=secrets.token_urlsafe(32)
        super().__init__(address,Handler)


class Handler(BaseHTTPRequestHandler):
    server_version='JobPilotLocal'
    def log_message(self,*args): pass
    def send(self,data,status=200,kind='application/json',headers=None):
        if kind=='application/json': data=json.dumps(data).encode()
        if isinstance(data,str): data=data.encode()
        self.send_response(status)
        self.send_header('Content-Type',kind+'; charset=utf-8' if kind.startswith('text/') or kind=='application/json' else kind)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.end_headers(); self.wfile.write(data)

    def local_request(self):
        port=self.server.server_address[1]
        allowed={f'localhost:{port}',f'127.0.0.1:{port}'}
        host=self.headers.get('Host','')
        if host not in allowed: raise PermissionError('Invalid local host')
        origin=self.headers.get('Origin')
        if origin and origin not in {f'http://{x}' for x in allowed}: raise PermissionError('Cross-origin requests are not allowed')
        # External links may open the dashboard, but must not expose API data,
        # downloads, embedded pages, or mutations to cross-site requests.
        dashboard_navigation=(
            self.command=='GET' and urlsplit(self.path).path=='/'
            and self.headers.get('Sec-Fetch-Mode')=='navigate'
            and self.headers.get('Sec-Fetch-Dest')=='document'
        )
        if self.headers.get('Sec-Fetch-Site')=='cross-site' and not dashboard_navigation:
            raise PermissionError('Cross-site requests are not allowed')

    def do_GET(self):
        try:
            self.local_request(); path=urlsplit(self.path).path; service=self.server.service
            if path=='/api/session': return self.send({'token':self.server.token})
            if path=='/api/state': return self.send(service.state())
            if path=='/api/model': return self.send(model_status(service.settings()['model']))
            if path=='/api/health': return self.send({'ok':True,'version':'0.1.0','local_only':True})
            if path.startswith('/api/task/'):
                task=service.tasks.get(path.rsplit('/',1)[-1])
                return self.send(task or {'error':'Task not found'},200 if task else 404)
            m=re.fullmatch(r'/api/packets/([a-f0-9]{20})/(packet\.json|resume\.(?:txt|html|pdf|docx))',path)
            if m:
                jid,name=m.groups(); packet=service.packet(jid)
                if name=='packet.json': return self.send(packet)
                if name.split('.')[-1] not in packet['formats']: raise ValueError('Export format not available')
                target=service.store.directory/'packets'/jid/name
                return self.send(target.read_bytes(),kind=mimetypes.guess_type(name)[0] or 'application/octet-stream',headers={'Content-Disposition':f'attachment; filename="{jid}-{name}"'})
            assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
            if path in assets:
                file=STATIC/assets[path]
                return self.send(file.read_bytes(),kind=mimetypes.guess_type(str(file))[0] or 'text/plain')
            return self.send({'error':'Not found'},404)
        except PermissionError as e: self.send({'error':str(e)},403)
        except ValueError as e: self.send({'error':str(e)},400)
        except Exception: self.send({'error':'Could not complete the request'},500)

    def do_POST(self):
        try:
            self.local_request()
            if not secrets.compare_digest(self.headers.get('X-JobPilot-Token',''),self.server.token): raise PermissionError('Invalid local session token; reload this page')
            if self.headers.get('Content-Type','').split(';')[0]!='application/json': raise ValueError('JSON content type is required')
            size=int(self.headers.get('Content-Length','0'))
            if size<0 or size>12_000_000: raise ValueError('Request too large')
            self.connection.settimeout(20)
            data=json.loads(self.rfile.read(size)); path=urlsplit(self.path).path; s=self.server.service
            if path=='/api/profile': result=s.save_profile(data)
            elif path=='/api/settings': result=s.save_settings(data)
            elif path=='/api/resume': result=s.upload_resume(data)
            elif path=='/api/jobs/import': result=s.import_jobs(data)
            elif path=='/api/tasks': result=s.task(data.get('kind'),data.get('job_id'))
            elif path=='/api/pause': result=s.save_settings({'auto_submit':False,'schedule_enabled':False})
            elif path=='/api/jobs/status':
                jid=data['job_id']; status=data['status']; job=s.store.job(jid)
                if s.lock.locked(): raise ValueError('Wait for the active task before changing an application status')
                if status not in ('submitted','interview','shortlisted','rejected','archived','new'): raise ValueError('Invalid status')
                if job['status']=='uncertain' and status=='new':
                    if data.get('confirmed_not_submitted') is not True: raise ValueError('Check the employer portal and confirm no application was submitted before resetting')
                    with s.store.connect() as c: c.execute("UPDATE attempts SET state='confirmed_not_submitted' WHERE job_id=? AND state='uncertain'",(jid,))
                if status=='new' and job['status'] in ('submitted','interview','shortlisted','rejected'): raise ValueError('Previously submitted applications cannot be automatically retried')
                if status=='submitted':
                    with s.store.connect() as c:
                        previous=c.execute('SELECT id,state FROM attempts WHERE job_id=? ORDER BY id DESC LIMIT 1',(jid,)).fetchone()
                        if previous and previous['state'] in ('uncertain','running'):
                            c.execute("UPDATE attempts SET state='submitted',detail='Manually verified submission' WHERE id=?",(previous['id'],))
                        elif not c.execute("SELECT 1 FROM attempts WHERE job_id=? AND state='submitted'",(jid,)).fetchone():
                            day=datetime.now(tz(s.settings()['timezone'])).date().isoformat()
                            c.execute("INSERT INTO attempts(job_id,company,day,state,detail,created) VALUES(?,?,?,'submitted','Manually recorded submission',?)",(jid,job['company'].strip().casefold(),day,now()))
                s.store.status(jid,status); s.store.event('manual_status',f'Manually recorded status: {status}',jid); result={'ok':True}
            elif path=='/api/messages/read':
                with s.store.connect() as c: c.execute('UPDATE messages SET seen=1 WHERE id=?',(data['id'],))
                result={'ok':True}
            else: return self.send({'error':'Not found'},404)
            self.send(result)
        except PermissionError as e: self.send({'error':str(e)},403)
        except (ValueError,KeyError,TypeError) as e: self.send({'error':str(e)},400)
        except Exception: self.send({'error':'Operation failed. Check your input and local configuration.'},500)


def main():
    p=argparse.ArgumentParser(description='Run JobPilot on this computer only')
    p.add_argument('--port',type=int,default=8765)
    p.add_argument('--data-dir',default=os.environ.get('JOBPILOT_DATA_DIR','data'))
    args=p.parse_args()
    if not 1<=args.port<=65535: p.error('Port must be between 1 and 65535')
    os.umask(0o077)
    try:
        with data_lock(args.data_dir):
            service=Service(args.data_dir)
            server=Server(('127.0.0.1',args.port),service)
            service.start()
            print(f'JobPilot Local is running at http://127.0.0.1:{server.server_port}',flush=True)
            print('Keep this terminal open for scheduling. Ctrl+C stops the app.',flush=True)
            try: server.serve_forever()
            except KeyboardInterrupt: pass
            finally: service.stopped.set(); server.server_close()
    except (ValueError,OSError) as exc:
        p.exit(1,f'Could not start JobPilot: {exc}\n')

if __name__=='__main__': main()
