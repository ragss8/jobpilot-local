import base64,json,tempfile,threading,unittest
from unittest.mock import patch
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from pathlib import Path
from jobpilot.db import Store
from jobpilot.matching import evaluate,skills
from jobpilot.sources import normalize,fetch_board,canonical_url
from jobpilot.service import Service,DEFAULT_SETTINGS,DEFAULT_PROFILE
from jobpilot.resume import build_packet,extract_upload,fingerprint
from jobpilot.mailbox import classify
from jobpilot.server import Server

RESUME='Alex Example\nSoftware Engineer\nExample Company | 2022-2025\nBuilt React and TypeScript interfaces backed by Node.js and PostgreSQL.\nImplemented Docker deployments and REST APIs.\nEducation: BEng Computer Science, 2022.'
def job(i=1,company='Example Company',desc='React, TypeScript, Node.js, PostgreSQL, Docker and REST experience required.'):
    return normalize('manual',str(i),company,'Full Stack Engineer',f'https://careers.example.com/jobs/{i}',desc,'Bengaluru')
def profile():
    return dict(DEFAULT_PROFILE,name='Alex Example',email='alex@example.com',phone='+1 555 0100',years=3,resume_text=RESUME,verified=True)

class MatchingTests(unittest.TestCase):
    def test_aliases_and_word_boundaries(self):
        found=skills('JavaScript with react.js, postgres, C++, C# and dotnet')
        self.assertNotIn('Java',found)
        for s in ['React','C++','C#','PostgreSQL']:self.assertIn(s,found)
    def test_missing_skills_not_invented(self):
        m=evaluate(profile(),job(desc='React, TypeScript, Java and Spring Boot required.'),DEFAULT_SETTINGS)
        self.assertEqual(m['score'],50);self.assertEqual(m['missing'],['Java','Spring Boot']);self.assertFalse(m['eligible'])
    def test_strictly_more_than_eighty(self):
        m=evaluate(dict(profile(),resume_text='React TypeScript Node.js PostgreSQL'),job(desc='React TypeScript Node.js PostgreSQL Docker'),DEFAULT_SETTINGS)
        self.assertEqual(m['score'],80);self.assertFalse(m['eligible'])
    def test_optional_skills_half_weight(self):
        m=evaluate(profile(),job(desc='React TypeScript required.\nPython preferred.'),DEFAULT_SETTINGS)
        self.assertEqual(m['score'],80)
    def test_empty_requirements_cannot_score_100(self):
        m=evaluate(profile(),job(desc='A motivated person who works well with others.'),DEFAULT_SETTINGS)
        self.assertEqual(m['score'],0);self.assertFalse(m['eligible'])
    def test_experience_blocks(self):
        m=evaluate(profile(),job(desc='React required. Minimum 5+ years of experience.'),DEFAULT_SETTINGS)
        self.assertFalse(m['eligible']);self.assertTrue(any('5 years' in b for b in m['blockers']))
    def test_remote_does_not_assume_global_eligibility(self):
        j=job();j['location']='Remote - US only'
        self.assertFalse(evaluate(profile(),j,DEFAULT_SETTINGS)['eligible'])
    def test_bangalore_alias_and_unknown_salary(self):
        j=job();j['location']='Bangalore'
        self.assertTrue(evaluate(profile(),j,DEFAULT_SETTINGS)['eligible'])
        self.assertFalse(evaluate(profile(),j,dict(DEFAULT_SETTINGS,require_salary=True))['eligible'])

class StoreTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.s=Store(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_duplicate_url_is_upserted(self):
        j=job();self.s.upsert_job(j);j['description']='React';self.s.upsert_job(j)
        self.assertEqual(len(self.s.jobs()),1);self.assertEqual(self.s.job(j['id'])['description'],'React')
    def test_company_and_daily_cap(self):
        for i in range(3):self.s.upsert_job(job(i,company='Same' if i<2 else 'Other'))
        a=self.s.reserve(job(0)['id'],' Same ','2026-09-08',1);self.s.finish(a,job(0)['id'],'needs_input','Missing answer')
        with self.assertRaises(ValueError):self.s.reserve(job(1)['id'],'same','2026-09-08',25)
        with self.assertRaises(ValueError):self.s.reserve(job(2)['id'],'Other','2026-09-08',1)
    def test_uncertain_never_retried(self):
        j=job();self.s.upsert_job(j);a=self.s.reserve(j['id'],j['company'],'2026-09-08',25)
        self.s.finish(a,j['id'],'uncertain','Unknown outcome');self.s.status(j['id'],'new')
        with self.assertRaises(ValueError):self.s.reserve(j['id'],j['company'],'2026-09-09',25)
    def test_restart_recovers_uncertain(self):
        j=job();self.s.upsert_job(j);self.s.reserve(j['id'],j['company'],'2026-09-08',25)
        recovered=Store(self.temp.name)
        self.assertEqual(recovered.job(j['id'])['status'],'uncertain');self.assertEqual(recovered.rows('attempts')[0]['state'],'uncertain')
    def test_parallel_reservations_cannot_exceed_cap(self):
        for i in range(8):self.s.upsert_job(job(i,company=f'Company {i}'))
        outcomes=[]
        def reserve(i):
            try:self.s.reserve(job(i)['id'],f'Company {i}','2026-09-08',3);outcomes.append(True)
            except ValueError:outcomes.append(False)
        threads=[threading.Thread(target=reserve,args=(i,)) for i in range(8)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(sum(outcomes),3)

class ConnectorTests(unittest.TestCase):
    def test_greenhouse_html_and_structure(self):
        jobs=fetch_board({'provider':'greenhouse','slug':'example','company':'Example'},lambda url:{'jobs':[{'id':1,'title':'Engineer','absolute_url':'https://boards.greenhouse.io/example/jobs/1','content':'<p>React</p><script>bad()</script><p>Postgres</p>','location':{'name':'India'}}]})
        self.assertEqual(jobs[0]['description'],'React\nPostgres');self.assertEqual(jobs[0]['board'],'example')
    def test_lever_pagination_and_description_lists(self):
        calls=[]
        def fetch(url):
            calls.append(url);n=100 if 'skip=0' in url else 1
            return [{'id':f'{len(calls)}-{i}','text':'Engineer','applyUrl':f'https://jobs.lever.co/example/{len(calls)}-{i}/apply','categories':{'location':'India'},'descriptionPlain':'React','lists':[{'text':'Requirements','content':'<li>TypeScript</li>'}]} for i in range(n)]
        jobs=fetch_board({'provider':'lever','slug':'example','company':'Example'},fetch)
        self.assertEqual(len(jobs),101);self.assertEqual(len(calls),2);self.assertIn('TypeScript',jobs[0]['description'])
    def test_ashby_unlisted_ignored(self):
        self.assertEqual(fetch_board({'provider':'ashby','slug':'example','company':'Example'},lambda u:{'jobs':[{'isListed':False}]}),[])
    def test_slug_injection_and_unsafe_urls_rejected(self):
        with self.assertRaises(ValueError):fetch_board({'provider':'lever','slug':'../../x','company':'Example'})
        for u in ['javascript:alert(1)','http://localhost/a','https://user:pass@example.com','https://example.com:444/x']:
            with self.assertRaises(ValueError):canonical_url(u)
    def test_query_identifiers_are_preserved(self):
        self.assertNotEqual(canonical_url('https://example.com/careers?job=1'),canonical_url('https://example.com/careers?job=2'))

class ResumeTests(unittest.TestCase):
    def test_tailoring_preserves_evidence_and_employer_context(self):
        with tempfile.TemporaryDirectory() as d:
            p=build_packet(d,profile(),job());self.assertIn(RESUME,p['text'])
            for h in p['highlights']:self.assertIn(h,RESUME.splitlines())
            self.assertIn('txt',p['formats']);self.assertIn('html',p['formats'])
    def test_model_failure_falls_back(self):
        with tempfile.TemporaryDirectory() as d,patch('jobpilot.resume.prioritize',side_effect=ValueError('bad refs')):
            p=build_packet(d,profile(),job(),use_ai=True)
            self.assertEqual(p['mode'],'Evidence-only');self.assertIn('unavailable',p['note'])
    def test_html_is_escaped(self):
        with tempfile.TemporaryDirectory() as d:
            build_packet(d,dict(profile(),resume_text=RESUME+'\n<script>alert(1)</script>'),job())
            self.assertNotIn('<script>',(Path(d)/'packets'/job()['id']/'resume.html').read_text())
    def test_text_upload_and_fingerprint(self):
        self.assertEqual(extract_upload('resume.txt',base64.b64encode(RESUME.encode()).decode()),RESUME)
        self.assertNotEqual(fingerprint(profile(),job()),fingerprint(dict(profile(),phone='changed'),job()))

class MailTests(unittest.TestCase):
    def test_positive_signals(self):
        self.assertEqual(classify('Interview availability','Can we schedule your interview?'),'interview')
        self.assertEqual(classify('Application update','You have been shortlisted for the next stage'),'shortlisted')
    def test_rejection_beats_interview_keywords(self):
        self.assertEqual(classify('Interview feedback','Unfortunately we are not moving forward.'),'rejection')
        self.assertEqual(classify('Update','You have not been shortlisted'),'rejection')
    def test_unrelated_mail_not_flagged(self):self.assertIsNone(classify('Shopping','Your parcel is on the way'))

class ServiceTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.s=Service(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_limits_and_unverified_profile(self):
        for bad in [31,0,-1,2.5,True]:
            with self.assertRaises(ValueError):self.s.save_settings({'daily_limit':bad})
        with self.assertRaises(ValueError):self.s.save_settings({'auto_submit':True})
    def test_profile_change_pauses(self):
        self.s.save_profile(profile());self.s.save_settings({'auto_submit':True});self.s.save_profile({'phone':'new'})
        self.assertFalse(self.s.settings()['auto_submit'])
    def test_import_validates_whole_batch(self):
        with self.assertRaises(ValueError):self.s.import_jobs([job(),{'title':'invalid'}])
        self.assertEqual(self.s.store.jobs(),[])
    def test_failed_sync_preserves_jobs(self):
        j=job();j.update(source='lever',board='example');self.s.store.upsert_job(j)
        self.s.save_settings({'boards':[{'provider':'lever','slug':'example','company':'Example'}]})
        with patch('jobpilot.service.fetch_board',side_effect=OSError()):r=self.s.sync()
        self.assertEqual(len(r['errors']),1);self.assertEqual(self.s.store.job(j['id'])['status'],'new')
    def test_successful_sync_closes_missing_job(self):
        j=job();j.update(source='lever',board='example');self.s.store.upsert_job(j)
        self.s.save_settings({'boards':[{'provider':'lever','slug':'example','company':'Example'}]})
        with patch('jobpilot.service.fetch_board',return_value=[]):self.s.sync()
        self.assertEqual(self.s.store.job(j['id'])['status'],'closed')
    def test_imported_jobs_cannot_auto_submit(self):
        self.s.save_profile(profile());self.s.save_settings({'auto_submit':True});self.s.store.upsert_job(job())
        with self.assertRaisesRegex(ValueError,'Imported jobs'):self.s.apply(job()['id'])
    def test_confirmed_submission_audited_and_cannot_repeat(self):
        self.s.save_profile(profile());self.s.save_settings({'auto_submit':True})
        j=job();j.update(source='lever',board='example');self.s.store.upsert_job(j)
        with patch('jobpilot.service.fetch_board',return_value=[j]),patch('jobpilot.service.run_application',return_value=('submitted','Confirmed')):
            self.assertEqual(self.s.apply(j['id'])['status'],'submitted')
            with self.assertRaises(ValueError):self.s.apply(j['id'])
        self.assertEqual(len(self.s.store.rows('attempts')),1)
    def test_changed_live_requirements_prevent_send(self):
        self.s.save_profile(profile());self.s.save_settings({'auto_submit':True})
        j=job();j.update(source='lever',board='example');self.s.store.upsert_job(j)
        with patch('jobpilot.service.fetch_board',return_value=[dict(j,description='Java and Spring Boot required. 8 years of experience.')]),patch('jobpilot.service.run_application') as send:
            with self.assertRaises(ValueError):self.s.apply(j['id'])
            send.assert_not_called()

class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.service=Service(self.temp.name)
        self.server=Server(('127.0.0.1',0),self.service);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base=f'http://127.0.0.1:{self.server.server_port}'
    def tearDown(self):self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def request(self,path,body=None,headers=None):
        return urlopen(Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers or {}),timeout=5)
    def test_health_and_security_headers(self):
        with self.request('/api/health') as r:
            self.assertTrue(json.load(r)['local_only']);self.assertIn("frame-ancestors 'none'",r.headers['Content-Security-Policy'])
    def test_cross_origin_and_dns_rebinding_rejected(self):
        for h in [{'Origin':'https://evil.example'},{'Host':'evil.example'},{'Sec-Fetch-Site':'cross-site'}]:
            with self.assertRaises(HTTPError) as ctx:self.request('/api/state',headers=h)
            self.assertEqual(ctx.exception.code,403)
    def test_dashboard_link_from_another_site_opens(self):
        headers={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}
        for path in ('/','/?from=link'):
            with self.subTest(path=path),self.request(path,headers=headers) as r:
                self.assertEqual(r.status,200)
                self.assertIn('text/html',r.headers['Content-Type'])
                self.assertIn('JobPilot',r.read().decode())
    def test_cross_site_navigation_cannot_read_api_or_downloads(self):
        headers={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}
        for path in ('/api/session','/api/state','/api/health','/api/packets/'+'a'*20+'/resume.txt','/app.js'):
            with self.subTest(path=path),self.assertRaises(HTTPError) as ctx:self.request(path,headers=headers)
            self.assertEqual(ctx.exception.code,403)
    def test_cross_site_dashboard_fetches_and_frames_are_rejected(self):
        for extra in ({},{'Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'},
                      {'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'iframe'},
                      {'Sec-Fetch-Mode':'navigate'}, {'Sec-Fetch-Dest':'document'}):
            with self.subTest(headers=extra),self.assertRaises(HTTPError) as ctx:
                self.request('/',headers={'Sec-Fetch-Site':'cross-site',**extra})
            self.assertEqual(ctx.exception.code,403)
    def test_dashboard_navigation_still_validates_host_and_origin(self):
        headers={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}
        for extra in ({'Host':'evil.example'},{'Origin':'https://evil.example'}):
            with self.subTest(headers=extra),self.assertRaises(HTTPError) as ctx:
                self.request('/',headers={**headers,**extra})
            self.assertEqual(ctx.exception.code,403)
    def test_cross_site_post_rejected_even_with_valid_token(self):
        headers={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document',
                 'Content-Type':'application/json','X-JobPilot-Token':self.server.token}
        before=self.service.settings()['daily_limit']
        for path in ('/','/api/settings'):
            with self.subTest(path=path),self.assertRaises(HTTPError) as ctx:
                self.request(path,{'daily_limit':22},headers)
            self.assertEqual(ctx.exception.code,403)
        self.assertEqual(self.service.settings()['daily_limit'],before)
    def test_mutation_requires_token(self):
        with self.assertRaises(HTTPError) as ctx:self.request('/api/settings',{'daily_limit':22},{'Content-Type':'application/json'})
        self.assertEqual(ctx.exception.code,403)
        with self.request('/api/settings',{'daily_limit':22},{'Content-Type':'application/json','X-JobPilot-Token':self.server.token}) as r:self.assertEqual(json.load(r)['daily_limit'],22)
    def test_import_prepare_download_end_to_end(self):
        h={'Content-Type':'application/json','X-JobPilot-Token':self.server.token}
        with self.request('/api/profile',profile(),h):pass
        with self.request('/api/jobs/import',[job()],h):pass
        p=self.service.prepare(job()['id'])
        with self.request(p['download']['txt']) as r:self.assertIn(RESUME,r.read().decode())
        with self.request('/api/state') as r:self.assertEqual(json.load(r)['stats']['discovered'],1)

if __name__=='__main__':unittest.main()
