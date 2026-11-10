import {newYorkParts} from './time.mjs';
/** Stored candle datetimes without offsets are New York wall time, never UTC. */
const cache=new Map();
export function marketTimestamp372(value){
 if(cache.has(value))return cache.get(value);
 const result=parseTimestamp(value);
 if(cache.size>=4096)cache.delete(cache.keys().next().value);
 cache.set(value,result);return result;
}
function parseTimestamp(value){
 if(typeof value!=='string')return null;
 const date=/^(20\d{2})-(\d{2})-(\d{2})/.exec(value);
 if(!date)return null;
 const calendarDay=new Date(Date.UTC(+date[1],+date[2]-1,+date[3]));
 if(calendarDay.getUTCFullYear()!==+date[1]||calendarDay.getUTCMonth()!==+date[2]-1||calendarDay.getUTCDate()!==+date[3])return null;
 if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)){
  const n=Date.parse(value);return Number.isFinite(n)?n:null;
 }
 const m=/^(20\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
 if(!m)return null;
 const [y,mo,d,h,mi,s]=m.slice(1).map(x=>Number(x||0));
 if(mo<1||mo>12||d<1||d>31||h>23||mi>59||s>59)return null;
 const desired=Date.UTC(y,mo-1,d,h,mi,s),calendar=new Date(desired);
 if(calendar.getUTCFullYear()!==y||calendar.getUTCMonth()!==mo-1||calendar.getUTCDate()!==d)return null;
 let guess=desired+5*3600000;
 for(let i=0;i<3;i++){
  const p=newYorkParts(new Date(guess));
  const actual=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,s);
  const delta=desired-actual;if(!delta)return guess;guess+=delta;
 }
 return null;
}
export const isClosedAsOf372=(position,now)=>{
 const at=marketTimestamp372(position?.closedAt);
 return position?.status==='CLOSED'&&at!==null&&at<=now.getTime();
};
