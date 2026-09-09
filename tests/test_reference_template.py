import tempfile
import unittest
from pathlib import Path
from jobpilot.resume import build_packet
from jobpilot.tailoring import structured_resume
from jobpilot.reference_template import render_pdf
from test_core import profile,job

SOURCE='''SUMMARY
Full-stack engineer building web and mobile products.
TECHNICAL SKILLS
Languages: TypeScript, Python
Frontend: React
EXPERIENCE
Example Company - Bengaluru, India
Software Engineer II Dec 2024 – Present
Fleet platform (Lead)
Built React and TypeScript interfaces for 43 vehicles.
Designed Node.js APIs for 200-300 concurrent users.
EDUCATION
Example Institute - B.E., Computer Science
2019 – 2023 • GPA: 8.3 / 10'''


class ReferenceTemplateTests(unittest.TestCase):
    def test_reference_layout_preserves_facts_and_omits_added_role_header(self):
        p=dict(profile(),resume_text=SOURCE)
        layout=structured_resume(p,job())
        self.assertNotIn('Target role:',layout['text'])
        self.assertEqual(layout['blocks'][0],('h1','ALEX EXAMPLE'))
        for line in SOURCE.splitlines():self.assertIn(line,layout['text'])

    def test_approved_layout_does_not_fall_back_to_old_format(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'approved resume layout'):
                build_packet(d,profile(),job(),structured=True)

    @unittest.skipUnless(Path('/System/Library/Fonts/Supplemental/Times New Roman.ttf').is_file(),'Reference font is required')
    def test_letter_pdf_has_searchable_text_links_and_one_page(self):
        from pypdf import PdfReader
        p=dict(profile(),resume_text=SOURCE,linkedin='https://www.linkedin.com/in/example')
        with tempfile.TemporaryDirectory() as d:
            packet=build_packet(d,p,job(),structured=True)
            pdf=PdfReader(Path(d)/'packets'/job()['id']/'resume.pdf')
            self.assertEqual(len(pdf.pages),1)
            self.assertEqual(tuple(pdf.pages[0].mediabox),(0,0,612,792))
            text=' '.join(pdf.pages[0].extract_text().split())
            for line in SOURCE.splitlines():self.assertIn(' '.join(line.split()),text)
            self.assertTrue(pdf.pages[0].get('/Annots'))
            self.assertNotIn('docx',packet['formats'])

    @unittest.skipUnless(Path('/System/Library/Fonts/Supplemental/Times New Roman.ttf').is_file(),'Reference font is required')
    def test_overflow_fails_instead_of_cutting_evidence_or_shrinking_type(self):
        p=dict(profile(),resume_text=SOURCE)
        layout=structured_resume(p,job());layout['styled_blocks']*=20
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'cannot fit'):
                render_pdf(Path(d)/'resume.pdf',layout)
