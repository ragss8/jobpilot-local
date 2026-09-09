import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from jobpilot.freshness import availability, relative_posted_at
from jobpilot.discovery import structured_jobs, linkedin_public
from jobpilot.service import Service
from test_core import job, profile

NOW=datetime(2026,9,9,10,tzinfo=timezone.utc)


class FreshnessTests(unittest.TestCase):
    def listing(self, hours=1, **extra):
        return dict(job(),source='linkedin',posted_at=(NOW-timedelta(hours=hours)).isoformat(),
                    active_verified_at=NOW.isoformat(),**extra)

    def test_exact_boundary_offsets_and_future_dates(self):
        self.assertTrue(availability(self.listing(24),NOW)['visible'])
        self.assertFalse(availability(self.listing(24.0001),NOW)['visible'])
        self.assertFalse(availability(self.listing(-1),NOW)['visible'])
        j=self.listing();j['posted_at']='2026-09-09T14:30:00+05:30'
        self.assertTrue(availability(j,NOW)['visible'])

    def test_unknown_naive_and_date_only_are_not_fresh(self):
        for date in (None,'2026-09-09','2026-09-09T09:00:00','bad'):
            j=self.listing();j['posted_at']=date
            self.assertFalse(availability(j,NOW)['visible'])

    def test_recent_discovery_never_renews_old_posting(self):
        j=self.listing(48,last_seen=NOW.isoformat())
        self.assertFalse(availability(j,NOW)['visible'])

    def test_active_company_openings_require_recent_verification_not_recent_publication(self):
        j=self.listing(500);j.update(source='greenhouse',board='example')
        self.assertTrue(availability(j,NOW)['visible'])
        j['active_verified_at']=(NOW-timedelta(hours=25)).isoformat()
        self.assertFalse(availability(j,NOW)['visible'])

    def test_closed_and_expired_are_hidden(self):
        self.assertFalse(availability(self.listing(status='closed'),NOW)['visible'])
        self.assertFalse(availability(self.listing(valid_through=NOW.isoformat()),NOW)['visible'])

    def test_relative_age_uses_conservative_rounding(self):
        self.assertEqual(relative_posted_at('23 hours ago',NOW),(NOW-timedelta(hours=24)).isoformat())
        self.assertEqual(relative_posted_at('24 hours ago',NOW),(NOW-timedelta(hours=25)).isoformat())
        self.assertIsNone(relative_posted_at('Recently',NOW))

    def test_linkedin_date_only_uses_main_posting_age_not_related_jobs(self):
        node={'@type':'JobPosting','title':'Engineer','description':'React required. '*20,
              'datePosted':'2026-09-09','hiringOrganization':{'name':'Example'}}
        html='<script type="application/ld+json">'+json.dumps(node)+'</script><span class="posted-time-ago__text">2 hours ago</span><time>1 minute ago</time>'
        jobs,_=structured_jobs(html,'https://in.linkedin.com/jobs/view/example-1')
        self.assertTrue(availability(jobs[0])['visible'])

    def test_linkedin_search_requests_one_day(self):
        urls=[]
        linkedin_public('Engineer','Bengaluru',fetch=lambda url:(urls.append(url) or '',url))
        self.assertIn('r86400',urls[0]);self.assertNotIn('r604800',urls[0])

    def test_linkedin_old_visible_age_overrides_recent_structured_date(self):
        current=datetime.now(timezone.utc)
        node={'@type':'JobPosting','title':'Engineer','description':'React required. '*20,
              'datePosted':current.isoformat(),'hiringOrganization':{'name':'Example'}}
        html='<script type="application/ld+json">'+json.dumps(node)+'</script><span class="posted-time-ago__text">2 days ago</span>'
        jobs,_=structured_jobs(html,'https://in.linkedin.com/jobs/view/example-1')
        self.assertFalse(availability(jobs[0])['visible'])

    def test_cached_ranking_expires_and_history_survives(self):
        with tempfile.TemporaryDirectory() as folder:
            s=Service(folder);s.save_profile(profile());s.save_settings({'fresh_only':True})
            j=self.listing(23);s.store.upsert_job(j);s.store.status(j['id'],'submitted')
            with patch('jobpilot.service.availability',side_effect=lambda j:availability(j,NOW)):
                self.assertEqual(len(s.state()['jobs']),1)
            with patch('jobpilot.service.availability',side_effect=lambda j:availability(j,NOW+timedelta(hours=2))):
                state=s.state();self.assertEqual(state['jobs'],[])
                self.assertEqual(state['stats']['submitted'],1)
                self.assertEqual(state['history_jobs'][0]['id'],j['id'])

    def test_stale_listing_is_rejected_before_model_or_browser(self):
        with tempfile.TemporaryDirectory() as folder:
            s=Service(folder);s.save_profile(profile());s.save_settings({'fresh_only':True,'auto_submit':True})
            j=self.listing(72,verified_public_posting=True);s.store.upsert_job(j)
            with patch('jobpilot.service.refresh_public_job',return_value=j),patch('jobpilot.service.run_application') as browser:
                with self.assertRaises(ValueError):s.apply(j['id'])
                browser.assert_not_called()
            self.assertEqual(s.store.rows('attempts'),[])


if __name__=='__main__':unittest.main()
