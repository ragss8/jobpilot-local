"""Download only the pinned, openly licensed source files used in this project."""
from pathlib import Path
import urllib.request,json,hashlib,ssl,certifi
context=ssl.create_default_context(cafile=certifi.where())
root=Path(__file__).resolve().parent/'sources';root.mkdir(exist_ok=True)
api='https://api.github.com/repos/m-agour/ResPlan/commits/main'
commit=json.load(urllib.request.urlopen(api,context=context))['sha']
manifest={'repository':'https://github.com/m-agour/ResPlan','revision':commit,'data_license':'CC-BY-4.0','files':[]}
for name in ['LICENSE','README.md','split.json','croissant.json','ResPlan.zip']:
 url=f'https://raw.githubusercontent.com/m-agour/ResPlan/{commit}/{name}'
 print('Downloading',name,flush=True)
 with urllib.request.urlopen(url,timeout=120,context=context) as res,open(root/name,'wb') as out:
  while chunk:=res.read(1024*1024):out.write(chunk)
 path=root/name
 manifest['files'].append({'name':name,'url':url,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(root/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('Sources pinned and checksummed.',flush=True)
