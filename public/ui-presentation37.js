// Extracted verbatim from app.js; loaded as a classic script before app.js.
function spreadSummary(r){const m=r?.metrics||{};if(m.spreadAvailable&&Number.isFinite(Number(m.spreadBps))){const cls=Number(m.spreadBps)<=Number(r.filters?.maxSpreadBps||20)?"good":"bad";return `<span class="${cls}">IEX Spread ${Number(m.spreadBps).toFixed(1)} bps</span> · Bid ${money(m.bid)} / Ask ${money(m.ask)}${m.quoteFresh?"":" · quote قديم"}`;}return `<span class="muted">Spread غير متاح — أضف Alpaca</span>`;}
function targetLabel(ep,n){const pct=Number(ep?.[`target${n}Pct`]||0);const rv=Number(ep?.[`t${n}R`]||([1,1.7,2.5][n-1]));return pct>0?`+${(pct*100).toFixed([0.6,0.8,1].some(x=>Math.abs(pct*100-x)<0.001)?1:2)}% · ${rv.toFixed(2)}R`:`${rv.toFixed(1)}R`;}
function setupLabel(r){const m=r?.metrics||{},f=String(m.setupFamily||"BREAKOUT_RETEST"),st=m.setupState,label=m.setupFamilyLabel||f;if(f==="FIRST_15M_CANDLE")return st==="CONFIRMED"?"15-Minute Candle ✓ — كسر High أول 15 دقيقة مثبت":st==="WAIT_15M_CONFIRMATION"?"15-Minute Candle — الكسر موجود وبانتظار تثبيت":st==="EXPIRED"?"15-Minute Candle — الإشارة قديمة/السعر ابتعد":"15-Minute Candle — بانتظار كسر High أول 15 دقيقة";if(f==="VWAP_RECLAIM")return st==="CONFIRMED"?"VWAP Reclaim ✓":st==="WAIT_CONFIRMATION"?"VWAP Reclaim — بانتظار التأكيد":"VWAP Reclaim — بانتظار الاستعادة";if(f==="MOMENTUM_CONTINUATION")return st==="CONFIRMED"?"Momentum Continuation ✓":"Momentum Continuation — الزخم غير مكتمل";return st==="CONFIRMED"?"Breakout ✓ Retest ✓ Confirmation ✓":st==="WAIT_CONFIRMATION"?"Breakout ✓ Retest ✓ — بانتظار Confirmation":st==="WAIT_RETEST"?"Breakout ✓ — بانتظار Retest":st==="FAILED_RETEST"?"Failed Breakout — مرفوض":st==="EXPIRED"?"Setup قديم/السعر ابتعد — مرفوض":"بانتظار Breakout";}
function sideAr(side){return side==="LONG"?"شراء":side==="SHORT"?"شورت قديم — غير معتمد شرعياً":"انتظار"}function money(v){return Number(v||0).toFixed(2)}function formatDubai(v){if(!v)return"";return new Intl.DateTimeFormat("ar-AE",{timeZone:"Asia/Dubai",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}function qualityClass(q){return q?.startsWith("A")?"quality-A":q?.startsWith("B")?"quality-B":q?.startsWith("C")?"quality-C":""}


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
