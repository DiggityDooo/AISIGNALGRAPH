import test from "node:test";
import assert from "node:assert/strict";
import { filterKey } from "./latticeFilters.ts";

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
