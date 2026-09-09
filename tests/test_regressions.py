import tempfile,unittest,json
from pathlib import Path
from jobpilot.db import Store
from jobpilot.locking import data_lock
from jobpilot.sources import normalize
from jobpilot.service import Service
from test_core import job,profile
import test_core

class RegressionTests(unittest.TestCase):
    def test_manual_to_feed_updates_provider_identity(self):
        with tempfile.TemporaryDirectory() as d:
            s=Store(d);j=job();s.upsert_job(j)
            feed=dict(j,source='lever',source_key='example:123',board='example');s.upsert_job(feed)
            changed=dict(feed,url='https://jobs.lever.co/example/123/apply',id='new-url-derived-id');jid=s.upsert_job(changed)
            self.assertEqual(len(s.jobs()),1);self.assertEqual(jid,j['id']);self.assertEqual(s.job(jid)['url'],changed['url'])
    def test_second_process_lock_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with data_lock(d):
                with self.assertRaises(ValueError):
                    with data_lock(d):pass
            with data_lock(d):pass
    def test_profile_change_marks_packet_stale(self):
        with tempfile.TemporaryDirectory() as d:
            s=Service(d);s.save_settings({'structured_tailoring':False});s.save_profile(profile());s.store.upsert_job(job());s.prepare(job()['id'])
            self.assertFalse(s.packet(job()['id'])['stale'])
            s.save_profile({'phone':'changed'})
            self.assertTrue(s.packet(job()['id'])['stale'])
    def test_job_import_is_blocked_during_worker(self):
        with tempfile.TemporaryDirectory() as d:
            s=Service(d)
            with s.lock:
                with self.assertRaises(ValueError):s.import_jobs([job()])

class ManualSubmissionTests(unittest.TestCase):
    setUp=test_core.HTTPTests.setUp
    tearDown=test_core.HTTPTests.tearDown
    request=test_core.HTTPTests.request
    # Exercise the HTTP mutation that affects quota and duplicate handling.
    def test_manual_submit_counts_budget_once(self):
        self.service.store.upsert_job(job())
        h={'Content-Type':'application/json','X-JobPilot-Token':self.server.token}
        for _ in range(2):
            with self.request('/api/jobs/status',{'job_id':job()['id'],'status':'submitted'},h):pass
        self.assertEqual(self.service.state()['stats']['today'],1)
        self.assertEqual(len(self.service.store.rows('attempts')),1)

if __name__=='__main__':unittest.main()
