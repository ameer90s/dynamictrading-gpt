/** Cache-only provider status; this endpoint never calls a market API. */
import {getStore} from '@netlify/blobs';
export default async function handler(request){
 if(request.method!=='GET')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405});
 try{
  const s=getStore('dynamic-trading');const [news,market]=await Promise.all([s.get('latest-news',{type:'json',consistency:'strong'}),s.get('latest-daily',{type:'json',consistency:'strong'})]);
  const age=x=>{const t=Date.parse(x||'');return Number.isFinite(t)?Date.now()-t:Infinity};
  const ns=news?.providerStatus||{},as=ns.alpaca==='ok'&&age(news?.generatedAt)<1200000?'LIVE':ns.alpaca==='error'?'ERROR':ns.alpaca==='not_configured'?'NOT_CONFIGURED':'UNVERIFIED';
  const fs=ns.finnhub==='LIVE'&&age(news?.finnhub?.verifiedAt)<1200000?'LIVE':ns.finnhub==='NOT_CONFIGURED'?'NOT_CONFIGURED':ns.finnhub==='DEGRADED'?'FALLBACK':'UNVERIFIED';
  return Response.json({alpaca:{status:as,lastVerifiedAt:as==='LIVE'?news.generatedAt:null},finnhub:{status:fs,lastVerifiedAt:fs==='LIVE'?news.finnhub.verifiedAt:null},source:'STORED_NEWS_LAST_RUN_ONLY',marketLastAt:market?.generatedAt||null},{headers:{'cache-control':'no-store'}});
 }catch{return Response.json({alpaca:{status:'UNVERIFIED'},finnhub:{status:'UNVERIFIED'},source:'ARCHIVE_UNAVAILABLE'},{status:503})}
}
export const config={path:'/api/provider-status38'};
