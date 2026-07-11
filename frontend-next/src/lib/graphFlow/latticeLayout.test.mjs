import test from "node:test";
import assert from "node:assert/strict";
import {
  clampLayoutIterations,
  LAYOUT_ITERATIONS,
  MAX_LAYOUT_ITERATIONS,
} from "./latticeLayout.ts";
import { sanitizeLayoutPositions } from "./latticeLayoutClient.ts";

test("clampLayoutIterations defaults and caps", () => {
  assert.equal(clampLayoutIterations(undefined), LAYOUT_ITERATIONS);
  assert.equal(clampLayoutIterations(NaN), LAYOUT_ITERATIONS);
  assert.equal(clampLayoutIterations(0), 1);
  assert.equal(clampLayoutIterations(-5), 1);
  assert.equal(clampLayoutIterations(9999), MAX_LAYOUT_ITERATIONS);
  assert.equal(clampLayoutIterations(60), 60);
});

test("sanitizeLayoutPositions drops non-finite values", () => {
  const cleaned = sanitizeLayoutPositions({
    a: { x: 1, y: 2 },
    b: { x: NaN, y: 3 },
    c: { x: 4, y: Infinity },
    d: null,
    e: { x: "1", y: 2 },
  });
  assert.deepEqual(cleaned, { a: { x: 1, y: 2 } });
});
