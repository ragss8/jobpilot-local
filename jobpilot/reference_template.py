"""Typography and geometry measured from the user's preferred one-page PDF."""
import re
from html import escape
from pathlib import Path

TEMPLATE_VERSION='raghu-reference-v1'
PAGE=(612,792)  # US Letter, matching the supplied PDF.
MARGIN_X=42.5
TOP=25
BOTTOM=25
COLOR='#1f2937'


def metric_markup(text):
    pattern=r'(?:~?\d[\d,]*(?:[–-]\d[\d,]*)?\s*(?:concurrent users|branches across South India|vehicles|minutes|hour|requests/sec|components|MB|ms))'
    parts=[];start=0
    for match in re.finditer(pattern,text):
        parts.extend((escape(text[start:match.start()]),'<b>'+escape(match[0])+'</b>'));start=match.end()
    return ''.join(parts)+escape(text[start:])


def styled_blocks(blocks):
    result=[];section='';company_pending=False;header=0
    for tag,text in blocks:
        if not text:continue
        rich=escape(text);kind='body'
        if tag=='h1':kind='name';rich='<b>'+rich+'</b>'
        elif not section:
            kind='contact' if header==0 else 'links';header+=1
            if kind=='links':
                rich='  •  '.join('<a href="'+escape(u,quote=True)+'" color="#0000ee"><u>'+escape(u)+'</u></a>' if u.startswith('https://') else escape(u) for u in text.split('  •  '))
        if tag=='h2':
            kind='section';section=text;company_pending=text=='EXPERIENCE';rich='<b>'+escape(text)+'</b>'
        elif section=='TECHNICAL SKILLS':
            kind='skill';label,sep,rest=text.partition(':')
            rich='<b>'+escape(label+sep)+'</b>'+escape(rest)
        elif tag=='li':kind='bullet';rich=metric_markup(text)
        elif tag=='h3':
            date=re.search(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b',text)
            if date:
                kind='role';rich='<b>'+escape(text[:date.start()].rstrip())+'</b> <i><font color="#555555">'+escape(text[date.start():])+'</font></i>'
            elif company_pending:
                kind='company';label,sep,rest=text.partition(' - ')
                rich='<b>'+escape(label)+'</b>'+('<font color="#555555">'+escape(sep+rest)+'</font>' if sep else '')
                company_pending=False
            else:kind='project';rich='<i>'+escape(text)+'</i>'
        elif section=='EDUCATION' and tag!='h2':
            if re.match(r'^\d{4}',text):kind='education_date'
            else:
                kind='education';label,sep,rest=text.partition(' - ')
                rich='<b>'+escape(label)+'</b>'+escape(sep+rest)
        result.append({'kind':kind,'text':text,'rich':rich})
    return result


def html_document(name,blocks):
    elements=[]
    for block in blocks:
        kind=block['kind'];tag='h1' if kind=='name' else 'h2' if kind=='section' else 'div'
        rich=block['rich'].replace('<font color="#555555">','<span style="color:#555">').replace('</font>','</span>')
        elements.append(f'<{tag} class="{kind}">'+rich+f'</{tag}>')
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+escape(name)+' - Resume</title><style>'+'''
@page{size:Letter;margin:25pt 42.5pt}*{box-sizing:border-box}body{width:527pt;margin:25pt auto;color:#000;font:10pt/11.5pt "Times New Roman",Times,serif}h1,h2{padding:0}.name{text-align:center;font-size:16pt;line-height:19pt;color:#1f2937;margin:0 0 5pt}.contact,.links{text-align:center;line-height:13.5pt}.contact,.education_date{color:#555}.links a{color:#0000ee;text-decoration:underline}.section{font-size:11pt;line-height:13pt;border-bottom:1pt solid #1f2937;color:#1f2937;margin:10pt 0 5pt}.body{margin:9pt 0 10pt}.skill{margin:0 0 2pt}.company{font-size:10.5pt;line-height:13pt;margin:0 0 3pt}.role{margin:3pt 0 2pt}.project{font-style:italic;margin:2pt 0 3pt}.bullet{position:relative;margin:0 0 2pt 36pt}.bullet:before{content:"●";position:absolute;left:-18pt;font:10pt Arial}.education,.education_date{margin:0 0 2pt}h2,.company,.role,.project{break-after:avoid}.bullet{break-inside:avoid}@media print{body{margin:0;width:auto}}
'''+'</style></head><body>'+''.join(elements)+'</body></html>'


def fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    roots=[Path('/System/Library/Fonts/Supplemental'),Path('C:/Windows/Fonts')]
    names={'ReferenceTimes':('Times New Roman.ttf','times.ttf'),
           'ReferenceTimesBold':('Times New Roman Bold.ttf','timesbd.ttf'),
           'ReferenceTimesItalic':('Times New Roman Italic.ttf','timesi.ttf'),
           'ReferenceTimesBoldItalic':('Times New Roman Bold Italic.ttf','timesbi.ttf')}
    for family,candidates in names.items():
        path=next((root/name for root in roots for name in candidates if (root/name).is_file()),None)
        if not path:raise ValueError('The reference template requires Times New Roman fonts')
        if family not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(family,str(path)))
    pdfmetrics.registerFontFamily('ReferenceTimes',normal='ReferenceTimes',bold='ReferenceTimesBold',italic='ReferenceTimesItalic',boldItalic='ReferenceTimesBoldItalic')


def render_pdf(path,layout):
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.colors import HexColor
    fonts();width=PAGE[0]-2*MARGIN_X
    styles={
        'name':dict(fontSize=16,leading=19,alignment=1,textColor=HexColor(COLOR)),
        'contact':dict(alignment=1,textColor=HexColor('#555555'),leading=13.5),
        'links':dict(alignment=1,leading=13.5),
        'section':dict(fontSize=11,leading=13,textColor=HexColor(COLOR)),
        'company':dict(fontSize=10.5,leading=13),
        'education_date':dict(textColor=HexColor('#555555')),
    }
    # Match the reference's typography; compact only discretionary vertical gaps
    # if confirmed additional facts would otherwise exceed its single page.
    spacing={'name':(0,5),'contact':(0,0),'links':(0,0),'section':(10,5),
             'body':(9,10),'skill':(0,2),'company':(0,3),'role':(3,2),
             'project':(2,3),'bullet':(0,2),'education':(0,2),'education_date':(0,0)}
    measured=[]
    for block in layout['styled_blocks']:
        kind=block['kind'];style=ParagraphStyle(kind,**{'fontName':'ReferenceTimes','fontSize':10,'leading':11.5,**styles.get(kind,{})})
        paragraph=Paragraph(block['rich'],style)
        _,height=paragraph.wrap(width-(36 if kind=='bullet' else 0),10000)
        before,after=spacing[kind];measured.append((kind,paragraph,height,before,after))
    content=sum(row[2] for row in measured);gaps=sum(row[3]+row[4] for row in measured)
    available=PAGE[1]-TOP-BOTTOM
    factor=min(1,(available-content)/gaps) if gaps else 1
    if factor<0.35:raise ValueError('Resume cannot fit the approved one-page template without reducing legibility')
    canvas=Canvas(str(path),pagesize=PAGE);canvas.setTitle(layout['blocks'][0][1]+' - Resume')
    y=PAGE[1]-TOP
    for kind,paragraph,height,before,after in measured:
        y-=before*factor
        paragraph.drawOn(canvas,MARGIN_X+(36 if kind=='bullet' else 0),y-height)
        if kind=='bullet':
            canvas.setFillColorRGB(0,0,0);canvas.circle(MARGIN_X+21,y-6,2,fill=1,stroke=0)
        y-=height
        if kind=='section':
            canvas.setStrokeColor(HexColor(COLOR));canvas.setLineWidth(1);canvas.line(MARGIN_X,y-1,MARGIN_X+width,y-1)
        y-=after*factor
    canvas.showPage();canvas.save()
    return {'pages':1,'font':'Times New Roman','body_size':10,'spacing_scale':round(factor,4),'bottom':round(y,2)}
