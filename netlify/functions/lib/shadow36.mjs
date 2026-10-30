// Six simultaneous V4 research targets, frozen from the actual quote at signal time.
// A one-minute bar does not reveal event ordering when SL and a target both touch;
// use AMBIGUOUS_SAME_BAR rather than inventing an intraminute fill. Price OHLCV
// comes from IEX, not actual historical exit Bid, so results are research proxies.
export function updateShadowSix(sig,bar){
  const targets=sig?.shadowTargets;if(!targets||!bar)return false;
  const stopped=bar.l<=Number(sig.sl);let changed=false;
  for(const x of Object.values(targets)){
    const before=JSON.stringify(x);
    const hit=Number(x.target)>0&&bar.h>=Number(x.target);
    x.maxPrice=Math.max(Number(x.maxPrice||sig.entry),bar.h);
    x.minPrice=Math.min(Number(x.minPrice||sig.entry),bar.l);
    x.lastCheckedAt=bar.t;
    const exited=Boolean(sig.closedAt);
    if(!exited&&!x.firstHitAt&&!x.stopFirstAt){
      if(hit&&stopped){x.status='AMBIGUOUS_SAME_BAR';x.stopFirstAt=bar.t;}
      else if(stopped){x.status='STOP_FIRST';x.stopFirstAt=bar.t;}
      else if(hit){x.status='HIT_BEFORE_STOP';x.firstHitAt=bar.t;}
    }else if(exited&&hit&&!x.firstHitAt&&!x.postExitHitAt){x.postExitHitAt=bar.t;
      if(!x.stopFirstAt)x.status='HIT_AFTER_OFFICIAL_EXIT';}
    if(JSON.stringify(x)!==before)changed=true;
  }
  return changed;
}
