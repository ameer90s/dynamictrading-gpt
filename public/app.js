const $ = (id) => document.getElementById(id);
let dt36LastAuditAt=0,dt36AuditPending=false;
// v2.8.1: storage access must never prevent the rest of the UI from booting.
const storage = {
  getItem(key){ try { return window.localStorage.getItem(key); } catch { return null; } },
  setItem(key,value){ try { window.localStorage.setItem(key,value); } catch {} },
  removeItem(key){ try { window.localStorage.removeItem(key); } catch {} }
};
const STORE = {
  history: "dynamic_trading_history", universe: "dynamic_trading_universe", latest: "dynamic_trading_latest_v35", mode: "dynamic_trading_strategy_mode_v35",
  pro: "dynamic_trading_pro", selected: "dynamic_trading_selected_trade_v282", lastHeavyScan: "dynamic_trading_last_heavy_scan", lastProFetch: "dynamic_trading_last_pro_fetch"
};
let currentData = safeJson(storage.getItem(STORE.latest));
if(currentData?.strategyVersion && currentData.strategyVersion !== '3.6') currentData = null;
let proData = safeJson(storage.getItem(STORE.pro));
let selectedTrade = null;
let selectionCarryOver = false;
let carryRefreshKey = "";
let chartRange = 60;
let proAutoTimer = null;
let lastNyDate = "";
let calibrationSyncBusy = false;
let lastCalibrationHash = "";
let marketClockState = null;

async function sendTelemetry(event,payload={}){try{await fetch("/api/telemetry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,...payload})})}catch{}}
function visibleConfirmed(){return (currentData?.display8||[]).filter(x=>x.recommendationState==="CONFIRMED")}
function logRevalidationViews(data){for(const r of (data?.display8||[]).filter(x=>x.recommendationState==="CONFIRMED"&&x.signalId)){sendTelemetry("REVALIDATION_VIEW",{signalId:r.signalId,symbol:r.symbol,source:"app-refresh",generatedAt:data.generatedAt,meta:{state:r.recommendationState,shadow:r.recommendedTarget||"",signalAgeSec:Number(r.signalAgeSec||0),entry:Number(r.price||0)}})}}

function safeJson(v){ try{return v?JSON.parse(v):null}catch{return null} }
function tickClocks(){
  const now = new Date();
  const timeOpts = { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false };
  const dateOpts = { weekday:"long", day:"numeric", month:"long", year:"numeric" };
  $("uaeTime").textContent = new Intl.DateTimeFormat("ar-AE", {...timeOpts,timeZone:"Asia/Dubai"}).format(now);
  $("uaeDate").textContent = new Intl.DateTimeFormat("ar-AE", {...dateOpts,timeZone:"Asia/Dubai"}).format(now);
  $("nyTime").textContent = new Intl.DateTimeFormat("en-US", {...timeOpts,timeZone:"America/New_York"}).format(now);
  $("nyDate").textContent = new Intl.DateTimeFormat("ar-AE", {...dateOpts,timeZone:"America/New_York"}).format(now);
  const clock = nyClock(now);
  updateMarketClockFallback(clock);
  updateTimingNote(now, clock);
  if(lastNyDate && lastNyDate !== clock.dateKey) checkSelection(true);
  if(selectionCarryOver && clock.minutes>=570 && clock.minutes<571 && carryRefreshKey!==clock.dateKey){carryRefreshKey=clock.dateKey;checkSelection(true);}
  lastNyDate = clock.dateKey;
}
function nyClock(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(now).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  const h=Number(parts.hour)%24,m=Number(parts.minute);
  return {dateKey:`${parts.year}-${parts.month}-${parts.day}`,weekday:parts.weekday,minutes:h*60+m};
}
const FALLBACK_HOLIDAYS = new Map([
  ["2026-01-01","رأس السنة"],["2026-01-19","عطلة مارتن لوثر كينغ"],["2026-02-16","يوم الرؤساء"],["2026-04-03","الجمعة العظيمة"],["2026-05-25","يوم الذكرى"],["2026-06-19","جونتينث"],["2026-07-03","عيد الاستقلال"],["2026-09-07","عيد العمال"],["2026-11-26","عيد الشكر"],["2026-12-25","عيد الميلاد"],
  ["2027-01-01","رأس السنة"],["2027-01-18","عطلة مارتن لوثر كينغ"],["2027-02-15","يوم الرؤساء"],["2027-03-26","الجمعة العظيمة"],["2027-05-31","يوم الذكرى"],["2027-06-18","جونتينث"],["2027-07-05","عيد الاستقلال"],["2027-09-06","عيد العمال"],["2027-11-25","عيد الشكر"],["2027-12-24","عيد الميلاد"],
  ["2028-01-17","عطلة مارتن لوثر كينغ"],["2028-02-21","يوم الرؤساء"],["2028-04-14","الجمعة العظيمة"],["2028-05-29","يوم الذكرى"],["2028-06-19","جونتينث"],["2028-07-04","عيد الاستقلال"],["2028-09-04","عيد العمال"],["2028-11-23","عيد الشكر"],["2028-12-25","عيد الميلاد"]
]);
const FALLBACK_EARLY_CLOSES = new Set(["2026-11-27","2026-12-24","2027-11-26","2028-07-03","2028-11-24"]);
function fallbackMarketState(clock){
  const holidayNameAr=FALLBACK_HOLIDAYS.get(clock.dateKey)||null;
  const weekend=["Sat","Sun"].includes(clock.weekday);
  const isTradingDay=!weekend&&!holidayNameAr;
  const earlyClose=FALLBACK_EARLY_CLOSES.has(clock.dateKey);
  const close=earlyClose?780:960,postClose=earlyClose?1020:1200;
  let session="CLOSED";
  if(!isTradingDay)session=holidayNameAr?"CLOSED_HOLIDAY":"CLOSED_WEEKEND";
  else if(clock.minutes>=240&&clock.minutes<570)session="PREMARKET";
  else if(clock.minutes>=570&&clock.minutes<close)session="REGULAR";
  else if(clock.minutes>=close&&clock.minutes<postClose)session="POSTMARKET";
  return {dateKey:clock.dateKey,session,isTradingDay,holidayNameAr,earlyClose,regularCloseMinute:close,postCloseMinute:postClose};
}
function updateMarketClockFallback(clock){
  if(marketClockState?.dateKey===clock.dateKey)return;
  applyMarketClockState(fallbackMarketState(clock),true);
}
function applyMarketClockState(state,fallback=false){
  if(!state)return; marketClockState=state;
  const el=$("marketStatus"); if(!el)return;
  el.classList.remove("market-open","market-pre","market-post","market-holiday");
  let text="● السوق الأمريكي مغلق";
  if(state.session==="REGULAR"){text=`● السوق الأمريكي مفتوح${state.earlyClose?" · إغلاق مبكر 13:00 ET":""}`;el.classList.add("market-open");}
  else if(state.session==="PREMARKET"){text="● PRE-MARKET · ما قبل السوق";el.classList.add("market-pre");}
  else if(state.session==="POSTMARKET"){text="● POST-MARKET · ما بعد السوق";el.classList.add("market-post");}
  else if(state.session==="CLOSED_HOLIDAY"){text=`● مغلق اليوم · ${state.holidayNameAr||"عطلة السوق"}`;el.classList.add("market-holiday");}
  else if(state.session==="CLOSED_WEEKEND")text="● مغلق · عطلة نهاية الأسبوع";
  el.textContent=text;
  el.title=fallback?"حالة محلية احتياطية؛ يتم تحديثها من تقويم السوق.":"حالة الجلسة حسب تقويم NYSE وتوقيت نيويورك.";
  const map={premarket:"PREMARKET",regular:"REGULAR",postmarket:"POSTMARKET",closed:"CLOSED"};
  Object.entries(map).forEach(([id,session])=>{const chip=$("session-"+id);if(chip)chip.classList.toggle("active",state.session===session||(session==="CLOSED"&&String(state.session).startsWith("CLOSED")));});
  const detail=$("sessionDetail");
  if(detail){
    if(state.session==="CLOSED_HOLIDAY")detail.textContent=`السوق مغلق بسبب ${state.holidayNameAr}. لا PRE أو Regular أو POST اليوم.`;
    else if(state.earlyClose)detail.textContent="جلسة إغلاق مبكر: Regular حتى 13:00 ET وPost حتى 17:00 ET.";
    else detail.textContent="Pre 04:00–09:30 · Regular 09:30–16:00 · Post 16:00–20:00 بتوقيت نيويورك.";
  }
}
async function refreshMarketClock(){
  try{const r=await fetch("/api/market-clock",{cache:"no-store"});if(!r.ok)return;applyMarketClockState(await r.json(),false);}catch{}
}
function updateTimingNote(now,clock){
  const note=$("recommendationTiming"); if(!note)return;
  const uaeTarget=uaeTimeForNyTarget(now,570);
  const market=(marketClockState?.dateKey===clock.dateKey)?marketClockState:fallbackMarketState(clock);
  if(selectedTrade){ note.textContent=`🔒 صفقة مفتوحة — يستمر البحث والمراقبة. سجّل النتيجة قبل اعتماد صفقة أخرى.`; }
  if(!market.isTradingDay){ note.textContent=market.holidayNameAr?`السوق مغلق اليوم بسبب ${market.holidayNameAr} — لا تصدر توصية جديدة حتى يوم التداول التالي.`:"السوق مغلق اليوم — التوصية التالية في يوم التداول التالي."; }
  else if(clock.minutes<570) note.textContent=`يبدأ الاكتشاف الديناميكي 09:30 نيويورك (${uaeTarget} الإمارات).`;
  else if(clock.minutes<610) note.textContent="مرحلة اكتشاف Stocks-in-Play: تدوير مجموعة الأسهم وتجميع RVOL/السيولة/القوة النسبية. لا اعتماد صفقة قبل 10:10.";
  else { const targetEnd=Number(market.regularCloseMinute||960)-1; if(clock.minutes<=targetEnd && market.session!=="POSTMARKET"){ const end=uaeTimeForNyTarget(now,targetEnd); const label=`${String(Math.floor((targetEnd+1)/60)).padStart(2,"0")}:${String((targetEnd+1)%60).padStart(2,"0")}`; note.textContent=`تحديث التوصيات 10:10–${label} نيويورك (حتى ${end} الإمارات): إذا لم تعتمدي صفقة، تتجدد الفرص مع Retest + News/Catalyst + Expected-R.`; } else note.textContent=`انتهت نافذة البحث عن Setup جديد لليوم. انتظر يوم التداول التالي.`; }
}
function uaeTimeForNyTarget(now,target){
  const getMin=(tz)=>{const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return (Number(p.hour)%24)*60+Number(p.minute)};
  let diff=getMin("Asia/Dubai")-getMin("America/New_York"); while(diff<0)diff+=1440; while(diff>=1440)diff-=1440;
  const mins=(target+diff)%1440,h=Math.floor(mins/60),m=mins%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

async function checkSelection(silent=false){
  try{
    const response=await fetch("/api/selection",{cache:"no-store"}); const data=await response.json();
    if(response.ok&&data.selected&&data.trade){
      storage.setItem(STORE.selected,JSON.stringify(data.trade));
      applyTradeLock(data.trade,data.nextTradeDate,!!data.carryOver);
      return true;
    }
    if(response.ok&&!data.selected){
      const local=safeJson(storage.getItem(STORE.selected));
      const today=nyClock().dateKey;
      // Do not wipe a same-day optimistic/local lock because of a transient store propagation delay.
      if(local?.side==="LONG"&&local?.tradeDate===today){applyTradeLock(local,local.lockedUntilTradeDate,false);return true;}
      clearTradeLock(true);return false;
    }
  }catch(e){
    const local=safeJson(storage.getItem(STORE.selected));
    if(local?.side==="LONG"){applyTradeLock(local,local.lockedUntilTradeDate,local.tradeDate!==nyClock().dateKey);return true;}
    if(!silent)console.warn(e);
  }
  return false;
}
async function readJsonResponse(response){const ct=String(response.headers?.get?.('content-type')||'').toLowerCase();const text=await response.text();if(!ct.includes('application/json'))throw new Error(`STALE — DO NOT TRADE: الخادم أعاد ${ct||'non-JSON'} بدلاً من بيانات التحليل.`);try{return JSON.parse(text);}catch{throw new Error('STALE — DO NOT TRADE: استجابة التحليل ليست JSON صالحاً.');}}
async function loadMarket(daily){
  if(!daily){const wait=heavyScanWaitSeconds();if(wait>0){showMessage(`حماية الخطة المجانية: انتظر ${wait} ثانية قبل مسح السوق الكامل.`,"error");return;}}
  setBusy(true);hideMessage();
  try{
    let url="/api/latest";
    if(!daily){
      // Smart refresh: reuse the saved scan whenever it is fresh enough, so a tap does not duplicate the scheduled 8-credit scan.
      try{
        const cachedResp=await fetch("/api/latest",{cache:"no-store"});
        if(cachedResp.ok){
          const cached=await readJsonResponse(cachedResp);
          const age=Date.now()-new Date(cached.generatedAt||0).getTime();
          const desired=cleanSymbols($("symbols").value);
          const cachedPrimary=Array.isArray(cached.primarySymbols)?cached.primarySymbols:[];
          const samePrimary=desired.length===cachedPrimary.length&&desired.every((s,i)=>s===cachedPrimary[i]);
          if(Number.isFinite(age)&&age<6*60*1000&&samePrimary){
            currentData=cached;storage.setItem(STORE.latest,JSON.stringify(cached));render(cached);
            showMessage("تم عرض آخر توصيات محفوظة بدون طلب جديد. Discovery يغطي الكون الشرعي خلال نحو 10 دقائق، وSMART تُعاد متابعتها كل دقيقة حتى إغلاق السوق.","ok");
            return;
          }
        }
      }catch{}
      stopProAuto(false);const symbols=cleanSymbols($("symbols").value);$("symbols").value=symbols.join(",");storage.setItem(STORE.universe,$("symbols").value);
      const adaptive=adaptiveWeights();const chosen=$("strategyMode").value;const mode=["active","balanced","precision"].includes(chosen)?chosen:"active";storage.setItem(STORE.mode,mode);
      url=`/api/market?symbols=${encodeURIComponent(symbols.join(","))}&weights=${encodeURIComponent(adaptive.values.join(","))}&mode=${encodeURIComponent(mode)}`;
      $("modelStatus").textContent=`${mode==="active"?"Active Flexible 0.6–1.0%":mode==="precision"?"High Precision":"Balanced"} · `+(adaptive.active?`متكيف بعد ${adaptive.count} صفقة`:`أساسي — يبدأ التكيف بعد 20 صفقة معتمدة`);
    }
    const response=await fetch(url,{cache:"no-store"});const data=await readJsonResponse(response);
    if(!response.ok)throw new Error(data.error||"تعذر جلب التحليل");
    if(data.locked&&data.selectedTrade){applyTradeLock(data.selectedTrade,data.nextTradeDate);showMessage("تم تحميل صفقة اليوم المعتمدة. لا يمكن تغييرها حتى يوم التداول التالي.","ok");return;}
    if(!daily)storage.setItem(STORE.lastHeavyScan,String(Date.now()));
    currentData=data;maybeSoundConfirmed(data);if(data.strategyMode&&$("strategyMode")){ $("strategyMode").value=data.strategyMode;storage.setItem(STORE.mode,data.strategyMode); }storage.setItem(STORE.latest,JSON.stringify(data));render(data);
    const coverage=data.coverageNote?` ${data.coverageNote}`:"";
    const msg=daily?`تم عرض أحدث توصيات محفوظة لليوم بدون استهلاك credits جديدة.${coverage}`:data.discoveryPhase?`مرحلة الاكتشاف الديناميكي نشطة: تم فحص ${data.dynamicSelection?.batch?.join(", ")||"دفعة أسهم"}. الاعتماد يبدأ 10:10 نيويورك بعد ترتيب Stocks-in-Play.${coverage}`:data.display8?.length?`تم العثور على ${data.display8.length} حالات واضحة الآن.${coverage}`:data.fallbackTrade?`تم حفظ أفضل BAD TRADE متاح.${coverage}`:`لا توجد بيانات كافية للتوصيات.${coverage}`;
    showMessage(msg,"ok");
  }catch(error){
    const raw=String(error.message||"حدث خطأ أثناء التحليل");
    if(/API credits|run out of API credits|current minute/i.test(raw))showMessage("حصة Twelve Data لهذه الدقيقة ممتلئة. لم نعد نكرر الطلب؛ اعرض التوصيات المحفوظة أو انتظر أقل من دقيقة للتحديث التالي.","error");
    else showMessage(raw,"error");
  }
  finally{setBusy(false)}
}
const SHARIA_BLOCKED=new Set(["SOFI","HOOD","COIN","MARA","MSTR"]);
function cleanSymbols(raw){return [...new Set(raw.split(",").map(x=>x.trim().toUpperCase().replace(/[^A-Z0-9.-]/g,"")).filter(Boolean))].filter(x=>!SHARIA_BLOCKED.has(x)).slice(0,5)}
function setBusy(v){$("scanBtn").disabled=v;$("dailyBtn").disabled=v;if($("strategyMode"))$("strategyMode").disabled=v;$("scanBtn").textContent=v?"جاري العرض…":"عرض توصيات اليوم";$("dailyBtn").textContent=v?"انتظر…":"تحديث يدوي / Force Refresh";}
function showMessage(text,type="ok"){const el=$("message");el.hidden=false;el.textContent=text;el.style.borderColor=type==="error"?"#63313a":"#315b4b";el.style.background=type==="error"?"#2c161a":"#112a21";el.style.color=type==="error"?"#ff9ba5":"#8be8b6";}
function hideMessage(){$("message").hidden=true;}

function dailyDisplayIdeas(data){
  if(data?.stale||data?.actionable===false)return [];
  if(Array.isArray(data?.display8)&&data.display8.length)return data.display8;
  if(Array.isArray(data?.display5)&&data.display5.length)return data.display5.slice(0,5);
  const rows=Array.isArray(data?.all)?data.all:[];
  if(rows.length){return rows.map(r=>r.tradeable?r:{...r,side:"LONG",badTrade:true,paperOnly:true,tradeable:false,quality:"BAD TRADE — فرصة ضعيفة/غير مكتملة",filters:{...(r.filters||{}),rejectedReason:r.filters?.rejectedReason||`Setup ${r.metrics?.setupState||"غير مكتمل"}`}});}
  return data?.fallbackTrade?[data.fallbackTrade]:(data?.top5||[]);
}
function render(data){
  if(data?.stale||data?.actionable===false)showMessage(`STALE — DO NOT TRADE · آخر تحليل ناجح ${data?.lastSuccessfulAnalysisAt?formatDubai(data.lastSuccessfulAnalysisAt):"غير معروف"} · عمر البيانات ${Number(data?.dataAgeSec||0)}ث`,"error");
  if(!data?.stale&&data?.actionable!==false)logRevalidationViews(data);
  const dailyIdeas=dailyDisplayIdeas(data);
  renderMarket(data.market);renderFocus(data.focus);renderTop5(dailyIdeas);renderDynamic(data.dynamicSelection);renderScannerHealth(data);renderNewsPanel(data);
  refresh36Panels(false);
  const count=$("dailyIdeasCount");if(count)count.textContent=`${dailyIdeas.length} / 8`;
  $("generatedAt").textContent=data.generatedAt?`آخر تحليل: ${formatDubai(data.generatedAt)}${data.creditSmart?.reused?" · من الكاش الذكي":""}`:"";
  if(data.errors?.length)showMessage(`اكتمل التحليل مع ملاحظات: ${data.errors.slice(0,2).join(" — ")}`,"error");
}
function renderDynamic(d){
  const status=$("dynamicStatus"),box=$("dynamicLeaders");if(!status||!box)return;
  if(!d){status.textContent="بانتظار المسح";box.innerHTML='<div class="empty-state">لا توجد بيانات اختيار ديناميكي بعد.</div>';return;}
  status.textContent=d.mode==="DISCOVERY"?`اكتشاف · ${d.scannedSymbols||0} سهم`:d.mode==="DYNAMIC_SMART_WATCH"?`اختيار ديناميكي · ${(d.selected||[]).length} أسهم`:`تم الاختيار · ${(d.selected||[]).length} أسهم`;
  const leaders=Array.isArray(d.leaders)?d.leaders:[];
  box.innerHTML=(d.primary?.length?`<div class="selected-universe">قائمتك: <b>${d.primary.map(esc).join(" · ")}</b>${d.alternativeCandidates?.length?`<br>البدائل التي تم فحصها: <b>${d.alternativeCandidates.map(esc).join(" · ")}</b>`:""}</div>`:d.selected?.length?`<div class="selected-universe">الكون التنفيذي: <b>${d.selected.map(esc).join(" · ")}</b></div>`:"")+(leaders.length?leaders.map((x,i)=>`<div class="dynamic-row"><span>${i+1}. <b>${esc(x.symbol)}</b></span><span>Score ${Number(x.score||0).toFixed(0)}</span><span>RVOL ${Number(x.rvol||0).toFixed(2)}×</span><span>RS ${Number(x.relativeStrengthPct||0)>=0?"+":""}${Number(x.relativeStrengthPct||0).toFixed(2)}%</span></div>`).join(""):'<div class="empty-state">يتم تجميع المرشحين خلال 09:30–10:09 نيويورك.</div>');
}
function renderScannerHealth(data){
  const stateEl=$("scannerHealthState"),ageEl=$("scannerLastAge"),shariaEl=$("scannerShariaCount"),scannedEl=$("scannerScannedCount"),textEl=$("scannerHealthText"),detailEl=$("scannerHealthDetail"),tag=$("scannerHealthTag");
  if(!stateEl)return;
  const clock=nyClock(),market=(marketClockState?.dateKey===clock.dateKey)?marketClockState:fallbackMarketState(clock);
  const generated=data?.generatedAt?Date.parse(data.generatedAt):NaN,ageSec=Number.isFinite(generated)?Math.max(0,Math.round((Date.now()-generated)/1000)):null;
  const activeWindow=market.isTradingDay&&market.session==="REGULAR"&&clock.minutes>=570&&clock.minutes<Number(market.regularCloseMinute||960);
  let state="READY",label="جاهز",cls="";
  if(activeWindow){if(ageSec!=null&&ageSec<=150){state="LIVE";label="🟢 LIVE";cls="good";}else if(ageSec!=null&&ageSec<=300){state="DELAYED";label="🟡 DELAYED";cls="mid";}else{state="STOPPED";label="🔴 STOPPED";cls="bad";}}
  else if(!market.isTradingDay||market.session!=="REGULAR"){state="MARKET_CLOSED";label="⚪ جاهز · السوق مغلق";}
  else if(clock.minutes<570){state="WAITING";label="⚪ بانتظار 09:30 ET";}else{state="SESSION_DONE";label="⚪ انتهت نافذة المسح";}
  stateEl.textContent=label;stateEl.className=cls;tag.textContent=state;ageEl.textContent=ageSec==null?"--":ageSec<60?`${ageSec}ث`:`${Math.floor(ageSec/60)}د ${ageSec%60}ث`;
  shariaEl.textContent=Number(data?.shariaUniverseCount||0)||"--";scannedEl.textContent=Number((data?.scannerHealth?.scanned??data?.dynamicSelection?.scannedSymbols) || 0)||"--";
  textEl.textContent=activeWindow?(state==="LIVE"?"المسح الخلفي يحدث البيانات تلقائياً؛ زر Force Refresh غير مطلوب للتحول من SMART إلى CONFIRMED.":state==="DELAYED"?"آخر دورة أبطأ من المتوقع؛ راقب الدورة التالية.":"لم تصل دورة حديثة ضمن نافذة المسح؛ يلزم فحص Netlify scheduled function."):"حالة الماسح محسوبة حسب نافذة السوق؛ عدم وجود توصية أثناء الإغلاق لا يعني توقفه.";
  const src=data?.shariaUniverseSource||"--",method=data?.shariaMethodology||"--",cache=data?.shariaCacheStatus||"--";const h=data?.scannerHealth||{},focus=data?.smartFocus||{},diag=data?.confirmationDiagnostics||{},b=diag.blockers||{};const blockers=Object.entries(b).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k.replace('WAIT_','')} ${v}`).join(' · ');detailEl.textContent=`Sharia: ${src} · ${method} · ${cache}${data?.shariaUniverseUpdatedAt?` · ${formatDubai(data.shariaUniverseUpdatedAt)}`:""} · Coverage ${Number((h.coveragePct??data?.scannerFunnel?.discoveryCoveragePct) || 0).toFixed(1)}% · Failed ${Number(h.failed||0)} · Retried ${Number(h.retried||0)}${focus.size?` · SMART Focus ${Number(focus.focusSymbols?.length||0)}/${Number(diag.activeSmart||0)} (Top ${focus.size})`:""}${blockers?` · Blockers: ${blockers}`:""}`;
}
function renderNewsPanel(data){
  const box=$("newsPanel"),upd=$("newsUpdated");if(!box)return;const rows=(data?.all||[]).filter(r=>r.news);
  if(upd)upd.textContent=data?.dynamicSelection?.newsGeneratedAt?`آخر تحديث: ${formatDubai(data.dynamicSelection.newsGeneratedAt)}`:"";
  if(!rows.length){box.innerHTML='<div class="empty-state">لم تصل بيانات الأخبار بعد. Scheduled News Scan يحدثها منفصلة عن مسح الأسعار.</div>';return;}
  box.innerHTML=rows.map(r=>{const n=r.news||{},head=n.latest?.[0];const cls=Number(n.sentimentScore||0)>8?"good":Number(n.sentimentScore||0)<-8?"bad":"";return `<div class="news-row"><div><b>${esc(r.symbol)}</b> <span class="${cls}">${Number(n.sentimentScore||0)>=0?"+":""}${Number(n.sentimentScore||0)}</span> · Risk ${Number(n.riskScore||0)}</div><small>${head?esc(head.title):esc(n.note||"لا توجد أخبار حديثة")}</small><small class="news-source">${esc(n.source||"")}</small></div>`}).join("");
}
function renderMarket(m){if(!m)return;setGauge("spy",m.spyTrend);setGauge("qqq",m.qqqTrend);setGauge("market",m.combined);const c=Math.round(m.combined);$("marketInterpretation").textContent=c>=70?"الاتجاه العام داعم للشراء بقوة.":c>=56?"ميل إيجابي؛ Active يختار بين 15-Minute Candle أو Breakout+Retest أو VWAP Reclaim أو Momentum Continuation.":c<=30?"الاتجاه العام سلبي بقوة؛ فرص LONG تحتاج جودة أعلى وسيولة جيدة.":c<=44?"ميل سلبي؛ البرنامج لا يمنع الشراء تلقائياً إذا كان السهم أقوى من السوق.":"السوق متوازن؛ جودة الـSetup والـSpread والسيولة تصبح أهم.";}
function setGauge(prefix,value){const v=Math.round(value||0);$(`${prefix}Trend`).textContent=`${v}%`;$(`${prefix}Bar`).style.width=`${Math.max(0,Math.min(100,v))}%`;}
function renderFocus(r){const box=$("focusContent");if(!r){box.className="empty-state";box.textContent="لا توجد بيانات كافية للسهم محل التركيز.";return;}box.className="";$("focusAge").textContent=formatDubai(r.generatedAt||currentData?.generatedAt);box.innerHTML=recHtml(r,"candidate");bindSelectButtons(box,r);}
function renderTop5(items){
  const box=$("top5"); if(!box)return;
  const rows=(items||[]).filter(r=>["BAD","WAIT","SMART","CONFIRMED"].includes(r.recommendationState));
  if($("dailyIdeasCount"))$("dailyIdeasCount").textContent=`${rows.length}`;
  if(!rows.length){box.innerHTML='<div class="empty-state">لا توجد فرصة واضحة حالياً — البرنامج مستمر في المراقبة.</div>';return;}
  const meta={BAD:["🔴 BAD TRADE","bad-trade-card"],WAIT:["🟡 WAIT","wait-v32"],SMART:["🟠 SMART","smart-v32"],CONFIRMED:["🟢 CONFIRMED BUY","confirmed-v32"]};
  box.innerHTML=rows.map((r,i)=>{const st=r.recommendationState,[label,cls]=meta[st],setup=r.metrics?.setupFamilyLabel||r.metrics?.setupFamily||"Setup",showLevels=st==="CONFIRMED";return `<article class="mini-rec ${cls}"><div class="v32-state">${label}</div><div class="top"><h3>${esc(r.symbol)}</h3><b>${r.profitPotentialScore!=null?`${Number(r.profitPotentialScore).toFixed(0)}/100 جودة`:`${r.confidence}%`}</b></div><div class="mini-price">$${money(r.price)}</div><div class="v32-essential"><b>${esc(setup)}</b><br>${showLevels?`Entry <b>${money(r.entryLow)}–${money(r.entryHigh)}</b><br>T1 <b>${money(r.target1)}</b> · T2 <b>${money(r.target2)}</b> · T3 <b>${money(r.target3)}</b><br>SL <b>${money(r.stopLoss)}</b>${r.signalAgeSec!=null?`<br><small>Signal age ${Math.round(Number(r.signalAgeSec))}s${r.recommendedTarget?` · Shadow ${esc(r.recommendedTarget)}`:""}</small>`:""}`:`${esc(r.stateReason||r.filters?.rejectedReason||"بانتظار وضوح أفضل")}`}</div>${showLevels?`<button class="select-trade" data-select-index="${i}">اعتماد الصفقة</button>`:''}</article>`}).join("");
  box.querySelectorAll("[data-select-index]").forEach(btn=>btn.addEventListener("click",()=>selectTrade(rows[Number(btn.dataset.selectIndex)])));
}
function recHtml(r,mode="candidate"){
  const selected=mode==="selected",bad=!!r.badTrade,conditional=!!r.conditionalTrade,canSelect=mode==="candidate"&&r.side!=="WAIT"&&(r.tradeable||bad),n=r.news||{},ev=Number(r.metrics?.expectedR||0),p=Number(r.metrics?.expectedWinRate||0)*100,ep=r.exitPlan||{};const headline=n.latest?.[0]?.title;
  return `${bad?'<div class="bad-trade-banner large">❌ BAD TRADE — يوجد سبب رفض حقيقي</div>':conditional?'<div class="wait-trade-banner large">⏳ WAIT — توصية مشروطة جيدة، بانتظار Trigger فقط</div>':''}<div class="halal-chip">☪️ HALAL MODE · LONG ONLY</div><div class="rec-head"><div class="ticker">${esc(r.symbol)}</div><span class="side ${r.side}">${sideAr(r.side)}</span><div class="confidence"><span class="muted">قدرة الربح (درجة غير معايرة)</span><strong>${r.research36?`${r.profitPotentialScore}/100`:`${r.confidence}%`}</strong><small class="${bad?'bad':qualityClass(r.quality)}">${esc(r.quality)}</small></div></div><div class="price">$${money(r.price)}</div><div class="ev-banner ${ev>=0?'positive':'negative'}"><span>${r.research36?'صافي العائد الحسابي (Paper)':'Expected Value'}</span><strong>${r.research36?(r.entryCostModel?`${Number(r.entryCostModel.netRewardR||0).toFixed(2)}R`:'بانتظار تأكيد الدخول'):`${ev>=0?'+':''}${ev.toFixed(2)}R / صفقة`}</strong><small>${r.research36?'احتمال تحقيق الربح غير مُعاير · ليس ضماناً':`Win estimate ${Math.round(p)}% · ${esc(r.metrics?.expectationSource||'model')}`}</small></div><div class="levels"><div class="level"><span>منطقة الدخول</span><strong>${money(r.entryLow)} – ${money(r.entryHigh)}</strong></div><div class="level target"><span>هدف 1 · ${targetLabel(ep,1)}</span><strong>${money(r.target1)}</strong></div><div class="level target"><span>هدف 2 · ${targetLabel(ep,2)}</span><strong>${money(r.target2)}</strong></div><div class="level target"><span>هدف 3 · ${targetLabel(ep,3)}</span><strong>${money(r.target3)}</strong></div><div class="level stop"><span>وقف الخسارة · ${Number(r.metrics?.stopDistancePct||0).toFixed(2)}%</span><strong>${money(r.stopLoss)}</strong></div><div class="level"><span>دعم / مقاومة</span><strong>${money(r.support)} / ${money(r.resistance)}</strong></div></div><div class="setup-details"><b>${esc(setupLabel(r))}</b><span>RVOL ${Number(r.metrics?.relativeVolume||0).toFixed(2)}× · Room ${Number(r.metrics?.roomR||0).toFixed(1)}R · In Play ${Number(r.inPlayScore||0).toFixed(0)}/100</span><span>Profile ${esc(r.metrics?.symbolProfileId||"BASE")} · Retest ${Number(r.metrics?.retestQuality||0).toFixed(0)}/100 · MTF ${Number(r.metrics?.mtfAlignment||0).toFixed(0)}/100 · RS ${Number(r.metrics?.relativeStrengthPct||0)>=0?'+':''}${Number(r.metrics?.relativeStrengthPct||0).toFixed(2)}% · سيولة ${Number(r.metrics?.liquidityScore||0).toFixed(0)}/100</span><span>News ${Number(n.sentimentScore||0)>=0?'+':''}${Number(n.sentimentScore||0)} · Risk ${Number(n.riskScore||0)} · Catalyst ${Number(n.catalystScore||0)}</span><span>${spreadSummary(r)}</span></div>${headline?`<div class="news-headline"><b>آخر إعلان:</b> ${esc(headline)}</div>`:''}${selected?`<div class="shadow-target approved-shadow"><b>🎯 Shadow داخل الصفقة:</b> ${esc(r.approvalShadow||r.shadowTracking?.current||r.recommendedTarget||"—")}<small> · Original ${esc(r.originalShadow||r.recommendedTarget||"—")}${r.signalAgeAtApprovalSec!=null?` · Signal age عند الاعتماد ${Math.round(Number(r.signalAgeAtApprovalSec))}s`:""}</small></div>`:""}<details class="trade-explain"><summary>💡 ملاحظات سريعة وخطة الخروج</summary><div class="exit-plan"><b>خطة الخروج ${esc(ep.profile||'STANDARD')}</b><span>بعد T1: ${esc(ep.afterT1||'Break-even')}</span><span>بعد T2: ${esc(ep.afterT2||'Trailing')}</span><span>${esc(ep.runner||'إدارة الجزء الأخير حسب الاتجاه')}</span></div><div class="reason">${esc(r.reason)}</div>${r.targetConfidence?`<div class="shadow-target"><b>🎯 Adaptive Target — Shadow:</b> ${esc(r.recommendedTarget)} · T1 ${Number(r.targetConfidence.t1||0)}% · T2 ${Number(r.targetConfidence.t2||0)}% · T3 ${Number(r.targetConfidence.t3||0)}%</div>`:""}</details>${canSelect?'<button class="select-trade '+(bad?'bad-trade-button':'')+'" data-select-symbol="'+esc(r.symbol)+'">'+(bad?'تثبيت BAD TRADE للمتابعة فقط':'اعتماد هذه الصفقة لليوم')+'</button>':''}${conditional?'<div class="trade-lock-note wait-copy">هذه ليست صفقة سيئة. انتظري تحولها إلى شراء بعد تحقق الـTrigger.</div>':bad?'<div class="bad-trade-note">هذه الإشارة مرفوضة تنفيذياً وتبقى للمتابعة فقط.</div>':r.side==="WAIT"?'<div class="trade-lock-note">إشارة مراقبة فقط.</div>':''}${selected?'<div class="trade-result-panel"><b>سجلي نتيجة الصفقة بعد انتهائها</b><small>اختاري أعلى هدف تحقق قبل الرجوع، أو SL إذا ضُرب وقف الخسارة.</small><div class="result-buttons" id="selectedResults"><button data-result="T1">✅ T1 الديناميكي</button><button data-result="T2">✅ T2 الديناميكي</button><button data-result="T3">🏆 T3 الديناميكي</button><button class="result-loss" data-result="SL">❌ SL</button></div><div id="selectedResultStatus"></div></div>':''}`;
}
function bindSelectButtons(root,r){root.querySelectorAll("[data-select-symbol]").forEach(btn=>btn.addEventListener("click",()=>selectTrade(r)));}
async function selectTrade(r){
  if(!r||r.side!=="LONG"||(!r.tradeable&&!r.badTrade)){showMessage("هذه البطاقة للمتابعة فقط ولا تحتوي صفقة LONG قابلة للتثبيت.","error");return;}
  const bad=!!r.badTrade;
  const ok=confirm(bad?`⚠ BAD TRADE — ${r.symbol} ${sideAr(r.side)}

هذه الإشارة ضعيفة/غير مكتملة. إذا ثبّتيها ستصبح صفقة اليوم للمتابعة فقط، وستختفي بقية التوصيات حتى يوم التداول التالي.

هل تريدين المتابعة؟`:`اعتماد ${r.symbol} كصفقة اليوم؟

بعد الاعتماد ستختفي بقية التوصيات فوراً، وستظهر أزرار تسجيل النتيجة T1 / T2 / T3 / SL.`);if(!ok)return;
  try{
    document.querySelectorAll(".select-trade").forEach(b=>b.disabled=true);
    const response=await fetch("/api/selection",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:r.symbol,generatedAt:currentData?.generatedAt||null,mode:currentData?.strategyMode||$("strategyMode")?.value||"active",acceptBadTrade:bad})});
    const data=await response.json();
    if(!response.ok){
      if(data.locked&&data.trade){storage.setItem(STORE.selected,JSON.stringify(data.trade));applyTradeLock(data.trade,data.trade?.lockedUntilTradeDate);return;}
      throw new Error(data.error||"تعذر اعتماد الصفقة");
    }
    storage.setItem(STORE.selected,JSON.stringify(data.trade));
    sendTelemetry("APPROVED",{signalId:data.trade.signalId||r.signalId||"",symbol:data.trade.symbol,source:"app",meta:{shadow:data.trade.approvalShadow||data.trade.recommendedTarget||"",signalAgeSec:Number(data.trade.signalAgeAtApprovalSec||0),executableEntry:Number(data.trade.executableEntry||0)}});
    applyTradeLock(data.trade,data.nextTradeDate);
    showMessage(data.trade.badTrade?`تم تثبيت BAD TRADE ${data.trade.symbol} للمتابعة. اختفت بقية التوصيات ويمكنك تسجيل النتيجة لاحقاً.`:`تم اعتماد ${data.trade.symbol} كصفقة اليوم. اختفت بقية التوصيات ويمكنك تسجيل T1 / T2 / T3 / SL من بطاقة الصفقة المعتمدة.`,data.trade.badTrade?"error":"ok");
    setTimeout(()=>$("selectedTradeSection")?.scrollIntoView({behavior:"smooth",block:"start"}),80);
  }catch(error){showMessage(error.message||"تعذر اعتماد الصفقة","error");document.querySelectorAll(".select-trade").forEach(b=>b.disabled=false);}
}
function setElementHidden(id,hidden){const el=$(id);if(!el)return;el.hidden=hidden;el.style.display=hidden?"none":"";}
function importServerOutcomeToHistory(trade){
  if(!trade?.outcome||!["T1","T2","T3","SL"].includes(trade.outcome))return;
  const history=getHistory(),id=trade.selectionId||`${trade.tradeDate}:${trade.symbol}`;
  if(history.some(x=>x.selectionId===id))return;
  history.unshift({selectionId:id,tradeDate:trade.tradeDate,symbol:trade.symbol,side:trade.side,confidence:trade.confidence,badTrade:Boolean(trade.badTrade),result:trade.outcome,R:Number(trade.outcomeR),generatedAt:trade.generatedAt||null,selectedAt:trade.selectedAt||null,closedAt:trade.closedAt||new Date().toISOString(),features:trade.features,metrics:trade.metrics||null,scores:trade.scores||null,news:trade.news||null,exitPlan:trade.exitPlan||null,errorTags:trade.outcome==="SL"?inferErrorTags(trade):[],evaluationPhase:trade.evaluationPhase||null,strategyMode:trade.metrics?.strategyMode||"active"});
  storage.setItem(STORE.history,JSON.stringify(history.slice(0,500)));
}
function applyTradeLock(trade,nextDate,carryOver=false){
  if(!trade)return;
  selectedTrade=trade;selectionCarryOver=carryOver;
  storage.setItem(STORE.selected,JSON.stringify(trade));
  document.body.classList.add("trade-locked");
  setElementHidden("selectedTradeSection",false);
  setElementHidden("focusCard",false);
  setElementHidden("top5Section",false);
  const symbols=$("symbols");if(symbols)symbols.disabled=false;
  if($("strategyMode"))$("strategyMode").disabled=false;
  if($("scanBtn")){ $("scanBtn").disabled=false;$("scanBtn").textContent="عرض توصيات اليوم";$("scanBtn").classList.remove("locked-button"); }
  if($("dailyBtn")){ $("dailyBtn").disabled=false;$("dailyBtn").textContent="تحديث يدوي / Force Refresh";$("dailyBtn").classList.remove("locked-button"); }
  if($("selectedAt"))$("selectedAt").textContent=trade.selectedAt?`تم الاعتماد: ${formatDubai(trade.selectedAt)}`:"صفقة اليوم";
  if($("nextTradeDate"))$("nextTradeDate").textContent=(nextDate||trade.lockedUntilTradeDate)?`إعادة فتح التوصيات: ${nextDate||trade.lockedUntilTradeDate}`:"";
  const root=$("selectedTradeContent");
  if(root){
    root.innerHTML=recHtml(trade,"selected");
    root.querySelectorAll("[data-result]").forEach(btn=>btn.addEventListener("click",()=>recordResult(trade,btn.dataset.result)));
  }
  importServerOutcomeToHistory(trade);
  renderSelectedTradeResultState();
  try{renderStats()}catch{}
  try{tickClocks()}catch{}
}
function clearTradeLock(force=false){
  selectedTrade=null;selectionCarryOver=false;carryRefreshKey="";document.body.classList.remove("trade-locked");
  setElementHidden("selectedTradeSection",true);setElementHidden("focusCard",false);setElementHidden("top5Section",false);
  const symbols=$("symbols");if(symbols)symbols.disabled=false;if($("strategyMode"))$("strategyMode").disabled=false;
  if($("scanBtn")){ $("scanBtn").disabled=false;$("scanBtn").textContent="عرض توصيات اليوم";$("scanBtn").classList.remove("locked-button"); }
  if($("dailyBtn")){ $("dailyBtn").disabled=false;$("dailyBtn").textContent="تحديث يدوي / Force Refresh";$("dailyBtn").classList.remove("locked-button"); }
  if(force)storage.removeItem(STORE.selected);
}
async function recordResult(r,result){
  if(!r||r.side==="WAIT"){showMessage("WAIT ليست صفقة ولا تدخل في الإحصائيات.","error");return;}
  if(!["T1","T2","T3","SL"].includes(result))return;
  const history=getHistory(),id=r.selectionId||`${r.tradeDate||nyClock().dateKey}:${r.symbol}`;
  if(history.some(x=>x.selectionId===id)){showMessage("تم تسجيل نتيجة هذه الصفقة مسبقاً.","error");renderSelectedTradeResultState();return;}
  const label=result==="SL"?"وقف الخسارة SL":result;
  if(!confirm(`تسجيل نتيجة ${r.symbol}: ${label}؟\n\nبعد التسجيل لا يمكن تغيير النتيجة من نفس اليوم.`))return;
  const ep=r.exitPlan||{};const R=result==="T1"?Number(ep.t1R||1):result==="T2"?Number(ep.t2R||1.7):result==="T3"?Number(ep.t3R||2.5):-1;const errorTags=result==="SL"?inferErrorTags(r):[];
  const closedAt=new Date().toISOString();
  const row={selectionId:id,tradeDate:r.tradeDate,symbol:r.symbol,side:r.side,confidence:r.confidence,badTrade:Boolean(r.badTrade),result,R,generatedAt:r.generatedAt||currentData?.generatedAt,selectedAt:r.selectedAt||null,closedAt,features:r.features,metrics:r.metrics||null,scores:r.scores||null,news:r.news||null,exitPlan:r.exitPlan||null,errorTags,evaluationPhase:r.evaluationPhase||currentData?.evaluationPhase||null,strategyMode:r.metrics?.strategyMode||currentData?.strategyMode||"active"};
  history.unshift(row);storage.setItem(STORE.history,JSON.stringify(history.slice(0,500)));
  selectedTrade={...r,outcome:result,outcomeR:R,closedAt};storage.setItem(STORE.selected,JSON.stringify(selectedTrade));
  renderStats();renderSelectedTradeResultState();
  try{
    const response=await fetch("/api/selection",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({result})});
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data.trade){selectedTrade=data.trade;storage.setItem(STORE.selected,JSON.stringify(data.trade));if(!data.dailyStop){storage.removeItem(STORE.selected);clearTradeLock(true);showMessage(`تم تسجيل ${result}. فُتح اعتماد فرصة جديدة لهذه الجلسة. SL اليوم: ${Number(data.slCount||0)}/2`,result==="SL"?"error":"ok");}else{storage.removeItem(STORE.selected);clearTradeLock(true);showMessage("تم تسجيل SL الثاني: توقف اعتماد صفقات جديدة لباقي جلسة اليوم، ويستمر البحث والمراقبة.","error");}}
    else throw new Error(data.error||"تعذر مزامنة النتيجة");
    showMessage(`تم تسجيل نتيجة ${r.symbol}: ${result}${errorTags.length?` · تحليل السبب: ${errorTags.join("، ")}`:""}`,result==="SL"?"error":"ok");
  }catch(error){showMessage(`تم حفظ النتيجة على هذا الجهاز، لكن تعذرت مزامنتها مع الخادم: ${error.message}`,"error");}
  renderSelectedTradeResultState();
}
function inferErrorTags(r){const tags=[],m=r.metrics||{},n=r.news||{};if(Number(m.chaseDistanceAtr||0)>.45)tags.push("دخول متأخر/مطاردة");if(Number(m.retestQuality||100)<82)tags.push("Retest أضعف");if(Number(m.relativeVolume||9)<1.7)tags.push("RVOL منخفض نسبياً");if(Number(m.mtfAlignment||100)<82)tags.push("توافق زمني متوسط");if(Number(m.roomR||9)<2.2)tags.push("مساحة R محدودة");if((r.side==="LONG"&&Number(m.relativeStrengthPct||0)<.25)||(r.side==="SHORT"&&Number(m.relativeStrengthPct||0)>-.25))tags.push("قوة نسبية غير كافية");if((r.side==="LONG"&&Number(n.sentimentScore||0)<0)||(r.side==="SHORT"&&Number(n.sentimentScore||0)>0))tags.push("خبر معاكس");if(Number(n.riskScore||0)>=70)tags.push("Catalyst عالي المخاطر");if(Number.isFinite(Number(m.spreadBps))&&Number(m.spreadBps)>Number(r.filters?.maxSpreadBps||20))tags.push("Spread واسع");if(["14:00–16:00"].includes(r.evaluationPhase)||["14:00–16:00"].includes(currentData?.evaluationPhase))tags.push("توصية متأخرة");return tags.length?tags:["فشل Setup بدون سبب واضح"];}
function renderSelectedTradeResultState(){
  if(!selectedTrade)return;const id=selectedTrade.selectionId||`${selectedTrade.tradeDate||nyClock().dateKey}:${selectedTrade.symbol}`;const existing=getHistory().find(x=>x.selectionId===id);const root=$("selectedTradeContent");if(!root)return;
  const serverResult=selectedTrade.outcome&&["T1","T2","T3","SL"].includes(selectedTrade.outcome)?{result:selectedTrade.outcome,R:selectedTrade.outcomeR}:null;
  const finalResult=existing||serverResult;
  root.querySelectorAll("[data-result]").forEach(b=>b.disabled=!!finalResult);
  const el=$("selectedResultStatus");if(el)el.innerHTML=finalResult?`<div class="result-status ${finalResult.result==="SL"?"loss":"win"}">تم تسجيل النتيجة: <b>${finalResult.result}</b> (${Number(finalResult.R).toFixed(2)}R). تم إغلاق الصفقة. يمكن اعتماد فرصة جديدة ما لم يصل اليوم إلى 2 SL.</div>`:`<div class="result-status pending">الصفقة مثبتة الآن. بعد انتهاء الصفقة اختاري T1 أو T2 أو T3 أو SL لتدخل النتيجة في الإحصائيات.</div>`;
}
function sanitizeHistory(){const h=getHistory();const cleaned=h.filter(x=>x&&x.side!=="WAIT"&&["T1","T2","T3","SL"].includes(x.result));if(cleaned.length!==h.length)storage.setItem(STORE.history,JSON.stringify(cleaned));}
function getHistory(){try{return JSON.parse(storage.getItem(STORE.history)||"[]")}catch{return[]}}
function strategyHistory(){return getHistory().filter(x=>!x.badTrade&&x.side==="LONG")}
function adaptiveWeights(){
  const trades=strategyHistory();const base=[.30,.20,.20,.20,.10];if(trades.length<20)return{active:false,count:trades.length,values:base};
  const winners=trades.filter(x=>Number(x.R)>0&&x.features),losers=trades.filter(x=>Number(x.R)<=0&&x.features);if(!winners.length||!losers.length)return{active:false,count:trades.length,values:base};
  const keys=["trend","momentum","volume","structure","market"];const edges=keys.map(k=>{const wa=winners.reduce((a,b)=>a+Number(b.features?.[k]||0),0)/winners.length;const la=losers.reduce((a,b)=>a+Number(b.features?.[k]||0),0)/losers.length;return Math.max(-.20,Math.min(.20,(wa-la)/100));});
  const raw=base.map((b,i)=>Math.max(.08,b*.70+(b+edges[i])*.30)),sum=raw.reduce((a,b)=>a+b,0);return{active:true,count:trades.length,values:raw.map(x=>x/sum)};
}
function tradeAnalytics(){
  const h=strategyHistory().filter(x=>Number.isFinite(Number(x.R)));
  const n=h.length,w=h.filter(x=>Number(x.R)>0),l=h.filter(x=>Number(x.R)<0);
  const net=h.reduce((a,b)=>a+Number(b.R||0),0),gp=w.reduce((a,b)=>a+Number(b.R||0),0),gl=Math.abs(l.reduce((a,b)=>a+Number(b.R||0),0));
  const expectancy=n?net/n:0,profitFactor=gl>0?gp/gl:(gp>0?Infinity:0),avgWin=w.length?gp/w.length:0,avgLoss=l.length?l.reduce((a,b)=>a+Number(b.R||0),0)/l.length:0;
  const chronological=[...h].sort((a,b)=>new Date(a.generatedAt||a.closedAt||0)-new Date(b.generatedAt||b.closedAt||0));
  let equity=0,peak=0,maxDD=0; for(const t of chronological){equity+=Number(t.R||0);peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity)}
  return {h,n,w,l,net,gp,gl,expectancy,profitFactor,avgWin,avgLoss,maxDD};
}
function nyMinuteFromIso(v){
  if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))return null;
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return (Number(p.hour)%24)*60+Number(p.minute);
}
function timeBucket(t){const m=nyMinuteFromIso(t.generatedAt||t.selectedAt);if(m==null)return"غير معروف";return m<610?"09:30–10:09":m<630?"10:10–10:29":m<690?"10:30–11:29":m<750?"11:30–12:29":m<840?"12:30–13:59":"14:00–16:00";}
function confidenceBucket(c){const v=Number(c||0);return v>=85?"85%+":v>=80?"80–84%":v>=75?"75–79%":v>=70?"70–74%":"<70%";}
function evConfidenceBucket(c){const v=Number(c||0);return v>=90?"90%+":v>=85?"85–89%":v>=80?"80–84%":"<80%";}
function groupedPerformance(items,keyFn){
  const map=new Map();for(const x of items){const k=keyFn(x);if(!map.has(k))map.set(k,[]);map.get(k).push(x)}
  return [...map.entries()].map(([key,rows])=>{const net=rows.reduce((a,b)=>a+Number(b.R||0),0),wins=rows.filter(x=>Number(x.R)>0).length,gp=rows.filter(x=>Number(x.R)>0).reduce((a,b)=>a+Number(b.R||0),0),gl=Math.abs(rows.filter(x=>Number(x.R)<0).reduce((a,b)=>a+Number(b.R||0),0));return{key,count:rows.length,net,expectancy:rows.length?net/rows.length:0,winRate:rows.length?wins/rows.length*100:0,pf:gl?gp/gl:(gp?Infinity:0)}}).sort((a,b)=>b.expectancy-a.expectancy);
}
function performanceCalibration(){
  const a=tradeAnalytics(),weights=adaptiveWeights().values;
  const makeStat=(rows)=>{const w=rows.filter(x=>Number(x.R)>0),net=rows.reduce((q,x)=>q+Number(x.R||0),0),gp=w.reduce((q,x)=>q+Number(x.R||0),0);return{count:rows.length,wins:w.length,avgWinR:w.length?gp/w.length:1.7,expectancy:rows.length?net/rows.length:0};};
  const makeMap=(keyFn)=>{const m={};for(const x of a.h){const k=keyFn(x);if(!m[k])m[k]=[];m[k].push(x)}return Object.fromEntries(Object.entries(m).map(([k,rows])=>[k,makeStat(rows)]));};
  const base={active:false,sampleSize:a.n,minConfidence:64,symbolThresholds:{},phaseThresholds:{},weights,performanceModel:{global:makeStat(a.h),symbol:makeMap(x=>x.symbol||"?"),phase:makeMap(timeBucket),confidence:makeMap(x=>evConfidenceBucket(x.confidence))},riskOverrides:{rvolBoost:0,retestBoost:0,mtfBoost:0,roomRBoost:0,chaseCut:0,relativeStrengthBoost:0,newsStrict:false},updatedAt:new Date().toISOString()};
  if(a.n<20)return base;
  base.active=true;const bands=groupedPerformance(a.h,x=>confidenceBucket(x.confidence)),byKey=Object.fromEntries(bands.map(x=>[x.key,x]));let min=64;
  if(byKey["<70%"]?.count>=5&&byKey["<70%"].expectancy<0)min=75;
  if(byKey["70–74%"]?.count>=5&&byKey["70–74%"].expectancy<0)min=75;
  if(min>=75&&byKey["75–79%"]?.count>=5&&byKey["75–79%"].expectancy<0)min=80;if(min>=80&&byKey["80–84%"]?.count>=5&&byKey["80–84%"].expectancy<0)min=85;base.minConfidence=min;
  for(const g of groupedPerformance(a.h,x=>x.symbol||"?")){if(g.count<5)continue;let bump=0;if(g.expectancy<0)bump=3;if(g.count>=8&&g.expectancy<=-.25)bump=7;base.symbolThresholds[g.key]=Math.min(92,min+bump);}
  for(const g of groupedPerformance(a.h,timeBucket)){if(g.key==="غير معروف"||g.count<5)continue;let bump=0;if(g.expectancy<0)bump=3;if(g.count>=8&&g.expectancy<=-.25)bump=5;base.phaseThresholds[g.key]=Math.min(92,min+bump);}
  const losses=a.h.filter(x=>x.result==="SL"),counts={};for(const t of losses)for(const tag of (t.errorTags||[]))counts[tag]=(counts[tag]||0)+1;const recurrent=(tag)=>losses.length>=6&&(counts[tag]||0)>=3&&(counts[tag]||0)/losses.length>=.25;
  if(recurrent("RVOL منخفض نسبياً"))base.riskOverrides.rvolBoost=.15;if(recurrent("Retest أضعف"))base.riskOverrides.retestBoost=5;if(recurrent("توافق زمني متوسط"))base.riskOverrides.mtfBoost=5;if(recurrent("مساحة R محدودة"))base.riskOverrides.roomRBoost=.20;if(recurrent("دخول متأخر/مطاردة"))base.riskOverrides.chaseCut=.10;if(recurrent("قوة نسبية غير كافية"))base.riskOverrides.relativeStrengthBoost=.10;if(recurrent("خبر معاكس")||recurrent("Catalyst عالي المخاطر"))base.riskOverrides.newsStrict=true;
  return base;
}
async function syncCalibrationToServer(calibration=performanceCalibration()){
  const payload={...calibration,weights:adaptiveWeights().values};const hash=JSON.stringify(payload);if(calibrationSyncBusy||hash===lastCalibrationHash)return;
  calibrationSyncBusy=true;
  try{const r=await fetch("/api/calibration",{method:"POST",headers:{"Content-Type":"application/json"},body:hash});if(r.ok)lastCalibrationHash=hash;}catch{}finally{calibrationSyncBusy=false;}
}
function formatPF(v){return v===Infinity?"∞":Number(v||0).toFixed(2)}
function setInsight(id,subId,item,formatKey=(x)=>x.key){$(id).textContent=item?formatKey(item):"--";$(subId).textContent=item?`${item.count} صفقات · ${item.expectancy>=0?"+":""}${item.expectancy.toFixed(2)}R/صفقة · نجاح ${Math.round(item.winRate)}%`:"تحتاج بيانات أكثر";}
function renderStats(){
  const a=tradeAnalytics(),h=a.h,adaptive=adaptiveWeights(),cal=performanceCalibration();
  if($("modelStatus"))$("modelStatus").textContent=adaptive.active?`النموذج: متكيف بعد ${adaptive.count} صفقة معتمدة`:`النموذج: أساسي — يبدأ التكيف بعد 20 صفقة معتمدة`;
  $("statTotal").textContent=a.n;$("statWin").textContent=`${a.n?Math.round(a.w.length/a.n*100):0}%`;$("statR").textContent=`${a.expectancy.toFixed(2)}R`;$("statPF").textContent=formatPF(a.profitFactor);$("statNetR").textContent=`${a.net>=0?"+":""}${a.net.toFixed(2)}R`;$("statDD").textContent=`-${a.maxDD.toFixed(2)}R`;$("statAvgWin").textContent=`${a.avgWin.toFixed(2)}R`;$("statAvgLoss").textContent=`${a.avgLoss.toFixed(2)}R`;
  if($("quickWin"))$("quickWin").textContent=`${a.n?Math.round(a.w.length/a.n*100):0}%`;if($("quickExpectancy"))$("quickExpectancy").textContent=`${a.expectancy>=0?"+":""}${a.expectancy.toFixed(2)}R`;if($("quickPF"))$("quickPF").textContent=formatPF(a.profitFactor);if($("quickNetR"))$("quickNetR").textContent=`${a.net>=0?"+":""}${a.net.toFixed(2)}R`;
  const badge=$("sampleQuality");badge.className="sample-badge "+(a.n>=60?"good":a.n>=20?"mid":"");badge.textContent=a.n>=60?`العينة: جيدة (${a.n})`:a.n>=20?`العينة: أولية (${a.n})`:`العينة: ${a.n}/20 قبل التكيّف`;
  const symbols=groupedPerformance(h,x=>x.symbol||"?").filter(x=>x.count>=2),times=groupedPerformance(h,timeBucket).filter(x=>x.key!=="غير معروف"&&x.count>=2),bands=groupedPerformance(h,x=>confidenceBucket(x.confidence)).filter(x=>x.count>=2);
  setInsight("bestSymbol","bestSymbolSub",symbols[0]);setInsight("bestTime","bestTimeSub",times[0]);setInsight("bestConfidence","bestConfidenceSub",bands[0]);
  const modeVal=$("strategyMode")?.value;const modeBase=modeVal==="active"?64:modeVal==="balanced"?75:82;$("performanceThreshold").textContent=`${Math.max(modeBase,cal.minConfidence)}%+`;const penalties=Object.values(cal.symbolThresholds).filter(x=>x>cal.minConfidence).length+Object.values(cal.phaseThresholds).filter(x=>x>cal.minConfidence).length;$("performanceFilterNote").textContent=cal.active?`متكيف · ${penalties} تشديدات · BAD TRADE مستبعدة من التعلم`:`EV يستخدم prior محافظ · BAD TRADE مستبعدة من التعلم`;
  const perf=$("symbolPerformance");perf.innerHTML=symbols.length?`<div class="performance-row header"><span>السهم</span><span>الصفقات</span><span>Expectancy</span><span>Win%</span><span>PF</span></div>`+symbols.map(g=>`<div class="performance-row"><span><b>${esc(g.key)}</b></span><span>${g.count}</span><span class="${g.expectancy>=0?'good':'bad'}">${g.expectancy>=0?'+':''}${g.expectancy.toFixed(2)}R</span><span>${Math.round(g.winRate)}%</span><span>${formatPF(g.pf)}</span></div>`).join("")+`<div class="calibration-note">${cal.active?`Scanner Learning 3.6 فعّال: الحد العام ${cal.minConfidence}%. Expected-R يستخدم Bayesian shrinkage مع نتائجك حتى لا يبالغ بعينة صغيرة.`:`بعد 20 صفقة يبدأ التشديد التلقائي. Expected-R متاح من الآن لكن بمزيج محافظ من prior + النتائج المتاحة.`}</div>`:'<div class="empty-state">تظهر مقارنة الأسهم بعد تسجيل نتيجتين على الأقل.</div>';
  for(const k of ["T1","T2","T3","SL"])$(`count${k}`).textContent=h.filter(x=>x.result===k).length;
  const allHistory=getHistory();const box=$("history");box.innerHTML=allHistory.length?allHistory.slice(0,20).map(x=>`<div class="history-row ${x.badTrade?'bad-history':''}"><span><b>${esc(x.symbol)}</b> · ${sideAr(x.side)} ${x.badTrade?'<em class="bad-tag">BAD</em>':''}</span><span>${x.confidence}%</span><span>${x.result} (${Number(x.R).toFixed(1)}R)</span><span>${formatDubai(x.closedAt)}</span></div>`).join(""):'<div class="empty-state">لا توجد صفقات معتمدة مسجلة.</div>';
  renderErrorAnalysis(h);renderScannerPerformance();renderScannerLearningQuality();
}

async function renderScannerPerformance(){
  const box=$('scannerHistory');if(!box)return;const range=Number($('scannerHistoryRange')?.value||1);
  try{const r=await fetch(`/api/signal-history?sessions=${range}`,{cache:'no-store'});if(!r.ok)return;const raw=await r.json();let sessions=range===1?[raw]:(raw.sessions||[]);if(range===2)sessions=sessions.slice(1,2);const rows=[];
    for(const d of sessions)for(const rec of Object.values(d.signals||{}))for(const sig of (rec.confirmedSignals||[]))rows.push({...sig,symbol:rec.symbol,dateKey:d.dateKey});
    rows.sort((a,b)=>Date.parse(b.confirmedAt||0)-Date.parse(a.confirmedAt||0));const done=rows.filter(x=>['T1','T2','T3','SL'].includes(x.finalOutcome)),wins=done.filter(x=>x.finalOutcome!=='SL');
    $('scanTotal').textContent=rows.length;$('scanWin').textContent=done.length?`${Math.round(wins.length/done.length*100)}%`:'--';$('scanT3').textContent=done.filter(x=>x.finalOutcome==='T3').length;$('scanSL').textContent=done.filter(x=>x.finalOutcome==='SL').length;
    box.innerHTML=rows.length?rows.slice(0,100).map(x=>`<div class="history-row"><span><b>${esc(x.symbol)}</b> · ${x.approvedAt?'معتمدة':'Scanner'} · ${esc(x.dateKey||'')}</span><span>${x.finalOutcome||'TRACKING'}${x.recommendedTarget?` · Shadow ${esc(x.recommendedTarget)}`:''}</span><span>${x.hits?.length?esc(x.hits.join(' → ')):'—'}</span><span>${x.pushLatencyMs!=null?`Push ${Math.round(Number(x.pushLatencyMs)/1000)}ث · `:''}${formatDubai(x.closedAt||x.confirmedAt)}</span></div>`).join(''):'<div class="empty-state">لا توجد CONFIRMED في الفترة المختارة.</div>';
  }catch{box.innerHTML='<div class="empty-state">تعذر تحميل سجل الماسح حالياً.</div>';}
}
async function renderScannerLearningQuality(){
  try{const r=await fetch('/api/calibration',{cache:'no-store'}),c=await r.json();if(!r.ok)return;const n=Number(c.sampleSize||0),badge=$('sampleQuality');if(badge){badge.className='sample-badge '+(n>=60?'good':n>=20?'mid':'');badge.textContent=n>=60?`العينة: جيدة (${n} Scanner)`:n>=20?`العينة: أولية (${n} Scanner)`:`العينة: ${n}/20 CONFIRMED قبل التكيّف`;}
    if($('performanceThreshold'))$('performanceThreshold').textContent=`${Number(c.minConfidence||64)}%+`;if($('performanceFilterNote'))$('performanceFilterNote').textContent=c.active?'Scanner Learning 3.6 فعّال · تعديل محافظ':'Scanner Learning 3.6 · Shadow حتى 20 نتيجة';
    const syms=Object.entries(c.performanceModel?.symbol||{}).filter(([,v])=>v?.count>=2).sort((a,b)=>Number(b[1].expectancy||0)-Number(a[1].expectancy||0));if(syms.length){$('bestSymbol').textContent=syms[0][0];$('bestSymbolSub').textContent=`${syms[0][1].count} إشارات · ${Number(syms[0][1].expectancy||0)>=0?'+':''}${Number(syms[0][1].expectancy||0).toFixed(2)} / إشارة`;const perf=$('symbolPerformance');if(perf)perf.innerHTML='<div class="performance-row header"><span>السهم</span><span>CONFIRMED</span><span>Expectancy</span><span>Win%</span><span>المصدر</span></div>'+syms.map(([sym,v])=>`<div class="performance-row"><span><b>${esc(sym)}</b></span><span>${Number(v.count||0)}</span><span class="${Number(v.expectancy||0)>=0?'good':'bad'}">${Number(v.expectancy||0)>=0?'+':''}${Number(v.expectancy||0).toFixed(2)}R</span><span>${v.count?Math.round(Number(v.wins||0)/Number(v.count)*100):0}%</span><span>Scanner 3.6</span></div>`).join('');}
    if($('modelStatus'))$('modelStatus').textContent=c.active?`النموذج: Scanner Learning 3.6 · ${n} نتيجة تلقائية`:`النموذج: أساسي — يبدأ Scanner Learning بعد 20 نتيجة تلقائية`;
  }catch{}
}
async function loadSignalHistorySessions(n=1){const r=await fetch(`/api/signal-history?sessions=${n}`,{cache:'no-store'});if(!r.ok)throw new Error('تعذر تحميل السجل');return r.json();}
function downloadText(name,text,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);}
async function exportSignalHistory(kind='json'){try{const d=await loadSignalHistorySessions(30);if(kind==='json')return downloadText('dynamic-trading-signal-history-30.json',JSON.stringify(d,null,2),'application/json');const rows=[['date','version','symbol','signalId','confirmedAt','approvedAt','entry','entryLow','entryHigh','bid','ask','last','spreadBps','quoteAgeSec','priceBucket','setupFamily','confidence','lowestBeforeRally','timeToLowSec','recoveryTimeSec','maePct','mfePct','t1','t2','t3','sl','preT3Status','recommendedTarget','outcome','postSlMfePct','postT3MfePct','hits','pushLatencyMs','pushDisplayedAt','pushClickedAt','firstAppOpenAt','firstRevalidationAt','actionableAtFirstRevalidation','signalAgeAtApprovalSec','originalShadow','approvalShadow','entrySlippagePct','repeatClass','aiQuality','aiEntry','aiT1','aiT2','aiT3','aiSL','recordClass']];for(const sess of d.sessions||[])for(const rec of Object.values(sess.signals||{}))for(const x of rec.confirmedSignals||[]){const f=x.features||{};rows.push([sess.dateKey,x.version||sess.schemaVersion||'',rec.symbol,x.signalId||'',x.confirmedAt||'',x.approvedAt||'',x.entry||'',x.entryLow||'',x.entryHigh||'',f.bid||'',f.ask||'',f.last||'',f.spreadBps??'',f.quoteAgeSec??'',f.priceBucket||'',f.setupFamily||'',f.confidence??'',x.lowestBeforeRally??'',x.timeToLowSec??'',x.recoveryTimeSec??'',x.maePct??'',x.mfePct??'',x.t1||'',x.t2||'',x.t3||'',x.sl||'',x.preT3Continuation?.status||'',x.recommendedTarget||'',x.finalOutcome||'',x.postSlMfePct??'',x.postT3MfePct??'',(x.hits||[]).join('>'),x.pushLatencyMs??'',x.pushDisplayedAt||'',x.pushClickedAt||'',x.firstAppOpenAt||'',x.firstRevalidationAt||'',x.actionableAtFirstRevalidation??'',x.signalAgeAtApprovalSec??'',x.recommendedTarget||'',x.approvalShadow||'',x.shadow?.entrySlippagePct??'',x.repeatClass||'',x.aiShadow?.quality||'',x.aiShadow?.entry??'',x.aiShadow?.t1??'',x.aiShadow?.t2??'',x.aiShadow?.t3??'',x.aiShadow?.sl??'',f.recordClass||'ACTUAL_PROGRAM_SIGNAL']);}downloadText('dynamic-trading-signal-history-30.csv',rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv');}catch(e){showMessage(e.message||'تعذر التصدير','error');}}
function renderErrorAnalysis(h){const box=$("errorAnalysis");if(!box)return;const losses=h.filter(x=>x.result==="SL"),m=new Map();for(const t of losses){const tags=t.errorTags?.length?t.errorTags:["فشل Setup بدون سبب واضح"];for(const tag of tags)m.set(tag,(m.get(tag)||0)+1);}const rows=[...m.entries()].sort((a,b)=>b[1]-a[1]);box.innerHTML=rows.length?rows.map(([tag,count])=>`<div class="error-chip"><b>${esc(tag)}</b><span>${count} مرة · ${losses.length?Math.round(count/losses.length*100):0}% من SL</span></div>`).join(""):'<div class="empty-state">تظهر أسباب الخسارة بعد تسجيل صفقات شراء SL جديدة.</div>';}
function spreadSummary(r){const m=r?.metrics||{};if(m.spreadAvailable&&Number.isFinite(Number(m.spreadBps))){const cls=Number(m.spreadBps)<=Number(r.filters?.maxSpreadBps||20)?"good":"bad";return `<span class="${cls}">IEX Spread ${Number(m.spreadBps).toFixed(1)} bps</span> · Bid ${money(m.bid)} / Ask ${money(m.ask)}${m.quoteFresh?"":" · quote قديم"}`;}return `<span class="muted">Spread غير متاح — أضف Alpaca</span>`;}
function targetLabel(ep,n){const pct=Number(ep?.[`target${n}Pct`]||0);const rv=Number(ep?.[`t${n}R`]||([1,1.7,2.5][n-1]));return pct>0?`+${(pct*100).toFixed([0.6,0.8,1].some(x=>Math.abs(pct*100-x)<0.001)?1:2)}% · ${rv.toFixed(2)}R`:`${rv.toFixed(1)}R`;}
function setupLabel(r){const m=r?.metrics||{},f=String(m.setupFamily||"BREAKOUT_RETEST"),st=m.setupState,label=m.setupFamilyLabel||f;if(f==="FIRST_15M_CANDLE")return st==="CONFIRMED"?"15-Minute Candle ✓ — كسر High أول 15 دقيقة مثبت":st==="WAIT_15M_CONFIRMATION"?"15-Minute Candle — الكسر موجود وبانتظار تثبيت":st==="EXPIRED"?"15-Minute Candle — الإشارة قديمة/السعر ابتعد":"15-Minute Candle — بانتظار كسر High أول 15 دقيقة";if(f==="VWAP_RECLAIM")return st==="CONFIRMED"?"VWAP Reclaim ✓":st==="WAIT_CONFIRMATION"?"VWAP Reclaim — بانتظار التأكيد":"VWAP Reclaim — بانتظار الاستعادة";if(f==="MOMENTUM_CONTINUATION")return st==="CONFIRMED"?"Momentum Continuation ✓":"Momentum Continuation — الزخم غير مكتمل";return st==="CONFIRMED"?"Breakout ✓ Retest ✓ Confirmation ✓":st==="WAIT_CONFIRMATION"?"Breakout ✓ Retest ✓ — بانتظار Confirmation":st==="WAIT_RETEST"?"Breakout ✓ — بانتظار Retest":st==="FAILED_RETEST"?"Failed Breakout — مرفوض":st==="EXPIRED"?"Setup قديم/السعر ابتعد — مرفوض":"بانتظار Breakout";}
function sideAr(side){return side==="LONG"?"شراء":side==="SHORT"?"شورت قديم — غير معتمد شرعياً":"انتظار"}function money(v){return Number(v||0).toFixed(2)}function formatDubai(v){if(!v)return"";return new Intl.DateTimeFormat("ar-AE",{timeZone:"Asia/Dubai",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}function qualityClass(q){return q?.startsWith("A")?"quality-A":q?.startsWith("B")?"quality-B":q?.startsWith("C")?"quality-C":""}

async function runBacktest(){
  const input=$("backtestSymbol"),monthsEl=$("backtestMonths"),btn=$("backtestBtn"),box=$("backtestResult");if(!input||!btn||!box)return;
  const symbol=input.value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,"")||"PLTR",months=Number(monthsEl?.value||6);input.value=symbol;btn.disabled=true;btn.textContent="جاري الاختبار…";box.innerHTML=`<div class="empty-state">يتم جلب ${months} أشهر من بيانات ${esc(symbol)} واختبار 5 إعدادات…</div>`;
  try{const r=await fetch(`/api/backtest?symbol=${encodeURIComponent(symbol)}&months=${months}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error||"تعذر الباكتيست");renderBacktestResult(symbol,d,box);}catch(e){box.innerHTML=`<div class="empty-state bad">${esc(e.message||"تعذر الاختبار")}</div>`;}finally{btn.disabled=false;btn.textContent="تشغيل Backtest";}
}
async function applyBacktestProfile(symbol,profileId,btn){
  if(!confirm(`اعتماد مقترح Backtest ${profileId} لسهم ${symbol}؟\n\nلن يتغير أي إعداد إلا بعد موافقتك هذه. سيطبق على ${symbol} فقط، ويمكن تغييره لاحقاً بعد Backtest جديد.`))return;
  btn.disabled=true;try{const r=await fetch('/api/backtest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol,profileId})}),d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تطبيق الإعداد');showMessage(`تم اعتماد المقترح ${d.profile.label||profileId} على ${symbol}. سيستخدمه التحليل القادم تلقائياً.`,`ok`);btn.textContent='✓ تم التطبيق';}catch(e){showMessage(e.message||'تعذر تطبيق الإعداد','error');btn.disabled=false;}
}
function renderBacktestResult(symbol,d,box){
  const best=d.recommendedProfile||{},oos=d.outOfSample||{},pf=d.profitFactor==null?'--':Number(d.profitFactor)>=900?'∞':Number(d.profitFactor).toFixed(2),stable=d.stability?.stable;
  const profileRows=(d.profiles||[]).map(x=>{const q=x.outOfSample||{},p=x.profile||{};return `<div class="profile-row ${best.id===p.id?'recommended':''}"><div><b>${esc(p.label||p.id)}</b><small>RVOL ${Number(p.minRvol||0).toFixed(2)} · Retest ${Number(p.maxRetestMinutes||0)}m · Chase ${Number(p.maxChaseAtr||0).toFixed(2)} ATR</small></div><span>${x.trades} صفقة</span><span>OOS ${q.trades||0}</span><span class="${Number(q.expectancy||0)>=0?'good':'bad'}">${Number(q.expectancy||0)>=0?'+':''}${Number(q.expectancy||0).toFixed(2)}R</span><span>PF ${q.profitFactor==null?'--':Number(q.profitFactor)>=900?'∞':Number(q.profitFactor).toFixed(2)}</span></div>`}).join('');
  const diag=d.diagnostics||{},rejectMap={breakout:'بدون Breakout',retest:'بدون Retest',confirmation:'بدون Confirmation',rvol:'RVOL ضعيف',emaTrend:'EMA/اتجاه',market:'السوق معاكس',chase:'دخول متأخر',risk:'Risk',openingRange:'OR غير مكتمل',rows:'بيانات ناقصة'},rejectHtml=Object.entries(diag.rejected||{}).filter(([,v])=>Number(v)>0).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="diag-reject">${rejectMap[k]||esc(k)}: ${v}</span>`).join('');
  const current=d.currentProfile||{id:'BASE',label:'High Precision الأساسي'};
  const delta=best.improvement||{};
  const deltaHtml=best.id?`<div class="proposal-delta"><span>الحالي: <b>${esc(current.label||current.id)}</b></span><span>المقترح: <b>${esc(best.label||best.id)}</b></span>${Number.isFinite(Number(delta.expectancyDelta))?`<span>فرق OOS Expectancy: <b class="${Number(delta.expectancyDelta)>=0?'good':'bad'}">${Number(delta.expectancyDelta)>=0?'+':''}${Number(delta.expectancyDelta).toFixed(2)}R</b></span>`:''}</div>`:'';
  const apply=best.id?`<div class="profile-recommend"><b>💡 مقترح Backtest لـ ${esc(symbol)}: ${esc(best.label||best.id)}</b><span>${esc(best.reason||'')}</span>${deltaHtml}<small>لا يتم تعديل التوصيات تلقائياً. القرار لك.</small>${best.eligibleToApply?`<button class="primary" id="applyProfileBtn">اعتماد المقترح وتطبيقه</button>`:best.changeNeeded===false?'<em>لا يوجد تعديل مطلوب؛ الإعداد الحالي هو الأفضل.</em>':'<em>مقترح للمراقبة فقط؛ عينة OOS غير كافية للاعتماد.</em>'}</div>`:'<div class="profile-recommend"><b>لا يوجد مقترح قابل للتقييم بعد</b><span>لم تنتج العينة صفقات OOS كافية؛ لن يتم تغيير أي إعداد.</span></div>';
  const attempts=`<div class="diag-summary"><span>الجلسات: <b>${Number(diag.sessions||0)}</b></span><span>محاولات Setup: <b>${Number(diag.attempts||0)}</b></span><span>15m Candle: <b>${Number(diag.first15mFound||0)}</b></span><span>VWAP: <b>${Number(diag.vwapReclaimFound||0)}</b></span><span>Momentum: <b>${Number(diag.momentumFound||0)}</b></span><span>جلسات بمحاولات متعددة: <b>${Number(diag.multiAttemptSessions||0)}</b></span><span>Setups مكتملة: <b>${Number(diag.finalSetups||0)}</b></span></div>`;
  box.innerHTML=`<div class="backtest-headline"><b>Backtest ${esc(symbol)} · ${d.period?.months||''} أشهر</b><span>${esc(d.provider||'')} · ${esc(d.period?.start||'')} → ${esc(d.period?.end||'')}</span></div><div class="backtest-grid"><div><span>أفضل Profile صفقات</span><b>${d.trades||0}</b></div><div><span>Win Rate</span><b>${Math.round(Number(d.winRate||0)*100)}%</b></div><div><span>Expectancy</span><b class="${Number(d.expectancy)>=0?'good':'bad'}">${Number(d.expectancy)>=0?'+':''}${Number(d.expectancy||0).toFixed(2)}R</b></div><div><span>Profit Factor</span><b>${pf}</b></div><div><span>OOS صفقات</span><b>${oos.trades||0}</b></div><div><span>OOS Expectancy</span><b class="${Number(oos.expectancy||0)>=0?'good':'bad'}">${Number(oos.expectancy||0)>=0?'+':''}${Number(oos.expectancy||0).toFixed(2)}R</b></div><div><span>OOS Win Rate</span><b>${Math.round(Number(oos.winRate||0)*100)}%</b></div><div><span>الثبات</span><b class="${stable?'good':'bad'}">${stable?'مقبول':'غير مثبت'}</b></div></div>${apply}<div class="profile-table"><h4>مقارنة إعدادات السهم</h4>${profileRows}</div><div class="backtest-diagnostics"><h4>تشخيص المحاولات داخل الجلسات</h4>${attempts}<div class="diag-rejects">${rejectHtml||'<span class="muted">لا توجد تفاصيل رفض.</span>'}</div></div><p class="muted">${esc(d.note||'')}</p>`;
  const applyBtn=$("applyProfileBtn");if(applyBtn)applyBtn.addEventListener('click',()=>applyBacktestProfile(symbol,best.id,applyBtn));
}

// ---------- Market Pro ----------
function heavyScanWaitSeconds(){const lastHeavy=Number(storage.getItem(STORE.lastHeavyScan)||0),lastPro=Number(storage.getItem(STORE.lastProFetch)||0),newest=Math.max(lastHeavy,lastPro),remain=60000-(Date.now()-newest);return remain>0?Math.ceil(remain/1000):0;}
function proWaitSeconds(){const lastHeavy=Number(storage.getItem(STORE.lastHeavyScan)||0),remain=60000-(Date.now()-lastHeavy);return remain>0?Math.ceil(remain/1000):0;}
async function loadMarketPro(manual=false){
  const wait=proWaitSeconds();if(wait>0){if(manual)showMessage(`مسح السوق الكامل استهلك حصة الطلبات الحالية. حدّث Market Pro بعد ${wait} ثانية.`,"error");return;}
  const btn=$("proRefreshBtn");btn.disabled=true;btn.textContent="جاري تحديث السوق…";
  try{const response=await fetch("/api/market-pro",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"تعذر تحديث Market Pro");proData=data;storage.setItem(STORE.pro,JSON.stringify(data));storage.setItem(STORE.lastProFetch,String(Date.now()));renderPro(data);if(manual)showMessage(`تم تحديث Market Pro: الشارت وVWAP وRVOL. ${data.extendedHoursNote||""}`.trim(),"ok");}
  catch(error){showMessage(error.message||"تعذر تحديث Market Pro","error");if($("autoLive").checked)stopProAuto(true);}finally{btn.disabled=false;btn.textContent="تحديث Market Pro";}
}
function toggleProAuto(){if($("autoLive").checked){const wait=proWaitSeconds();if(wait>0){$("autoLive").checked=false;showMessage(`يمكن تشغيل التحديث التلقائي بعد ${wait} ثانية من مسح السوق.`,"error");return;}if(!proData)loadMarketPro(false);clearInterval(proAutoTimer);proAutoTimer=setInterval(()=>loadMarketPro(false),30000);showMessage("تم تشغيل تحديث Market Pro كل 30 ثانية.","ok");}else stopProAuto(false);}
function stopProAuto(uncheck=true){if(proAutoTimer){clearInterval(proAutoTimer);proAutoTimer=null;}if(uncheck&&$("autoLive"))$("autoLive").checked=false;}
function renderPro(d){
  if(!d)return;
  $("proPrice").textContent=`$${money(d.price)}`;
  if($("proPriceLabel"))$("proPriceLabel").textContent=d.priceStale?"آخر سعر متاح":"السعر الحالي";
  const change=Number(d.changePct||0);$("proChange").textContent=`${change>=0?"+":""}${change.toFixed(2)}% من بداية الجلسة المرجعية`;$("proChange").classList.toggle("positive",change>0);$("proChange").classList.toggle("negative",change<0);
  $("proSession").textContent=sessionAr(d.session);$("proVwap").textContent=`$${money(d.vwap)}`;$("proVwapMode").textContent=d.vwapMode||"VWAP";
  const extLabel=d.extendedHoursAvailable?"لا توجد شموع":"يتطلب Pro";
  $("proPreHigh").textContent=d.premarketHigh==null?extLabel:`$${money(d.premarketHigh)}`;$("proPreLow").textContent=d.premarketLow==null?extLabel:`$${money(d.premarketLow)}`;
  if($("proPostHigh"))$("proPostHigh").textContent=d.postmarketHigh==null?extLabel:`$${money(d.postmarketHigh)}`;
  if($("proPostLow"))$("proPostLow").textContent=d.postmarketLow==null?extLabel:`$${money(d.postmarketLow)}`;
  $("proRvol").textContent=`${Number(d.relativeVolume||0).toFixed(2)}×`;$("proRvolSample").textContent=d.rvolSampleDays?`مقارنة مع ${d.rvolSampleDays} جلسات سابقة`:`تقدير من الحجم الأخير`;$("proSR").textContent=`${money(d.support)} / ${money(d.resistance)}`;
  if($("proExtendedNote"))$("proExtendedNote").textContent=d.extendedHoursAvailable?"Extended-hours مفعلة: PRE/POST تدخل في لوحة Market Pro.":"PRE/POST أضيفت لحالة السوق والواجهة. الأسعار الحية الممتدة في Twelve Data تحتاج خطة Pro ثم TWELVE_DATA_PREPOST=true في Netlify.";
  const buy=Math.max(0,Math.min(100,Number(d.buyPressure||50))),sell=100-buy;$("buyPressure").style.width=`${buy}%`;$("sellPressure").style.width=`${sell}%`;$("pressureText").textContent=`BUY ${Math.round(buy)}% · SELL ${Math.round(sell)}%`;$("pressureNote").textContent=d.pressureMethod||"ضغط تقديري وليس Order Flow فعلي.";$("proMarketTime").textContent=d.marketDatetime?`آخر شمعة بالسوق: ${d.marketDatetime} ET${d.priceStale?` · آخر يوم بيانات ${d.latestDataDate||""}`:""}`:"";$("proUpdated").textContent=d.generatedAt?`تحديث الموقع: ${formatDubai(d.generatedAt)}`:"";$("chartEmpty").style.display="none";drawMarketProChart(d);
}
function sessionAr(s){return s==="PREMARKET"?"PRE-MARKET":s==="REGULAR"?"MARKET OPEN":s==="AFTER_HOURS"||s==="POSTMARKET"?"POST-MARKET":"MARKET CLOSED"}
function drawMarketProChart(d){
  const canvas=$("marketProChart");if(!canvas||!Array.isArray(d.chart)||!d.chart.length)return;const data=d.chart.slice(-chartRange),rect=canvas.getBoundingClientRect();if(rect.width<20||rect.height<20)return;const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);const ctx=canvas.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);const W=rect.width,H=rect.height,pad={l:12,r:56,t:14,b:26},pw=W-pad.l-pad.r,ph=H-pad.t-pad.b;
  const extra=[Number(d.support),Number(d.resistance),...data.map(x=>Number(x.vwap)).filter(Number.isFinite)];let min=Math.min(...data.map(x=>Number(x.l)),...extra.filter(x=>x>0)),max=Math.max(...data.map(x=>Number(x.h)),...extra.filter(x=>x>0));if(!Number.isFinite(min)||!Number.isFinite(max))return;const margin=Math.max((max-min)*.08,Math.abs(max)*.002);min-=margin;max+=margin;const y=v=>pad.t+(max-v)/(max-min)*ph,x=i=>pad.l+(i+.5)/data.length*pw;ctx.clearRect(0,0,W,H);ctx.font="10px system-ui";ctx.textAlign="left";ctx.textBaseline="middle";
  for(let i=0;i<=4;i++){const val=max-(max-min)*i/4,yy=pad.t+ph*i/4;ctx.strokeStyle="rgba(143,161,187,.12)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(W-pad.r+4,yy);ctx.stroke();ctx.fillStyle="#7f91aa";ctx.fillText(`$${val.toFixed(2)}`,W-pad.r+8,yy)}
  const cw=Math.max(2,Math.min(8,pw/data.length*.62));data.forEach((c,i)=>{const xx=x(i),yo=y(Number(c.o)),yc=y(Number(c.c)),yh=y(Number(c.h)),yl=y(Number(c.l)),up=Number(c.c)>=Number(c.o);ctx.strokeStyle=up?"#35d07f":"#ff6978";ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,yh);ctx.lineTo(xx,yl);ctx.stroke();ctx.fillRect(xx-cw/2,Math.min(yo,yc),cw,Math.max(1,Math.abs(yc-yo)));});ctx.strokeStyle="#f4bd50";ctx.lineWidth=1.6;ctx.beginPath();let started=false;data.forEach((c,i)=>{const v=Number(c.vwap);if(!Number.isFinite(v)||v<=0)return;const xx=x(i),yy=y(v);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)});if(started)ctx.stroke();drawLevel(ctx,y(Number(d.support)),"#35d07f","S");drawLevel(ctx,y(Number(d.resistance)),"#ff6978","R");ctx.fillStyle="#71839b";ctx.textAlign="center";ctx.textBaseline="top";const labels=Math.min(4,data.length);for(let i=0;i<labels;i++){const idx=Math.round(i*(data.length-1)/Math.max(1,labels-1));ctx.fillText(shortTime(data[idx].t),x(idx),H-pad.b+7)}
  function drawLevel(c,yy,color,label){if(!Number.isFinite(yy)||yy<pad.t||yy>H-pad.b)return;c.save();c.setLineDash([4,4]);c.strokeStyle=color;c.globalAlpha=.55;c.beginPath();c.moveTo(pad.l,yy);c.lineTo(W-pad.r,yy);c.stroke();c.restore();c.fillStyle=color;c.textAlign="right";c.textBaseline="bottom";c.fillText(label,W-pad.r-3,yy-2)}
}
function shortTime(v){const m=String(v||"").match(/[ T](\d{2}:\d{2})/);return m?m[1]:""}

function initCompactUi(){
  const today=$("tab-today"),ideas=$("top5Section"),hero=today?.querySelector(".hero-grid");if(today&&ideas&&hero)today.insertBefore(ideas,hero);
  const buttons=[...document.querySelectorAll(".tab-button")],panels=[...document.querySelectorAll(".tab-panel")];
  const valid=new Set(buttons.map(b=>b.dataset.tab));
  function activate(name,scroll=false){
    if(!valid.has(name))name="today";
    buttons.forEach(b=>{const on=b.dataset.tab===name;b.classList.toggle("active",on);b.setAttribute("aria-selected",on?"true":"false");});
    panels.forEach(p=>p.classList.toggle("active",p.dataset.panel===name));
    storage.setItem("dynamic_trading_ui_tab_v35",name);
    if(name==="pro"&&proData)requestAnimationFrame(()=>drawMarketProChart(proData));
    if(scroll)window.scrollTo({top:0,behavior:"smooth"});
  }
  buttons.forEach(b=>b.addEventListener("click",()=>activate(b.dataset.tab,true)));
  activate(storage.getItem("dynamic_trading_ui_tab_v35")||"today",false);
  const syncTicker=()=>{const src=$("recommendationTiming"),dst=$("smartTickerText");if(src&&dst)dst.textContent=src.textContent;const dot=$("todayTabDot");if(dot)dot.hidden=!selectedTrade;};
  syncTicker();setInterval(syncTicker,1000);
}

// ===== v2.8.1 resilient UI bootstrap =====
let appBooted = false;
function bindUiControl(id,event,handler){
  const el=$(id);
  if(!el)return;
  const key=`bound${event}`;
  if(el.dataset[key]==="1")return;
  el.dataset[key]="1";
  el.addEventListener(event,(ev)=>{
    try{ handler(ev); }catch(err){
      console.error(`UI action failed: ${id}`,err);
      showMessage(`تعذر تنفيذ الزر مؤقتاً: ${err?.message||"خطأ غير معروف"}`,"error");
    }
  });
}

function urlBase64ToUint8Array(base64String){const padding="=".repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
let lastConfirmedSoundKey="";
function playConfirmedSound(){
  try{const a=new Audio("/assets/confirmed-buy.wav");a.volume=0.9;a.play().catch(()=>{});}catch{}
}
function maybeSoundConfirmed(data){
  const rows=[...(data?.display8||[]),...(data?.top5||[])];
  const confirmed=rows.find(r=>r?.recommendationState==="CONFIRMED"||r?.tradeable===true);
  if(!confirmed)return;const key=`${data?.generatedAt||""}:${confirmed.symbol}`;if(key===lastConfirmedSoundKey)return;lastConfirmedSoundKey=key;playConfirmedSound();
}
async function enableBackgroundAlerts(){
  try{
    if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))throw new Error("هذا المتصفح لا يدعم تنبيهات الخلفية.");
    const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("يجب السماح بالإشعارات لتفعيل تنبيه CONFIRMED BUY.");
    const cfg=await fetch("/api/push-subscribe",{cache:"no-store"}).then(r=>r.json());if(!cfg.configured||!cfg.publicKey)throw new Error("مفاتيح VAPID غير مضافة في Netlify بعد.");
    const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg.publicKey)});
    const r=await fetch("/api/push-subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sub)});if(!r.ok)throw new Error("تعذر حفظ اشتراك التنبيه.");
    storage.setItem("dynamic_trading_push_enabled_v35","1");const b=$("pushBtn");if(b)b.textContent="🔔 تنبيهات الخلفية مفعلة";showMessage("تم تفعيل تنبيهات CONFIRMED BUY حتى عند قفل الهاتف (حسب قيود Android والمتصفح).","ok");
  }catch(e){showMessage(e.message||"تعذر تفعيل التنبيهات","error");}
}

function bootApp(){
  if(appBooted)return;
  appBooted=true;
  try{
    sanitizeHistory();
    const savedUniverse=storage.getItem(STORE.universe);
    if(savedUniverse&&$("symbols")){ $("symbols").value=cleanSymbols(savedUniverse).join(","); storage.setItem(STORE.universe,$("symbols").value); }
    const savedMode=storage.getItem(STORE.mode);
    if(["active","balanced","precision"].includes(savedMode)&&$("strategyMode")) $("strategyMode").value=savedMode;
  }catch(err){ console.warn("Startup state recovery",err); }

  // Bind each control independently: one failing control can no longer disable the others.
  bindUiControl("strategyMode","change",()=>{storage.setItem(STORE.mode,$("strategyMode")?.value||"active");renderStats();});
  bindUiControl("scanBtn","click",()=>loadMarket(true));
  bindUiControl("dailyBtn","click",()=>loadMarket(false));
  bindUiControl("pushBtn","click",()=>enableBackgroundAlerts());
  bindUiControl("soundTestBtn","click",()=>{playConfirmedSound();showMessage("هذا هو صوت CONFIRMED BUY داخل التطبيق. تنبيه الهاتف المقفل يستخدم قناة إشعارات Android/المتصفح.","ok");});
  bindUiControl("scannerHistoryRange","change",()=>renderScannerPerformance());bindUiControl("exportHistoryJson","click",()=>exportSignalHistory("json"));bindUiControl("exportHistoryCsv","click",()=>exportSignalHistory("csv"));
  bindUiControl("clearStats","click",()=>{ if(confirm("مسح جميع نتائج الصفقات المسجلة على هذا الجهاز؟")){storage.removeItem(STORE.history);lastCalibrationHash="";renderStats();renderSelectedTradeResultState();}});
  bindUiControl("backtestBtn","click",()=>runBacktest());
  bindUiControl("backtestSymbol","input",()=>{const box=$("backtestResult");if(box)box.innerHTML=`<div class="empty-state">لم يتم تشغيل الاختبار بعد لهذا الرمز.</div>`;});
  bindUiControl("proRefreshBtn","click",()=>loadMarketPro(true));
  bindUiControl("autoLive","change",()=>toggleProAuto());
  const ranges=$("chartRanges");
  if(ranges) ranges.querySelectorAll("button").forEach((btn,i)=>{
    if(btn.dataset.uiBound==="1")return; btn.dataset.uiBound="1";
    btn.addEventListener("click",()=>{chartRange=Number(btn.dataset.range)||60;ranges.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===btn));if(proData)drawMarketProChart(proData);});
  });
  window.addEventListener("resize",()=>{try{if(proData)drawMarketProChart(proData)}catch{}});

  try{ initCompactUi(); }catch(err){ console.warn("Tab UI fallback active",err); }
  try{ renderStats(); }catch(err){ console.warn("Stats render skipped",err); }
  const localSelected=safeJson(storage.getItem(STORE.selected));
  if(localSelected?.side==="LONG"&&localSelected?.tradeDate===nyClock().dateKey){
    try{applyTradeLock(localSelected,localSelected.lockedUntilTradeDate,false);}catch(err){console.warn("Local trade lock recovery",err);}
  }
  try{ if(currentData&&!selectedTrade)render(currentData); }catch(err){ console.warn("Cached recommendations render skipped",err); }
  try{ if(proData)renderPro(proData); }catch(err){ console.warn("Cached PRO render skipped",err); }
  try{ tickClocks(); }catch(err){ console.warn("Clock init",err); }
  try{ refreshMarketClock(); }catch{}
  setInterval(()=>{try{tickClocks()}catch{}},1000);
  setInterval(()=>{try{refreshMarketClock()}catch{}},60000);
  setInterval(async()=>{try{const r=await fetch("/api/latest",{cache:"no-store"});if(!r.ok)return;const d=await readJsonResponse(r);if(d?.generatedAt&&d.generatedAt!==currentData?.generatedAt){currentData=d;storage.setItem(STORE.latest,JSON.stringify(d));render(d);maybeSoundConfirmed(d);}else if(d?.generatedAt){renderScannerHealth(d);}}catch{}},30000);
  checkSelection(true).catch?.(()=>{});
  setTimeout(()=>{if(!selectedTrade)loadMarket(true).catch?.(()=>{});},700);

  window.DynamicTradingApp={
    runBacktest,
    loadRecommendations:()=>loadMarket(true),
    smartRefresh:()=>loadMarket(false),
    refreshMarketPro:()=>loadMarketPro(true)
  };

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/service-worker.js",{updateViaCache:"none"}).then(reg=>{reg.update().catch(()=>{});if(storage.getItem("dynamic_trading_push_enabled_v35")==="1"){const b=$("pushBtn");if(b)b.textContent="🔔 تنبيهات الخلفية مفعلة";}}).catch(()=>{});
  }
}
window.addEventListener("error",(ev)=>{console.error("Dynamic Trading UI error",ev.error||ev.message);});
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bootApp,{once:true}); else bootApp();

window.addEventListener("pageshow",()=>{const rows=visibleConfirmed();if(rows.length){for(const r of rows)if(r.signalId)sendTelemetry("APP_OPEN",{signalId:r.signalId,symbol:r.symbol,source:"pageshow",generatedAt:currentData?.generatedAt||""});}});


// Dynamic Trading 3.6: evidence cards and research AI read from the same Netlify history
// as the legacy Signal History / scanner. No new subscriptions or user accounts.
const dt36Names={openingReturnPct:'ارتفاع أول 15 دقيقة %',openingMomentum5Pct:'زخم أول 5 دقائق %',
 openingDollarVolume:'القيمة الدولارية للافتتاح',openingVolRatio:'تسارع حجم الافتتاح',
 relativeStrengthPct:'قوة السهم مقابل SPY %',benchmarkOpeningReturnPct:'SPY %',
 vwap:'VWAP',ema9:'EMA9',ema12:'EMA12',ema20:'EMA20',macd:'MACD',rsi14:'RSI14',
 atr14:'ATR14',hod:'HOD قمة اليوم',hodGapPct:'المسافة عن HOD %',
 momentum3Pct:'زخم 3 دقائق %',momentum5Pct:'زخم 5 دقائق %',momentum10Pct:'زخم 10 دقائق %',
 retestVolumeRatio:'حجم Retest مقارنة بالسابق',closePosition:'موضع إغلاق شمعة التأكيد',
 green:'شمعة خضراء',aboveVwap:'فوق VWAP',recentLow3:'أدنى آخر 3 شموع',
 openingRange5High:'قمة أول 5 دقائق',dollarVolumeLast5:'القيمة الدولارية آخر 5 دقائق',
 candleRangePct:'مدى الشمعة %',openingBars:'عدد شموع الافتتاح',openingReady:'اكتمال الافتتاح',
 completedBarAt:'وقت آخر شمعة مكتملة',price:'السعر',quoteSource:'مصدر Bid/Ask'};
function dt36Num(v){return v==null?'غير متاح':typeof v==='number'?Number(v).toLocaleString('en-US',{maximumFractionDigits:4}):String(v)}
function dt36Gates(name,arr){if(!arr?.length)return '';
 return `<details class="dt36-gates"><summary>${esc(name)} · ${arr.filter(x=>x.passed).length}/${arr.length} اجتاز</summary><div class="dt36-rows">`+
 arr.map(g=>`<div class="dt36-gate"><b class="${g.passed?'good':'bad'}">${g.passed?'✓ PASS':'× FAIL'}</b><span>${esc(g.gate)}</span><span>${esc(dt36Num(g.observed))} ${esc(g.operator)} ${esc(dt36Num(g.threshold))}</span>${g.passed?'':`<small>${esc(g.reason)}</small>`}</div>`).join('')+'</div></details>';}
function dt36Card(x){const f=x.features||{},q=x.quote||{},targets=x.shadowTargets||{};
 const indicatorList=Object.entries(f).filter(([k])=>dt36Names[k]);
 const level=Object.entries(targets).map(([k,v])=>`<span>${esc(k)} <b>$${esc(dt36Num(v))}</b></span>`).join(' · ');
 return `<article class="dt36-transition ${x.to==='CONFIRMED'?'dt36-confirmed':''}">
 <div class="dt36-head"><b>${esc(x.symbol)} · ${esc(x.from||'REGULAR')} → ${esc(x.to)}</b><small>${esc(formatDubai(x.at))}</small></div>
 <div><b>سبب القرار:</b> <span class="${x.to==='CONFIRMED'?'good':''}">${esc(x.reason||'غير متاح')}</span>
  · <b>جودة الإشارة:</b> ${esc(dt36Num(x.qualityScore))}/100
  · <b>احتمال الربح:</b> غير مُعاير</div>
 <div class="dt36-mini">Retest: ${esc(x.model||'بانتظار')} · Trigger: ${esc(dt36Num(x.trigger))}
  · Bid: ${esc(dt36Num(q.bid))} · Ask: ${esc(dt36Num(q.ask))}
  · Spread: ${esc(dt36Num(q.spreadBps))} bps · Quote age: ${esc(dt36Num(q.ageSec))}s</div>
 ${x.profitCapacity?`<div class="dt36-mini">Entry: $${esc(dt36Num(x.profitCapacity.entry))} · SL: $${esc(dt36Num(x.profitCapacity.stop))} · Dynamic: $${esc(dt36Num(x.profitCapacity.exitTarget))} · Net RR: ${esc(dt36Num(x.profitCapacity.netRewardR))}R</div>`:''}
 ${level?`<div class="dt36-mini">Shadow: ${level}</div>`:''}
 ${dt36Gates('REGULAR → SMART | شروط الافتتاح',x.openingChecks)}
 ${dt36Gates('SMART → CONFIRMED | تأكيد Retest',x.confirmationChecks)}
 ${dt36Gates('بوابات تنفيذ Bid/Ask والتكاليف',x.executionChecks)}
 <details class="dt36-gates"><summary>كل المؤشرات المسجلة وقت القرار (${indicatorList.length})</summary>
 <div class="dt36-feature-grid">${indicatorList.map(([k,v])=>`<span>${esc(dt36Names[k])}: <b>${esc(dt36Num(v))}</b></span>`).join('')}</div></details></article>`;
}
async function refresh36Panels(force=false){
 const el=$('dt36TransitionCards'),ai=$('dt36AiInsights');if(!el&&!ai)return;
 if(dt36AuditPending||(!force&&Date.now()-dt36LastAuditAt<55000))return;
 dt36AuditPending=true;dt36LastAuditAt=Date.now();
 try{const [tr,ar]=await Promise.all([fetch('/api/transition-cards',{cache:'no-store'}),fetch('/api/ai-insights',{cache:'no-store'})]);
  if(tr.ok&&el){const d=await tr.json();el.innerHTML=d.cards?.length?d.cards.map(dt36Card).join(''):
    '<div class="empty-state">لا توجد انتقالات إلى SMART أو CONFIRMED مسجلة اليوم. سيظهر السبب مع أول تغيير.</div>';}
  if(ar.ok&&ai){const d=await ar.json();const o=d.outcomes||{};
    ai.innerHTML=`<p><b>الجلسات:</b> ${esc(dt36Num(d.sessionsAnalyzed))} · SMART ${esc(dt36Num(d.smartTransitions))} · صفقات مكتملة ${esc(dt36Num(o.completedComparable))}
     · <b>Confidence:</b> ${esc(d.calibration?.status||'UNCALIBRATED')}</p>`+
    (d.recommendations||[]).map(r=>`<article class="dt36-advice"><b>${esc(r.title)}</b><p>${esc(r.evidence||'')}</p><small>${esc(r.hypothesis||'')} · اقتراح فقط / لا تغيير تلقائي</small></article>`).join('')+
    '<details><summary>أسباب الرفض الأكثر شيوعاً وأهداف Shadow</summary>'+
     (d.blockers||[]).map(x=>`<div>${esc(x.reason)}: ${esc(x.count)}</div>`).join('')+
     (d.shadow||[]).map(x=>`<div>${esc(x.mode)}: ${esc(x.hitBeforeStop)}/${esc(x.observed)} قبل الوقف · ${esc(x.postExitHit)} بعد الخروج</div>`).join('')+'</details>';}
 }catch(error){if(el&&!el.childElementCount)el.textContent='تعذر تحميل سجل 3.6؛ سيتم المحاولة في التحديث التالي.';}
 finally{dt36AuditPending=false;}
}

document.addEventListener("click",event=>{if(event.target?.id==="dt36RefreshBtn")refresh36Panels(true)});
