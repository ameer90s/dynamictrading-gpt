import {getStore} from '@netlify/blobs';
import {recommendationWindow} from './lib/time.mjs';
import {HISTORY_INDEX_KEY,STRATEGY_VERSION,SCHEMA_VERSION} from './lib/version.mjs';
export default async(req)=>{const store=getStore('dynamic-trading'),clock=recommendationWindow(),u=new URL(req.url);const n=Math.max(1,Math.min(30,Number(u.searchParams.get('sessions')||1)));const index=await store.get(HISTORY_INDEX_KEY,{type:'json',consistency:'strong'});let refs=(index?.sessions||[]).filter(x=>x?.dateKey);
 // Backward-compatible recovery: always merge indexed sessions with historical date keys,
 // so creating the new index never hides sessions written by older releases.
 const known=new Set(refs.map(x=>x.dateKey));for(const dateKey of fallbackDateKeys(clock.dateKey,90)){if(!known.has(dateKey))refs.push({dateKey,key:`signal-history-${dateKey}`});}refs.sort((a,b)=>b.dateKey.localeCompare(a.dateKey));
 const sessions=[];for(const ref of refs){const x=await store.get(ref.key||`signal-history-${ref.dateKey}`,{type:'json',consistency:'strong'});if(x&&!sessions.some(s=>s.dateKey===x.dateKey))sessions.push(x);if(sessions.length>=n)break;}
 if(n===1){const data=sessions[0]||await store.get('signal-history-latest',{type:'json',consistency:'strong'})||{version:STRATEGY_VERSION,schemaVersion:SCHEMA_VERSION,signals:{},events:[]};return json(data);}return json({version:STRATEGY_VERSION,schemaVersion:SCHEMA_VERSION,sessionsRequested:n,sessionsFound:sessions.length,indexedSessions:(index?.sessions||[]).length,sessions});};
export const config={path:'/api/signal-history'};
function fallbackDateKeys(endKey,count){const out=[],d=new Date(`${endKey}T12:00:00Z`);while(out.length<count){const day=d.getUTCDay();if(day!==0&&day!==6)out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()-1);}return out;}
function json(x){return new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
