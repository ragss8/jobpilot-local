"""Evaluate generated answers, not training loss. Only passing adapters may serve."""
import json,hashlib,time,argparse
from pathlib import Path
from mlx_lm import load,generate
from mlx_lm.sample_utils import make_sampler
root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--split',default='test');parser.add_argument('--limit',type=int,default=0);args=parser.parse_args()
rows=[json.loads(s) for s in (root/f'data/{args.split}.jsonl').read_text().splitlines()]
if args.limit:rows=rows[:args.limit]
def signature(obj):return sorted((f['kind'],f['count'],f['excluded']) for f in obj['features'])
report={'split':args.split,'rows':len(rows),'thresholds':{'json':1.0,'projectType':.95,'intent':.95,'features':.9,'evidence':1.0},'runs':{},'approved':False}
for name,adapter in [('base',None),('adapter',str(root/'runs/request-v1'))]:
 model,tokenizer=load(str(root/'models/qwen3-4b'),adapter_path=adapter)
 scores={k:0 for k in report['thresholds']};outputs=[]
 for i,row in enumerate(rows):
  prompt=tokenizer.apply_chat_template(row['messages'][:-1],tokenize=False,add_generation_prompt=True,enable_thinking=False)
  answer=generate(model,tokenizer,prompt=prompt,max_tokens=384,sampler=make_sampler(temp=0),verbose=False)
  target=json.loads(row['messages'][-1]['content']);checks={k:False for k in scores}
  try:
   obj=json.loads(answer);checks['json']=isinstance(obj,dict) and isinstance(obj.get('features'),list)
   checks['projectType']=obj['projectType']==target['projectType'];checks['intent']=obj['intent']==target['intent'];checks['features']=signature(obj)==signature(target)
   request=row['messages'][1]['content'].split('\nRequest: ',1)[1]
   checks['evidence']=all(isinstance(f['evidence'],str) and f['evidence'].strip() and f['evidence'] in request for f in obj['features'])
  except (ValueError,KeyError,TypeError):pass
  for k,v in checks.items():scores[k]+=bool(v)
  outputs.append({'request':row['messages'][1]['content'],'expected':target,'answer':answer,'checks':checks})
  if (i+1)%12==0:print(name,i+1,len(rows),scores,flush=True)
 report['runs'][name]={'metrics':{k:v/len(rows) for k,v in scores.items()},'outputs':outputs}
 del model
 import mlx.core as mx
 mx.clear_cache()
metrics=report['runs']['adapter']['metrics'];base=report['runs']['base']['metrics']
report['approved']=args.split=='test' and not args.limit and all(metrics[k]>=v and metrics[k]>=base[k] for k,v in report['thresholds'].items())
report['adapter_sha256']=hashlib.sha256((root/'runs/request-v1/adapters.safetensors').read_bytes()).hexdigest()
report['dataset_sha256']=hashlib.sha256((root/f'data/{args.split}.jsonl').read_bytes()).hexdigest()
report['system_sha256']=hashlib.sha256((root/'system.txt').read_bytes()).hexdigest()
path=root/'runs/request-v1'/('evaluation.json' if not args.limit else 'evaluation-sample.json');path.write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='runs'},indent=2),flush=True)
print({name:value['metrics'] for name,value in report['runs'].items()},flush=True)
