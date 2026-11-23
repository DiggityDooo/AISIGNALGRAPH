import test from "node:test";
import assert from "node:assert/strict";
import { filterGraphPayload, filterKey } from "./latticeFilters.ts";

const base = {
  searchQuery: "",
  lens: "global",
  activeYear: 2026,
  visibleNodeTypes: new Set(["lab", "story"]),
};

test("filterKey is stable under global lens when selection changes", () => {
  assert.equal(
    filterKey({ ...base, selectedNodeId: "a" }),
    filterKey({ ...base, selectedNodeId: "b" }),
  );
});

test("filterKey includes selection under local lens", () => {
  assert.notEqual(
    filterKey({ ...base, lens: "local", selectedNodeId: "a" }),
    filterKey({ ...base, lens: "local", selectedNodeId: "b" }),
  );
});

test("filterKey sorts visibleNodeTypes so insertion order does not matter", () => {
  assert.equal(
    filterKey({ ...base, visibleNodeTypes: new Set(["b", "a"]) }),
    filterKey({ ...base, visibleNodeTypes: new Set(["a", "b"]) }),
  );
});

test("filterKey treats null and omitted selectedNodeId the same under local lens", () => {
  assert.equal(
    filterKey({ ...base, lens: "local", selectedNodeId: null }),
    filterKey({ ...base, lens: "local" }),
  );
});


test("era filters keep matching stories and their context without cross-era stories", () => {
  const nodes = [
    {id: "story:founding", type: "story", era: "founding", year: "1956"},
    {id: "story:frontier", type: "story", era: "frontier", year: "2024"},
    {id: "entity:lab", type: "lab"},
    {id: "entity:year-1956", type: "year", year: "1956"},
  ];
  const edges = [
    {source: "entity:year-1956", target: "story:founding"},
    {source: "story:founding", target: "entity:lab"},
    {source: "story:founding", target: "story:frontier"},
    {source: "story:frontier", target: "entity:lab"},
  ];
  const result = filterGraphPayload({nodes, edges}, {
    ...base, activeEra: "founding", activeYear: 1956,
    visibleNodeTypes: new Set(["story", "year", "lab"]),
  });
  assert.deepEqual(result.nodes.map(node => node.id), ["story:founding", "entity:lab", "entity:year-1956"]);
  assert.deepEqual(result.edges, edges.slice(0, 2));
  assert.notEqual(filterKey(base), filterKey({...base, activeEra: "founding"}));
});

test("publication cutoff filters future year nodes as well as stories", () => {
  const nodes = [{id: "then", type: "story", year: "1956"}, {id: "later", type: "year", year: "2026"}];
  const result = filterGraphPayload({nodes, edges: []}, {
    ...base, activeYear: 1960, visibleNodeTypes: new Set(["story", "year"]),
  });
  assert.deepEqual(result.nodes.map(node => node.id), ["then"]);
});
