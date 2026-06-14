import test from "node:test";
import assert from "node:assert/strict";
import { getLayoutedElements } from "./layoutUtils.ts";

const nodes = [
  {
    id: "a",
    type: "documentCard",
    position: { x: 0, y: 0 },
    data: { label: "A" },
  },
  {
    id: "b",
    type: "documentCard",
    position: { x: 0, y: 0 },
    data: { label: "B" },
  },
];

const edges = [{ id: "e1", source: "a", target: "b" }];

function assertFinitePositions(layouted, mode) {
  for (const node of layouted.nodes) {
    assert.ok(Number.isFinite(node.position.x), `${mode}: ${node.id} x finite`);
    assert.ok(Number.isFinite(node.position.y), `${mode}: ${node.id} y finite`);
  }
}

test("getLayoutedElements returns finite flow positions", () => {
  const layouted = getLayoutedElements(nodes, edges, "flow");
  assert.equal(layouted.nodes.length, 2);
  assertFinitePositions(layouted, "flow");
});

test("getLayoutedElements returns finite tree positions", () => {
  const layouted = getLayoutedElements(nodes, edges, "tree");
  assert.equal(layouted.nodes.length, 2);
  assertFinitePositions(layouted, "tree");
});

test("getLayoutedElements keeps disconnected nodes at finite positions", () => {
  const orphan = [
    ...nodes,
    {
      id: "orphan",
      type: "documentCard",
      position: { x: 0, y: 0 },
      data: { label: "Orphan" },
    },
  ];
  const layouted = getLayoutedElements(orphan, edges, "flow");
  const orphanNode = layouted.nodes.find((n) => n.id === "orphan");
  assert.ok(orphanNode);
  assert.ok(Number.isFinite(orphanNode.position.x));
  assert.ok(Number.isFinite(orphanNode.position.y));
});
