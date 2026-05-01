// Detection-time threshold for recurring auto-detection.
// Compares (max - min) / median amount across candidate transactions.
// Tighten if false positives appear; loosen if real recurring patterns are missed.
export const AUTO_DETECT_AMOUNT_SPREAD = 0.25;

// Match-time default tolerance for new auto-created recurring rules.
// Per-rule configurable; this is just the default at creation time.
export const RULE_MATCH_DEFAULT_TOLERANCE_PCT = 20;

// Minimum number of historical transactions required to detect a pattern.
// Per-bucket overrides apply in detect.ts (weekly/monthly require 3, others 2).
export const AUTO_DETECT_MIN_SAMPLES = 2;

// Threshold above which the dashboard shows "data is stale" warning.
export const STALENESS_HOURS = 24;
