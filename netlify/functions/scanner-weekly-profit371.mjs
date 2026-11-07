/** Five direct read-only session-history Blob reads, only on performance view. */
import {monday371,nextDay371,summarizeScannerWeek371} from './lib/scanner-weekly-profit371.mjs';
export async function scannerWeeklyProfit371(request,{store=null,now=new Date()}={}){
 if(request.method!=='GET')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405});
 let week,commissionPerTrade=0;
 try { const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const date=Object.fromEntries(parts.map(x=>[x.type,x.value])); const params=new URL(request.url).searchParams; week=monday371(params.get('week')||`${date.year}-${date.month}-${date.day}`); const fee=params.get('commission'); if(fee!==null){if(!/^\d+(?:\.\d{1,2})?$/.test(fee))throw Error('INVALID_COMMISSION');commissionPerTrade=Number(fee);if(commissionPerTrade>100)throw Error('INVALID_COMMISSION');} }
 catch{return Response.json({error:'INVALID_WEEK'},{status:400});}
 // No future or arbitrarily old historical scans: bounds read overhead.
 const diff=(Date.parse(`${week}T12:00:00Z`)-now.getTime())/86400000;
 if(diff>7||diff<-(2*365+10))return Response.json({error:'WEEK_OUT_OF_RANGE'},{status:400});
 try{
  const actualStore=store||(await import('@netlify/blobs')).getStore('dynamic-trading');
  const docs=await Promise.all(Array.from({length:5},(_,i)=>actualStore.get(`signal-history-${nextDay371(week,i)}`,{type:'json',consistency:'strong'})));
  return Response.json(summarizeScannerWeek371(week,docs,{now,commissionPerTrade}),{headers:{'Cache-Control':'private, max-age=0, no-store'}});
 }catch(e){console.error('DT371_WEEKLY_SCANNER_READ_FAILED',String(e?.message||e).slice(0,100));return Response.json({error:'SCANNER_HISTORY_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export default request=>scannerWeeklyProfit371(request);
export const config={path:'/api/scanner-weekly-profit'};
