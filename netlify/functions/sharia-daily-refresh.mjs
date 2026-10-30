import {getStore} from '@netlify/blobs';
import {refreshDailySharia} from './lib/sharia-daily.mjs';
export default async()=>{
  const store=getStore({name:'dynamic-trading'});
  const result=await refreshDailySharia(store);
  return new Response(JSON.stringify({ok:!!result.symbols?.length,count:result.count,source:result.source,sourceUpdatedAt:result.sourceUpdatedAt,cacheStatus:result.cacheStatus,changes:result.changes||null,error:result.refreshError||null}),{status:result.symbols?.length?200:503,headers:{'content-type':'application/json'}});
};
export const config={schedule:'15 12 * * 1-5'};
