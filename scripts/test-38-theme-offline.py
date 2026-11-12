from pathlib import Path
from playwright.sync_api import sync_playwright
import re,base64,json
root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
html=re.sub(r'<script\b[^>]*\bsrc=[^>]+>\s*</script>','',html,flags=re.I)
html=re.sub(r'<link\b[^>]*\brel="stylesheet"[^>]*>','',html,flags=re.I)
html=html.replace('/dt-pulse-approved-wordmark.jpg','data:image/jpeg;base64,'+base64.b64encode((root/'dt-pulse-approved-wordmark.jpg').read_bytes()).decode())
res=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
 for width in [320,375,390,430]:
  errors=[]
  page=browser.new_page(viewport={'width':width,'height':844},device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded',timeout=16000)
  for css in ['styles.css','dt37-next.css','dt372-brand.css','weekly-profit-calc371.css','dt38.css']:
   page.add_style_tag(content=(root/css).read_text())
  page.add_script_tag(content="window.fetch=()=>Promise.reject(new Error('NETWORK_DISABLED_TEST'));window.scrollTo=()=>{};")
  page.add_script_tag(content=(root/'tab-nav.js').read_text())
  page.add_script_tag(content=(root/'dt38.js').read_text())
  page.locator('[data-tab="today"]').click()
  check={'width':width,'tab_count':page.locator('.main-tabs .tab-button').count(),
   'no_horizontal_overflow':page.evaluate('document.documentElement.scrollWidth<=innerWidth'),
   'logo_loaded':page.locator('.dt372-approved-brand').evaluate('(x)=>x.complete&&x.naturalWidth>0'),
   'today_content_present':all(page.locator(selector).count()==1 for selector in ['#tab-today .dt38-today-summary','#tab-today .dt38-today-research','#tab-today .dt38-today-ai']),
   'today_active':page.locator('#tab-today').evaluate('(x)=>x.classList.contains("active")')}
  if width==390:page.screenshot(path=str(root.parent/'DT38_THEME_TODAY_RENDER_390.png'),full_page=True)
  for tab in ['market','ai','research','performance']:
   page.locator(f'[data-tab="{tab}"]').click()
   check[f'{tab}_works']=page.locator('#tab-'+tab).evaluate('(x)=>x.classList.contains("active")')
  page.locator('#dt38Settings').click()
  check['settings_works']=page.locator('#tab-tools').evaluate('(x)=>x.classList.contains("active")')
  check['errors']=errors
  res.append(check)
  page.close()
 browser.close()
print(json.dumps(res,ensure_ascii=False,indent=2))
assert all(x['tab_count']==5 and not x['errors'] and all(v for k,v in x.items() if k not in ('width','tab_count','errors')) for x in res)
