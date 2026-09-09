"""Reorganize source evidence without changing claims or employer attribution."""
import re
from html import escape
from .matching import skills

HEADINGS={'SUMMARY':'summary','PROFESSIONAL SUMMARY':'summary','TECHNICAL SKILLS':'skills',
          'SKILLS':'skills','EXPERIENCE':'experience','WORK EXPERIENCE':'experience',
          'PROFESSIONAL EXPERIENCE':'experience','EDUCATION':'education'}


def structured_resume(profile, job):
    original=profile.get('resume_text','').strip()
    sections={};current=None
    for line in original.splitlines():
        line=line.strip()
        if not line:continue
        heading=HEADINGS.get(line.upper())
        if heading:
            current=heading;sections.setdefault(current,[])
        elif current:sections[current].append(line)
    if not sections.get('experience') or not sections.get('education'):return None
    required=skills(job['description'])
    relevance=lambda text:len(skills(text)&required)
    name=profile.get('name','').strip()
    contacts=' | '.join(profile.get(x,'') for x in ('location','email','phone') if profile.get(x))
    links=' | '.join(profile.get(x,'') for x in ('linkedin','github','portfolio') if profile.get(x))
    blocks=[('h1',name),('p',contacts),('p',links),('p','Target role: '+job['title'])]
    if sections.get('summary'):
        blocks += [('h2','PROFESSIONAL SUMMARY')]+[('p',x) for x in sections['summary']]
    if sections.get('skills'):
        blocks.append(('h2','TECHNICAL SKILLS'))
        blocks += [('p',x) for x in sorted(sections['skills'],key=relevance,reverse=True)]
    blocks.append(('h2','EXPERIENCE'))
    pending=[]
    for line in sections['experience']:
        # Short title/date/project labels anchor the following bullets. Reorder
        # only inside each anchored block, never across employers or roles.
        is_bullet=len(line)>115 or bool(re.match(r'^(?:Built|Owned|Designed|Shipped|Implemented|Developed|Led|Created|Delivered|Managed|Optimized|Used)\b',line))
        if is_bullet:pending.append(line)
        else:
            blocks += [('li',x) for x in sorted(pending,key=relevance,reverse=True)];pending=[]
            blocks.append(('h3',line))
    blocks += [('li',x) for x in sorted(pending,key=relevance,reverse=True)]
    blocks.append(('h2','EDUCATION'));blocks += [('p',x) for x in sections['education']]
    text='\n'.join(value for _,value in blocks if value)
    # Every source experience and education line must remain verbatim.
    if any(line not in text for line in sections['experience']+sections['education']):
        raise ValueError('Resume evidence validation failed')
    elements=[];in_list=False
    for tag,value in blocks:
        if not value:continue
        if tag=='li' and not in_list:elements.append('<ul>');in_list=True
        elif tag!='li' and in_list:elements.append('</ul>');in_list=False
        elements.append(f'<{tag}>{escape(value)}</{tag}>')
    if in_list:elements.append('</ul>')
    html='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+escape(name)+' - Resume</title><style>'+'''
@page{size:A4;margin:17mm}body{max-width:760px;margin:32px auto;font:10.5pt/1.4 Arial,sans-serif;color:#111}h1{font-size:23pt;margin:0 0 7px}h2{font-size:11pt;margin:16px 0 7px;border-bottom:1px solid #aaa;padding-bottom:4px}h3{font-size:10.5pt;margin:10px 0 5px}p{margin:4px 0;overflow-wrap:anywhere}ul{padding-left:18px;margin:4px 0 8px}li{margin-bottom:5px;break-inside:avoid}h2,h3{break-after:avoid}@media print{body{margin:0;max-width:none}}
'''+'</style></head><body>'+''.join(elements)+'</body></html>'
    return {'text':text,'html':html,'blocks':blocks}
