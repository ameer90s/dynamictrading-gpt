import {getStore} from "@netlify/blobs";
export default async(req)=>{
  if(req.method==="GET")return json({publicKey:process.env.VAPID_PUBLIC_KEY||null,configured:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const sub=await req.json().catch(()=>null);if(!sub?.endpoint)return json({error:"اشتراك Push غير صالح"},400);
  const store=getStore("dynamic-trading");const list=await store.get("push-subscriptions-v33",{type:"json",consistency:"strong"})||[];
  const next=[...list.filter(x=>x?.endpoint!==sub.endpoint),sub].slice(-10);await store.setJSON("push-subscriptions-v33",next);return json({ok:true,count:next.length},201);
};
export const config={path:"/api/push-subscribe"};
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
