import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";
import * as chartIndicators from "../tools/chart-indicators.js";

const bullishAboveLineWithoutBreak = {
  latest: {
    candle: { close: 1.01 },
    previousCandle: { close: 0.99 },
    supertrend: { value: 1, direction: "bullish" },
    states: { supertrendBreakUp: false },
  },
};

const explicitBreakUp = {
  latest: {
    candle: { close: 1.01 },
    previousCandle: { close: 0.99 },
    supertrend: { value: 1, direction: "bullish" },
    states: { supertrendBreakUp: true },
  },
};

async function withChartPayload(t, payload) {
  const originalFetch = globalThis.fetch;
  const originalEnabled = config.indicators.enabled;
  config.indicators.enabled = true;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify(payload),
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    config.indicators.enabled = originalEnabled;
  });
  return chartIndicators.confirmIndicatorPreset({
    mint: "test-mint",
    side: "entry",
    preset: "evil_panda",
    intervals: ["15_MINUTE"],
    refresh: true,
  });
}

test("Evil Panda rejects bullish price above Supertrend without a fresh break", async (t) => {
  const result = await withChartPayload(t, bullishAboveLineWithoutBreak);
  assert.equal(result.confirmed, false);
});

test("Evil Panda accepts an explicit Supertrend break-up", async (t) => {
  const result = await withChartPayload(t, explicitBreakUp);
  assert.equal(result.confirmed, true);
});

test("deploy approval helper fails closed for missing, skipped, or disabled confirmation", () => {
  const approve = chartIndicators.isIndicatorConfirmationApproved;
  assert.equal(typeof approve, "function");
  assert.equal(approve({ enabled: true, confirmed: true, skipped: false }), true);
  assert.equal(approve({ enabled: true, confirmed: true, skipped: true }), false);
  assert.equal(approve({ enabled: true, confirmed: false, skipped: false }), false);
  assert.equal(approve({ enabled: false, confirmed: true, skipped: false }), false);
  assert.equal(approve(null), false);
});
