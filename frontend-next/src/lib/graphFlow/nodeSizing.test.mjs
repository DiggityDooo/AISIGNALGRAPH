import test from "node:test";
import assert from "node:assert/strict";
import { computeDegrees, connectionCountsFromTree, degreeBasedSize } from "./nodeSizing.ts";

test("degreeBasedSize grows with degree but stays within [min, max]", () => {
  const low = degreeBasedSize(0, { min: 5, max: 16, base: 5, scale: 2.1 });
  const mid = degreeBasedSize(4, { min: 5, max: 16, base: 5, scale: 2.1 });
  const high = degreeBasedSize(1000, { min: 5, max: 16, base: 5, scale: 2.1 });
  assert.equal(low, 5);
  assert.ok(mid > low);
  assert.equal(high, 16);
});

test("computeDegrees counts deduplicated in/out/total degree per node", () => {
  const payload = {
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { source: "a", target: "b" },
      { source: "a", target: "b" }, // duplicate, should not double-count
      { source: "c", target: "b" },
    ],
  };
  const degrees = computeDegrees(payload);
  assert.deepEqual(degrees.get("a"), { in: 0, out: 1, total: 1 });
  assert.deepEqual(degrees.get("b"), { in: 2, out: 0, total: 2 });
  assert.deepEqual(degrees.get("c"), { in: 0, out: 1, total: 1 });
});

test("computeDegrees ignores edges referencing unknown nodes", () => {
  const payload = {
    nodes: [{ id: "a" }],
    edges: [{ source: "a", target: "missing" }],
  };
  const degrees = computeDegrees(payload);
  assert.deepEqual(degrees.get("a"), { in: 0, out: 0, total: 0 });
});

test("connectionCountsFromTree reconstructs full graph degree from tree edges plus cyclic edges", () => {
  const childrenById = new Map([
    ["root", ["a", "b"]],
    ["a", ["c"]],
    ["b", []],
    ["c", []],
  ]);
  const cyclicEdges = [{ source: "c", target: "b" }];
  const counts = connectionCountsFromTree(childrenById, cyclicEdges);
  assert.equal(counts.get("root"), 2);
  assert.equal(counts.get("a"), 2);
  assert.equal(counts.get("b"), 2);
  assert.equal(counts.get("c"), 2);
});
