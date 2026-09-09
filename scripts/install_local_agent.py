"""Install user-scoped macOS launch agents for JobPilot and local Ollama."""
import argparse
import json
import os
import plistlib
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.request
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LABELS=('local.jobpilot.ollama','local.jobpilot.app')


def call(path,body=None,token=''):
    request=urllib.request.Request('http://127.0.0.1:8765'+path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json','X-JobPilot-Token':token})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request,timeout=10) as response:
        return json.load(response)


def install():
    if sys.platform!='darwin':raise SystemExit('This installer is for macOS user launch agents.')
    os.umask(0o077)
    python=ROOT/'.venv/bin/python';ollama=shutil.which('ollama')
    if not python.exists() or not ollama:raise SystemExit('Install the local environment and Ollama first.')
    data=ROOT/'data';logs=data/'logs';logs.mkdir(parents=True,exist_ok=True)
    agents=Path.home()/'Library/LaunchAgents';agents.mkdir(parents=True,exist_ok=True)
    definitions={
        LABELS[0]:{'ProgramArguments':[ollama,'serve'],'EnvironmentVariables':{
            'OLLAMA_NO_CLOUD':'1','OLLAMA_HOST':'127.0.0.1:11434','OLLAMA_MODELS':str(data/'models')}},
        LABELS[1]:{'ProgramArguments':[str(python),str(ROOT/'run.py'),'--data-dir',str(data),'--port','8765']}}
    for label,extra in definitions.items():
        definition={'Label':label,'WorkingDirectory':str(ROOT),'RunAtLoad':True,
                    'KeepAlive':{'SuccessfulExit':False},'ThrottleInterval':30,
                    'StandardOutPath':str(logs/(label+'.out.log')),
                    'StandardErrorPath':str(logs/(label+'.err.log')),**extra}
        path=agents/(label+'.plist')
        with path.open('wb') as file:plistlib.dump(definition,file)
        path.chmod(0o600)
    print('User launch-agent definitions installed. No cloud deployment.',flush=True)


def replace_running():
    state=call('/api/state')
    if state['busy']:raise SystemExit('An application task is active. Wait for it before replacing the server.')
    token=call('/api/session')['token']
    call('/api/pause',{},token)
    backup=ROOT/'data/backups';backup.mkdir(exist_ok=True)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    with sqlite3.connect('file:'+str(ROOT/'data/jobpilot.sqlite3')+'?mode=ro',uri=True) as source:
        with sqlite3.connect(backup/('before-automation-'+stamp+'.sqlite3')) as target:source.backup(target)
    raw=subprocess.check_output(['lsof','-nP','-tiTCP:8765','-sTCP:LISTEN'],text=True).strip().splitlines()
    if len(raw)!=1:raise SystemExit('Could not identify a single app server.')
    pid=int(raw[0]);command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
    cwd=subprocess.check_output(['lsof','-a','-p',str(pid),'-d','cwd','-Fn'],text=True)
    if 'run.py' not in command or str(ROOT) not in cwd:raise SystemExit('The existing listener was not verified as this JobPilot workspace.')
    os.kill(pid,signal.SIGINT)
    for _ in range(40):
        try:os.kill(pid,0)
        except ProcessLookupError:break
        time.sleep(.25)
    else:raise SystemExit('The app has not stopped; no force kill was attempted.')
    print('Old server stopped after an SQLite backup.',flush=True)


def start():
    domain='gui/'+str(os.getuid())
    agents=Path.home()/'Library/LaunchAgents'
    # Existing managed instances are replaced without touching unrelated processes.
    for label in LABELS:
        subprocess.run(['launchctl','bootout',domain+'/'+label],capture_output=True)
        result=subprocess.run(['launchctl','bootstrap',domain,str(agents/(label+'.plist'))],capture_output=True,text=True)
        if result.returncode:raise SystemExit('Could not load '+label+': '+result.stderr.strip())
    print('JobPilot will start at login and restart after a process failure.',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replace-running',action='store_true')
    parser.add_argument('--start',action='store_true')
    args=parser.parse_args()
    install()
    if args.replace_running:replace_running()
    if args.start:start()
