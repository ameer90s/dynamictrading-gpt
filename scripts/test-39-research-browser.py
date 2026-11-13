"""Offline Chromium smoke test. Mock inputs ONLY; no paid APIs or live Netlify."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64
R=Path(__file__).resolve().parents[1]/'public'
styles='\n'.join((R/x).read_text() for x in ['pulse-rebuild.css','today39.css','scanner39.css','ai39.css','research39.css','performance39.css'])
for fn in ('dt-approved-header.png','dt-approved-research.png','dt-approved-ai.png','dt-approved-candles.png'):
 styles=styles.replace('/'+fn,'data:image/png;base64,'+base64.b64encode((R/fn).read_bytes()).decode())
backend='<div class="app-shell" style="display:none"><span id="marketStatus">● السوق الأمريكي مغلق</span><span id="marketInterpretation">متوازن</span><span id="scannerHealthState">غير متحقق</span><span id="uaeTime">—</span><span id="nyTime">—</span></div>'
with sync_playwright() as tool:
 browser=tool.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in (320,360,390,473):
  page=browser.new_page(viewport={'width':width,'height':590})
  errors=[];calls=[]
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.on('request',lambda request:calls.append(request.url))
  page.set_content('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body>'+backend+'</body></html>')
  page.add_style_tag(content=styles)
  for file in ('today39.js','scanner39.js','ai39.js','research39.js','performance39.js'):
   page.add_script_tag(content=(R/file).read_text())
  page.add_script_tag(content=(R/'pulse-rebuild.js').read_text())
  page.locator('.pu-scrolltabs [data-go="research"]').click()
  assert page.locator('#dt39-research').count()==1
  assert page.locator('#r39-total').inner_text()=='—'
  assert page.locator('.r39-offer').count()==0
  assert page.locator('.r39-actions button').count()==0
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
  page.evaluate('''()=>{window.DT38LastResearch={day:'2026-11-10',experiments:[{id:'x',symbol:'ABC',hypothesis_ar:'مراجعة فقط',test_ar:'دليل محفوظ'}],localHypotheses:[]};window.dispatchEvent(new CustomEvent('dt38:research'))}''')
  assert page.locator('#r39-total').inner_text()=='1'
  assert page.locator('.r39-offer').count()==1
  assert page.locator('.r39-actions button').count()==2
  assert page.locator('#r39-accepted').inner_text()=='—' # no owner decisions fetched, no fabricated approvals
  page.locator('[data-r39-tab="openai"]').click()
  assert page.locator('[data-r39-pane="openai"]').is_visible()
  page.locator('[data-r39-tab="recommendations"]').click()
  assert page.locator('[data-r39-pane="recommendations"]').is_visible()
  page.locator('.r39-accordions details').first.locator('summary').click()
  assert page.locator('.r39-accordions details').first.get_attribute('open') is not None
  assert not calls, calls
  assert not errors, errors
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
  print('PASS researcher offline',width)
  page.close()
 browser.close()
