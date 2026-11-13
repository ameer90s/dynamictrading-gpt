"""Read-only 3.9 AI report rendering regression using actual ai39.js + ai39.css."""
from pathlib import Path
from playwright.sync_api import sync_playwright
P=Path(__file__).resolve().parents[1]/'public'
record={"latest":{"at":"2026-11-12T23:15:00Z","model":"adaptive","serviceStatus":"ACTIVE","coverage":{"coveragePct":75}},"transitions":[{"symbol":"NVDA","state":"SMART","reason":"SESSION_RETURN_LOW","checks":{"quote":"NOT_VERIFIED"},"features":{"sector":"Technology"}}],"internalReport":{"day":"2026-11-12","generatedAt":"2026-11-12T23:15:00Z","coverage":{"eligible":80,"coveragePct":75},"outcomes":{"uniqueClosed":3,"winners":2,"losers":1,"netPaperUsd":6.5},"decisionCases":[{"evidenceId":"record-1","causalConclusion":"NOT_VERIFIED","hypotheses":"{\"status\":\"NOT_VERIFIED\"}"}],"rejectionReview":[{"reason":"SESSION_RETURN_LOW","evaluations":14}],"stageStates":{"scan":"RECORDED"}}}
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']);
 for width in (320,390,473):
  page=b.new_page(viewport={"width":width,"height":900},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  page.set_content('<html lang="ar" dir="rtl"><head></head><body><div id="pulse-app"></div></body></html>')
  page.add_style_tag(content=(P/'ai39.css').read_text());page.add_script_tag(content=(P/'ai39.js').read_text())
  page.evaluate('d=>{document.querySelector("#pulse-app").innerHTML=window.DT39AIScreen.template();window.DT39AIScreen.render(d)}',record)
  assert not errors,errors
  assert '2026' in page.locator('#a39-updated').inner_text()
  assert 'توقيت الإمارات' in page.locator('#a39-updated').inner_text()
  assert '2 / 1' in page.locator('#a39-report-brief').inner_text()
  assert '6.50' in page.locator('#a39-report-brief').inner_text()
  assert page.locator('#dt39-ai-scanner .a39-accordion details').count()==4
  page.locator('#dt39-ai-scanner .a39-accordion details').first.locator('summary').click()
  assert 'مرجع الدليل' in page.locator('#a39-analysis').inner_text()
  assert '{"status"' not in page.locator('#a39-analysis').inner_text()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.screenshot(path=f'/mnt/data/DT39_AI_REPORT_REAL_CODE_{width}.png',full_page=True)
  page.evaluate('()=>{window.DT39AIScreen.render(null)}')
  assert 'لم يصل تقرير' in page.locator('#a39-report-brief').inner_text()
  assert 'غير متوفر' in page.locator('#a39-updated').inner_text()
  assert not errors,errors
  page.close();print('PASS ai report browser',width)
 b.close()
print('AI39_REPORT_BROWSER_PASS 3/3')
