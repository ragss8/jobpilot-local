"""Real Chromium integration against intercepted fixtures, never real employers."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from jobpilot.browser import run_application
from jobpilot.db import Store
from jobpilot.resume import fingerprint
from test_core import profile,job


@unittest.skipUnless(os.environ.get('JOBPILOT_BROWSER_TESTS')=='1','Set JOBPILOT_BROWSER_TESTS=1 for isolated real-browser fixtures')
class BrowserFlowTests(unittest.TestCase):
    def run_fixture(self,extra='',auto_submit=True,confirmation='Your application has been submitted',answers=None,preflight_only=False):
        from playwright.sync_api import sync_playwright
        submissions=[]
        html='''<html><body><h1>Fixture application</h1><form onsubmit="event.preventDefault();fetch('/fixture-submit',{method:'POST'}).then(r=>r.text()).then(t=>document.body.textContent=t)">
        <label>First name<input name="first_name" required></label>
        <label>Last name<input name="last_name" required></label>
        <label>Email<input name="email" type="email" required></label>
        <label>Phone<input name="phone" required></label>
        <label>Notice Period (In Days)<input name="notice" required></label>
        <label>Resume<input name="resume" type="file" required></label>'''+extra+'''<button type="submit">Submit application</button></form></body></html>'''
        class PageProxy:
            def __init__(self,page):self.page=page
            def __getattr__(self,name):return getattr(self.page,name)
            def goto(self,url,**kwargs):
                def fixture(route):
                    if route.request.method=='POST':
                        submissions.append(route.request.url)
                        route.fulfill(status=200,content_type='text/plain',body=confirmation)
                    else:route.fulfill(status=200,content_type='text/html',body=html)
                self.page.route('**/*',fixture)
                return self.page.goto(url,**kwargs)
        class ContextProxy:
            def __init__(self,context):self.context=context
            def new_page(self):return PageProxy(self.context.new_page())
        class BrowserProxy:
            def __init__(self,browser):self.browser=browser
            def new_context(self,**kwargs):return ContextProxy(self.browser.new_context(**kwargs))
            def close(self):return self.browser.close()
        class ChromiumProxy:
            def __init__(self,chromium):self.chromium=chromium
            def launch(self,**kwargs):return BrowserProxy(self.chromium.launch(**kwargs))
        class RuntimeProxy:
            def __enter__(self):
                self.manager=sync_playwright();self.runtime=self.manager.__enter__()
                self.chromium=ChromiumProxy(self.runtime.chromium);return self
            def __exit__(self,*args):return self.manager.__exit__(*args)
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory);store.set('settings',{'auto_submit':auto_submit})
            p=dict(profile(),answers={'Notice Period (In Days)':'15',**(answers or {})})
            j=job();j['url']='https://jobs.lever.co/fixture/000'
            folder=Path(directory)/'packets'/j['id'];folder.mkdir(parents=True)
            (folder/'resume.pdf').write_bytes(b'%PDF-1.4\n%%EOF')
            packet={'fingerprint':fingerprint(p,j),'formats':['pdf']}
            with patch('playwright.sync_api.sync_playwright',RuntimeProxy):
                result=run_application(store,j,p,packet,{'headless':True,'browser_channel':'chrome','preflight_only':preflight_only})
            return result,submissions
    def test_known_answers_upload_and_confirmed_submit(self):
        result,submissions=self.run_fixture()
        self.assertEqual(result[0],'submitted');self.assertEqual(len(submissions),1)
    def test_unanswered_required_question_prevents_submission(self):
        result,submissions=self.run_fixture('<label>Unprovided personal answer<input required></label>')
        self.assertEqual(result[0],'needs_input');self.assertEqual(submissions,[])
    def test_pause_prevents_submission_after_preparation(self):
        result,submissions=self.run_fixture(auto_submit=False)
        self.assertEqual(result[0],'needs_input');self.assertEqual(submissions,[])

    def test_required_custom_group_without_answer_prevents_submission(self):
        result,submissions=self.run_fixture('''<fieldset aria-required="true"><legend>Unprovided sponsorship question</legend>
            <label><input type="radio" name="sponsorship">Yes</label><label><input type="radio" name="sponsorship">No</label></fieldset>''')
        self.assertEqual(result[0],'needs_input');self.assertIn('Unprovided sponsorship',result[1]);self.assertEqual(submissions,[])

    def test_exact_answer_selects_radio_in_its_question_group(self):
        result,submissions=self.run_fixture('''<fieldset aria-required="true"><legend>Notice Period (In Days)</legend>
            <label><input type="radio" name="notice-choice" required>15</label><label><input type="radio" name="notice-choice" required>30</label></fieldset>''')
        self.assertEqual(result[0],'submitted');self.assertEqual(len(submissions),1)

    def test_preflight_never_submits_even_when_automation_enabled(self):
        result,submissions=self.run_fixture(preflight_only=True)
        self.assertEqual(result[0],'prepared');self.assertEqual(submissions,[])

    def test_selected_react_combobox_is_valid_with_empty_search_input(self):
        result,submissions=self.run_fixture('''<div class="select__control"><input aria-label="Degree" role="combobox" aria-required="true" oninput="document.querySelector('#choice').hidden=false">
            <div id="choice" role="option" hidden onclick="this.parentElement.querySelector('input').value='';this.outerHTML='<span class=select__single-value>Bachelor of Engineering</span>'">Bachelor of Engineering</div></div>''',answers={'Degree':'Bachelor of Engineering'})
        self.assertEqual(result[0],'submitted');self.assertEqual(len(submissions),1)


if __name__=='__main__':unittest.main()
