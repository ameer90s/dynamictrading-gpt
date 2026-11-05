/** Canonical trading mode configuration, extracted verbatim from trading.mjs. */

export const STRATEGY_MODES = {
  active: {
    id: "active", label: "Active Flexible 0.6–1.0%", minConfidence: 60, minRvol: 0.75, minRoomR: 0.65,
    minRetestQuality: 42, minMtfAlignment: 42, minInPlay: 32, minLiquidityScore: 32,
    maxChaseAtr: 1.08, minBreakoutVolume: 0.90, minConfirmationVolume: 0.88, maxRetestMinutes:35, maxConfirmationAgeMinutes:30, maxSpreadBps:35, smartSpreadBps:70,
    minRelativeStrengthLong: -0.30, maxRelativeStrengthShort: 0.10, scoreGap: 2, minExpectedR: -0.02,
    target1Pct:0.006, target2Pct:0.008, target3Pct:0.010, minStopPct:0.0055, maxStopPct:0.0110,
  },
  precision: {
    id: "precision", label: "High Precision", minConfidence: 82, minRvol: 1.50, minRoomR: 1.70,
    minRetestQuality: 75, minMtfAlignment: 72, minInPlay: 62, minLiquidityScore: 65,
    maxChaseAtr: 0.60, minBreakoutVolume: 1.15, minConfirmationVolume: 1.15, maxRetestMinutes:14, maxConfirmationAgeMinutes:6, maxSpreadBps:20,
    minRelativeStrengthLong: 0.10, maxRelativeStrengthShort: -0.10, scoreGap: 9, minExpectedR: 0.20,
  },
  balanced: {
    id: "balanced", label: "Balanced", minConfidence: 75, minRvol: 1.30, minRoomR: 1.40,
    minRetestQuality: 62, minMtfAlignment: 60, minInPlay: 50, minLiquidityScore: 50,
    maxChaseAtr: 0.80, minBreakoutVolume: 1.05, minConfirmationVolume: 1.05, maxRetestMinutes:20, maxConfirmationAgeMinutes:8, maxSpreadBps:30,
    minRelativeStrengthLong: -0.05, maxRelativeStrengthShort: 0.05, scoreGap: 7, minExpectedR: 0.08,
  },
};
