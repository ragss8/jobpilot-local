from zipfile import ZipFile
import io,pickle,collections
# The source format is pickle. Only these inert geometry/data constructors are
# allowed; arbitrary classes, functions and persistent references are refused.
class SafeUnpickler(pickle.Unpickler):
 def find_class(self,module,name):
  if (module,name)==('shapely.io','from_wkb'):
   from shapely import from_wkb
   return from_wkb
  if (module,name)==('collections','defaultdict'):return collections.defaultdict
  if module in ('numpy.core.multiarray','numpy._core.multiarray') and name=='scalar':
   import numpy as np
   return np.core.multiarray.scalar
  if (module,name)==('numpy','dtype'):
   import numpy as np
   return np.dtype
  if module=='builtins' and name in ('set','frozenset','dict','list','tuple','str','int','float'):return getattr(__import__('builtins'),name)
  raise pickle.UnpicklingError(f'Unsupported constructor {module}.{name}')
 def persistent_load(self,pid):raise pickle.UnpicklingError('Persistent references are unsupported')
def load_plans():
 from pathlib import Path
 import hashlib,json
 root=Path(__file__).resolve().parent/'sources'
 manifest=json.loads((root/'manifest.json').read_text())
 expected=next(f['sha256'] for f in manifest['files'] if f['name']=='ResPlan.zip')
 if hashlib.sha256((root/'ResPlan.zip').read_bytes()).hexdigest()!=expected:raise ValueError('Dataset checksum mismatch')
 with ZipFile(root/'ResPlan.zip') as z:return SafeUnpickler(io.BytesIO(z.read('ResPlan.pkl'))).load()
if __name__=='__main__':
 data=load_plans();print(type(data),len(data));print(type(data[0]));print({k:(type(v).__name__,str(v)[:180]) for k,v in data[0].items()})
