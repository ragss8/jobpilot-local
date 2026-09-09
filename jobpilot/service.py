import hashlib
import json
import re
import threading
import time
import uuid
from datetime import datetime,timedelta,timezone
from pathlib import Path
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from .db import Store,now
from .matching import evaluate
from .sources import fetch_board,normalize
from .resume import build_packet,extract_upload,model_status
from .browser import run_application
from . import mailbox
from .discovery import discover, query_plan, refresh_public_job

DEFAULT_SETTINGS={'threshold':80,'daily_limit':25,'roles':['full stack','full-stack','software engineer','frontend','backend'],
    'locations':['Bengaluru','Bangalore'],'min_salary_lpa':15,'require_salary':False,'excluded_companies':[],
    'keywords':[],'boards':[],'model':'qwen3:4b','use_ai':False,'auto_submit':False,
    'schedule_enabled':False,'run_at':'09:30','timezone':'Asia/Kolkata','mail_enabled':False,'headless':False,
    'discovery_enabled':True,'discovery_sources':['employers','linkedin','naukri','indeed'],
    'discovery_page_limit':30,'browser_channel':'chrome','structured_tailoring':True,
    'strict_required_skills':False,'excluded_required_skills':[]}
DEFAULT_PROFILE={'name':'','email':'','phone':'','location':'Bengaluru, India','years':None,'current_company':'',
                 'linkedin':'','github':'','portfolio':'','resume_text':'','answers':{},'verified':False}


def tz(name):
    try: return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        if name=='Asia/Kolkata': return timezone(timedelta(hours=5,minutes=30))
        if name=='UTC': return timezone.utc
        raise ValueError('Timezone unavailable. Install tzdata or choose UTC.')


def number(value, label, low, high, integer=False):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not low<=value<=high or (integer and not isinstance(value,int)):
        raise ValueError(f'{label} must be between {low} and {high}'+(' and a whole number' if integer else ''))
    return value


def strings(value,label,limit=100):
    if not isinstance(value,list) or len(value)>limit or any(not isinstance(x,str) or len(x)>200 for x in value):
        raise ValueError(f'{label} must be a list of short text values')
    return [x.strip() for x in value if x.strip()]


class Service:
    def __init__(self,directory):
        self.store=Store(directory); self.lock=threading.Lock(); self.tasks={}; self.stopped=threading.Event()
        self._match_cache={}
        if not self.store.get('settings'): self.store.set('settings',DEFAULT_SETTINGS)
        if not self.store.get('profile'): self.store.set('profile',DEFAULT_PROFILE)
        self.scheduler=threading.Thread(target=self._schedule,daemon=True)

    def start(self): self.scheduler.start()
    def settings(self): return dict(DEFAULT_SETTINGS,**self.store.get('settings',{}))
    def profile(self): return dict(DEFAULT_PROFILE,**self.store.get('profile',{}))

    def save_settings(self,data):
        s=self.settings()
        for key in data:
            if key not in DEFAULT_SETTINGS: raise ValueError(f'Unknown setting: {key}')
        s.update(data)
        number(s['threshold'],'Threshold',0,99)
        number(s['daily_limit'],'Daily limit',1,30,True)
        number(s['min_salary_lpa'],'Minimum salary',0,500)
        number(s['discovery_page_limit'],'Discovery pages',1,100,True)
        if s['browser_channel'] not in ('chrome','chromium'): raise ValueError('Choose Chrome or Chromium')
        if not isinstance(s['discovery_sources'],list) or not s['discovery_sources'] or any(x not in ('employers','linkedin','naukri','indeed') for x in s['discovery_sources']):
            raise ValueError('Choose supported discovery sources')
        for k in ('roles','locations','excluded_companies','keywords','excluded_required_skills'): s[k]=strings(s[k],k)
        for k in ('require_salary','use_ai','auto_submit','schedule_enabled','mail_enabled','headless','discovery_enabled','structured_tailoring','strict_required_skills'):
            if not isinstance(s[k],bool): raise ValueError(f'{k} must be true or false')
        from .resume import LOCAL_MODELS
        if s['model'] not in LOCAL_MODELS: raise ValueError('Choose a supported local Ollama model')
        if not isinstance(s['run_at'],str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',s['run_at']): raise ValueError('Use HH:MM for daily run time')
        tz(s['timezone'])
        if not isinstance(s['boards'],list) or len(s['boards'])>100: raise ValueError('Add at most 100 company boards')
        unique=set()
        for b in s['boards']:
            if not isinstance(b,dict) or b.get('provider') not in ('lever','greenhouse','ashby') or not re.fullmatch('[A-Za-z0-9_-]{1,100}',b.get('slug','')):
                raise ValueError('Each company board needs a provider and valid slug')
            if not isinstance(b.get('company'),str) or not 1<=len(b['company'].strip())<=120: raise ValueError('Company name is required')
            key=(b['provider'],b['slug'])
            if key in unique: raise ValueError('Duplicate company board')
            unique.add(key)
        if s['auto_submit'] and not self.profile()['verified']: raise ValueError('Complete and verify your profile before enabling automatic submission')
        self.store.set('settings',s)
        return s

    def save_profile(self,data):
        if self.lock.locked(): raise ValueError('Wait for the current task before editing the profile; Pause is always available')
        p=self.profile()
        for key in data:
            if key not in DEFAULT_PROFILE: raise ValueError(f'Unknown profile field: {key}')
        p.update(data)
        for k in DEFAULT_PROFILE:
            if k in ('years','verified','answers'): continue
            if not isinstance(p[k],str) or len(p[k])>(60000 if k=='resume_text' else 1000): raise ValueError(f'Invalid {k}')
        if p['years'] is not None: number(p['years'],'Experience',0,60)
        if not isinstance(p['verified'],bool): raise ValueError('Verified must be true or false')
        if not isinstance(p['answers'],dict) or len(p['answers'])>100 or any(not isinstance(k,str) or len(k)>500 or not isinstance(v,(str,bool)) or (isinstance(v,str) and len(v)>4000) for k,v in p['answers'].items()):
            raise ValueError('Answers must map exact questions to text or true/false')
        if p['verified']:
            if not p['name'].strip() or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',p['email']) or not p['phone'].strip() or len(p['resume_text'].strip())<100:
                raise ValueError('A verified profile needs your name, valid email, phone and full resume')
        self.store.set('profile',p)
        # Any profile change invalidates previously prepared submissions and stops automation until explicitly enabled again.
        s=self.settings(); s['auto_submit']=False; self.store.set('settings',s)
        return p

    def upload_resume(self,data):
        text=extract_upload(data.get('filename',''),data.get('content',''))
        if len(text.strip())<50: raise ValueError('Could not extract enough text. Paste the text, or OCR a scanned PDF first.')
        self.save_profile({'resume_text':text,'verified':False})
        return {'text':text}

    def ranked(self):
        p=self.profile(); s=self.settings()
        jobs=[]
        profile_key=hashlib.sha256(json.dumps([p,s],sort_keys=True).encode()).hexdigest()
        for j in self.store.jobs():
            key=hashlib.sha256((profile_key+json.dumps(j,sort_keys=True)).encode()).hexdigest()
            if key not in self._match_cache:self._match_cache[key]=evaluate(p,j,s)
            jobs.append(dict(j,match=self._match_cache[key]))
        if len(self._match_cache)>10000:self._match_cache.clear()
        return sorted(jobs,key=lambda j:(j['match']['eligible'],j['match']['score']),reverse=True)

    def state(self):
        s=self.settings(); day=datetime.now(tz(s['timezone'])).date().isoformat()
        with self.store.connect() as c:
            attempted=c.execute('SELECT count(*) FROM attempts WHERE day=?',(day,)).fetchone()[0]
        jobs=self.ranked()
        return {'settings':s,'profile':self.profile(),'jobs':jobs,'events':self.store.rows('events',30),
                'discovery':self.store.get('last_discovery',{}),'search_plan':query_plan(self.profile(),s),
                'questions':self.store.get('pending_questions',[]),
                'attempts':self.store.rows('attempts'),'messages':self.store.rows('messages'),
                'tasks':list(self.tasks.values())[-20:], 'last_sync':self.store.get('last_sync'),
                'stats':{'discovered':len(jobs),'eligible':sum(x['match']['eligible'] and x['status'] in ('new','prepared','queued') for x in jobs),
                         'submitted':sum(x['status']=='submitted' for x in jobs),'today':attempted},'busy':self.lock.locked()}

    def import_jobs(self,data):
        if self.lock.locked(): raise ValueError('Wait for the current task before importing jobs')
        if not isinstance(data,list) or not 1<=len(data)<=500: raise ValueError('Import 1 to 500 job objects')
        prepared=[]
        for x in data:
            if not isinstance(x,dict): raise ValueError('Each job must be an object')
            for k in ('title','company','url','description'):
                if not isinstance(x.get(k),str) or not x[k].strip() or len(x[k])>(60000 if k=='description' else 2000): raise ValueError(f'A valid {k} is required')
            location=x.get('location','')
            if not isinstance(location,str) or len(location)>500: raise ValueError('Invalid location')
            opts={}
            for k in ('min_years','salary_max_lpa'):
                if x.get(k) is not None: opts[k]=number(x[k],k,0,500)
            prepared.append(normalize('manual',hashlib.sha256(x['url'].encode()).hexdigest(),x['company'],x['title'],x['url'],x['description'],location,**opts))
        for job in prepared: self.store.upsert_job(job)
        self.store.event('import',f'Imported {len(prepared)} jobs')
        return {'imported':len(prepared)}

    def sync(self):
        boards=self.settings()['boards']
        if not boards: raise ValueError('Add company board slugs in Sources first')
        count=0; errors=[]
        for b in boards:
            try:
                jobs=fetch_board(b)
                for j in jobs: self.store.upsert_job(j)
                ids={x['id'] for x in jobs}
                # Only close jobs from a board whose complete request succeeded.
                for old in self.store.jobs():
                    if old['source']==b['provider'] and old.get('board')==b['slug'] and old['id'] not in ids and old['status'] in ('new','prepared','queued','needs_input'):
                        self.store.status(old['id'],'closed')
                count+=len(jobs)
            except Exception as e:
                error=f'{b["company"]}: {type(e).__name__}. Check the board slug and network access.'
                errors.append(error); self.store.event('source_error',error)
        self.store.set('last_sync',now()); self.store.event('sync',f'Synced {count} postings; {len(errors)} board errors')
        return {'jobs':count,'errors':errors}

    def discover(self):
        if not self.profile()['resume_text'].strip(): raise ValueError('A resume is required for discovery')
        result=discover(self.profile(),self.settings(),stopped=self.stopped)
        for job in result['jobs']:self.store.upsert_job(job)
        settings=self.settings();boards=settings['boards'][:]
        keys={(b['provider'],b['slug']) for b in boards}
        for board in result['boards']:
            if (board['provider'],board['slug']) not in keys and len(boards)<100:
                boards.append(board);keys.add((board['provider'],board['slug']))
        settings['boards']=boards;self.store.set('settings',settings)
        report={k:v for k,v in result.items() if k!='jobs'}
        report.update(created=now(),jobs=len(result['jobs']))
        self.store.set('last_discovery',report)
        self.store.event('discovery',f'Discovered {len(result["jobs"])} postings; checked {len(result["sources"])} source responses')
        return report

    def prepare(self,jid):
        j=self.store.job(jid); p=self.profile(); s=self.settings()
        packet=build_packet(self.store.directory,p,j,s['model'],s['use_ai'],structured=s['structured_tailoring'])
        if j['status'] in ('new','prepared','queued'): self.store.status(jid,'prepared')
        self.store.event('prepared',f'Prepared an evidence-based resume for {j["company"]}',jid)
        return packet

    def packet(self,jid):
        self.store.job(jid)
        path=self.store.directory/'packets'/jid/'packet.json'
        if not path.exists(): raise ValueError('Prepare this resume first')
        packet=json.loads(path.read_text(encoding='utf-8'))
        from .resume import fingerprint
        packet['stale']=packet['fingerprint']!=fingerprint(self.profile(),self.store.job(jid))
        return packet

    def apply(self,jid):
        s=self.settings(); p=self.profile(); job=self.store.job(jid)
        if not s['auto_submit']: raise ValueError('Automatic submission is paused; enable it in Settings after completing your profile')
        if not p['verified']: raise ValueError('Verify your profile before automatic applications')
        if job['status'] not in ('new','prepared','queued','needs_input'): raise ValueError('This job cannot be automatically submitted in its current state')
        # Fetch authoritative feed immediately before sending; do not apply from stale snapshots.
        if not job.get('board') and not job.get('verified_public_posting'):
            self.store.status(jid,'needs_input')
            raise ValueError('Imported jobs require manual application. Automatic submission requires a supported company feed.')
        if job.get('board'):
            live=fetch_board({'provider':job['source'],'slug':job['board'],'company':job['company']})
            fresh=next((x for x in live if x['source_key']==job['source_key']),None)
        else:
            fresh=refresh_public_job(job)
        if not fresh:
            self.store.status(jid,'closed'); raise ValueError('Job is no longer in the employer feed')
        fresh['id']=jid; self.store.upsert_job(fresh); job=self.store.job(jid)
        match=evaluate(p,job,s)
        if not match['eligible']: raise ValueError('; '.join(match['blockers']))
        if s['use_ai']:
            from .assessment import assess
            from .resume import fingerprint
            signature=fingerprint(p,job)+':'+s['model']
            assessment=self.store.get('assessment:'+jid,{})
            if assessment.get('signature')!=signature:
                try:assessment=assess(p,job,s['model'])
                except Exception:
                    raise ValueError('Local fit review could not be validated; skipping this application')
                assessment['signature']=signature
                self.store.set('assessment:'+jid,assessment)
            if assessment['fit']!='strong':
                self.store.event('fit_rejected',assessment['reason'],jid)
                raise ValueError('Local fit review: '+assessment['reason'])
        packet=self.prepare(jid)
        s=self.settings()
        if not s['auto_submit']: raise ValueError('Automatic submission was paused')
        latest_match=evaluate(p,job,s)
        if not latest_match['eligible']: raise ValueError('; '.join(latest_match['blockers']))
        day=datetime.now(tz(s['timezone'])).date().isoformat()
        attempt=self.store.reserve(jid,job['company'],day,s['daily_limit'])
        try:
            state,detail=run_application(self.store,job,p,packet,s)
        except Exception:
            state,detail='uncertain','Unexpected runner failure. Check employer portal before retrying.'
        self.store.finish(attempt,jid,state,detail)
        if state=='needs_input':
            questions=self.store.get('pending_questions',[])
            if not any(q['job_id']==jid and q['detail']==detail for q in questions):
                questions.append({'job_id':jid,'company':job['company'],'detail':detail,'created':now()})
                self.store.set('pending_questions',questions[-100:])
        return {'status':state,'detail':detail}

    def cycle(self):
        result={'applications':[]}
        if self.settings()['discovery_enabled']:
            result['discovery']=self.discover()
        if self.settings()['boards']:result['sync']=self.sync()
        for job in self.ranked():
            if not self.settings()['auto_submit']: break
            if not job['match']['eligible'] or job['status'] not in ('new','prepared','queued'): continue
            with self.store.connect() as c:
                day=datetime.now(tz(self.settings()['timezone'])).date().isoformat()
                if c.execute('SELECT count(*) FROM attempts WHERE day=?',(day,)).fetchone()[0]>=self.settings()['daily_limit']: break
                if c.execute('SELECT 1 FROM attempts WHERE company=? AND day=?',(job['company'].strip().casefold(),day)).fetchone(): continue
            try: result['applications'].append({'job':job['id'],**self.apply(job['id'])})
            except Exception as e: self.store.event('application_blocked',str(e)[:1500],job['id'])
            # A fixed quiet interval limits load; this is not human impersonation.
            if self.stopped.wait(5): break
        if self.settings()['mail_enabled']:
            try: result['inbox']=mailbox.poll(self.store)
            except Exception: self.store.event('inbox_error','Inbox could not be read. Check local IMAP configuration.')
        return result

    def task(self,kind,jid=None):
        functions={'discover':self.discover,'sync':self.sync,'cycle':self.cycle,'inbox':lambda:mailbox.poll(self.store),
                   'prepare':lambda:self.prepare(jid),'apply':lambda:self.apply(jid)}
        if kind not in functions: raise ValueError('Unknown task')
        if not self.lock.acquire(blocking=False): raise ValueError('Another task is running. You can still pause automation.')
        key=uuid.uuid4().hex
        self.tasks[key]={'id':key,'kind':kind,'status':'running','created':now()}
        def run():
            try:
                result=functions[kind]()
                self.tasks[key]={**self.tasks[key],'status':'done','result':result}
            except Exception as e:
                detail=str(e) if isinstance(e,ValueError) else f'{type(e).__name__}: operation failed. Check configuration and connectivity.'
                self.tasks[key]={**self.tasks[key],'status':'error','error':detail[:1500]}
                self.store.event('error',detail[:1500],jid)
            finally:
                self.lock.release()
        threading.Thread(target=run,daemon=True).start()
        return {'task_id':key}

    def _schedule(self):
        last_mail=0
        while not self.stopped.wait(20):
            s=self.settings(); local=datetime.now(tz(s['timezone'])); day=local.date().isoformat()
            if s['schedule_enabled'] and local.strftime('%H:%M')>=s['run_at'] and self.store.get('last_cycle_day')!=day and not self.lock.locked():
                try:
                    self.task('cycle'); self.store.set('last_cycle_day',day)
                except ValueError: pass
            elif s['mail_enabled'] and time.monotonic()-last_mail>300 and not self.lock.locked():
                try: self.task('inbox'); last_mail=time.monotonic()
                except ValueError: pass
