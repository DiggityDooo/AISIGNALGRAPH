import test from "node:test";
import assert from "node:assert/strict";
import { filterNodes, filterEdges, nodeMatchesFts } from "./filters.js";

test("filterNodes respects visible types and year", () => {
  const nodes = [
    { id: "a", label: "Alpha", type: "lab", year: 2024 },
    { id: "b", label: "Beta", type: "risk", year: 2027 },
  ];
  const result = filterNodes({
    nodes,
    edges: [],
    query: "",
    lens: "global",
    activeYear: 2025,
    visibleNodeTypes: new Set(["lab"]),
    selectedNodeId: null,
    ftsStoryIds: new Set(),
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a");
});

test("filterNodes matches FTS story ids", () => {
  const nodes = [{ id: "story:42", label: "Hidden title", type: "story" }];
  const ftsStoryIds = new Set(["story:42"]);
  assert.equal(nodeMatchesFts(nodes[0], ftsStoryIds), true);
  const result = filterNodes({
    nodes,
    edges: [],
    query: "quantum",
    lens: "global",
    activeYear: 2026,
    visibleNodeTypes: new Set(["story"]),
    selectedNodeId: null,
    ftsStoryIds,
  });
  assert.equal(result.length, 1);
});

test("filterEdges keeps only visible endpoints", () => {
  const edges = [
    { source: "a", target: "b" },
    { source: "a", target: "c" },
  ];
  const visible = new Set(["a", "b"]);
  const result = filterEdges(edges, visible);
  assert.equal(result.length, 1);
  assert.equal(result[0].target, "b");
});
