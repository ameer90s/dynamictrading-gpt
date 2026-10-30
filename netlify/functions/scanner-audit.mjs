// Same combined audit endpoint accepts ?kind=scanner.
import handler from './ai-parallel-audit.mjs';
export default async(req)=>{
 const u=new URL(req.url);u.searchParams.set('kind','scanner');return handler(new Request(u.toString(),{method:req.method,headers:req.headers}));
};
export const config={path:'/api/scanner-audit'};
