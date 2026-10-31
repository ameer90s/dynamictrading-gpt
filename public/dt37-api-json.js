/* 3.7 API response safety: never treat Netlify's HTML fallback as market JSON. */
(()=>{'use strict';
 async function parse(response){
  const status=Number(response?.status)||0;
  const contentType=String(response?.headers?.get?.('content-type')||'').toLowerCase();
  let path='API';
  try{path=new URL(response?.url||'',location.origin).pathname||'API';}catch{}
  let body='';
  try{body=await response.text()}catch{throw new Error(`API_READ_FAILED · ${path} · HTTP ${status}`)}
  if(/<\s*!doctype\b|<\s*html\b/i.test(body.slice(0,300))||contentType.includes('text/html')){
   throw new Error(`API_HTML_RESPONSE · ${path} · HTTP ${status}: الخدمة أعادت صفحة ويب بدل JSON. تحقق من نشر Netlify Functions ومسار API.`)
  }
  if(!/(?:\bapplication\/json\b|\+json\b)/.test(contentType)){
   throw new Error(`API_NOT_JSON · ${path} · HTTP ${status}: نوع الاستجابة ${contentType||'غير محدد'}`)
  }
  try{return JSON.parse(body)}catch{throw new Error(`API_INVALID_JSON · ${path} · HTTP ${status}`)}
 }
 window.DT37ApiJson={parse};
})();
