"""Read-only IMAP polling. Never sends, deletes, moves, or marks mail read."""
import email
import hashlib
import imaplib
import os
import re
import ssl
from datetime import datetime,timedelta,timezone
from email.header import decode_header,make_header
from .db import now


def decode(value):
    try: return str(make_header(decode_header(value or '')))
    except Exception: return str(value or '')


def classify(subject, body):
    text=(subject+'\n'+body).casefold()
    if re.search(r'not (?:been )?shortlisted|not (?:be )?(?:moving|proceeding) forward|unfortunately|regret to inform|other candidates|application.{0,30}(?:unsuccessful|rejected)',text): return 'rejection'
    if re.search(r'interview (?:invitation|schedule|availability)|schedule (?:an |your |a )?interview|invite you.{0,60}interview|interview with',text): return 'interview'
    if re.search(r'you(?: have been| are|.re).{0,15}shortlisted|application.{0,30}shortlisted|selected for (?:the )?next',text): return 'shortlisted'
    if re.search(r'offer (?:letter|of employment)|pleased to offer you',text): return 'offer'
    if re.search(r'application (?:received|submitted)|thank you for (?:your application|applying)',text): return 'acknowledgement'
    return None


def poll(store):
    host=os.environ.get('JOBPILOT_IMAP_HOST','')
    username=os.environ.get('JOBPILOT_IMAP_USER','')
    password=os.environ.get('JOBPILOT_IMAP_PASSWORD','')
    if not all((host,username,password)): raise ValueError('Set JOBPILOT_IMAP_HOST, JOBPILOT_IMAP_USER and JOBPILOT_IMAP_PASSWORD on your computer')
    count=0; days=int(os.environ.get('JOBPILOT_IMAP_LOOKBACK_DAYS','14'))
    since=(datetime.now(timezone.utc)-timedelta(days=min(max(days,1),90))).strftime('%d-%b-%Y')
    with imaplib.IMAP4_SSL(host,port=993,ssl_context=ssl.create_default_context(),timeout=25) as m:
        m.login(username,password)
        if m.select('INBOX',readonly=True)[0]!='OK': raise ValueError('Could not read INBOX')
        status,data=m.uid('search',None,'SINCE',since)
        if status!='OK': raise ValueError('Inbox search failed')
        # Scan bounded recent mail; dedupe by Message-ID across sessions and UIDVALIDITY resets.
        for uid in (data[0] or b'').split()[-250:]:
            status,items=m.uid('fetch',uid,'(BODY.PEEK[]<0.262144>)')
            raw=next((x[1] for x in items if isinstance(x,tuple)),None)
            if status!='OK' or not raw: continue
            msg=email.message_from_bytes(raw)
            identity=username+'|'+str(msg.get('Message-ID') or hashlib.sha256(raw).hexdigest())
            key=hashlib.sha256(identity.encode()).hexdigest()
            with store.connect() as c:
                if c.execute('SELECT 1 FROM messages WHERE id=?',(key,)).fetchone(): continue
            subject=decode(msg.get('Subject')); sender=decode(msg.get('From')); body=[]
            for part in msg.walk():
                if part.get_content_type()=='text/plain' and part.get_content_disposition()!='attachment':
                    body.append((part.get_payload(decode=True) or b'').decode(part.get_content_charset() or 'utf-8',errors='replace'))
            if not body:
                from .sources import plain
                for part in msg.walk():
                    if part.get_content_type()=='text/html' and part.get_content_disposition()!='attachment':
                        body.append(plain((part.get_payload(decode=True) or b'').decode('utf-8',errors='replace')))
            content='\n'.join(body)[:20000]; kind=classify(subject,content)
            if not kind: continue
            # No employer status is changed based on a keyword classifier.
            with store.connect() as c:
                c.execute('INSERT OR IGNORE INTO messages(id,kind,sender,subject,preview,created) VALUES(?,?,?,?,?,?)',
                          (key,kind,sender,subject,content[:500],now()))
            count+=1
    store.event('inbox',f'{count} new recruiting email signals. Review the original emails to confirm.')
    return {'new_messages':count}
