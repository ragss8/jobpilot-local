"""Explainable skill coverage; not a proprietary ATS score or hiring probability."""
import re

ALIASES = {
    'React': ['react','reactjs','react.js'], 'React Native': ['react native'],
    'TypeScript': ['typescript'], 'JavaScript': ['javascript','ecmascript'],
    'Node.js': ['node.js','nodejs','node js','node'], 'NestJS': ['nestjs','nest.js'],
    'Next.js': ['next.js','nextjs'], 'Vue': ['vue','vue.js','vuejs'],
    'Angular': ['angular'], 'HTML': ['html','html5'], 'CSS': ['css','css3'],
    'Tailwind': ['tailwind','tailwindcss'], 'Redux': ['redux'],
    'PostgreSQL': ['postgresql','postgres'], 'MySQL': ['mysql'], 'SQL': ['sql'],
    'MongoDB': ['mongodb'], 'Redis': ['redis'], 'Prisma': ['prisma'],
    'Python': ['python'], 'Java': ['java'], 'Spring Boot': ['spring boot'],
    'C++': ['c++'], 'C#': ['c#'], '.NET': ['.net','dotnet'], 'Go': ['golang'],
    'REST': ['rest','restful'], 'GraphQL': ['graphql'], 'WebSocket': ['websocket','websockets'],
    'Docker': ['docker'], 'Kubernetes': ['kubernetes','k8s'],
    'AWS': ['aws','amazon web services'], 'Azure': ['azure'],
    'GCP': ['gcp','google cloud'], 'CI/CD': ['ci/cd','ci cd','continuous integration'],
    'Git': ['git'], 'GitHub Actions': ['github actions'], 'Terraform': ['terraform'],
    'Playwright': ['playwright'], 'Jest': ['jest'], 'Cypress': ['cypress'],
    'Testing': ['unit testing','integration testing','automated testing'],
    'Microservices': ['microservices','microservice'], 'System design': ['system design','distributed systems'],
    'Agile': ['agile','scrum'], 'Leadership': ['mentoring','mentor','team lead'],
    'RAG': ['retrieval augmented generation','retrieval-augmented generation','rag'],
    'LLM': ['llm','llms','large language models'], 'LangChain': ['langchain'],
    'Embeddings': ['embeddings','embedding'], 'Vector database': ['vector database','pinecone','weaviate','faiss'],
    'FastAPI': ['fastapi'], 'ShadCN': ['shadcn', 'shadcn ui'],
    'React Testing Library': ['react testing library'], 'PyTest': ['pytest'],
    'OAuth': ['oauth', 'oauth2', 'oauth 2.0'], 'OIDC': ['oidc', 'openid connect'],
    'Kafka': ['kafka'], 'RabbitMQ': ['rabbitmq'], 'Drizzle': ['drizzle'],
    'TypeORM': ['typeorm'], 'SQLAlchemy': ['sqlalchemy'],
    'Zustand': ['zustand'], 'TanStack Query': ['tanstack query'],
    'BullMQ': ['bullmq', 'bull mq'],
    'Scala': ['scala'], 'Spark': ['spark', 'pyspark'], 'Hadoop': ['hadoop'],
    'Data engineering': ['data engineering', 'big data'], 'Data warehousing': ['data warehousing','data warehouse'],
    'Snowflake': ['snowflake'], 'Machine learning': ['machine learning'],
}

SKILL_PATTERNS={name:re.compile(r'(?<![\w])(?:'+'|'.join(re.escape(a) for a in aliases)+r')(?![\w])',re.I)
                for name,aliases in ALIASES.items()}


def contains(text, term):
    return bool(re.search(r'(?<![\w])'+re.escape(term)+r'(?![\w])', text, re.I))


def skills(text, extra=()):
    found={k for k, pattern in SKILL_PATTERNS.items() if pattern.search(text)}
    found.update(x.strip() for x in extra if x.strip() and contains(text,x.strip()))
    return found


def evidence_skills(text, extra=()):
    found=skills(text,extra)
    # Narrow, documented entailments, not arbitrary skill invention.
    if 'GitHub Actions' in found: found.update(('Git','CI/CD'))
    if 'PostgreSQL' in found or 'MySQL' in found: found.add('SQL')
    return found


def alternative_groups(text, requested):
    """Collapse explicit alternatives within a technology family, not mixed stacks."""
    families=[{'AWS','Azure','GCP'}, {'React','Vue','Angular'},
              {'Prisma','Drizzle','TypeORM','SQLAlchemy'}, {'PostgreSQL','MySQL','MongoDB'},
              {'Node.js','Python','Java','Go','C#','.NET'}, {'Redux','Zustand','TanStack Query'}]
    groups=[]
    for line in re.split(r'[\n;]',text):
        if not re.search(r'\bor\b|/',line,re.I): continue
        line_skills=skills(line) & requested
        for family in families:
            present=line_skills & family
            if len(present)<2: continue
            # A family list must explicitly offer a choice. Plain 'and' lists stay separate.
            spans=[]
            for name in present:
                for alias in ALIASES[name]:
                    match=re.search(r'(?<![\w])'+re.escape(alias)+r'(?![\w])',line,re.I)
                    if match: spans.append((match.start(),match.end(),name));break
            spans.sort()
            region=line[spans[0][0]:spans[-1][1]]
            if re.search(r'\bor\b|/',region,re.I) and not re.search(r'\band\b',region,re.I):
                # Do not collapse a long sentence containing unrelated requirements.
                rest=region
                for name in present:
                    for alias in sorted(ALIASES[name],key=len,reverse=True):
                        rest=re.sub(r'(?<![\w])'+re.escape(alias)+r'(?![\w])','',rest,flags=re.I)
                rest=re.sub(r'\([^)]{0,30}\)','',rest)
                if re.fullmatch(r'[\s,/()]*|[\s,/()]*or[\s,/()]*',rest,flags=re.I):
                    if not any(present & g for g in groups):groups.append(present)
    return groups


def qualification_text(text):
    """Prefer the employer's qualifications section over company marketing copy."""
    starts={'requirements','requirements qualifications','required skills','qualifications','basic qualifications',
            'minimum qualifications','what you bring','what youll bring','what youll bring to the team',
            'what were looking for','what you need','what youll need','your qualifications','must have','you may be a good fit if you'}
    stops={'about us','about the company','about hinge health','what youll love about us','benefits',
           'compensation','what we offer','equal opportunity','why join us','apply for this job','not sure this is the right fit'}
    lines=text.splitlines();collected=[];active=False;preferred=False
    for line in lines:
        key=re.sub(r'[^a-z ]','',line.lower()).strip()
        key=re.sub(r'\s+',' ',key)
        if key in starts:
            active=True;preferred=False;continue
        if active and key in stops:break
        if active:
            if re.fullmatch(r'(?:preferred qualifications?|preferred|nice to have|bonus|bonus points|strong candidates may also have)',key):
                preferred=True;continue
            collected.append(('Optional: ' if preferred else '')+line)
    return '\n'.join(collected) if collected and skills('\n'.join(collected)) else text


def evaluate(profile, job, settings):
    text=qualification_text(job['description'])
    extra=settings.get('keywords',[])
    requested=skills(text,extra)
    evidence=evidence_skills(profile.get('resume_text',''),extra)
    matched=requested & evidence
    missing=requested-evidence
    # Optional requirements count half; unknown requirements remain visible in the JD.
    optional=set()
    for line in text.splitlines():
        if re.search(r'nice.to.have|preferred|bonus|optional|a plus',line,re.I):
            optional |= skills(line,extra)
    required=requested-optional
    weighted=lambda s: sum(1 if x in required else .5 for x in s)
    alternatives=alternative_groups(text,requested)
    grouped=set().union(*alternatives) if alternatives else set()
    numerator=weighted(matched-grouped);denominator=weighted(requested-grouped)
    satisfied_alternatives=set()
    for group in alternatives:
        weight=max(1 if x in required else .5 for x in group)
        denominator+=weight
        if group & evidence:
            numerator+=weight;satisfied_alternatives|=group-evidence
    score=round(100*numerator/denominator,1) if denominator else 0
    missing-=satisfied_alternatives
    blockers=[]
    warnings=[]
    if not requested:
        blockers.append('No recognized requirements; add matching keywords or review manually')
    if score <= settings.get('threshold',80):
        blockers.append(f"Skill coverage must exceed {settings.get('threshold',80)}%")
    required_missing=missing & required
    excluded=required_missing & set(settings.get('excluded_required_skills',[]))
    if excluded:blockers.append('Excluded mandatory skills: '+', '.join(sorted(excluded)))
    if settings.get('strict_required_skills') and required_missing:
        blockers.append('Unverified mandatory skills: '+', '.join(sorted(required_missing)))
    roles=settings.get('roles',[])
    if roles and not any(x.casefold() in job['title'].casefold() for x in roles):
        blockers.append('Outside your target job titles')
    location=job.get('location','').casefold().replace('bangalore','bengaluru')
    wanted=[x.casefold().replace('bangalore','bengaluru') for x in settings.get('locations',[])]
    if wanted and not any(x in location for x in wanted):
        blockers.append('Location not in your selected locations (remote eligibility is not assumed)')
    years=job.get('min_years')
    if years is None:
        matches=re.findall(r'(\d{1,2})\s*(?:\+|[-–]\s*\d{1,2})?\s*(?:years|yrs)\s+(?:of\s+)?(?:[\w-]+\s+){0,8}experience',text,re.I)
        matches+=re.findall(r'(?:experience|exp)\s*[:\-]?\s*(\d{1,2})\s*(?:\+|[-–]\s*\d{1,2})?\s*(?:years|yrs)',job['description'],re.I)
        if matches:years=max(map(int,matches))
    if years is not None:
        if profile.get('years') is None:
            blockers.append('Add your total experience to check this requirement')
        elif profile['years'] < years:
            blockers.append(f'Requires at least {years} years of experience')
    salary=job.get('salary_max_lpa')
    if settings.get('min_salary_lpa',0):
        if salary is not None and salary < settings['min_salary_lpa']:
            blockers.append('Advertised salary is below your minimum')
        elif salary is None:
            warnings.append('Salary is not verified')
            if settings.get('require_salary'):
                blockers.append('A verified salary range is required')
    if job['company'].casefold() in [x.casefold() for x in settings.get('excluded_companies',[])]:
        blockers.append('Company is excluded')
    if job.get('status')=='closed':
        blockers.append('No longer listed in the last successful board sync')
    if not profile.get('resume_text','').strip():
        blockers.append('Upload or paste your resume')
    return {'score':score,'matched':sorted(matched),'missing':sorted(missing),'required_missing':sorted(missing & required),
            'alternatives':[sorted(x) for x in alternatives],
            'eligible':not blockers,'blockers':blockers,'warnings':warnings,
            'method':'Evidence-based skill coverage; explicit technology alternatives count once and preferred skills weigh 0.5. Not an ATS score or interview probability.'}
