/** Unified US regular-session discovery + lightweight follow-ups.
 * Normal: discovery [09:30,15:00); follow-up 15:00..16:00 ET.
 * Early close: discovery [09:30,12:00); follow-up 12:00..13:00 ET.
 * Uses the real NYSE calendar via marketSession/recommendationWindow.
 * Late follow-up runs at five-minute intervals plus the actual close;
 * scheduling invocations outside the due window still cost Netlify resources.
 */
export const LAST_HOUR_FOLLOW_MINUTES37=5;
export function sessionPlan37(clock){
 const open=clock?.startMinute??570;
 const close=Number(clock?.regularCloseMinute);
 const minute=Number(clock?.minuteOfDay);
 const valid=clock?.isTradingDay===true&&Number.isFinite(close)&&Number.isFinite(minute)&&close>open;
 const discoveryCutoff=close-60;
 const discovery=valid&&minute>=open&&minute<discoveryCutoff&&clock.session==='REGULAR';
 const followup=valid&&minute>=discoveryCutoff&&minute<=close;
 const followupDue=followup&&((minute-discoveryCutoff)%LAST_HOUR_FOLLOW_MINUTES37===0||minute===close);
 return {open,close,discoveryCutoff,discovery,followup,followupDue,
   phase:discovery?'DISCOVERY':followup?'FOLLOWUP_ONLY':'CLOSED',
   expectedDiscoveryMinutes:Math.max(0,discoveryCutoff-open),
   noNewEntries:!discovery};
}
