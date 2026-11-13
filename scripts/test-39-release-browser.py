from pathlib import Path
from playwright.sync_api import sync_playwright
import re,json
ROOT=Path(__file__).resolve().parents[1]/'public'
html=(ROOT/'index.html').read_text()
css=re.findall(r'<link[^>]+href="(/[^"?]+\.css)(?:\?[^\"]*)?"[^>]*>',html)
scripts=re.findall(r'<script[^>]+src="(/[^"?]+\.(?:js|mjs))(?:\?[^\"]*)?"[^>]*>\s*</script>',html)
html=re.sub(r'<script\b[^>]*\bsrc=[^>]*>\s*</script>','',html,flags=re.I)
html=re.sub(r'<link\b[^>]*\brel="stylesheet"[^>]*>','',html,flags=re.I)
print('ASSETS',len(css),len(scripts),flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
 for width in (320,390,473):
  page=browser.new_page(viewport={'width':width,'height':900})
  errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded')
  page.add_script_tag(content='window.fetch=()=>Promise.reject(new Error("TEST_NETWORK_DISABLED"));window.scrollTo=()=>{};')
  for src in css:
   path=ROOT/src.lstrip('/')
   if path.is_file():page.add_style_tag(content=path.read_text())
  for src in scripts:
   path=ROOT/src.lstrip('/')
   if path.is_file() and path.suffix=='.js':
    try:page.add_script_tag(content=path.read_text())
    except Exception as e: errs.append('script '+src+':'+str(e)[:180])
  page.wait_for_timeout(250)
  rows=[]
  for tab in ('today','market','ai','research','performance'):
   btn=page.locator(f'.pu-scrolltabs [data-go="{tab}"]');count=btn.count()
   if count:btn.click(timeout=2500)
   visible=page.locator(f'.pu-screen[data-screen="{tab}"]').is_visible() if page.locator(f'.pu-screen[data-screen="{tab}"]').count() else False
   overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth')
   rows.append({'tab':tab,'button':count,'visible':visible,'overflow':overflow})
   if width==390:page.screenshot(path=str(Path('/mnt/data')/f'DT39_RELEASE_DOM_{tab}_390.png'))
  print(json.dumps({'width':width,'rows':rows,'errors':errs[:8]},ensure_ascii=False),flush=True)
  assert all(x['button']==1 and x['visible'] and not x['overflow'] for x in rows), 'BAD_UI_NAV'
  assert not errs,'JS_ERRORS'
  page.close()
 browser.close()
