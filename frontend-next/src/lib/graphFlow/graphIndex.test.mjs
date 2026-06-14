import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGraphIndex,
  computeVisibleIds,
  pickSeedIds,
} from "./graphIndex.ts";
import { toggleExpanded } from "../../hooks/useProgressiveGraph.ts";

const samplePayload = {
  nodes: [
    { id: "root", label: "Root Story", type: "story", importance: 10, year: 2024 },
    { id: "child-a", label: "Child A", type: "entity", importance: 5, year: 2023 },
    { id: "child-b", label: "Child B", type: "topic", importance: 3, year: 2022 },
    { id: "grand", label: "Grandchild", type: "model", importance: 1, year: 2021 },
  ],
  edges: [
    { source: "root", target: "child-a" },
    { source: "root", target: "child-b" },
    { source: "child-a", target: "grand" },
  ],
};

test("pickSeedIds prefers high-importance story roots", () => {
  const index = buildGraphIndex(samplePayload);
  const seeds = pickSeedIds(index, 1);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0], "root");
});

test("computeVisibleIds includes seeds and expanded descendants only", () => {
  const index = buildGraphIndex(samplePayload);
  const seeds = pickSeedIds(index, 1);
  const expanded = new Set(["root"]);
  const visible = computeVisibleIds(seeds, expanded, index.childrenById);
  assert.equal(visible.has("root"), true);
  assert.equal(visible.has("child-a"), true);
  assert.equal(visible.has("child-b"), true);
  assert.equal(visible.has("grand"), false);
});

test("toggleExpanded adds children and collapses descendant branches", () => {
  const index = buildGraphIndex(samplePayload);
  const expanded = new Set(["root", "child-a"]);
  const collapsed = toggleExpanded("root", expanded, index.childrenById);
  assert.equal(collapsed.has("root"), false);
  assert.equal(collapsed.has("child-a"), false);
  assert.equal(collapsed.has("grand"), false);

  const reExpanded = toggleExpanded("root", collapsed, index.childrenById);
  assert.equal(reExpanded.has("root"), true);
});

test("buildGraphIndex records non-tree edges when a node has multiple parents", () => {
  const cyclicPayload = {
    nodes: [
      { id: "a", label: "A", type: "story", importance: 10, year: 2024 },
      { id: "b", label: "B", type: "entity", importance: 5, year: 2023 },
      { id: "c", label: "C", type: "topic", importance: 3, year: 2022 },
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "c", target: "b" },
    ],
  };
  const index = buildGraphIndex(cyclicPayload);
  assert.equal(index.cyclicEdges.length, 1);
  assert.deepEqual(index.cyclicEdges[0], { source: "c", target: "b" });
  assert.deepEqual(index.childrenById.get("a"), ["b"]);
  assert.equal(index.childrenById.get("c")?.length, 0);
});

test("buildGraphIndex breaks a directed cycle into a tree plus cyclic edge", () => {
  const index = buildGraphIndex({
    nodes: [
      { id: "a", label: "A", importance: 10 },
      { id: "b", label: "B", importance: 5 },
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
    ],
  });

  assert.deepEqual(index.rootIds, ["a"]);
  assert.deepEqual(index.childrenById.get("a"), ["b"]);
  assert.deepEqual(index.childrenById.get("b"), []);
  assert.deepEqual(index.cyclicEdges, [{ source: "b", target: "a" }]);
});
