import test from "node:test";
import assert from "node:assert/strict";
import {
  glowShadowForAccent,
  hexToRgb,
  signalDurationFromImportance,
} from "./nodeColors.ts";

test("hexToRgb parses type accent colors", () => {
  assert.deepEqual(hexToRgb("#00e0ff"), { r: 0, g: 224, b: 255 });
  assert.equal(hexToRgb("bad"), null);
});

test("signalDurationFromImportance — higher importance = faster (shorter duration)", () => {
  const slow = signalDurationFromImportance(0);
  const fast = signalDurationFromImportance(10);
  assert.ok(fast < slow);
  assert.ok(fast >= 0.35);
});

test("glowShadowForAccent returns rgba shadow string", () => {
  const shadow = glowShadowForAccent("#7c5cff");
  assert.match(shadow ?? "", /rgba\(124,92,255/);
});
