from pathlib import Path
import re,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
# No external requests: use original DOM and local CSS/JS injected without fetching.
html=re.sub(r'<script\b[^>]*\bsrc=[^>]+>\s*</script>','',html,flags=re.I)
html=re.sub(r'<link\b[^>]*\brel="stylesheet"[^>]*>','',html,flags=re.I)
html=re.sub(r'<link\b[^>]*\bhref="[^"]+"[^>]*\brel="stylesheet"[^>]*>','',html,flags=re.I)
html=html.replace('</head>','<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data: \'self\'">\n</head>')
res={};errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
  page=browser.new_page(viewport={'width':320,'height':844},device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded',timeout=15000)
  for css in ['styles.css','dt37-next.css','dt372-brand.css','dt38.css']:
   page.add_style_tag(content=(root/css).read_text())
  page.add_script_tag(content="window.fetch=()=>Promise.reject(new Error('NETWORK_DISABLED_TEST'));window.scrollTo=()=>{};")
  page.add_script_tag(content=(root/'tab-nav.js').read_text())
  page.add_script_tag(content=(root/'dt38.js').read_text())
  res['tabs']=page.locator('.main-tabs .tab-button[data-tab]').count()
  res['width_overflow']=page.evaluate('document.documentElement.scrollWidth>window.innerWidth')
  res['width_320']=not res['width_overflow']
  for w in [360,390,430]:
   page.set_viewport_size({'width':w,'height':844})
   res[f'width_{w}']=not page.evaluate('document.documentElement.scrollWidth>window.innerWidth')
  for tab in ['today','ai','research','performance','market']:
   page.locator(f'.main-tabs [data-tab={tab}]').click();res[f'tab_{tab}']=page.locator('#tab-'+tab).evaluate('(n)=>n.classList.contains("active")')
  page.evaluate('''const box=document.querySelector('#top5');box.innerHTML='<article class="mini-rec"><h3>NVDA</h3></article>';window.dispatchEvent(new CustomEvent('dt38:scanner-rows',{detail:[{symbol:'NVDA',recommendationState:'CONFIRMED',price:101,target1:106,stopLoss:99,entryLow:100,entryHigh:101,stateReason:'Valid entry conditions'}]}))''')
  page.locator('#top5 .mini-rec').click();res['popup_open']=page.locator('#dt38SignalDialog').evaluate('(d)=>d.open')
  page.locator('#dt38SignalDialog .dt38-close').click()
  page.locator('#dt38Settings').click();res['settings_visible']=page.locator('#tab-tools').evaluate('(n)=>n.classList.contains("active")')
  res['errors']=errors
  # Optional visual snapshot: enable locally as needed; no network requests.
  browser.close()
except Exception as e:res['failure']=str(e)
print(json.dumps(res,ensure_ascii=False,indent=2))
assert all(v is True for k,v in res.items() if k.startswith('tab_') or k in ('popup_open','settings_visible')) and res.get('tabs')==5 and not res.get('width_overflow') and all(res.get(f'width_{w}') for w in [320,360,390,430]) and not res.get('errors') and not res.get('failure'), 'Chromium interactive UI test failed'
