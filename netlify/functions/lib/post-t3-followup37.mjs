/**
 * Research-only T3 follow-up. Never edits entry, T1/T2/T3 or stop loss.
 * When a T3 is hit inside a completed one-minute bar, the bar high is an
 * observable upper bound on continuation, not proof of an executable fill
 * after the exact TP3 crossing (OHLC has no intrabar timestamps).
 */
const round3 = n => Number(n.toFixed(3));
export function trackPostT3Bar37(signal, bar) {
  const t3 = Number(signal?.t3), high = Number(bar?.h), close = Number(bar?.c);
  if (!(Number.isFinite(t3) && t3 > 0 && Number.isFinite(high) && high >= 0 &&
    Number.isFinite(close) && close > 0 && typeof bar?.t === 'string' && bar.t)) return false;
  const oldPeak = Number(signal.postT3Peak);
  const peak = Math.max(t3, Number.isFinite(oldPeak) ? oldPeak : t3, high);
  let changed = false;
  function set(key, value) {
    if (signal[key] !== value) { signal[key] = value; changed = true; }
  }
  if (!(Number.isFinite(oldPeak) && oldPeak >= t3)) {
    set('postT3Peak', peak);
    set('postT3PeakAt', bar.t);
  } else if (peak > oldPeak) {
    set('postT3Peak', peak);
    set('postT3PeakAt', bar.t);
  }
  set('postT3MfePct', round3((peak / t3 - 1) * 100));
  set('postT3GivebackPct', round3((peak - close) / peak * 100));
  return changed;
}
