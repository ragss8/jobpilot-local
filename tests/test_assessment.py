import io,json,unittest
from unittest.mock import patch
from jobpilot.assessment import assess
class FitReviewValidation(unittest.TestCase):
 def test_contradiction_is_not_approved(self):
  raw={'message':{'content':json.dumps({'fit':'strong','reason':'Supported','gaps':['Requires Kafka'],'evidence_ids':[0]})}}
  with patch('urllib.request.OpenerDirector.open',return_value=io.BytesIO(json.dumps(raw).encode())):
   self.assertEqual(assess({'resume_text':'React engineer'}, {'title':'Engineer','description':'Requires Kafka'},'qwen3:4b')['fit'],'uncertain')
 def test_invalid_evidence_rejected(self):
  raw={'message':{'content':json.dumps({'fit':'strong','reason':'Supported','gaps':[],'evidence_ids':[1000]})}}
  with patch('urllib.request.OpenerDirector.open',return_value=io.BytesIO(json.dumps(raw).encode())):
   with self.assertRaises(ValueError):assess({'resume_text':'React engineer'},{'title':'Engineer','description':'React'},'qwen3:4b')
if __name__=='__main__':unittest.main()
