"""Wall-clock listing availability; discovery time is never publication time."""
import re
from datetime import datetime, timedelta, timezone

WINDOW=timedelta(hours=24)


def timestamp(value):
    if not isinstance(value,str):return None
    try:
        parsed=datetime.fromisoformat(value.replace('Z','+00:00'))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:return None


def relative_posted_at(text, checked_at):
    """Use the oldest possible instant for a rounded visible relative age."""
    match=re.fullmatch(r'\s*(\d+)\s+(minute|hour|day)s?\s+ago\s*',text,re.I)
    if not match:return None
    amount=int(match[1])+1
    delta=timedelta(**{match[2].lower()+'s':amount})
    return (checked_at-delta).isoformat()


def availability(job, at=None):
    at=at or datetime.now(timezone.utc)
    if job.get('status') in ('closed','archived'):
        return {'visible':False,'reason':'Listing is closed or archived'}
    expiry=timestamp(job.get('valid_through'))
    if expiry and expiry<=at:return {'visible':False,'reason':'Listing has expired'}
    verified=timestamp(job.get('active_verified_at'))
    if not verified or not timedelta(0)<=at-verified<=WINDOW:
        return {'visible':False,'reason':'Active listing has not been verified within 24 hours'}
    company=(job.get('source') in ('greenhouse','lever','ashby') and bool(job.get('board'))
             or job.get('source')=='careers' and job.get('verified_public_posting'))
    if company:
        return {'visible':True,'reason':'Active on the company careers page','kind':'active_company'}
    posted=timestamp(job.get('posted_at'))
    if not posted:
        return {'visible':False,'reason':'Posting time cannot be verified within 24 hours'}
    if not timedelta(0)<=at-posted<=WINDOW:
        return {'visible':False,'reason':'Posting is older than 24 hours or has an invalid future date'}
    return {'visible':True,'reason':'Posted within 24 hours and verified active','kind':'fresh_board'}


def require_available(job, settings):
    if settings.get('fresh_only'):
        result=availability(job)
        if not result['visible']:raise ValueError(result['reason'])
