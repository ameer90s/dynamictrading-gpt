import {randomUUID} from 'node:crypto';

export function isApiCreditError(error) {
  return /run out of API credits|current minute|API credits/i.test(String(error?.message || error || ""));
}

export function secondsToNextMinute(now = new Date()) {
  return Math.max(2, 61 - now.getUTCSeconds());
}

export async function reserveApiMinute(store, source, estimatedCredits = 8) {
  const now = new Date();
  const minuteKey = now.toISOString().slice(0,16).replace(/[-:T]/g, "");
  const key = `api-credit-guard-${minuteKey}`;
  const existing = await store.get(key, { type:"json", consistency:"strong" });
  if (existing) return { allowed:false, waitSeconds:secondsToNextMinute(now), existing, key };
  // Only one caller wins even when two scheduled functions read an empty minute.
  // A conditional-write acknowledgement is not enough: verify ownership in Blob.
  const claimId = randomUUID();
  const receipt = await store.setJSON(key, { source, estimatedCredits, reservedAt:now.toISOString(), claimId }, { onlyIfNew:true });
  if (receipt?.modified !== true) return { allowed:false, waitSeconds:secondsToNextMinute(now), key };
  const confirmed = await store.get(key, { type:'json', consistency:'strong' });
  if (confirmed?.claimId !== claimId) throw Error('API_MINUTE_RESERVATION_NOT_VERIFIED');
  return { allowed:true, waitSeconds:0, key };
}
