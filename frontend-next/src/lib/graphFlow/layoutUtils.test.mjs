import test from "node:test";
import assert from "node:assert/strict";
import { clearLayoutCache, getLayoutedElements } from "./layoutUtils.ts";

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

test("getLayoutedElements returns cached layout for identical graph signature", () => {
  clearLayoutCache();
  const first = getLayoutedElements(nodes, edges, "flow", { fingerprint: "fp-test" });
  const refreshedNodes = nodes.map((node) => ({
    ...node,
    data: { ...node.data, label: `${node.data.label}!` },
  }));
  const second = getLayoutedElements(refreshedNodes, edges, "flow", { fingerprint: "fp-test" });
  for (const id of ["a", "b"]) {
    const fromFirst = first.nodes.find((node) => node.id === id);
    const fromSecond = second.nodes.find((node) => node.id === id);
    assert.deepEqual(fromFirst.position, fromSecond.position);
    assert.deepEqual(fromFirst.style, fromSecond.style);
    assert.equal(fromSecond.data.label, `${fromFirst.data.label}!`);
  }
  assert.equal(second.edges, edges);
});

test("getLayoutedElements does not reuse layout when edge endpoints change", () => {
  clearLayoutCache();
  const thirdNode = {
    id: "c",
    type: "documentCard",
    position: { x: 0, y: 0 },
    data: { label: "C" },
  };
  const graphNodes = [...nodes, thirdNode];
  const first = getLayoutedElements(
    graphNodes,
    [{ id: "e1", source: "a", target: "b" }],
    "flow",
  );
  const second = getLayoutedElements(
    graphNodes,
    [{ id: "e1", source: "a", target: "c" }],
    "flow",
  );

  assert.notEqual(first.nodes, second.nodes);
});
