"""3.9 Today Chromium regression; real screen modules, offline-only fixture data."""
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]/'public'
HTML='''<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="app-shell" style="display:none"><span id="nyTime">10:12</span><span id="uaeTime">19:12</span><span id="marketStatus">● السوق الأمريكي مفتوح</span><span id="marketInterpretation">متوازن</span><span id="scannerHealthState">البيانات محفوظة</span></div></body></html>'''
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
    for width in (320,390,473):
        p=browser.new_page(viewport={'width':width,'height':900})
        errors=[]; calls=[]
        p.on('pageerror',lambda e: errors.append(str(e)))
        p.on('request',lambda r: calls.append(r.url))
        p.set_content(HTML)
        p.add_script_tag(content="window.fetch=()=>Promise.reject(new Error('OFFLINE'));window.scrollTo=()=>{};window.DT38LastScannerRows=[{symbol:'TEST',recommendationState:'SMART',price:10}];")
        for f in ['pulse-rebuild.css','palette39.css','viewport39.css','today39.css','scanner39.css','ai39.css','research39.css','performance39.css']:
            p.add_style_tag(content=(R/f).read_text())
        for f in ['today39.js','scanner39.js','ai39.js','research39.js','performance39.js','pulse-rebuild.js']:
            p.add_script_tag(content=(R/f).read_text())
        assert p.locator('.pu-scrolltabs [data-go]').count()==5
        assert p.locator('#dt39-today').count()==1
        assert not p.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not errors, errors
        for tab in ('market','ai','research','performance','today'):
            p.locator(f'.pu-scrolltabs [data-go="{tab}"]').click()
            assert p.locator(f'[data-screen="{tab}"]').is_visible(),tab
        assert not errors,errors
        assert not calls,calls
        assert not p.evaluate('document.documentElement.scrollWidth > innerWidth'),width
        print('PASS today and five tabs',width)
        p.close()
    browser.close()
print('TODAY39_BROWSER_PASS 3/3')
