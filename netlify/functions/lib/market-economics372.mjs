/** Shared paper safety floor. Spread/slippage are explicit assumptions, never fills. */
export const PAPER_SLIPPAGE_BPS372=2;
export function sizePaperPosition372({entry,stop,bid,ask,capitalUsd,riskBudgetUsd,feesUsd=2,slippageBps=PAPER_SLIPPAGE_BPS372}={}){
 if(![entry,stop,bid,ask,capitalUsd,riskBudgetUsd,feesUsd,slippageBps].every(Number.isFinite)||
  entry<=0||stop<=0||stop>=entry||bid<=0||ask<bid||capitalUsd<=feesUsd||riskBudgetUsd<=feesUsd||feesUsd<0||slippageBps<0)return 0;
 const frictionPerShare=ask-bid+2*entry*slippageBps/10000;
 return Math.max(0,Math.min((capitalUsd-feesUsd)/(entry+frictionPerShare),
  (riskBudgetUsd-feesUsd)/(entry-stop+frictionPerShare)));
}
export function tradeEconomics372({entry,stop,target,qty,feesUsd=2,bid,ask,slippageBps=PAPER_SLIPPAGE_BPS372}={}){
 const valid=[entry,stop,target,qty,feesUsd,bid,ask,slippageBps].every(Number.isFinite)&&
  entry>0&&stop>0&&stop<entry&&target>entry&&qty>0&&feesUsd>=0&&bid>0&&ask>=bid&&slippageBps>=0;
 if(!valid)return {valid:false,netGainUsd:null,netLossUsd:null,netRewardR:null,acceptable:false,reason:'INVALID_ECONOMIC_INPUT'};
 // Entry uses the actual ask. Reserve a full observed spread plus two adverse
 // slippage legs as a conservative modeled friction budget, in addition to fees.
 const spreadUsd=(ask-bid)*qty,slippageUsd=2*entry*slippageBps/10000*qty;
 const totalCostUsd=feesUsd+spreadUsd+slippageUsd;
 const netGainUsd=(target-entry)*qty-totalCostUsd,netLossUsd=(entry-stop)*qty+totalCostUsd;
 const netRewardR=netLossUsd>0?netGainUsd/netLossUsd:null;
 return {valid:true,entry,stop,target,qty,feesUsd,spreadUsd,slippageUsd,slippageBps,totalCostUsd,
  netGainUsd,netLossUsd,netRewardR,acceptable:netGainUsd>netLossUsd,
  reason:netGainUsd>netLossUsd?'NET_REWARD_EXCEEDS_RISK':'NET_REWARD_NOT_GREATER_THAN_RISK',
  model:'PAPER_ASK_ENTRY_OBSERVED_SPREAD_TWO_SLIPPAGE_LEGS_NO_BROKER_FILL'};
}
export function selectExecutablePlan372(plans=[]){
 return [...plans].filter(p=>p.checks?.length&&p.checks.every(c=>c.passed)&&p.economics?.acceptable)
  .sort((a,b)=>b.economics.netRewardR-a.economics.netRewardR||
   b.economics.netGainUsd-a.economics.netGainUsd||String(a.id).localeCompare(String(b.id)))[0]||null;
}
