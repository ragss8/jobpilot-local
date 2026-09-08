"""Create a PRIVATE GitHub source repository. Does not deploy or host the app.
Requires Git and the GitHub CLI authenticated on your own computer.
Only explicitly selected source directories are staged; personal data is excluded.
"""
import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=['jobpilot','tests','scripts','docs','README.md','LICENSE','run.py','start.bat','start.sh','requirements-optional.txt','.gitignore','.env.example']

def run(args,check=True):
    r=subprocess.run(args,cwd=ROOT,text=True,capture_output=True)
    if check and r.returncode:
        # gh error output might contain repository details, but never print stored credentials.
        raise SystemExit(f'Command failed: {args[0]} {args[1]}\n{r.stderr.strip()}')
    return r

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner',default='ragss8')
    parser.add_argument('--name',default='jobpilot-local')
    args=parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+',args.owner) or not re.fullmatch(r'[A-Za-z0-9_.-]+',args.name):
        parser.error('Invalid GitHub owner or repository name')
    for tool in ('git','gh'):
        if not shutil.which(tool):raise SystemExit(f'Install {tool} first. See README.')
    who=json.loads(run(['gh','api','user']).stdout)
    if who['login'].casefold()!=args.owner.casefold():
        raise SystemExit(f'GitHub CLI is connected as {who["login"]}, expected {args.owner}. Run gh auth switch or gh auth login.')
    full=f'{args.owner}/{args.name}'
    exists=run(['gh','repo','view',full,'--json','visibility'],check=False)
    if exists.returncode==0:
        raise SystemExit(f'{full} already exists. Nothing was pushed. Use the existing-repo instructions in README after verifying that it is private.')
    if not (ROOT/'.git').exists():run(['git','init','-b','main'])
    if run(['git','remote','get-url','origin'],check=False).returncode==0:
        raise SystemExit('This checkout already has an origin. Nothing was changed; inspect git remote -v first.')
    for setting,value in [('user.name',who['login']),('user.email',f'{who["id"]}+{who["login"]}@users.noreply.github.com')]:
        if run(['git','config','--get',setting],check=False).returncode!=0:run(['git','config','--local',setting,value])
    run(['git','add','--',*SOURCE])
    staged=run(['git','diff','--cached','--name-only']).stdout.splitlines()
    if any(path.split('/')[0] not in SOURCE for path in staged):
        raise SystemExit('Unrelated files are staged. Inspect git diff --cached before pushing.')
    if run(['git','diff','--cached','--quiet'],check=False).returncode!=0:
        run(['git','commit','-m','Build JobPilot local application workspace'])
    run(['gh','repo','create',full,'--private','--source',str(ROOT),'--remote','origin','--push',
         '--description','Local job discovery, explainable matching, resume preparation and application tracking. No hosted deployment.'])
    repo=json.loads(run(['gh','api',f'repos/{full}']).stdout)
    if not repo.get('private'):raise SystemExit('Repository privacy could not be verified. Inspect GitHub settings immediately.')
    print(f'Private source repository created: {repo["html_url"]}')
    print('The app has not been deployed. Run it locally with python run.py.')

if __name__=='__main__':main()
