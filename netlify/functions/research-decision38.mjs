/** Owner-only recommendation decision, separate from deployment/trading approval. */
import {timingSafeEqual,createHash} from 'node:crypto';
import {getStore} from '@netlify/blobs';
const fail=(error,status)=>Response.json({error},{status,headers:{'cache-control':'no-store'}});
function authenticated(header,secret){if(!secret||secret.length<20||!header?.startsWith('Bearer '))return false;const left=createHash('sha256').update(header.slice(7)).digest();const right=createHash('sha256').update(secret).digest();return timingSafeEqual(left,right)}
export default async function handler(request){
 if(!['POST','GET'].includes(request.method))return fail('METHOD_NOT_ALLOWED',405);
 if(!authenticated(request.headers.get('authorization'),process.env.DT38_DECISION_ADMIN_TOKEN))return fail('OWNER_TOKEN_MISSING_OR_INVALID',401);
 if(request.method==='GET'){
  const day=new URL(request.url).searchParams.get('day');if(!/^20\d{2}-\d\d-\d\d$/.test(day||''))return fail('BAD_DAY',400);
  try{const store=getStore('dynamic-trading');const out=[];const pages=await store.list({prefix:`dt38-owner-decision-${day}-`});for(const item of (pages.blobs||[]).slice(0,100)){const value=await store.get(item.key,{type:'json',consistency:'strong'});if(value&&value.day===day)out.push(value)}return Response.json({day,decisions:out,hasMore:!!pages.cursor},{headers:{'cache-control':'no-store'}})}catch{return fail('STORE_UNAVAILABLE',503)}
 }
 let entry;try{const raw=await request.text();if(raw.length>3000)return fail('PAYLOAD_TOO_LARGE',413);entry=JSON.parse(raw)}catch{return fail('BAD_JSON',400)}
 if(!/^[A-Za-z0-9_:\-.]{1,110}$/.test(entry?.id||'')||!['APPROVE','REJECT'].includes(entry?.verdict)||!/^20\d{2}-\d\d-\d\d$/.test(entry?.day||'')||!['OPENAI','LOCAL'].includes(entry?.source))return fail('INVALID_DECISION',400);
 const source=String(entry.summary||'').slice(0,800),at=new Date().toISOString(),record={id:entry.id,day:entry.day,source:entry.source,verdict:entry.verdict,summary:source,at,status:'OWNER_REVIEW_ONLY_NOT_APPLIED',autoTrade:false,autoDeploy:false};
 try{
  const store=getStore('dynamic-trading');const key=`dt38-owner-decision-${entry.day}-${createHash('sha256').update(entry.id).digest('hex').slice(0,20)}`;
  const prior=await store.get(key,{type:'json',consistency:'strong'});if(prior)return Response.json({status:'ALREADY_RECORDED',at:prior.at,verdict:prior.verdict});
  const response=await store.setJSON(key,record,{onlyIfNew:true});if(response?.modified===false)return fail('DECISION_CONFLICT_RECHECK',409);
  const saved=await store.get(key,{type:'json',consistency:'strong'});if(saved?.id!==entry.id||saved?.verdict!==entry.verdict)return fail('DECISION_PERSISTENCE_NOT_VERIFIED',503);
  return Response.json({status:'SAVED',at,verdict:entry.verdict,productionApplied:false},{headers:{'cache-control':'no-store'}});
 }catch{return fail('STORE_UNAVAILABLE',503)}
}
export const config={path:'/api/research-decision38'};
