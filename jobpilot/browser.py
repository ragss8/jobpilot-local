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
    name=profile.get('name','').strip(); first,_,last=name.rpartition(' ')
    if not first:first=name;last=''
    answers={k:profile.get(v,'') for k,v in {'full name':'name','name':'name','email':'email','email address':'email',
             'phone':'phone','phone number':'phone','current company':'current_company','current location':'location',
             'linkedin':'linkedin','linkedin profile':'linkedin','github':'github','github url':'github','portfolio':'portfolio'}.items()}
    answers.update({'first name':first,'last name':last})
    # Exact, explicitly supplied answers are the only source for custom questions.
    answers.update({label_key(k):v for k,v in profile.get('answers',{}).items()})
    aliases={
        'notice period (in days)': ['notice period','notice period in days','notice period (days)'],
        'current ctc (in lakhs - inr)': ['current ctc','current ctc (lpa)','current salary (lpa)'],
        'expected ctc (in lakhs - inr)': ['expected ctc','expected ctc (lpa)','expected salary (lpa)'],
        'linkedin profile': ['linkedin url','linkedin profile url'],
        'current designation': ['current job title','current title'],
        'location (city)': ['city','location','location preference'],
        'website': ['personal website','portfolio url']}
    for source,targets in aliases.items():
        if source in answers:
            for target in targets:answers.setdefault(target,answers[source])
    return answers


def challenge_present(page):
    challenges=page.locator('iframe[title*="challenge" i], iframe[src*="hcaptcha"], input[type="password"], [data-testid="challenge-page"]')
    return any(challenges.nth(i).is_visible() for i in range(challenges.count()))


def choose_custom(page,control,value):
    choices=[str(value)]
    if value=='Bachelor of Engineering':choices=["Bachelor's Degree",str(value)]
    control.click();control.fill('')
    try:page.get_by_role('option').first.wait_for(state='visible',timeout=4000)
    except Exception:pass
    # Static taxonomies already expose choices; avoid replacing them with a search.
    for choice in choices:
        options=page.get_by_role('option',name=choice,exact=True)
        if options.count()==1 and options.is_visible():
            options.click();return True
    for choice in choices:
        control.click();control.fill(choice)
        options=page.get_by_role('option',name=choice,exact=True)
        try:options.wait_for(state='visible',timeout=4000)
        except Exception:continue
        if options.count()==1:
            options.click();return True
    return False


def public_host(host):
    try:
        addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
        return bool(addresses) and all(ipaddress.ip_address(x[4][0]).is_global for x in addresses)
    except OSError: return False


def fill_question_groups(page, values):
    """Handle observed Ashby and accessible radio groups with exact saved answers."""
    unknown=[]
    groups=page.locator('fieldset, [role="radiogroup"], .ashby-application-form-field-entry:has(.ashby-application-form-input-yesno)')
    for i in range(groups.count()):
        group=groups.nth(i)
        if not group.is_visible():continue
        labels=group.locator('legend, .ashby-application-form-question-title')
        label=labels.first.inner_text() if labels.count() else group.get_attribute('aria-label') or ''
        if not label:continue
        required=group.evaluate('''e=>e.getAttribute('aria-required')==='true' || !!e.querySelector('[required], [aria-required="true"], .ashby-application-form-question-title[class*="_required_"]')''')
        value=values.get(label_key(label))
        options=group.get_by_role('radio',name=str(value),exact=True) if value is not None else None
        if options is not None and options.count()==1:options.check()
        elif value is not None:
            buttons=group.get_by_role('button',name=str(value),exact=True)
            if buttons.count()==1:buttons.click()
            elif required:unknown.append(label+' (no exact option)')
        elif required:unknown.append(label)
    return unknown


def run_application(store, job, profile, packet, settings):
    host=urlsplit(job['url']).hostname
    aggregator=any(x in (host or '').split('.') for x in ('linkedin','naukri','indeed'))
    if host not in ATS_HOSTS and (not job.get('verified_public_posting') or aggregator):
        return 'needs_input','This posting requires a job-board account or a verified employer application link. Discovery will continue with other employers.'
    if packet['fingerprint']!=fingerprint(profile,job):
        return 'needs_input','Profile or job changed. Prepare an updated resume first.'
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return 'needs_input','Install optional dependencies and run: python -m playwright install chromium'
    folder=store.directory/'packets'/job['id']
    resume=next((folder/f'resume.{ext}' for ext in ('pdf','docx') if ext in packet['formats']),None)
    if not resume: return 'needs_input','PDF or DOCX export is required for browser applications. Install optional dependencies.'
    clicked=False;stage='opening employer page'
    try:
        with sync_playwright() as p:
            options={'headless':settings.get('headless',False)}
            if settings.get('browser_channel')=='chrome':options['channel']='chrome'
            browser=p.chromium.launch(**options)
            context=browser.new_context(accept_downloads=False)
            public_cache={}
            def guard(route):
                url=urlsplit(route.request.url)
                if url.scheme in ('data','blob'): return route.continue_()
                if url.scheme!='https' or url.port not in (None,443) or not url.hostname:
                    return route.abort()
                if url.hostname not in public_cache: public_cache[url.hostname]=public_host(url.hostname)
                if not public_cache[url.hostname]: return route.abort()
                if route.request.is_navigation_request() and route.request.frame==page.main_frame and url.hostname not in ATS_HOSTS|{host}:
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
            if challenge_present(page):
                return 'needs_input','An active verification challenge or login requires account access. Other employers will continue.'
            if not page.locator('input[type="email"], input[name="email"]').count():
                apply=page.get_by_role('link',name=re.compile(r'^apply (?:now|for this job)$',re.I))
                if apply.count()==1:
                    apply.click(); page.wait_for_timeout(1200)
            values=answers_for(profile); unknown=[]; uploaded=False
            controls=page.locator('input:not([type="hidden"]), textarea, select').element_handles()
            # Resolve required visible questions before optional autocomplete widgets.
            controls.sort(key=lambda c: not c.evaluate("e=>(e.required || e.getAttribute('aria-required')==='true') && e.getAttribute('aria-hidden')!=='true'"))
            for i,control in enumerate(controls):
                stage=f'reading form control {i+1}'
                if not control.evaluate('e=>e.isConnected'):continue
                meta=control.evaluate('''e => ({tag:e.tagName.toLowerCase(),type:e.type,name:e.name,id:e.id,
                    label:[...(e.labels||[])].map(l=>l.textContent).join(' ').trim() || e.getAttribute('aria-label') || e.placeholder || e.name,
                    required:e.required || e.getAttribute('aria-required')==='true', value:e.value, disabled:e.disabled,
                    visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)})''')
                if meta['disabled']: continue
                key=label_key(meta['label']); typ=meta['type']
                stage='filling '+(meta['label'] or meta['id'] or 'unlabelled control')[:160]
                if typ=='file':
                    if re.search(r'resume|résumé|cv',key,re.I) or meta['id'] in ('resume','_systemfield_resume'):
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
                        if not choose_custom(page,control,value):
                            control.fill('');control.press('Escape')
                            if meta['required']:unknown.append(meta['label']+' (no exact dropdown option)')
                    else: control.fill(str(value))
                elif meta['required'] and not meta['value']: unknown.append(meta['label'])
            stage='checking required question groups'
            unknown.extend(fill_question_groups(page,values))
            # Re-check native validation and custom required widgets after fills.
            invalid=page.locator('input:invalid, textarea:invalid, select:invalid, input[aria-required="true"], textarea[aria-required="true"], select[aria-required="true"], [role="combobox"][aria-required="true"]')
            for i in range(invalid.count()):
                field=invalid.nth(i)
                if not field.is_visible(): continue
                bad=field.evaluate('''e => {
                    const selected=e.closest('.select__control')?.querySelector('.select__single-value, .select__multi-value');
                    return e.matches(':invalid') || (e.getAttribute('aria-required')==='true' && !(e.value || e.getAttribute('aria-valuetext') || selected?.textContent));
                }''')
                if bad: unknown.append(field.get_attribute('aria-label') or field.get_attribute('name') or 'Required form field')
            if not uploaded: unknown.append('Resume upload could not be identified')
            evidence=store.directory/'evidence'; evidence.mkdir(exist_ok=True)
            page.screenshot(path=str(evidence/f'{job["id"]}-filled.png'),full_page=True)
            if unknown: return 'needs_input','Missing or unsupported fields: '+', '.join(dict.fromkeys(unknown))[:1200]
            if challenge_present(page):
                return 'needs_input','Active verification challenge before submission. Other employers will continue.'
            if settings.get('preflight_only'):
                return 'prepared','Required fields and resume upload verified without clicking submit. Screenshot saved locally.'
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
                result_text=page.locator('body').inner_text()
                if re.search(r"we couldn.t submit your application",result_text,re.I) and re.search(r'flagged as possible spam',result_text,re.I):
                    return 'needs_input','Employer explicitly rejected submission as possible spam. No confirmed application; saved screenshot. Automatic retry is disabled for this posting.'
                return 'uncertain','Submit was clicked but confirmation was not verified. Check the employer portal before any retry.'
            page.screenshot(path=str(evidence/f'{job["id"]}-submitted.png'),full_page=True)
            browser.close()
            return 'submitted','Employer confirmation text was observed after submitting. Evidence saved locally.'
    except Exception as exc:
        # Do not store arbitrary browser exception details which may contain form values.
        return ('uncertain' if clicked else 'needs_input'),('Submission outcome is uncertain; check employer portal.' if clicked else f'Browser could not complete the form ({type(exc).__name__} while {stage}). No submit click occurred.')
