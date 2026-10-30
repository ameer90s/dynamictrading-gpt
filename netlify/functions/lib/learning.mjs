// Scanner-first conservative learning. It learns only from finalized automatic
// CONFIRMED outcomes, never from the user's approval choice.
const BASE={active:false,source:'SCANNER_CONFIRMED',sampleSize:0,minConfidence:64,symbolThresholds:{},phaseThresholds:{},weights:[.30,.20,.20,.20,.10],performanceModel:{global:null,symbol:{},phase:{},confidence:{}},riskOverrides:{rvolBoost:0,retestBoost:0,mtfBoost:0,roomRBoost:0,chaseCut:0,relativeStrengthBoost:0,newsStrict:false},learnedIds:[]};
export async function refreshScannerLearning(store,history){
  const state=await store.get('scanner-learning-state-v35',{type:'json',consistency:'strong'})||{...BASE,rows:[],learnedIds:[]};const known=new Set(state.learnedIds||[]);let added=0;
  for(const rec of Object.values(history?.signals||{}))for(const s of (rec.confirmedSignals||[])){
    const sid=s.signalId||`${history?.dateKey||'legacy'}:${rec.symbol}:${s.confirmedAt||'unknown'}`;if(known.has(sid)||!['T1','T2','T3','SL'].includes(s.finalOutcome))continue;
    state.rows.push({id:sid,symbol:rec.symbol,result:s.finalOutcome,confidence:Number(s.features?.confidence||0),f:s.features||{},at:s.confirmedAt});known.add(sid);added++;
  }
  if(!added)return await store.get('scanner-calibration-v35',{type:'json',consistency:'strong'})||BASE;
  state.rows=state.rows.slice(-500);state.learnedIds=[...known].slice(-1000);const cal=build(state.rows);await store.setJSON('scanner-learning-state-v35',state);await store.setJSON('scanner-calibration-v35',cal);return cal;
}
function build(rows){const n=rows.length,wins=rows.filter(x=>x.result!=='SL');const cal={...BASE,active:n>=20,sampleSize:n,updatedAt:new Date().toISOString(),performanceModel:{global:stat(rows),symbol:{},phase:{},confidence:{}},riskOverrides:{...BASE.riskOverrides}};
  for(const [k,a] of groups(rows,x=>x.symbol))if(a.length>=5)cal.performanceModel.symbol[k]=stat(a);for(const [k,a] of groups(rows,x=>bucket(x.confidence)))if(a.length>=5)cal.performanceModel.confidence[k]=stat(a);
  if(n>=20){for(const b of ['<70%','70–74%','75–79%','80–84%']){const a=rows.filter(x=>bucket(x.confidence)===b);if(a.length>=5&&stat(a).expectancy<0)cal.minConfidence=Math.max(cal.minConfidence,b==='<70%'||b==='70–74%'?75:b==='75–79%'?80:85);}for(const [sym,a] of groups(rows,x=>x.symbol)){if(a.length>=5&&stat(a).expectancy<0)cal.symbolThresholds[sym]=Math.min(92,cal.minConfidence+(a.length>=8?5:3));}
    const losses=rows.filter(x=>x.result==='SL'),rate=(fn)=>losses.length?losses.filter(fn).length/losses.length:0;if(losses.length>=6&&rate(x=>Number(x.f?.relativeVolume||9)<1.0)>=.25)cal.riskOverrides.rvolBoost=.15;if(losses.length>=6&&rate(x=>Number(x.f?.retestQuality||100)<65)>=.25)cal.riskOverrides.retestBoost=5;if(losses.length>=6&&rate(x=>Number(x.f?.mtfAlignment||100)<70)>=.25)cal.riskOverrides.mtfBoost=5;if(losses.length>=6&&rate(x=>Number(x.f?.roomR||9)<1.4)>=.25)cal.riskOverrides.roomRBoost=.2;if(losses.length>=6&&rate(x=>Number(x.f?.chaseDistanceAtr||0)>.75)>=.25)cal.riskOverrides.chaseCut=.1;if(losses.length>=6&&rate(x=>Number(x.f?.relativeStrengthPct||0)<.1)>=.25)cal.riskOverrides.relativeStrengthBoost=.1;if(losses.length>=6&&rate(x=>Number(x.f?.newsRisk||0)>=70)>=.25)cal.riskOverrides.newsStrict=true;}
  return cal;
}
function stat(a){const wins=a.filter(x=>x.result!=='SL').length;const r=a.map(x=>x.result==='T3'?1.0:x.result==='T2'?0.8:x.result==='T1'?0.6:-1);const net=r.reduce((q,x)=>q+x,0);return{count:a.length,wins,avgWinR:wins?r.filter(x=>x>0).reduce((q,x)=>q+x,0)/wins:.8,expectancy:a.length?net/a.length:0};}
function groups(a,fn){const m=new Map();for(const x of a){const k=fn(x)||'?';if(!m.has(k))m.set(k,[]);m.get(k).push(x);}return m;}
function bucket(c){return c>=90?'90%+':c>=85?'85–89%':c>=80?'80–84%':c>=75?'75–79%':c>=70?'70–74%':'<70%';}
