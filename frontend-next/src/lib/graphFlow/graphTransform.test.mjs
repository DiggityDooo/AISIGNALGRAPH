import test from "node:test";
import assert from "node:assert/strict";
import { buildTreeFromPayload } from "./graphTransform.ts";

test("buildTreeFromPayload handles deep graphs without recursive overflow", () => {
  const nodeCount = 12_000;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n-${index}`,
    label: `Node ${index}`,
  }));
  const edges = Array.from({ length: nodeCount - 1 }, (_, index) => ({
    source: `n-${index}`,
    target: `n-${index + 1}`,
  }));

  const result = buildTreeFromPayload({ nodes, edges });
  assert.equal(result.tree.attributes?.nodeCount, nodeCount);
  assert.equal(result.tree.children?.[0]?.name, "Node 0");
  assert.equal(result.cyclicEdges.length, 0);
});
