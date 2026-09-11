"""Reproducible extraction corpus. ResPlan contributes room counts only.
Synthetic conversation templates supply intent/use labels, never building rules.
"""
import json,random,hashlib
from pathlib import Path
from inspect_data import load_plans
root=Path(__file__).resolve().parent
system=(root/'system.txt').read_text()
rng=random.Random(41)
rows={k:[] for k in ('train','valid','test')}
def row(split,text,kind,active,features,intent='new',source='synthetic'):
 answer={'projectType':kind,'intent':intent,'features':[{'kind':k,'count':n,'evidence':e,'excluded':x} for k,n,e,x in features]}
 rows[split].append({'messages':[{'role':'system','content':system},{'role':'user','content':f'Active project: {active or "none"}\nRequest: {text}'},{'role':'assistant','content':json.dumps(answer,separators=(',',':'))}], 'source':source})
# Splits use different language templates, not a random row split of paraphrases.
verbs={'train':['Design','Create','Plan','I want'], 'valid':['Please prepare'], 'test':['Could you draw up']}
amenities={'house':['bedroom','kitchen','bathroom','garden','theatre'],'resort':['cottage','pool','reception','restaurant','parking'],'apartment':['bedroom','kitchen','bathroom','lift','parking']}
for split in rows:
 for kind,fs in amenities.items():
  for i in range(65 if split=='train' else 10):
   kinds=rng.sample(fs,rng.randint(1,3));items=[(k,rng.randint(1,4)) for k in kinds]
   phrases=[f'{n} {k}{"s" if n>1 else ""}' for k,n in items]
   label='apartment building' if kind=='apartment' else kind
   text=f'{rng.choice(verbs[split])} a {label} on a 60 x 90 ft plot with '+', '.join(phrases)+'.'
   row(split,text,kind,rng.choice([None,'house','resort','apartment']),[(k,n,p,False) for (k,n),p in zip(items,phrases)])
  for i,k in enumerate(fs):
   for active in ('house','resort','apartment'):
    phrase=f'{i+1} {k}{"s" if i else ""}'
    prefix={'train':'Add','valid':'Please include','test':'Revise the current design to include'}[split]
    row(split,f'{prefix} {phrase}.',active,active,[(k,i+1,phrase,False)],'edit')
    prefix={'train':'Remove the','valid':'Omit the','test':'We no longer want the'}[split]
    row(split,f'{prefix} {k}.',active,active,[(k,None,k,True)],'edit')
 for kind in ('hospital','school','airport','warehouse','office building','shopping mall'):
  row(split,f'{rng.choice(verbs[split])} a {kind} on a 100 x 100 ft plot.','unsupported','house',[])
 for active in ('house','resort','apartment'):
  row(split,{'train':'Use a 70 x 90 ft plot instead.','valid':'Change the site to 80 x 120 ft.','test':'Keep the rooms; resize the plot to 75 x 110 feet.'}[split],active,active,[],'edit')
  row(split,{'train':'Start over. Design a resort with a pool.','valid':'New project: a resort with a pool.','test':'A different project now: a resort with a pool.'}[split],'resort',active,[('pool',None,'pool',False)])
# Dataset-derived room count briefs retain the canonical source partitions.
plans=load_plans();splits=json.loads((root/'sources/split.json').read_text())
for split,key in [('train','train'),('valid','val'),('test','test')]:
 ids=set(splits[key]);eligible=[p for p in plans if p['id'] in ids];rng.shuffle(eligible)
 for p in eligible[:60 if split=='train' else 12]:
  counts=[]
  for k in ('bedroom','bathroom','kitchen','living'):
   geom=p.get(k);n=0 if geom is None or geom.is_empty else len(geom.geoms) if hasattr(geom,'geoms') else 1
   if n:counts.append((k,n))
  phrases=[f'{n} {k}{"s" if n>1 else ""}' for k,n in counts]
  row(split,f'{rng.choice(verbs[split])} a house with '+', '.join(phrases)+'.','house',None,[(k,n,e,False) for (k,n),e in zip(counts,phrases)],source=f'ResPlan:{p["id"]}')
manifest={'seed':41,'system_sha256':hashlib.sha256(system.encode()).hexdigest(),'source':'sources/manifest.json','description':'Synthetic extraction requests plus ResPlan room-count requests. Template-disjoint splits. No geometry or regulatory rules learned.','splits':{}}
for split,values in rows.items():
 rng.shuffle(values)
 path=root/'data'/f'{split}.jsonl';path.parent.mkdir(exist_ok=True)
 path.write_text(''.join(json.dumps(v)+'\n' for v in values))
 manifest['splits'][split]={'rows':len(values),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(root/'data/manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
