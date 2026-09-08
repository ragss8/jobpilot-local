"""Explainable skill coverage; not a proprietary ATS score or hiring probability."""
import re

ALIASES = {
    'React': ['react','reactjs','react.js'], 'React Native': ['react native'],
    'TypeScript': ['typescript'], 'JavaScript': ['javascript','ecmascript'],
    'Node.js': ['node.js','nodejs','node js'], 'NestJS': ['nestjs','nest.js'],
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
}


def contains(text, term):
    return bool(re.search(r'(?<![\w])'+re.escape(term)+r'(?![\w])', text, re.I))


def skills(text, extra=()):
    found={k for k, aliases in ALIASES.items() if any(contains(text,a) for a in aliases)}
    found.update(x.strip() for x in extra if x.strip() and contains(text,x.strip()))
    return found


def evaluate(profile, job, settings):
    text=job['description']
    extra=settings.get('keywords',[])
    requested=skills(text,extra)
    evidence=skills(profile.get('resume_text',''),extra)
    matched=requested & evidence
    missing=requested-evidence
    # Optional requirements count half; unknown requirements remain visible in the JD.
    optional=set()
    for line in text.splitlines():
        if re.search(r'nice.to.have|preferred|bonus|optional|a plus',line,re.I):
            optional |= skills(line,extra)
    required=requested-optional
    weighted=lambda s: sum(1 if x in required else .5 for x in s)
    score=round(100*weighted(matched)/weighted(requested),1) if requested else 0
    blockers=[]
    warnings=[]
    if not requested:
        blockers.append('No recognized requirements; add matching keywords or review manually')
    if score <= settings.get('threshold',80):
        blockers.append(f"Skill coverage must exceed {settings.get('threshold',80)}%")
    roles=settings.get('roles',[])
    if roles and not any(x.casefold() in job['title'].casefold() for x in roles):
        blockers.append('Outside your target job titles')
    location=job.get('location','').casefold().replace('bangalore','bengaluru')
    wanted=[x.casefold().replace('bangalore','bengaluru') for x in settings.get('locations',[])]
    if wanted and not any(x in location for x in wanted):
        blockers.append('Location not in your selected locations (remote eligibility is not assumed)')
    years=job.get('min_years')
    if years is None:
        match=re.search(r'(\d{1,2})\s*(?:\+|[-–]\s*\d{1,2})?\s*(?:years|yrs)\s+(?:of\s+)?(?:professional\s+|relevant\s+)?experience',text,re.I)
        if match:
            years=int(match.group(1))
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
            'eligible':not blockers,'blockers':blockers,'warnings':warnings,
            'method':'Weighted coverage of recognized JD skills against your original resume; optional skills weigh 0.5. Not an ATS score.'}
