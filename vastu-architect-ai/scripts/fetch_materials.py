"""Download a small, attributed set of CC0 assets for local use; never called at runtime."""
import json, subprocess
from pathlib import Path
base=Path(__file__).resolve().parents[1]
def fetch(url):
 return subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','60','--user-agent','AanganLocalStudio/0.2',url])
for asset in ['wood_floor']:
 data=json.loads(fetch('https://api.polyhaven.com/files/'+asset))
 (base/'public/materials'/f'{asset}-source.json').write_text(json.dumps(data,indent=2))
 for channel in ['diff','nor_gl','rough']:
  item=data[{'diff':'Diffuse','rough':'Rough'}.get(channel,channel)]['1k']['jpg'];dest=base/'public/materials'/f'{asset}-{channel}.jpg'
  dest.write_bytes(fetch(item['url']))
  print(dest.name,dest.stat().st_size)
