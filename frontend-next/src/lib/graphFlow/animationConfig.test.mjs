import test from "node:test";
import assert from "node:assert/strict";
import {
  CARD_REVEAL_DURATION_MS,
  CARD_REVEAL_STAGGER_MS,
  CARD_REVEAL_MAX_STAGGER_STEPS,
  cardRevealDelayMs,
  cardRevealTotalMs,
  computeRevealOrder,
} from "./animationConfig.ts";

test("cardRevealDelayMs ramps by the stagger step", () => {
  assert.equal(cardRevealDelayMs(0), 0);
  assert.equal(cardRevealDelayMs(1), CARD_REVEAL_STAGGER_MS);
  assert.equal(cardRevealDelayMs(3), 3 * CARD_REVEAL_STAGGER_MS);
});

test("cardRevealDelayMs clamps negatives to zero", () => {
  assert.equal(cardRevealDelayMs(-5), 0);
});

test("cardRevealDelayMs caps the stagger so a big burst stays snappy", () => {
  const capped = CARD_REVEAL_MAX_STAGGER_STEPS * CARD_REVEAL_STAGGER_MS;
  assert.equal(cardRevealDelayMs(CARD_REVEAL_MAX_STAGGER_STEPS), capped);
  assert.equal(cardRevealDelayMs(CARD_REVEAL_MAX_STAGGER_STEPS + 4), capped);
});

test("cardRevealTotalMs is last delay plus one duration", () => {
  assert.equal(cardRevealTotalMs(0), 0);
  assert.equal(cardRevealTotalMs(1), CARD_REVEAL_DURATION_MS);
  assert.equal(
    cardRevealTotalMs(3),
    2 * CARD_REVEAL_STAGGER_MS + CARD_REVEAL_DURATION_MS,
  );
});

test("computeRevealOrder indexes only the newly-visible children, in child order", () => {
  const children = ["a", "b", "c", "d"];
  const prev = new Set(["parent", "a"]); // 'a' was already on screen
  const curr = new Set(["parent", "a", "b", "c", "d"]);
  const order = computeRevealOrder(children, prev, curr);

  assert.equal(order.has("a"), false, "already-visible child does not animate");
  assert.deepEqual([...order.entries()], [
    ["b", 0],
    ["c", 1],
    ["d", 2],
  ]);
});

test("computeRevealOrder yields nothing when no child is newly visible", () => {
  const children = ["a", "b"];
  const same = new Set(["parent", "a", "b"]);
  const order = computeRevealOrder(children, same, same);
  assert.equal(order.size, 0);
});

test("computeRevealOrder ignores children not yet visible", () => {
  const children = ["a", "b", "c"];
  const prev = new Set(["parent"]);
  const curr = new Set(["parent", "a", "c"]); // 'b' capped behind +N, not visible
  const order = computeRevealOrder(children, prev, curr);
  assert.deepEqual([...order.entries()], [
    ["a", 0],
    ["c", 1],
  ]);
});
