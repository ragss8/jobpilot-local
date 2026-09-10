"""Opt-in integration: real installed Ollama + browser, no model-response mocks."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1];art=root/'artifacts';art.mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE'],args=['--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173')
 # Migration is scoped to architecture keys; an unrelated application key survives.
 page.evaluate("localStorage.removeItem('aangan-fresh-chat-v3'); localStorage.setItem('aangan-project-v1','old design'); localStorage.setItem('jobpilot-test-sentinel','keep')")
 page.reload()
 expect(page.get_by_role('heading',name='Tell us how you want to live.')).to_be_visible()
 assert page.evaluate("localStorage.getItem('aangan-project-v1')") is None
 assert page.evaluate("localStorage.getItem('jobpilot-test-sentinel')")=='keep'
 assert page.locator('#floor-plan').count()==0
 page.screenshot(path=str(art/'fresh-chat.png'))
 page.get_by_role('button',name='An independent G+3 house',exact=False).click()
 page.get_by_role('button',name='Generate architecture').click()
 print('Sent complete G+3 brief to real Ollama',flush=True)
 for step in range(26):
  page.wait_for_timeout(5000)
  print('Progress',step,page.locator('.generation-status').all_text_contents(), 'errors',errors,flush=True)
  if errors or page.get_by_role('button',name='Generate architecture').count():break
 page.screenshot(path=str(art/'generation-result.png'),full_page=True)
 (art/'generation-dom.txt').write_text(page.locator('body').inner_text())
 state=page.evaluate("JSON.parse(localStorage.getItem('aangan-conversation-v3'))")
 (art/'live-conversation.json').write_text(json.dumps(state,indent=2))
 print(state['messages'][-1]['text'],flush=True)
 assert state['result'] and len(state['result']['proposals'])==3,state['messages'][-1]['text']
 p=state['result']['proposals'][0]['project']
 assert len(p['floors'])==5
 assert [r['type'] for r in p['floors'][0]['rooms'] if r['type'] not in ['stairs','lift','entrance']]==['parking']
 assert sorted(r['type'] for r in p['floors'][2]['rooms'] if r['type'] in ['bedroom','master'])==['bedroom','bedroom']
 assert any(r['type']=='jacuzzi' for r in p['floors'][4]['rooms'])
 assert any(f['kind']=='pergola' for r in p['floors'][4]['rooms'] for f in r['furniture'])
 page.screenshot(path=str(art/'chat-ground-plan.png'))
 page.get_by_label('Current floor',exact=True).select_option('1')
 page.screenshot(path=str(art/'chat-first-floor.png'))
 page.get_by_label('Current floor',exact=True).select_option('4')
 page.screenshot(path=str(art/'chat-terrace-plan.png'))
 page.get_by_role('button',name='3D view',exact=True).click()
 expect(page.locator('.viewer canvas')).to_be_visible(timeout=20000)
 page.wait_for_timeout(1200)
 page.screenshot(path=str(art/'chat-whole-house.png'))
 page.get_by_label('Current floor',exact=True).select_option('0')
 page.get_by_role('button',name='Walkthrough',exact=True).click()
 page.wait_for_timeout(600)
 print('Room selectors:',page.locator('select').evaluate_all('(els)=>els.map(e=>[e.getAttribute("aria-label"),Array.from(e.options).map(o=>o.textContent)])'),flush=True)
 page.screenshot(path=str(art/'chat-walk.png'))
 # Test normal persistence, then a dimension-only follow-up retains all five levels.
 page.reload()
 expect(page.get_by_label('Current floor',exact=True)).to_be_visible()
 page.get_by_label('Describe your house').fill('Use 20 × 30 instead')
 page.get_by_role('button',name='Generate architecture').click()
 expect(page.get_by_text('I couldn’t find a layout',exact=False)).to_be_visible(timeout=10000)
 assert page.locator('#floor-plan').count()==0
 page.get_by_label('Describe your house').fill('Use 30 × 40 instead')
 page.get_by_role('button',name='Generate architecture').click()
 expect(page.get_by_label('Current floor',exact=True)).to_be_visible(timeout=10000)
 assert len(page.evaluate("JSON.parse(localStorage.getItem('aangan-conversation-v3')).brief.floors"))==5
 page.get_by_role('button',name='New conversation',exact=True).click()
 expect(page.get_by_role('heading',name='Tell us how you want to live.')).to_be_visible()
 assert page.evaluate("localStorage.getItem('aangan-conversation-v3')") is None
 assert page.evaluate("localStorage.getItem('jobpilot-test-sentinel')")=='keep'
 page.reload();expect(page.get_by_role('heading',name='Tell us how you want to live.')).to_be_visible()
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(art/'fresh-chat-mobile.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close()
 print('PASS: live model, five-floor program, reset scope, persistence, 2D/3D/walk, follow-up and mobile',flush=True)
