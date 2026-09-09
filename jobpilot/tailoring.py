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
    name=profile.get('name','').strip().upper()
    phone=profile.get('phone','')
    if re.fullmatch(r'\+91\d{10}',phone):phone=phone[:3]+'-'+phone[3:8]+'-'+phone[8:]
    contacts='  •  '.join(x for x in (profile.get('location',''),phone,profile.get('email','')) if x)
    links='  •  '.join(profile.get(x,'') for x in ('linkedin','github','portfolio') if profile.get(x))
    blocks=[('h1',name),('p',contacts),('p',links)]
    if sections.get('summary'):
        blocks += [('h2','SUMMARY')]+[('p',x) for x in sections['summary']]
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
    from .reference_template import html_document, styled_blocks, TEMPLATE_VERSION
    styled=styled_blocks(blocks)
    return {'text':text,'html':html_document(name,styled),'blocks':blocks,
            'styled_blocks':styled,'template':TEMPLATE_VERSION}
