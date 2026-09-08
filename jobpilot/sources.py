import hashlib
import html
import json
import re
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit
from .transport import tls_context


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
        if tag in ('p','li','br','div','h2','h3'): self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
        if tag in ('p','li','div'): self.parts.append('\n')
    def handle_data(self,data):
        if not self.skip: self.parts.append(data)


def plain(value):
    parser=TextParser(); parser.feed(html.unescape(value or ''))
    return '\n'.join(x.strip() for x in ''.join(parser.parts).splitlines() if x.strip())


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        raise ValueError('Unexpected redirect from the job provider')


def get_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':'JobPilotLocal/0.1 (+local personal job search)','Accept':'application/json'})
    with urllib.request.build_opener(NoRedirect,urllib.request.HTTPSHandler(context=tls_context())).open(req,timeout=25) as r:
        raw=r.read(20_000_001)
    if len(raw)>20_000_000: raise ValueError('Provider response is too large')
    return json.loads(raw)


def canonical_url(value):
    p=urlsplit(value.strip())
    if p.scheme!='https' or not p.hostname or p.username or p.password:
        raise ValueError('Use a public HTTPS application URL')
    if p.port not in (None,443): raise ValueError('Only standard HTTPS URLs are supported')
    # Keep query: some ATS platforms identify a job solely through query parameters.
    return urlunsplit(('https',p.netloc.lower(),p.path.rstrip('/'),p.query,''))


def normalize(source,key,company,title,url,description,location='',**kwargs):
    url=canonical_url(url)
    return dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],source=source,source_key=str(key),company=company,
                title=title,url=url,description=plain(description),location=location,**kwargs)


def fetch_board(board, fetch=get_json):
    provider=board['provider']; slug=board['slug']
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',slug): raise ValueError('Invalid board slug')
    company=board['company']; result=[]
    if provider=='greenhouse':
        data=fetch(f'https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true')
        for x in data['jobs']:
            result.append(normalize(provider,f'{slug}:{x["id"]}',company,x['title'],x['absolute_url'],x.get('content',''),x.get('location',{}).get('name',''),board=slug))
    elif provider=='lever':
        skip=0
        while True:
            data=fetch(f'https://api.lever.co/v0/postings/{slug}?mode=json&limit=100&skip={skip}')
            for x in data:
                desc=x.get('descriptionPlain') or x.get('description','')
                desc+='\n'+'\n'.join(y.get('text','')+'\n'+y.get('content','') for y in x.get('lists',[]))
                desc+='\n'+x.get('additionalPlain','')
                result.append(normalize(provider,f'{slug}:{x["id"]}',company,x['text'],x.get('applyUrl') or x['hostedUrl'],desc,x.get('categories',{}).get('location',''),board=slug))
            if len(data)<100: break
            skip+=100
            if skip>=10000: raise ValueError('Board exceeded pagination limit; sync aborted to avoid closing unseen jobs')
    elif provider=='ashby':
        data=fetch(f'https://api.ashbyhq.com/posting-api/job-board/{slug}')
        for x in data['jobs']:
            if x.get('isListed') is False: continue
            result.append(normalize(provider,f'{slug}:{x.get("id") or x["jobUrl"]}',company,x['title'],x.get('applyUrl') or x['jobUrl'],x.get('descriptionPlain') or x.get('descriptionHtml',''),x.get('location',''),board=slug))
    else:
        raise ValueError('Choose Greenhouse, Lever, or Ashby')
    return result
