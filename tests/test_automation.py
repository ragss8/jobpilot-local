import json
import tempfile
import unittest
from unittest.mock import patch
from jobpilot.discovery import board_from_url, discover, query_plan, structured_jobs, employer_boards
from jobpilot.matching import evaluate
from jobpilot.service import DEFAULT_SETTINGS, Service
from jobpilot.tailoring import structured_resume
from jobpilot.transport import validate_public_url
from jobpilot.browser import answers_for
from test_core import profile, job


class DiscoveryTests(unittest.TestCase):
    def test_observed_linkedin_website_redirect_resolves_employer_board(self):
        pages={
            'https://www.linkedin.com/company/acme':'<a data-tracking-control-name="about_website" href="https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Facme.example%2F">Website</a>',
            'https://acme.example/':'<a href="/careers">Careers</a>',
            'https://acme.example/careers':'<a href="https://jobs.ashbyhq.com/acme">Jobs</a>'}
        found=employer_boards('https://www.linkedin.com/company/acme',fetch=lambda url:(pages[url],url))
        self.assertEqual(found,[{'provider':'ashby','slug':'acme','company':'acme'}])
    def test_search_plan_does_not_send_resume_or_contact_details(self):
        p=profile();plans=json.dumps(query_plan(p,DEFAULT_SETTINGS))
        for private in (p['email'],p['phone'],p['name'],p['resume_text']):self.assertNotIn(private,plans)
        self.assertIn('React',plans)
    def test_ats_boards_come_only_from_supported_hosts(self):
        self.assertEqual(board_from_url('https://jobs.lever.co/acme/123')['slug'],'acme')
        self.assertIsNone(board_from_url('https://jobs.lever.co.evil.example/acme/123'))
        self.assertIsNone(board_from_url('https://jobs.ashbyhq.com/../secret'))
    def test_jsonld_nested_posting_and_expiry(self):
        node={'@type':'JobPosting','title':'Full Stack Engineer','description':'React and Node.js. '*20,
              'hiringOrganization':{'name':'Acme'},'jobLocation':{'address':{'addressLocality':'Bengaluru','addressCountry':'India'}},
              'baseSalary':{'currency':'INR','value':{'unitText':'YEAR','maxValue':2000000}}}
        html='<script type="application/ld+json">'+json.dumps({'@graph':[node]})+'</script>'
        jobs,_=structured_jobs(html,'https://careers.example.com/job/1')
        self.assertEqual(jobs[0]['salary_max_lpa'],20)
        self.assertIn('Bengaluru',jobs[0]['location']);self.assertTrue(jobs[0]['verified_public_posting'])
        node['validThrough']='2020-01-01'
        self.assertEqual(structured_jobs('<script type="application/ld+json">'+json.dumps(node)+'</script>','https://example.com/job')[0],[])
    def test_search_noise_cannot_consume_page_budget(self):
        rss='<rss><channel><item><link>https://unrelated.example/court</link></item></channel></rss>'
        calls=[]
        def fetch(url):calls.append(url);return rss,url
        result=discover(profile(),dict(DEFAULT_SETTINGS,discovery_sources=['employers']),fetch=fetch)
        self.assertEqual(result['jobs'],[])
        self.assertTrue(all('bing.com' in u for u in calls))
        self.assertEqual(result['sources'][0]['status'],'no_public_results')
    def test_private_and_redirect_destinations_rejected(self):
        for url in ('http://example.com','https://user:pass@example.com','https://example.com:8000'):
            with self.assertRaises(ValueError):validate_public_url(url)
        with patch('jobpilot.transport.socket.getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(ValueError):validate_public_url('https://public-looking.example')


class ContextualMatchingTests(unittest.TestCase):
    def test_cloud_alternatives_are_one_requirement(self):
        p=dict(profile(),resume_text='React AWS')
        m=evaluate(p,job(desc='React required.\nCloud: AWS, Azure or GCP.'),DEFAULT_SETTINGS)
        self.assertEqual(m['score'],100);self.assertEqual(m['missing'],[])
    def test_and_requirements_are_not_collapsed(self):
        p=dict(profile(),resume_text='React AWS')
        m=evaluate(p,job(desc='React required.\nAWS and Azure required.'),DEFAULT_SETTINGS)
        self.assertEqual(m['score'],66.7);self.assertIn('Azure',m['missing'])
    def test_mixed_stack_slash_does_not_make_typescript_optional(self):
        p=dict(profile(),resume_text='React')
        m=evaluate(p,job(desc='React/TypeScript required.'),DEFAULT_SETTINGS)
        self.assertEqual(m['score'],50)
    def test_required_security_and_testing_stay_visible(self):
        m=evaluate(profile(),job(desc='React, OAuth and PyTest required.'),DEFAULT_SETTINGS)
        self.assertEqual(m['required_missing'],['OAuth','PyTest'])


class TailoringTests(unittest.TestCase):
    def test_reordering_never_moves_bullets_to_another_employer(self):
        original='SUMMARY\nEngineer building products.\nTECHNICAL SKILLS\nReact, Node.js\nEXPERIENCE\nAcme | 2024–Present\nBuilt React interfaces for 43 vehicles.\nDesigned Node.js APIs for field operations.\nBeta | 2022–2024\nBuilt React analytics for 150 branches.\nEDUCATION\nB.E. Computer Science, 2022'
        layout=structured_resume(dict(profile(),resume_text=original),job(desc='Node.js required.'))
        self.assertLess(layout['text'].index('Designed Node.js'),layout['text'].index('Built React interfaces'))
        self.assertLess(layout['text'].index('Built React interfaces'),layout['text'].index('Beta |'))
        for line in original.splitlines()[6:]:self.assertIn(line,layout['text'])
        self.assertNotIn('Next.js',layout['text'])
    def test_ambiguous_source_layout_uses_original_fallback(self):
        self.assertIsNone(structured_resume(profile(),job()))
    def test_application_answer_aliases_preserve_confirmed_values(self):
        p=dict(profile(),name='M Raghu Gaikwad',answers={'Notice Period (In Days)':'15','Expected CTC (In Lakhs - INR)':'15'})
        answers=answers_for(p)
        self.assertEqual(answers['first name'],'M Raghu');self.assertEqual(answers['last name'],'Gaikwad')
        self.assertEqual(answers['notice period'],'15');self.assertEqual(answers['expected ctc'],'15')
        self.assertNotIn('are you legally authorized to work in the united states?',answers)


class PipelineTests(unittest.TestCase):
    def test_discovery_persists_jobs_and_deduplicates_boards(self):
        with tempfile.TemporaryDirectory() as folder:
            service=Service(folder);service.save_profile(profile())
            board={'provider':'lever','slug':'acme','company':'Acme'}
            result={'jobs':[job()],'boards':[board,board],'sources':[],'queries':[]}
            with patch('jobpilot.service.discover',return_value=result):service.discover()
            self.assertEqual(len(service.store.jobs()),1)
            self.assertEqual(service.settings()['boards'],[board])
    def test_cycle_can_discover_without_manually_added_boards(self):
        with tempfile.TemporaryDirectory() as folder:
            service=Service(folder);service.save_profile(profile())
            with patch.object(service,'discover',return_value={'jobs':0}) as discovery:
                result=service.cycle()
            discovery.assert_called_once();self.assertEqual(result['applications'],[])


if __name__=='__main__':unittest.main()
