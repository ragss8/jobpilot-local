"""Loopback-only local inference. An adapter needs a matching passing report."""
from http.server import HTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import json,hashlib
from mlx_lm import load,generate
from mlx_lm.sample_utils import make_sampler
root=Path(__file__).resolve().parent
run=root/'runs/request-v1'
approved=False
if (run/'evaluation.json').exists():
 report=json.loads((run/'evaluation.json').read_text())
 approved=report.get('approved') is True and report.get('adapter_sha256')==hashlib.sha256((run/'adapters.safetensors').read_bytes()).hexdigest() and report.get('system_sha256')==hashlib.sha256((root/'system.txt').read_bytes()).hexdigest()
model,tokenizer=load(str(root/'models/qwen3-4b'),adapter_path=str(run) if approved else None)
class Handler(BaseHTTPRequestHandler):
 def send(self,code,obj):
  body=json.dumps(obj).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  if self.path!='/health':return self.send(404,{'error':'Not found'})
  self.send(200,{'ready':True,'approved':approved,'model':'Qwen3-4B planning adapter' if approved else 'Qwen3-4B base','system_sha256':hashlib.sha256((root/'system.txt').read_bytes()).hexdigest()})
 def do_POST(self):
  if self.path!='/predict':return self.send(404,{'error':'Not found'})
  try:
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<=64000:return self.send(413,{'error':'Request too large'})
   body=json.loads(self.rfile.read(length));messages=body['messages']
   if not isinstance(messages,list) or len(messages)!=2 or [m['role'] for m in messages]!=['system','user'] or not all(isinstance(m['content'],str) for m in messages):raise ValueError('Invalid messages')
   if messages[0]['content']!=(root/'system.txt').read_text():raise ValueError('Extraction schema does not match this model service')
   prompt=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=False)
   content=generate(model,tokenizer,prompt=prompt,max_tokens=1300,sampler=make_sampler(temp=0),verbose=False)
   self.send(200,{'content':content,'adapter':approved})
  except (ValueError,KeyError,TypeError) as e:self.send(400,{'error':str(e)})
  except (BrokenPipeError,ConnectionResetError):pass
print(f'Local planning inference on 127.0.0.1:11435; adapter approved={approved}',flush=True)
HTTPServer(('127.0.0.1',11435),Handler).serve_forever()
