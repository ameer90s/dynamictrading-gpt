/** Read-only, separate scalp results and per-minute audit. No trade actions. */
import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {scalpStateKey37,scalpAuditKey37,scalpLatestKey37} from './lib/scalp-standalone37.mjs';
import {scalpSummary37} from './lib/ai-scalp-paper37.mjs';
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default async req=>{
 if(req.method!=='GET')return j({error:'METHOD_NOT_ALLOWED'},405);
 const url=new URL(req.url),day=url.searchParams.get('day')||recommendationWindow().dateKey;
 if(!/^20\d\d-\d\d-\d\d$/.test(day))return j({error:'INVALID_DAY'},400);
 const store=getStore('dynamic-trading');
 try{
  const [state,latest,report]=await Promise.all([
   store.get(scalpStateKey37(day),{type:'json',consistency:'strong'}),
   store.get(scalpLatestKey37,{type:'json',consistency:'strong'}),
   store.get(`dt37-scalp-agent-review-${day}`,{type:'json',consistency:'strong'})]);
  const book=state?.book||null;
  const positions=Object.values(book?.records||{}).filter(x=>x?.position).map(x=>({symbol:x.symbol,...x.position}));
  const pending=Object.values(book?.records||{}).filter(x=>x?.pending).map(x=>({symbol:x.symbol,...x.pending,reason:x.reason}));
  const requestedMinute=url.searchParams.has('auditMinute')?Number(url.searchParams.get('auditMinute')):null;
  if(requestedMinute!==null&&(!Number.isInteger(requestedMinute)||requestedMinute<570||requestedMinute>959))
   return j({error:'INVALID_AUDIT_MINUTE'},400);
  const minutes=requestedMinute===null?Math.min(12,Math.max(0,Number(url.searchParams.get('auditMinutes')||0))):1;
  const audits=minutes&&(requestedMinute!==null||state?.book?.lastMinute!=null)?await Promise.all(Array.from({length:minutes},(_,i)=>
   store.get(scalpAuditKey37(day,requestedMinute??(state.book.lastMinute-i)),{type:'json',consistency:'strong'}))):[];
  return j({day,status:state?.updatedAt?'RECORDED':'NOT_RECORDED',latest:latest?.day===day?latest:null,
   cycles:state?.cycles||0,scannedDistinct:state?.distinctSymbols?.length||0,eligibleCount:state?.eligibleCount||null,
   updatedAt:state?.updatedAt||null,summary:book?scalpSummary37(book):null,
   positions,closedOutcomes:book?.closedOutcomes||[],pending,agentReview:report||null,
   minuteAudits:audits.filter(Boolean),paperOnly:true,brokerOrders:false});
 }catch{return j({day,status:'ARCHIVE_READ_FAILED',error:'READ_FAILED'},503);}
};
export const config={path:'/api/scalp-paper'};
