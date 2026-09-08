"""Resume-led public discovery. Access challenges are reported, never bypassed."""
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.parse import quote, urlencode, urljoin, urlsplit
from .matching import skills
from .sources import canonical_url, normalize, plain, fetch_board
from .transport import read_public

ATS = {'jobs.lever.co': 'lever', 'job-boards.greenhouse.io': 'greenhouse',
       'boards.greenhouse.io': 'greenhouse', 'jobs.ashbyhq.com': 'ashby'}
SEARCH_DOMAINS = {'employers': 'site:job-boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com',
                  'linkedin': 'site:linkedin.com/jobs/view', 'naukri': 'site:naukri.com/job-listings',
                  'indeed': 'site:in.indeed.com/viewjob'}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.structured=[]; self.script=None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.script = []
    def handle_data(self, value):
        if self.script is not None: self.script.append(value)
    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            try: self.structured.append(json.loads(''.join(self.script)))
            except (ValueError, TypeError): pass
            self.script = None


def query_plan(profile, settings):
    evidence = skills(profile.get('resume_text', ''))
    focus = [name for name in ('React', 'TypeScript', 'Node.js', 'NestJS', 'Python', 'React Native', 'PostgreSQL') if name in evidence]
    location = (settings.get('locations') or [profile.get('location', '')])[0]
    roles = ['full stack engineer', 'software engineer II']
    if 'Node.js' in evidence: roles.append('backend engineer Node.js')
    if 'React Native' in evidence: roles.append('React Native engineer')
    return [{'role': role, 'location': location, 'keywords': focus[:3],
             'query': ' '.join([role, location, *focus[:2]])} for role in roles]


def board_from_url(url):
    parsed = urlsplit(url); parts = parsed.path.strip('/').split('/')
    provider = ATS.get(parsed.hostname)
    if not provider or not parts or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', parts[0]):
        return None
    return {'provider': provider, 'slug': parts[0], 'company': parts[0]}


def search_public(query, fetch=read_public):
    body, _ = fetch('https://www.bing.com/search?' + urlencode({'q': query, 'format': 'rss'}))
    try: tree = ET.fromstring(body)
    except ET.ParseError: raise ValueError('Search returned an access page instead of results')
    return [{'title': node.findtext('title', ''), 'url': node.findtext('link', '')}
            for node in tree.findall('.//item') if node.findtext('link', '').startswith('https://')][:10]


def linkedin_public(query, location, fetch=read_public):
    url = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?' + urlencode(
        {'keywords': query, 'location': location, 'start': 0, 'f_TPR': 'r604800'})
    body, _ = fetch(url)
    parser = PageParser(); parser.feed(body)
    return list(dict.fromkeys(link.split('?')[0] for link in parser.links
                             if urlsplit(link).hostname in ('www.linkedin.com', 'in.linkedin.com') and '/jobs/view/' in link))[:10]


def job_nodes(value):
    if isinstance(value, list):
        for child in value: yield from job_nodes(child)
    elif isinstance(value, dict):
        types = value.get('@type', [])
        if types == 'JobPosting' or isinstance(types, list) and 'JobPosting' in types:
            yield value
        if '@graph' in value: yield from job_nodes(value['@graph'])


def structured_jobs(body, url):
    parser = PageParser(); parser.feed(body); results = []
    for node in job_nodes(parser.structured):
        title = node.get('title'); description = node.get('description', '')
        org = node.get('hiringOrganization') or {}
        company = org.get('name', '') if isinstance(org, dict) else ''
        if not title or not company or len(plain(description)) < 100: continue
        valid = node.get('validThrough')
        if valid:
            try:
                expiry = datetime.fromisoformat(valid.replace('Z', '+00:00'))
                if expiry.tzinfo is None: expiry = expiry.replace(tzinfo=timezone.utc)
                if expiry < datetime.now(timezone.utc): continue
            except (ValueError, TypeError): pass
        locations = node.get('jobLocation') or []
        if isinstance(locations, dict): locations = [locations]
        names=[]
        for place in locations:
            address = place.get('address', {}) if isinstance(place, dict) else {}
            if isinstance(address, str): names.append(address); continue
            names.append(', '.join(str(address[k]) for k in ('addressLocality', 'addressRegion', 'addressCountry') if address.get(k)))
        if node.get('jobLocationType') == 'TELECOMMUTE':
            names.append('Remote')
            restrictions = node.get('applicantLocationRequirements') or []
            if isinstance(restrictions, dict): restrictions = [restrictions]
            names.extend(x.get('name', '') for x in restrictions if isinstance(x, dict))
        source_host = urlsplit(url).hostname or ''
        source = next((x for x in ('linkedin', 'naukri', 'indeed') if x in source_host), 'careers')
        record = normalize(source, hashlib.sha256(url.encode()).hexdigest(), company, title, url, description,
                           '; '.join(filter(None, names)), verified_public_posting=True, discovery_url=url,
                           posted_at=node.get('datePosted'), application_kind='browser')
        salary = node.get('baseSalary') or {}
        if isinstance(salary, dict) and salary.get('currency') == 'INR':
            value = salary.get('value') or {}
            if isinstance(value, dict) and value.get('unitText', '').upper() in ('YEAR', 'ANNUAL'):
                amount = value.get('maxValue', value.get('value'))
                if isinstance(amount, (int, float)) and not isinstance(amount, bool): record['salary_max_lpa'] = amount / 100000
        results.append(record)
    return results, parser.links


def refresh_public_job(job, fetch=read_public):
    if not job.get('verified_public_posting'):
        raise ValueError('This imported record has no verified public posting')
    body, final_url = fetch(job.get('discovery_url') or job['url'])
    records, links = structured_jobs(body, final_url)
    fresh = next((x for x in records if x['title'].casefold() == job['title'].casefold()
                  and x['company'].casefold() == job['company'].casefold()), None)
    if not fresh: raise ValueError('Current employer requirements could not be verified; skipping submission')
    fresh.update(id=job['id'], source_key=job['source_key'])
    return fresh


def discover(profile, settings, fetch=read_public, board_fetch=fetch_board, stopped=None):
    queries = query_plan(profile, settings); report=[]; boards={}; urls=[]; jobs={}
    enabled = settings.get('discovery_sources', ['employers', 'linkedin', 'naukri', 'indeed'])
    max_pages = settings.get('discovery_page_limit', 30)
    for source in enabled:
        if stopped and stopped.is_set(): break
        found=[]
        try:
            if source == 'linkedin':
                found = linkedin_public(queries[0]['role'] + ' ' + ' '.join(queries[0]['keywords'][:2]), queries[0]['location'], fetch)
            else:
                for plan in queries[:2]:
                    found.extend(x['url'] for x in search_public(plan['query'] + ' ' + SEARCH_DOMAINS[source], fetch))
            # Search engines sometimes ignore site filters. Never label unrelated links as source results.
            if source != 'employers':
                found = [u for u in found if source in (urlsplit(u).hostname or '').split('.')]
            urls.extend(found)
            report.append({'source': source, 'status': 'searched', 'results': len(found)})
        except Exception as exc:
            report.append({'source': source, 'status': 'unavailable', 'detail': f'{type(exc).__name__}: public access unavailable; no bypass attempted'})
    for raw_url in list(dict.fromkeys(urls))[:max_pages]:
        if stopped and stopped.is_set(): break
        try:
            url = canonical_url(raw_url)
            board = board_from_url(url)
            if board:
                boards[(board['provider'], board['slug'])] = board
                continue
            body, final_url = fetch(url)
            records, links = structured_jobs(body, final_url)
            for record in records: jobs[record['id']] = record
            for link in links:
                board = board_from_url(urljoin(final_url, unescape(link)))
                if board: boards[(board['provider'], board['slug'])] = board
        except Exception as exc:
            report.append({'source': urlsplit(raw_url).hostname, 'status': 'skipped',
                           'detail': f'{type(exc).__name__}: posting could not be verified'})
    for board in list(boards.values())[:12]:
        if stopped and stopped.is_set(): break
        try:
            entries = board_fetch(board)
            for entry in entries: jobs[entry['id']] = entry
            report.append({'source': board['slug'], 'status': 'feed_verified', 'results': len(entries)})
        except Exception as exc:
            report.append({'source': board['slug'], 'status': 'unavailable', 'detail': type(exc).__name__})
    return {'jobs': list(jobs.values()), 'boards': list(boards.values())[:12], 'sources': report, 'queries': queries}
