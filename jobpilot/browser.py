"""Local visible-browser adapter. No stealth, CAPTCHA solving, or credential capture."""
import ipaddress
import re
import socket
from urllib.parse import urlsplit
from .resume import fingerprint

ATS_HOSTS={'jobs.lever.co','jobs.eu.lever.co','boards.greenhouse.io','job-boards.greenhouse.io','jobs.ashbyhq.com'}
SUCCESS=[r'your application has been (?:submitted|received)',r'thank you for applying',r'thanks for applying',r'application submitted successfully']


def label_key(text):
    return re.sub(r'\s+',' ',re.sub(r'[*:]+','',text)).strip().casefold()


def answers_for(profile):
    name=profile.get('name','').strip(); first,_,last=name.partition(' ')
    answers={k:profile.get(v,'') for k,v in {'full name':'name','name':'name','email':'email','email address':'email',
             'phone':'phone','phone number':'phone','current company':'current_company','current location':'location',
             'linkedin':'linkedin','linkedin profile':'linkedin','github':'github','github url':'github','portfolio':'portfolio'}.items()}
    answers.update({'first name':first,'last name':last})
    # Exact, explicitly supplied answers are the only source for custom questions.
    answers.update({label_key(k):v for k,v in profile.get('answers',{}).items()})
    return answers


def public_host(host):
    try:
        addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
        return bool(addresses) and all(ipaddress.ip_address(x[4][0]).is_global for x in addresses)
    except OSError: return False


def run_application(store, job, profile, packet, settings):
    host=urlsplit(job['url']).hostname
    if host not in ATS_HOSTS:
        return 'needs_input','This employer uses an unsupported form. Open the original job and use the prepared resume.'
    if packet['fingerprint']!=fingerprint(profile,job):
        return 'needs_input','Profile or job changed. Prepare an updated resume first.'
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return 'needs_input','Install optional dependencies and run: python -m playwright install chromium'
    folder=store.directory/'packets'/job['id']
    resume=next((folder/f'resume.{ext}' for ext in ('pdf','docx') if ext in packet['formats']),None)
    if not resume: return 'needs_input','PDF or DOCX export is required for browser applications. Install optional dependencies.'
    clicked=False
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=settings.get('headless',False))
            context=browser.new_context(accept_downloads=False)
            public_cache={}
            def guard(route):
                url=urlsplit(route.request.url)
                if url.scheme in ('data','blob'): return route.continue_()
                if url.scheme!='https' or url.port not in (None,443) or not url.hostname:
                    return route.abort()
                if url.hostname not in public_cache: public_cache[url.hostname]=public_host(url.hostname)
                if not public_cache[url.hostname]: return route.abort()
                if route.request.is_navigation_request() and route.request.frame==page.main_frame and url.hostname not in ATS_HOSTS:
                    return route.abort()
                return route.continue_()
            page=context.new_page(); page.route('**/*',guard)
            page.set_default_timeout(8000)
            response=page.goto(job['url'],wait_until='domcontentloaded',timeout=45000)
            if response and response.status>=400: return 'needs_input',f'Employer page returned HTTP {response.status}'
            page.wait_for_timeout(1800)
            body=page.locator('body').inner_text()
            if re.search(r'job (?:is no longer|has been filled)|position (?:is no longer available|has been filled)',body,re.I):
                return 'closed','The employer page says the position is closed.'
            # CAPTCHA components may be present invisibly; pause rather than guessing their state.
            if page.locator('iframe[src*="captcha"], [class*="captcha"], [id*="captcha"], input[type="password"]').count():
                return 'needs_input','CAPTCHA or login found. Continue directly on the employer site.'
            if not page.locator('input[type="email"], input[name="email"]').count():
                apply=page.get_by_role('link',name=re.compile(r'^apply (?:now|for this job)$',re.I))
                if apply.count()==1:
                    apply.click(); page.wait_for_timeout(1200)
            values=answers_for(profile); unknown=[]; uploaded=False
            controls=page.locator('input:not([type="hidden"]), textarea, select')
            for i in range(controls.count()):
                control=controls.nth(i)
                meta=control.evaluate('''e => ({tag:e.tagName.toLowerCase(),type:e.type,name:e.name,
                    label:[...(e.labels||[])].map(l=>l.textContent).join(' ').trim() || e.getAttribute('aria-label') || e.placeholder || e.name,
                    required:e.required || e.getAttribute('aria-required')==='true', value:e.value, disabled:e.disabled,
                    visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)})''')
                if meta['disabled']: continue
                key=label_key(meta['label']); typ=meta['type']
                if typ=='file':
                    if re.search(r'resume|résumé|cv',key,re.I):
                        control.set_input_files(str(resume)); uploaded=True
                    elif meta['required']: unknown.append(meta['label'])
                    continue
                if not meta['visible'] or typ in ('submit','button','reset'): continue
                value=values.get(key)
                if value is None and meta['name'] in ('email','phone','name','first_name','last_name'):
                    value=values.get(label_key(meta['name'].replace('_',' ')))
                if typ in ('checkbox','radio'):
                    if typ=='checkbox' and isinstance(value,bool): control.set_checked(value)
                    elif typ=='radio' and value is not None and str(value)==meta['value']: control.check()
                    continue
                if value is not None and str(value).strip():
                    if meta['tag']=='select': control.select_option(label=str(value))
                    elif control.get_attribute('role')=='combobox':
                        unknown.append(meta['label']+' (custom dropdown)')
                    else: control.fill(str(value))
                elif meta['required'] and not meta['value']: unknown.append(meta['label'])
            # Re-check native validation and custom required widgets after fills.
            invalid=page.locator('input:invalid, textarea:invalid, select:invalid, [aria-required="true"]')
            for i in range(invalid.count()):
                field=invalid.nth(i)
                if not field.is_visible(): continue
                bad=field.evaluate('e => e.matches(":invalid") || (e.getAttribute("aria-required")==="true" && !(e.value || e.getAttribute("aria-valuetext")))')
                if bad: unknown.append(field.get_attribute('aria-label') or field.get_attribute('name') or 'Required form field')
            if not uploaded: unknown.append('Resume upload could not be identified')
            evidence=store.directory/'evidence'; evidence.mkdir(exist_ok=True)
            page.screenshot(path=str(evidence/f'{job["id"]}-filled.png'),full_page=True)
            if unknown: return 'needs_input','Missing or unsupported fields: '+', '.join(dict.fromkeys(unknown))[:1200]
            if page.locator('iframe[src*="captcha"], [class*="captcha"], [id*="captcha"]').count():
                return 'needs_input','CAPTCHA found before submit. Complete the application in your browser.'
            if not store.get('settings',{}).get('auto_submit'):
                return 'needs_input','Automatic submission is paused. Form was prepared; screenshot is saved locally.'
            submit=page.get_by_role('button',name=re.compile(r'^(submit application|submit your application|submit|apply)$',re.I))
            if submit.count()!=1: return 'needs_input','Could not identify a single submission button.'
            before=page.locator('body').inner_text()
            if any(re.search(x,before,re.I) for x in SUCCESS):
                return 'needs_input','Confirmation text already present before submission; check employer portal.'
            clicked=True
            submit.click()
            try:
                page.get_by_text(re.compile('|'.join(SUCCESS),re.I)).first.wait_for(state='visible',timeout=15000)
            except Exception:
                page.screenshot(path=str(evidence/f'{job["id"]}-uncertain.png'),full_page=True)
                return 'uncertain','Submit was clicked but confirmation was not verified. Check the employer portal before any retry.'
            page.screenshot(path=str(evidence/f'{job["id"]}-submitted.png'),full_page=True)
            browser.close()
            return 'submitted','Employer confirmation text was observed after submitting. Evidence saved locally.'
    except Exception as exc:
        # Do not store arbitrary browser exception details which may contain form values.
        return ('uncertain' if clicked else 'needs_input'),('Submission outcome is uncertain; check employer portal.' if clicked else f'Browser could not complete the form ({type(exc).__name__}). Check browser installation or complete manually.')
